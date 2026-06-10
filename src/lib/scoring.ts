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
  KO_SOURCES,
  CHAMPION_SLOT,
  SCORING_ROUNDS,
  type ScoringRound,
} from "./bracket";

export interface ScoringConfig {
  exact: number;
  result: number;
  bracket: Record<ScoringRound, number>;
}

export const DEFAULT_SCORING: ScoringConfig = {
  exact: 5,
  result: 2,
  bracket: { R32: 1, R16: 2, QF: 4, SF: 6, FINAL: 8, CHAMPION: 12 },
};

export function matchPointsFor(grade: Grade, cfg: ScoringConfig): number {
  if (grade === "EXACT") return cfg.exact;
  if (grade === "RESULT") return cfg.result;
  return 0;
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

function realWinnerLoser(m: RealMatch): { winner?: string; loser?: string } {
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

/** Bracket points: +N per team correctly placed in each round (PLAN.MD §6). */
export function computeBracketPoints(
  slots: Record<string, string>,
  progress: RealProgress,
  cfg: ScoringConfig
): { total: number; byRound: Record<ScoringRound, number> } {
  const mine = reachedByRound(slots);
  const byRound = {} as Record<ScoringRound, number>;
  let total = 0;
  for (const r of SCORING_ROUNDS) {
    let correct = 0;
    for (const t of mine[r]) if (progress.reached[r].has(t)) correct++;
    byRound[r] = correct * cfg.bracket[r];
    total += byRound[r];
  }
  return { total, byRound };
}

/** Match-prediction points for one player across all finished matches. */
export function computeMatchPoints(
  preds: Map<number, { homeScore: number; awayScore: number }>,
  matches: RealMatch[],
  cfg: ScoringConfig
): { total: number; graded: Map<number, Grade> } {
  let total = 0;
  const graded = new Map<number, Grade>();
  for (const m of matches) {
    if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
    const pred = preds.get(m.id);
    const g = gradeScore(pred, { homeScore: m.homeScore, awayScore: m.awayScore });
    graded.set(m.id, g);
    total += matchPointsFor(g, cfg);
  }
  return { total, graded };
}
