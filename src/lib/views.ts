// View models for the four tabs — server-side assembly shared by pages and
// API routes. Everything is plain JSON, ready to hand to client components.

import { prisma } from "./db";
import { getConfig, isMatchLocked, matchLockAt } from "./config";
import { getCore, derivePlayer, getRealProgress } from "./data";
import { gradeScore, type Grade } from "./grade";
import { boostTeamId, gradeBracketSlot, matchInvolves, matchPointsFor } from "./scoring";
import { computeTable } from "./standings";
import { slotKey, roundOfMatch, CHAMPION_SLOT, KO_MATCH_NUMS } from "./bracket";
import type { Team } from "@prisma/client";

export interface TeamView {
  id: string;
  name: string;
  code: string;
  flag: string;
}

const teamView = (t: Team | undefined | null): TeamView | null =>
  t ? { id: t.id, name: t.name, code: t.code, flag: t.flagEmoji } : null;

export function slotLabel(slot: string | null | undefined): string | null {
  if (!slot) return null;
  const m1 = slot.match(/^([12])([A-L])$/);
  if (m1) return m1[1] === "1" ? `Winner Group ${m1[2]}` : `Runner-up Group ${m1[2]}`;
  if (slot.startsWith("3")) return `3rd of ${slot.slice(1)}`;
  const wl = slot.match(/^([WL])(\d+)$/);
  if (wl) return `${wl[1] === "W" ? "Winner" : "Loser"} of M${wl[2]}`;
  return slot;
}

export interface MatchView {
  id: number;
  stage: string;
  groupName: string | null;
  matchday: string | null;
  venue: string | null;
  kickoffUtc: string;
  status: string;
  // real participants (group stage always; knockouts once known)
  home: TeamView | null;
  away: TeamView | null;
  homeSlotLabel: string | null;
  awaySlotLabel: string | null;
  homeScore: number | null;
  awayScore: number | null;
  // the player's own predicted participants for knockout matches
  predHome: TeamView | null;
  predAway: TeamView | null;
  pred: { homeScore: number; awayScore: number; predWinnerTeamId: string | null } | null;
  grade: Grade;
  points: number;
  /** Points multiplier when the boosted team (Spain) plays in this match, else null. */
  boost: number | null;
  locked: boolean; // this match's own rolling deadline has passed
  lockAtUtc: string; // when this match freezes (lockMinutes before kickoff)
  open: boolean; // can be predicted right now (ignoring the lock)
  stale: boolean; // knockout pred made against participants the cascade no longer produces
}

export interface MatchesPayload {
  lockMinutes: number;
  matches: MatchView[];
}

export async function getMatchesView(playerId: string): Promise<MatchesPayload> {
  const [core, cfg, preds] = await Promise.all([
    getCore(),
    getConfig(),
    prisma.scorePred.findMany({ where: { playerId } }),
  ]);
  const derived = await derivePlayer(playerId, core);
  const predByMatch = new Map(preds.map((p) => [p.matchId, p]));
  const stale = new Set(derived.staleMatchNums);
  const open = new Set(derived.openMatchNums);
  const boostedId = boostTeamId(cfg.scoring, core.teams);

  const matches = core.matches.map((m): MatchView => {
    const pred = predByMatch.get(m.id);
    const isGroup = m.stage === "GROUP";
    const predHomeId = isGroup ? m.homeTeamId : derived.slots[slotKey(m.id, "H")];
    const predAwayId = isGroup ? m.awayTeamId : derived.slots[slotKey(m.id, "A")];
    const grade =
      m.status === "FINISHED" && m.homeScore != null
        ? gradeScore(pred, { homeScore: m.homeScore, awayScore: m.awayScore! })
        : "PENDING";
    return {
      id: m.id,
      stage: m.stage,
      groupName: m.groupName,
      matchday: m.matchday,
      venue: m.venue,
      kickoffUtc: m.kickoffUtc.toISOString(),
      status: m.status,
      home: teamView(m.homeTeamId ? core.teamById.get(m.homeTeamId) : null),
      away: teamView(m.awayTeamId ? core.teamById.get(m.awayTeamId) : null),
      homeSlotLabel: slotLabel(m.homeSlot),
      awaySlotLabel: slotLabel(m.awaySlot),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      predHome: teamView(predHomeId ? core.teamById.get(predHomeId) : null),
      predAway: teamView(predAwayId ? core.teamById.get(predAwayId) : null),
      pred: pred
        ? { homeScore: pred.homeScore, awayScore: pred.awayScore, predWinnerTeamId: pred.predWinnerTeamId }
        : null,
      grade,
      points: matchPointsFor(grade, cfg.scoring, matchInvolves(m, boostedId)),
      boost: matchInvolves(m, boostedId) ? cfg.scoring.boostMultiplier : null,
      locked: isMatchLocked(m.kickoffUtc, cfg.lockMinutes),
      lockAtUtc: matchLockAt(m.kickoffUtc, cfg.lockMinutes).toISOString(),
      open: isGroup || open.has(m.id),
      stale: stale.has(m.id),
    };
  });

  return { lockMinutes: cfg.lockMinutes, matches };
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export interface GroupRowView {
  team: TeamView;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  pos: number;
  qualifies: "winner" | "runner_up" | "best_third" | null;
  grade: Grade; // vs the real outcome, once groups are final
}

export interface GroupView {
  name: string;
  complete: boolean;
  predsMade: number;
  rows: GroupRowView[];
}

export interface GroupsPayload {
  groups: GroupView[];
  qualifiedThirdGroups: string[] | null;
  realFinal: boolean;
}

export async function getGroupsView(playerId: string): Promise<GroupsPayload> {
  const core = await getCore();
  const [derived, progress, preds] = await Promise.all([
    derivePlayer(playerId, core),
    getRealProgress(core),
    prisma.scorePred.findMany({ where: { playerId, matchId: { lte: 72 } } }),
  ]);
  const predByMatch = new Map(
    preds.map((p) => [p.matchId, { homeScore: p.homeScore, awayScore: p.awayScore }])
  );

  // Real final tables (for the correctness overlay once the group stage ends).
  const realTables: Record<string, string[]> = {};
  if (progress.groupsFinal) {
    for (const g of Object.keys(core.teamsByGroup)) {
      const finished = core.matches.filter(
        (m) => m.groupName === g && m.status === "FINISHED" && m.homeScore != null
      );
      realTables[g] = computeTable(
        core.teamsByGroup[g],
        finished.map((m) => ({
          homeTeamId: m.homeTeamId!,
          awayTeamId: m.awayTeamId!,
          homeScore: m.homeScore!,
          awayScore: m.awayScore!,
        })),
        { lotsSeed: "real" }
      ).map((r) => r.teamId);
    }
  }

  const qualifiedThirds = new Set(derived.qualifiedThirdGroups ?? []);
  const groups = Object.keys(core.teamsByGroup)
    .sort()
    .map((g): GroupView => {
      const fixtures = core.groupMatches.filter((m) => m.groupName === g);
      const scored = fixtures
        .filter((m) => predByMatch.has(m.id))
        .map((m) => ({ ...predByMatch.get(m.id)!, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId }));
      const complete = scored.length === 6;
      const table =
        derived.groupTables[g] ??
        computeTable(core.teamsByGroup[g], scored, { lotsSeed: playerId });

      const rows = table.map((r, i): GroupRowView => {
        const qualifies = !complete
          ? null
          : i === 0
            ? "winner"
            : i === 1
              ? "runner_up"
              : i === 2 && qualifiedThirds.has(g)
                ? "best_third"
                : null;
        // Grade predicted qualifiers vs the real outcome (PLAN.MD §7b):
        // bright green = right team in exactly that slot, light green = team
        // qualified but in a different slot, red = team didn't qualify.
        let grade: Grade = "PENDING";
        if (qualifies && progress.groupsFinal && progress.complete.R32) {
          const realPos = realTables[g]?.indexOf(r.teamId) ?? -1;
          if (realPos === i) grade = "EXACT";
          else if (progress.reached.R32.has(r.teamId)) grade = "RESULT";
          else grade = "WRONG";
        }
        return {
          team: teamView(core.teamById.get(r.teamId))!,
          played: r.played,
          won: r.won,
          drawn: r.drawn,
          lost: r.lost,
          gf: r.gf,
          ga: r.ga,
          gd: r.gd,
          pts: r.pts,
          pos: i + 1,
          qualifies,
          grade,
        };
      });
      return { name: g, complete, predsMade: scored.length, rows };
    });

  return {
    groups,
    qualifiedThirdGroups: derived.qualifiedThirdGroups,
    realFinal: progress.groupsFinal,
  };
}

// ---------------------------------------------------------------------------
// Bracket
// ---------------------------------------------------------------------------

export interface BracketSideView {
  team: TeamView | null;
  label: string | null; // shown while the side is not derivable yet
  grade: Grade;
}

export interface BracketMatchView {
  num: number;
  round: string;
  kickoffUtc: string;
  venue: string | null;
  home: BracketSideView;
  away: BracketSideView;
  pred: { homeScore: number; awayScore: number; predWinnerTeamId: string | null } | null;
  locked: boolean;
  lockAtUtc: string;
  open: boolean;
  stale: boolean;
  realHome: TeamView | null;
  realAway: TeamView | null;
  realHomeScore: number | null;
  realAwayScore: number | null;
  realStatus: string;
}

export interface BracketPayload {
  rounds: { round: string; title: string; matches: BracketMatchView[] }[];
  champion: { team: TeamView; grade: Grade } | null;
  staleCount: number;
  groupsDone: number; // of 12 — how much of the cascade is unlocked
}

const ROUND_TITLES: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  THIRD: "Third place",
  FINAL: "Final",
};

export async function getBracketView(playerId: string): Promise<BracketPayload> {
  const core = await getCore();
  const [derived, progress, preds, cfg] = await Promise.all([
    derivePlayer(playerId, core),
    getRealProgress(core),
    prisma.scorePred.findMany({ where: { playerId, matchId: { gte: 73 } } }),
    getConfig(),
  ]);
  const predByMatch = new Map(preds.map((p) => [p.matchId, p]));
  const stale = new Set(derived.staleMatchNums);
  const open = new Set(derived.openMatchNums);
  const matchById = new Map(core.matches.map((m) => [m.id, m]));

  const side = (num: number, s: "H" | "A"): BracketSideView => {
    const teamId = derived.slots[slotKey(num, s)];
    const dbMatch = matchById.get(num);
    const rawSlot = s === "H" ? dbMatch?.homeSlot : dbMatch?.awaySlot;
    return {
      team: teamView(teamId ? core.teamById.get(teamId) : null),
      label: teamId ? null : slotLabel(rawSlot),
      grade: teamId ? gradeBracketSlot(slotKey(num, s), teamId, progress) : "PENDING",
    };
  };

  const rounds = (["R32", "R16", "QF", "SF", "THIRD", "FINAL"] as const).map((round) => ({
    round,
    title: ROUND_TITLES[round],
    matches: KO_MATCH_NUMS.filter((n) => roundOfMatch(n) === round).map((num): BracketMatchView => {
      const db = matchById.get(num)!;
      const p = predByMatch.get(num);
      return {
        num,
        round,
        kickoffUtc: db.kickoffUtc.toISOString(),
        venue: db.venue,
        home: side(num, "H"),
        away: side(num, "A"),
        pred: p
          ? { homeScore: p.homeScore, awayScore: p.awayScore, predWinnerTeamId: p.predWinnerTeamId }
          : null,
        locked: isMatchLocked(db.kickoffUtc, cfg.lockMinutes),
        lockAtUtc: matchLockAt(db.kickoffUtc, cfg.lockMinutes).toISOString(),
        open: open.has(num),
        stale: stale.has(num),
        realHome: teamView(db.homeTeamId ? core.teamById.get(db.homeTeamId) : null),
        realAway: teamView(db.awayTeamId ? core.teamById.get(db.awayTeamId) : null),
        realHomeScore: db.homeScore,
        realAwayScore: db.awayScore,
        realStatus: db.status,
      };
    }),
  }));

  const championId = derived.slots[CHAMPION_SLOT];
  return {
    rounds,
    champion: championId
      ? {
          team: teamView(core.teamById.get(championId))!,
          grade: gradeBracketSlot(CHAMPION_SLOT, championId, progress),
        }
      : null,
    staleCount: derived.staleMatchNums.length,
    groupsDone: Object.keys(derived.groupTables).length,
  };
}
