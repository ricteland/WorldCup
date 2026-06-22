// Scoring (PLAN.MD §6) + real-tournament progress used to grade brackets.
// Pure functions; weights come from Settings so they can be tuned live.

import { gradeScore, type Grade } from "./grade";
import {
  deriveBracket,
  reachedByRound,
  roundOfMatch,
  roundOfSlot,
  slotKey,
  EXPECTED_ROUND_SIZE,
  KO_MATCH_NUMS,
  KO_SOURCES,
  CHAMPION_SLOT,
  SCORING_ROUNDS,
  type ScoringRound,
  type KoGameRound,
} from "./bracket";

export interface ScoringConfig {
  exact: number;
  /** Right result, wrong score. */
  result: number;
  /** Bonus per group whose final order was predicted exactly (1st→4th). */
  groupOrder: number;
  /** Points per real qualifier among the 32 a player's group tables send through. */
  r32Qualifier: number;
  /** Match points are multiplied by this factor for knockout games, by round —
   *  the deeper the round, the bigger the prize. */
  koMultiplier: Record<KoGameRound, number>;
  /** Match points are multiplied when this team plays (the league is Spanish). */
  boostTeamCode: string | null;
  boostMultiplier: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  exact: 5,
  result: 3,
  groupOrder: 3,
  r32Qualifier: 1,
  koMultiplier: { R32: 2, R16: 3, QF: 4, SF: 5, FINAL: 6 },
  boostTeamCode: "ESP",
  boostMultiplier: 3,
};

export function matchPointsFor(
  grade: Grade,
  cfg: ScoringConfig,
  boosted = false,
  koMultiplier = 1
): number {
  const base = grade === "EXACT" ? cfg.exact : grade === "RESULT" ? cfg.result : 0;
  return base * (boosted ? cfg.boostMultiplier : 1) * koMultiplier;
}

/**
 * Knockout points multiplier for a match, by round (R32 ×2 … Final ×6 by
 * default). Group games and the third-place play-off score normally (×1).
 */
export function koMultiplierFor(matchId: number, cfg: ScoringConfig): number {
  if (matchId <= 72) return 1;
  const round = roundOfMatch(matchId);
  return round === "THIRD" ? 1 : cfg.koMultiplier[round];
}

/** Resolve the boosted team's id (cuid) from its code, or null when disabled. */
export function boostTeamId(
  cfg: ScoringConfig,
  teams: { id: string; code: string }[]
): string | null {
  if (!cfg.boostTeamCode || cfg.boostMultiplier === 1) return null;
  return teams.find((t) => t.code === cfg.boostTeamCode)?.id ?? null;
}

export function matchInvolves(
  m: { homeTeamId?: string | null; awayTeamId?: string | null },
  teamId: string | null
): boolean {
  return teamId != null && (m.homeTeamId === teamId || m.awayTeamId === teamId);
}

// ---------------------------------------------------------------------------
// Real tournament progress
// ---------------------------------------------------------------------------

export interface RealMatch {
  id: number;
  stage: string; // GROUP | R32 | R16 | QF | SF | THIRD | FINAL
  groupName?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status: string; // SCHEDULED | LIVE | FINISHED
  winnerTeamId?: string | null; // knockout: set when decided on penalties
}

export interface RealProgress {
  /** Teams known to have reached each scoring round (may be partial). */
  reached: Record<ScoringRound, Set<string>>;
  /** True once the round's membership is fully known. */
  complete: Record<ScoringRound, boolean>;
  /** Teams that can no longer appear in any later round. */
  eliminated: Set<string>;
  /** Known real slot occupants (M73H… + CHAMPION). */
  realSlots: Record<string, string>;
  groupsFinal: boolean;
}

export function realWinnerLoser(m: RealMatch): { winner?: string; loser?: string } {
  if (m.status !== "FINISHED" || !m.homeTeamId || !m.awayTeamId) return {};
  if (m.winnerTeamId) {
    return {
      winner: m.winnerTeamId,
      loser: m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId,
    };
  }
  if (m.homeScore == null || m.awayScore == null) return {};
  if (m.homeScore > m.awayScore) return { winner: m.homeTeamId, loser: m.awayTeamId };
  if (m.awayScore > m.homeScore) return { winner: m.awayTeamId, loser: m.homeTeamId };
  return {}; // drawn knockout with no recorded winner yet
}

/**
 * Compute who has really reached each round so far. Prefers the actual team
 * assignments recorded on knockout matches (FIFA's official seeding); falls
 * back to deriving qualifiers from final group tables while the source hasn't
 * filled the R32 pairings in yet.
 */
export function computeRealProgress(input: {
  matches: RealMatch[];
  teamsByGroup: Record<string, string[]>;
  fairPlay?: Record<string, number>;
  lotsSeed?: string;
}): RealProgress {
  const { matches, teamsByGroup, fairPlay } = input;
  const lotsSeed = input.lotsSeed ?? "real";
  const reached: Record<ScoringRound, Set<string>> = {
    R32: new Set(),
    R16: new Set(),
    QF: new Set(),
    SF: new Set(),
    FINAL: new Set(),
    CHAMPION: new Set(),
  };
  const realSlots: Record<string, string> = {};
  const eliminated = new Set<string>();

  const groupMatches = matches.filter((m) => m.stage === "GROUP");
  const groupsFinal =
    groupMatches.length === 72 && groupMatches.every((m) => m.status === "FINISHED");

  // Slot assignments straight from reality (and winners of finished games).
  const ko = matches.filter((m) => m.stage !== "GROUP").sort((a, b) => a.id - b.id);
  for (const m of ko) {
    const round = roundOfMatch(m.id);
    const scoringRound: ScoringRound | null = round === "THIRD" ? null : round;
    if (m.homeTeamId) {
      realSlots[slotKey(m.id, "H")] = m.homeTeamId;
      if (scoringRound) reached[scoringRound].add(m.homeTeamId);
    }
    if (m.awayTeamId) {
      realSlots[slotKey(m.id, "A")] = m.awayTeamId;
      if (scoringRound) reached[scoringRound].add(m.awayTeamId);
    }
    const { winner, loser } = realWinnerLoser(m);
    if (winner && m.id === 104) {
      reached.CHAMPION.add(winner);
      realSlots[CHAMPION_SLOT] = winner;
    }
    if (winner) {
      // also propagate forward in case the source hasn't filled next round yet
      for (const [nextNum, src] of Object.entries(KO_SOURCES)) {
        for (const side of ["home", "away"] as const) {
          const ref = src[side];
          const team = "win" in ref && ref.win === m.id ? winner : "lose" in ref && ref.lose === m.id ? loser : undefined;
          if (!team) continue;
          const k = slotKey(Number(nextNum), side === "home" ? "H" : "A");
          realSlots[k] ??= team;
          const r = roundOfSlot(k);
          if (r !== "THIRD") reached[r].add(team);
        }
      }
    }
    if (loser && round !== "THIRD") eliminated.add(loser);
  }

  // Fall back to deriving the 32 qualifiers from final group tables when the
  // source hasn't updated R32 team names yet.
  if (groupsFinal && reached.R32.size < 32) {
    const derived = deriveBracket({
      groupMatches: groupMatches.map((m) => ({
        id: m.id,
        groupName: m.groupName!,
        homeTeamId: m.homeTeamId!,
        awayTeamId: m.awayTeamId!,
      })),
      teamsByGroup,
      groupScores: new Map(
        groupMatches.map((m) => [m.id, { homeScore: m.homeScore!, awayScore: m.awayScore! }])
      ),
      koScores: new Map(),
      fairPlay,
      lotsSeed,
    });
    for (const [slot, team] of Object.entries(derived.slots)) {
      if (roundOfSlot(slot) !== "R32") continue;
      realSlots[slot] ??= team;
      reached.R32.add(team);
    }
  }

  if (groupsFinal && reached.R32.size === 32) {
    const all = Object.values(teamsByGroup).flat();
    for (const t of all) if (!reached.R32.has(t)) eliminated.add(t);
  }

  const complete = Object.fromEntries(
    SCORING_ROUNDS.map((r) => [r, reached[r].size >= EXPECTED_ROUND_SIZE[r]])
  ) as Record<ScoringRound, boolean>;

  return { reached, complete, eliminated, realSlots, groupsFinal };
}

// ---------------------------------------------------------------------------
// Grading & points
// ---------------------------------------------------------------------------

/** Grade one predicted bracket slot against reality (PLAN.MD §7b). */
export function gradeBracketSlot(slot: string, teamId: string, progress: RealProgress): Grade {
  const round = roundOfSlot(slot);
  if (round === "THIRD") {
    // not scored; still colored: exact slot match or pending/wrong on elimination
    if (progress.realSlots[slot] === teamId) return "EXACT";
    if (progress.realSlots[slot]) return "WRONG";
    return progress.eliminated.has(teamId) ? "WRONG" : "PENDING";
  }
  if (progress.realSlots[slot] === teamId) return "EXACT";
  if (progress.reached[round].has(teamId)) return "RESULT"; // right round, other slot
  if (progress.complete[round] || progress.eliminated.has(teamId)) return "WRONG";
  return "PENDING";
}

// ---------------------------------------------------------------------------
// Round-by-round knockout picks (made against the real bracket)
// ---------------------------------------------------------------------------

export interface KoPredEntry {
  homeScore: number;
  awayScore: number;
  /** Winner pick, required when the predicted score is a draw. */
  winnerTeamId?: string | null;
  /** Real participants the prediction was made against. */
  snapHomeTeamId?: string | null;
  snapAwayTeamId?: string | null;
}

/** The team a knockout prediction sends through, given the real matchup. */
export function predictedKoWinner(
  entry: { homeScore: number; awayScore: number; winnerTeamId?: string | null },
  realHome: string,
  realAway: string
): string | null {
  if (entry.homeScore > entry.awayScore) return realHome;
  if (entry.awayScore > entry.homeScore) return realAway;
  if (entry.winnerTeamId === realHome || entry.winnerTeamId === realAway)
    return entry.winnerTeamId;
  return null;
}

const koPredStale = (
  p: { snapHomeTeamId?: string | null; snapAwayTeamId?: string | null },
  home: string | undefined,
  away: string | undefined
) => (p.snapHomeTeamId ?? null) !== (home ?? null) || (p.snapAwayTeamId ?? null) !== (away ?? null);

/**
 * Per-match knockout gating: a match is open once both real participants are
 * known; a stored pick is stale when reality no longer matches its snapshot
 * (a sync/admin correction changed the matchup — re-enter the pick).
 */
export function koOpenAndStale(
  koPreds: Map<number, { snapHomeTeamId?: string | null; snapAwayTeamId?: string | null }>,
  progress: RealProgress
): { open: Set<number>; stale: Set<number> } {
  const open = new Set<number>();
  const stale = new Set<number>();
  for (const num of KO_MATCH_NUMS) {
    const home = progress.realSlots[slotKey(num, "H")];
    const away = progress.realSlots[slotKey(num, "A")];
    if (home && away) open.add(num);
    const p = koPreds.get(num);
    if (p && koPredStale(p, home, away)) stale.add(num);
  }
  return { open, stale };
}

/**
 * Bracket points (PLAN.MD §6, round-by-round edition):
 * +cfg.r32Qualifier per real qualifier among the 32 teams the player's own
 * predicted group tables send through — the only bracket points still driven by
 * group-stage predictions. Knockout progress is rewarded through the per-round
 * match-point multiplier (see koMultiplierFor), not flat advancement bonuses.
 */
export function computeBracketPoints(input: {
  /** The player's derived slots from group predictions (R32 seeding only). */
  groupSlots: Record<string, string>;
  progress: RealProgress;
  cfg: ScoringConfig;
}): { total: number } {
  const { groupSlots, progress, cfg } = input;
  let correct = 0;
  for (const t of reachedByRound(groupSlots).R32) if (progress.reached.R32.has(t)) correct++;
  return { total: correct * cfg.r32Qualifier };
}

/**
 * Group names whose predicted final order (1st→4th) matches the real one
 * exactly — judged group by group as each real group is settled. Worth
 * cfg.groupOrder bonus points apiece.
 */
export function perfectOrderGroups(
  predTables: Record<string, { teamId: string }[]>,
  realTables: Record<string, { teamId: string }[]>,
  settledGroups: Iterable<string>
): string[] {
  const out: string[] = [];
  for (const g of settledGroups) {
    const pred = predTables[g];
    const real = realTables[g];
    if (!pred || !real || pred.length !== real.length) continue;
    if (pred.every((row, i) => row.teamId === real[i].teamId)) out.push(g);
  }
  return out.sort();
}

/**
 * Match-prediction points for one player across all finished matches.
 * Knockout preds carry a snapshot of the matchup they were made against;
 * a pred whose snapshot disagrees with the real participants is not graded.
 */
export function computeMatchPoints(
  preds: Map<
    number,
    {
      homeScore: number;
      awayScore: number;
      snapHomeTeamId?: string | null;
      snapAwayTeamId?: string | null;
    }
  >,
  matches: RealMatch[],
  cfg: ScoringConfig,
  boostedTeamId: string | null = null
): { total: number; graded: Map<number, Grade> } {
  let total = 0;
  const graded = new Map<number, Grade>();
  for (const m of matches) {
    if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
    let pred = preds.get(m.id);
    // group preds carry no snapshot; KO preds always do
    if (
      pred &&
      (pred.snapHomeTeamId || pred.snapAwayTeamId) &&
      koPredStale(pred, m.homeTeamId ?? undefined, m.awayTeamId ?? undefined)
    ) {
      pred = undefined;
    }
    const g = gradeScore(pred, { homeScore: m.homeScore, awayScore: m.awayScore });
    graded.set(m.id, g);
    total += matchPointsFor(g, cfg, matchInvolves(m, boostedTeamId), koMultiplierFor(m.id, cfg));
  }
  return { total, graded };
}
