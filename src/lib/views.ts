// View models for the four tabs — server-side assembly shared by pages and
// API routes. Everything is plain JSON, ready to hand to client components.

import { prisma } from "./db";
import { getConfig, isMatchLocked, matchLockAt } from "./config";
import { getCore, derivePlayer, getRealProgress, realGroupTables, toMaps } from "./data";
import { gradeScore, type Grade } from "./grade";
import {
  boostTeamId,
  gradeBracketSlot,
  koMultiplierFor,
  koOpenAndStale,
  matchInvolves,
  matchPointsFor,
  perfectOrderGroups,
  predictedKoWinner,
  realWinnerLoser,
} from "./scoring";
import { computeTable, rankThirds } from "./standings";
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
  // knockout participants resolved from the real bracket (covers source lag)
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
  stale: boolean; // knockout pick made against a matchup reality no longer matches
}

export interface MatchesPayload {
  lockMinutes: number;
  /** Admin has manually closed all predictions (overrides the rolling window). */
  manualLock: boolean;
  matches: MatchView[];
}

export async function getMatchesView(playerId: string): Promise<MatchesPayload> {
  const [core, cfg, preds] = await Promise.all([
    getCore(),
    getConfig(),
    prisma.scorePred.findMany({ where: { playerId } }),
  ]);
  const progress = await getRealProgress(core);
  const predByMatch = new Map(preds.map((p) => [p.matchId, p]));
  const { koPreds } = toMaps(preds);
  const { open, stale } = koOpenAndStale(koPreds, progress);
  const boostedId = boostTeamId(cfg.scoring, core.teams);

  const matches = core.matches.map((m): MatchView => {
    const pred = predByMatch.get(m.id);
    const isGroup = m.stage === "GROUP";
    // knockouts: the real participants, via realSlots when the source lags
    const predHomeId = isGroup ? m.homeTeamId : progress.realSlots[slotKey(m.id, "H")];
    const predAwayId = isGroup ? m.awayTeamId : progress.realSlots[slotKey(m.id, "A")];
    const grade =
      m.status === "FINISHED" && m.homeScore != null && !stale.has(m.id)
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
      points: matchPointsFor(
        grade,
        cfg.scoring,
        matchInvolves(m, boostedId),
        koMultiplierFor(m.id, cfg.scoring)
      ),
      boost: matchInvolves(m, boostedId) ? cfg.scoring.boostMultiplier : null,
      locked: cfg.predictionsLocked || isMatchLocked(m.kickoffUtc, cfg.lockMinutes),
      lockAtUtc: matchLockAt(m.kickoffUtc, cfg.lockMinutes).toISOString(),
      open: isGroup || open.has(m.id),
      stale: stale.has(m.id),
    };
  });

  return { lockMinutes: cfg.lockMinutes, manualLock: cfg.predictionsLocked, matches };
}

// ---------------------------------------------------------------------------
// Single-match league view: everyone's pick for one match. Only assembled for
// LIVE/FINISHED matches — until kickoff, other players' predictions stay
// private (the matches API never serves them).
// ---------------------------------------------------------------------------

export interface MatchLeagueRowView {
  playerId: string;
  name: string;
  isYou: boolean;
  pred: {
    homeScore: number;
    awayScore: number;
    /** Winner pick on a drawn knockout score, resolved to a team. */
    winner: TeamView | null;
  } | null;
  /** Knockout pick made against a matchup reality no longer matches. */
  stale: boolean;
  grade: Grade;
  /** Match points (exact/result × boost × knockout-round multiplier), 0 until finished. */
  points: number;
}

export interface MatchLeaguePayload {
  matchId: number;
  status: string;
  finished: boolean;
  rows: MatchLeagueRowView[];
}

export async function getMatchLeagueView(
  matchId: number,
  viewerId: string
): Promise<MatchLeaguePayload | "hidden" | null> {
  const core = await getCore();
  const m = core.matches.find((x) => x.id === matchId);
  if (!m) return null;
  if (m.status !== "LIVE" && m.status !== "FINISHED") return "hidden";

  const [cfg, players, preds] = await Promise.all([
    getConfig(),
    prisma.player.findMany({ where: { isAdmin: false }, orderBy: { displayName: "asc" } }),
    prisma.scorePred.findMany({ where: { matchId } }),
  ]);
  const predByPlayer = new Map(preds.map((p) => [p.playerId, p]));
  const boosted = matchInvolves(m, boostTeamId(cfg.scoring, core.teams));
  const koMult = koMultiplierFor(m.id, cfg.scoring);
  const finished = m.status === "FINISHED" && m.homeScore != null && m.awayScore != null;

  const rows = players.map((pl): MatchLeagueRowView => {
    const p = predByPlayer.get(pl.id);
    // same snapshot rule as computeMatchPoints: a KO pred made against a
    // matchup that has since changed is not graded
    const stale =
      !!p &&
      !!(p.predHomeTeamId || p.predAwayTeamId) &&
      ((p.predHomeTeamId ?? null) !== (m.homeTeamId ?? null) ||
        (p.predAwayTeamId ?? null) !== (m.awayTeamId ?? null));
    const grade: Grade =
      finished && !stale
        ? gradeScore(p, { homeScore: m.homeScore!, awayScore: m.awayScore! })
        : "PENDING";
    return {
      playerId: pl.id,
      name: pl.displayName,
      isYou: pl.id === viewerId,
      pred: p
        ? {
            homeScore: p.homeScore,
            awayScore: p.awayScore,
            winner: teamView(p.predWinnerTeamId ? core.teamById.get(p.predWinnerTeamId) : null),
          }
        : null,
      stale,
      grade,
      points: matchPointsFor(grade, cfg.scoring, boosted, koMult),
    };
  });

  if (finished) {
    const gradeOrder: Record<Grade, number> = { EXACT: 0, RESULT: 1, WRONG: 2, PENDING: 3 };
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        gradeOrder[a.grade] - gradeOrder[b.grade] ||
        a.name.localeCompare(b.name)
    );
  }

  return { matchId, status: m.status, finished, rows };
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
  /** The real group is settled and the player called its exact 1st→4th order. */
  orderPerfect: boolean;
  rows: GroupRowView[];
}

export interface GroupsPayload {
  groups: GroupView[];
  /** Live tables built from real finished matches — updates as the days go on. */
  realGroups: GroupView[];
  qualifiedThirdGroups: string[] | null;
  realQualifiedThirdGroups: string[] | null;
  realFinal: boolean;
  /** Bonus points per exactly-ordered group (scoring.groupOrder). */
  orderBonus: number;
}

export async function getGroupsView(playerId: string): Promise<GroupsPayload> {
  const core = await getCore();
  const [derived, progress, preds, cfg] = await Promise.all([
    derivePlayer(playerId, core),
    getRealProgress(core),
    prisma.scorePred.findMany({ where: { playerId, matchId: { lte: 72 } } }),
    getConfig(),
  ]);
  const predByMatch = new Map(
    preds.map((p) => [p.matchId, { homeScore: p.homeScore, awayScore: p.awayScore }])
  );

  // Real tables computed live from finished matches — they feed the "Real"
  // view as the tournament unfolds and the correctness overlay once final.
  const { tables: realTables, played: realPlayed, settledGroups } = realGroupTables(core);
  // settled groups whose exact 1st→4th order the player called → gold + bonus
  const perfect = new Set(perfectOrderGroups(derived.groupTables, realTables, settledGroups));

  // Real best thirds are only knowable once every group has finished.
  let realQualifiedThirdGroups: string[] | null = null;
  if (progress.groupsFinal) {
    const thirds = Object.entries(realTables).map(([g, rows]) => ({
      ...rows[2],
      groupName: g,
    }));
    realQualifiedThirdGroups = rankThirds(thirds, "real")
      .slice(0, 8)
      .map((t) => t.groupName);
  }
  const realQualThirds = new Set(realQualifiedThirdGroups ?? []);

  const realGroups = Object.keys(core.teamsByGroup)
    .sort()
    .map((g): GroupView => {
      const complete = realPlayed[g] === 6;
      const rows = realTables[g].map(
        (r, i): GroupRowView => ({
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
          qualifies: !complete
            ? null
            : i === 0
              ? "winner"
              : i === 1
                ? "runner_up"
                : i === 2 && realQualThirds.has(g)
                  ? "best_third"
                  : null,
          grade: "PENDING",
        })
      );
      return { name: g, complete, predsMade: realPlayed[g], orderPerfect: false, rows };
    });

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
          const realPos = realTables[g]?.findIndex((row) => row.teamId === r.teamId) ?? -1;
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
      return { name: g, complete, predsMade: scored.length, orderPerfect: perfect.has(g), rows };
    });

  return {
    groups,
    realGroups,
    qualifiedThirdGroups: derived.qualifiedThirdGroups,
    realQualifiedThirdGroups,
    realFinal: progress.groupsFinal,
    orderBonus: cfg.scoring.groupOrder,
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
  /** Score-prediction grade vs the real result — drives the card color, same
   *  as the Matches tab (exact/result/wrong/pending). */
  grade: Grade;
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
  /** The player's predicted winner of the final, once they've picked it. */
  champion: { team: TeamView; grade: Grade } | null;
  staleCount: number;
  groupsFinal: boolean; // real group stage done — the R32 exists
  openCount: number; // knockout matches currently predictable
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
  const [progress, preds, cfg] = await Promise.all([
    getRealProgress(core),
    prisma.scorePred.findMany({ where: { playerId, matchId: { gte: 73 } } }),
    getConfig(),
  ]);
  const predByMatch = new Map(preds.map((p) => [p.matchId, p]));
  const { koPreds } = toMaps(preds);
  const { open, stale } = koOpenAndStale(koPreds, progress);
  const matchById = new Map(core.matches.map((m) => [m.id, m]));

  const rounds = (["R32", "R16", "QF", "SF", "THIRD", "FINAL"] as const).map((round) => ({
    round,
    title: ROUND_TITLES[round],
    matches: KO_MATCH_NUMS.filter((n) => roundOfMatch(n) === round).map((num): BracketMatchView => {
      const db = matchById.get(num)!;
      const p = predByMatch.get(num);
      const homeId = progress.realSlots[slotKey(num, "H")];
      const awayId = progress.realSlots[slotKey(num, "A")];

      // Grade the player's winner pick once the real match is decided:
      // the picked side turns gold when it went through, red when it didn't.
      const pickedWinner =
        p && homeId && awayId && !stale.has(num)
          ? predictedKoWinner(
              { homeScore: p.homeScore, awayScore: p.awayScore, winnerTeamId: p.predWinnerTeamId },
              homeId,
              awayId
            )
          : null;
      const { winner: realWinner } = realWinnerLoser(db);
      const sideGrade = (teamId: string | undefined): Grade =>
        teamId && pickedWinner === teamId && realWinner
          ? realWinner === teamId
            ? "EXACT"
            : "WRONG"
          : "PENDING";
      const side = (teamId: string | undefined, rawSlot: string | null): BracketSideView => ({
        team: teamView(teamId ? core.teamById.get(teamId) : null),
        label: teamId ? null : slotLabel(rawSlot),
        grade: sideGrade(teamId),
      });

      // Card-level grade: the player's predicted score vs the real result,
      // gated exactly like the Matches tab (a stale pick stays neutral).
      const finished = db.status === "FINISHED" && db.homeScore != null && db.awayScore != null;
      const grade: Grade =
        finished && !stale.has(num)
          ? gradeScore(p, { homeScore: db.homeScore!, awayScore: db.awayScore! })
          : "PENDING";

      return {
        num,
        round,
        kickoffUtc: db.kickoffUtc.toISOString(),
        venue: db.venue,
        home: side(homeId, db.homeSlot),
        away: side(awayId, db.awaySlot),
        pred: p
          ? { homeScore: p.homeScore, awayScore: p.awayScore, predWinnerTeamId: p.predWinnerTeamId }
          : null,
        grade,
        locked: cfg.predictionsLocked || isMatchLocked(db.kickoffUtc, cfg.lockMinutes),
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

  // Champion = the player's predicted winner of the final.
  const finalPred = koPreds.get(104);
  const finalHome = progress.realSlots[slotKey(104, "H")];
  const finalAway = progress.realSlots[slotKey(104, "A")];
  const championId =
    finalPred && finalHome && finalAway && !stale.has(104)
      ? predictedKoWinner(finalPred, finalHome, finalAway)
      : null;

  return {
    rounds,
    champion: championId
      ? {
          team: teamView(core.teamById.get(championId))!,
          grade: gradeBracketSlot(CHAMPION_SLOT, championId, progress),
        }
      : null,
    staleCount: stale.size,
    groupsFinal: progress.groupsFinal,
    openCount: open.size,
  };
}
