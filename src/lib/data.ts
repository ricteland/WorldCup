// Server-side assembly: glue between the DB and the pure engines
// (standings / bracket cascade / scoring). Used by pages and API routes.

import { prisma } from "./db";
import { getConfig } from "./config";
import {
  deriveBracket,
  roundOfSlot,
  type DeriveResult,
  type KoScoreEntry,
} from "./bracket";
import {
  boostTeamId,
  computeBracketPoints,
  computeMatchPoints,
  computeRealProgress,
  type RealProgress,
} from "./scoring";
import type { Match, ScorePred, Team } from "@prisma/client";

export interface Core {
  teams: Team[];
  teamById: Map<string, Team>;
  matches: Match[];
  teamsByGroup: Record<string, string[]>;
  groupMatches: { id: number; groupName: string; homeTeamId: string; awayTeamId: string }[];
}

export async function getCore(): Promise<Core> {
  const [teams, matches] = await Promise.all([
    prisma.team.findMany({ orderBy: [{ groupName: "asc" }, { name: "asc" }] }),
    prisma.match.findMany({ orderBy: { id: "asc" } }),
  ]);
  const teamsByGroup: Record<string, string[]> = {};
  for (const t of teams) (teamsByGroup[t.groupName] ??= []).push(t.id);
  const groupMatches = matches
    .filter((m) => m.stage === "GROUP")
    .map((m) => ({
      id: m.id,
      groupName: m.groupName!,
      homeTeamId: m.homeTeamId!,
      awayTeamId: m.awayTeamId!,
    }));
  return { teams, teamById: new Map(teams.map((t) => [t.id, t])), matches, teamsByGroup, groupMatches };
}

function toMaps(preds: ScorePred[]) {
  const groupScores = new Map<number, { homeScore: number; awayScore: number }>();
  const koScores = new Map<number, KoScoreEntry>();
  for (const p of preds) {
    if (p.matchId <= 72) {
      groupScores.set(p.matchId, { homeScore: p.homeScore, awayScore: p.awayScore });
    } else {
      koScores.set(p.matchId, {
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        winnerTeamId: p.predWinnerTeamId,
        snapHomeTeamId: p.predHomeTeamId,
        snapAwayTeamId: p.predAwayTeamId,
      });
    }
  }
  return { groupScores, koScores };
}

/** Run the cascade for one player (PLAN.MD §7). */
export async function derivePlayer(playerId: string, core?: Core): Promise<DeriveResult> {
  const c = core ?? (await getCore());
  const preds = await prisma.scorePred.findMany({ where: { playerId } });
  const { groupScores, koScores } = toMaps(preds);
  return deriveBracket({
    groupMatches: c.groupMatches,
    teamsByGroup: c.teamsByGroup,
    groupScores,
    koScores,
    lotsSeed: playerId,
  });
}

/** Persist the derived bracket as BracketPick rows (kept consistent with §7). */
export async function persistBracketPicks(playerId: string, derived: DeriveResult): Promise<void> {
  const rows = Object.entries(derived.slots).map(([slot, teamId]) => ({
    playerId,
    slot,
    round: roundOfSlot(slot),
    teamId,
  }));
  await prisma.$transaction([
    prisma.bracketPick.deleteMany({ where: { playerId } }),
    ...(rows.length ? [prisma.bracketPick.createMany({ data: rows })] : []),
  ]);
}

export async function getRealProgress(core?: Core): Promise<RealProgress> {
  const c = core ?? (await getCore());
  return computeRealProgress({
    matches: c.matches.map((m) => ({
      id: m.id,
      stage: m.stage,
      groupName: m.groupName,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      winnerTeamId: m.winnerTeamId,
    })),
    teamsByGroup: c.teamsByGroup,
  });
}

export interface LeaderboardRow {
  playerId: string;
  displayName: string;
  matchPoints: number;
  bracketPoints: number;
  total: number;
  rank: number;
  isAdmin: boolean;
}

/**
 * Ranked league (PLAN.MD §9.4): total points desc; players level on points are
 * ordered randomly (explicitly no tiebreaker).
 */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const [core, players, allPreds, cfg] = await Promise.all([
    getCore(),
    prisma.player.findMany(),
    prisma.scorePred.findMany(),
    getConfig(),
  ]);
  const progress = await getRealProgress(core);
  const boostedId = boostTeamId(cfg.scoring, core.teams);
  const predsByPlayer = new Map<string, ScorePred[]>();
  for (const p of allPreds) {
    let list = predsByPlayer.get(p.playerId);
    if (!list) predsByPlayer.set(p.playerId, (list = []));
    list.push(p);
  }

  const rows = players.map((pl) => {
    const preds = predsByPlayer.get(pl.id) ?? [];
    const { groupScores, koScores } = toMaps(preds);
    const scoreMap = new Map<number, { homeScore: number; awayScore: number }>([
      ...groupScores,
      ...new Map([...koScores].map(([k, v]) => [k, { homeScore: v.homeScore, awayScore: v.awayScore }])),
    ]);
    const matchPts = computeMatchPoints(scoreMap, core.matches, cfg.scoring, boostedId);
    const derived = deriveBracket({
      groupMatches: core.groupMatches,
      teamsByGroup: core.teamsByGroup,
      groupScores,
      koScores,
      lotsSeed: pl.id,
    });
    const bracketPts = computeBracketPoints(derived.slots, progress, cfg.scoring);
    return {
      playerId: pl.id,
      displayName: pl.displayName,
      matchPoints: matchPts.total,
      bracketPoints: bracketPts.total,
      total: matchPts.total + bracketPts.total,
      rank: 0,
      isAdmin: pl.isAdmin,
    };
  });

  // sort by total desc; shuffle within equal totals (random order, no tiebreaker)
  const jitter = new Map(rows.map((r) => [r.playerId, Math.random()]));
  rows.sort((a, b) => b.total - a.total || jitter.get(a.playerId)! - jitter.get(b.playerId)!);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
