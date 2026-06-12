// Server-side assembly: glue between the DB and the pure engines
// (standings / bracket cascade / scoring). Used by pages and API routes.

import { prisma } from "./db";
import { getConfig } from "./config";
import { computeTable, lotsHash, type TableRow } from "./standings";
import { deriveBracket, type DeriveResult } from "./bracket";
import {
  boostTeamId,
  computeBracketPoints,
  computeMatchPoints,
  computeRealProgress,
  perfectOrderGroups,
  type KoPredEntry,
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

export function toMaps(preds: ScorePred[]) {
  const groupScores = new Map<number, { homeScore: number; awayScore: number }>();
  const koPreds = new Map<number, KoPredEntry>();
  for (const p of preds) {
    if (p.matchId <= 72) {
      groupScores.set(p.matchId, { homeScore: p.homeScore, awayScore: p.awayScore });
    } else {
      koPreds.set(p.matchId, {
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        winnerTeamId: p.predWinnerTeamId,
        snapHomeTeamId: p.predHomeTeamId,
        snapAwayTeamId: p.predAwayTeamId,
      });
    }
  }
  return { groupScores, koPreds };
}

/**
 * Derive a player's predicted group tables and R32 seeding (PLAN.MD §7).
 * Knockout picks are made against the real bracket and never cascade, so
 * only group predictions feed the derivation.
 */
export async function derivePlayer(playerId: string, core?: Core): Promise<DeriveResult> {
  const c = core ?? (await getCore());
  const preds = await prisma.scorePred.findMany({
    where: { playerId, matchId: { lte: 72 } },
  });
  return deriveBracket({
    groupMatches: c.groupMatches,
    teamsByGroup: c.teamsByGroup,
    groupScores: new Map(
      preds.map((p) => [p.matchId, { homeScore: p.homeScore, awayScore: p.awayScore }])
    ),
    koScores: new Map(),
    lotsSeed: playerId,
  });
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

/**
 * Real group tables computed live from finished matches (lots seeded "real"),
 * plus which groups are settled (all 6 games played). Shared by the Groups
 * tab and the exact-order bonus.
 */
export function realGroupTables(core: Core): {
  tables: Record<string, TableRow[]>;
  played: Record<string, number>;
  settledGroups: string[];
} {
  const tables: Record<string, TableRow[]> = {};
  const played: Record<string, number> = {};
  for (const g of Object.keys(core.teamsByGroup)) {
    const finished = core.matches.filter(
      (m) => m.groupName === g && m.status === "FINISHED" && m.homeScore != null
    );
    played[g] = finished.length;
    tables[g] = computeTable(
      core.teamsByGroup[g],
      finished.map((m) => ({
        homeTeamId: m.homeTeamId!,
        awayTeamId: m.awayTeamId!,
        homeScore: m.homeScore!,
        awayScore: m.awayScore!,
      })),
      { lotsSeed: "real" }
    );
  }
  const settledGroups = Object.keys(played).filter((g) => played[g] === 6);
  return { tables, played, settledGroups };
}

/**
 * Undocumented gambling-corner perk: every NEW league point earned quietly
 * tops the bankroll up $1. `gambleCredited` is a high-water mark of points
 * already paid out; NULL means the baseline hasn't been set — it's
 * initialized to the player's current total so pre-existing points never
 * pay. Points lost to corrections are never clawed back (and don't pay
 * again when regained). Compare-and-swap guards against double-credits from
 * concurrent requests. Returns the dollars just credited.
 */
export async function creditGamblingIncome(
  player: { id: string; gambleCredited: number | null },
  totalPoints: number
): Promise<number> {
  if (player.gambleCredited == null) {
    await prisma.player.updateMany({
      where: { id: player.id, gambleCredited: null },
      data: { gambleCredited: totalPoints },
    });
    return 0;
  }
  const delta = totalPoints - player.gambleCredited;
  if (delta <= 0) return 0;
  const res = await prisma.player.updateMany({
    where: { id: player.id, gambleCredited: player.gambleCredited },
    data: { gambleCredited: totalPoints, gambleBalance: { increment: delta } },
  });
  return res.count > 0 ? delta : 0;
}

export interface LeaderboardRow {
  playerId: string;
  displayName: string;
  matchPoints: number;
  bracketPoints: number;
  total: number;
  rank: number;
  /** Ever lost the whole gambling-corner bankroll — the badge is permanent. */
  bankrupt: boolean;
}

/**
 * Ranked league (PLAN.MD §9.4): total points desc; players level on points are
 * ordered randomly (explicitly no tiebreaker). The admin account is a control
 * panel, not a contestant — it stays off the board.
 */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const [core, players, allPreds, cfg] = await Promise.all([
    getCore(),
    prisma.player.findMany({ where: { isAdmin: false } }),
    prisma.scorePred.findMany(),
    getConfig(),
  ]);
  const progress = await getRealProgress(core);
  const real = realGroupTables(core);
  const boostedId = boostTeamId(cfg.scoring, core.teams);
  const predsByPlayer = new Map<string, ScorePred[]>();
  for (const p of allPreds) {
    let list = predsByPlayer.get(p.playerId);
    if (!list) predsByPlayer.set(p.playerId, (list = []));
    list.push(p);
  }

  const rows = players.map((pl) => {
    const preds = predsByPlayer.get(pl.id) ?? [];
    const { groupScores, koPreds } = toMaps(preds);
    const matchPts = computeMatchPoints(
      new Map([...groupScores, ...koPreds]),
      core.matches,
      cfg.scoring,
      boostedId
    );
    const derived = deriveBracket({
      groupMatches: core.groupMatches,
      teamsByGroup: core.teamsByGroup,
      groupScores,
      koScores: new Map(),
      lotsSeed: pl.id,
    });
    const bracketPts = computeBracketPoints({
      groupSlots: derived.slots,
      koPreds,
      progress,
      cfg: cfg.scoring,
    });
    // exact-order bonus: settled groups whose 1st→4th the player nailed
    const orderBonus =
      perfectOrderGroups(derived.groupTables, real.tables, real.settledGroups).length *
      cfg.scoring.groupOrder;
    return {
      playerId: pl.id,
      displayName: pl.displayName,
      matchPoints: matchPts.total,
      bracketPoints: bracketPts.total + orderBonus,
      total: matchPts.total + bracketPts.total + orderBonus,
      rank: 0,
      bankrupt: pl.gambleBusted,
    };
  });

  // pay the secret per-point income: fresh points quietly refill bankrolls
  // (the bankruptcy tag stays on regardless — once a bad gambler, always one)
  for (const r of rows) {
    const pl = players.find((p) => p.id === r.playerId)!;
    await creditGamblingIncome(pl, r.total);
  }

  // sort by total desc; equal totals fall back to a seeded "drawing of lots"
  // (random-looking but deterministic, so the order survives refreshes)
  rows.sort(
    (a, b) =>
      b.total - a.total ||
      lotsHash("leaderboard", a.playerId) - lotsHash("leaderboard", b.playerId)
  );
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
