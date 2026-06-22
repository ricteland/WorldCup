// Bracket model: the official 2026 R32 pairing map, the best-thirds slot
// constraints, knockout wiring, and the prediction cascade (PLAN.MD §7).
//
// Pairings and wiring are transcribed from the official FIFA match schedule
// (matches 73–104) as published in openfootball/worldcup.json. Each knockout
// match is identified by its official number; bracket slots are "M{num}H",
// "M{num}A" plus "CHAMPION".

import {
  computeTable,
  rankThirds,
  type ScoredMatch,
  type TableRow,
  type ThirdRow,
} from "./standings";

export type Round = "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";
export type ScoringRound = "R32" | "R16" | "QF" | "SF" | "FINAL" | "CHAMPION";
/** Knockout rounds that are actually played as a match (third place aside). */
export type KoGameRound = Exclude<Round, "THIRD">;

export const SCORING_ROUNDS: ScoringRound[] = ["R32", "R16", "QF", "SF", "FINAL", "CHAMPION"];

export function roundOfMatch(num: number): Round {
  if (num >= 73 && num <= 88) return "R32";
  if (num >= 89 && num <= 96) return "R16";
  if (num >= 97 && num <= 100) return "QF";
  if (num >= 101 && num <= 102) return "SF";
  if (num === 103) return "THIRD";
  if (num === 104) return "FINAL";
  throw new Error(`Not a knockout match: ${num}`);
}

export type SeedRef =
  | { kind: "pos"; pos: 1 | 2; group: string }
  | { kind: "third"; groups: string[] };

const pos = (p: 1 | 2, group: string): SeedRef => ({ kind: "pos", pos: p, group });
const third = (g: string): SeedRef => ({ kind: "third", groups: g.split("") });

/** Official Round-of-32 pairing map (matches 73–88). */
export const R32_SEEDS: Record<number, { home: SeedRef; away: SeedRef }> = {
  73: { home: pos(2, "A"), away: pos(2, "B") },
  74: { home: pos(1, "E"), away: third("ABCDF") },
  75: { home: pos(1, "F"), away: pos(2, "C") },
  76: { home: pos(1, "C"), away: pos(2, "F") },
  77: { home: pos(1, "I"), away: third("CDFGH") },
  78: { home: pos(2, "E"), away: pos(2, "I") },
  79: { home: pos(1, "A"), away: third("CEFHI") },
  80: { home: pos(1, "L"), away: third("EHIJK") },
  81: { home: pos(1, "D"), away: third("BEFIJ") },
  82: { home: pos(1, "G"), away: third("AEHIJ") },
  83: { home: pos(2, "K"), away: pos(2, "L") },
  84: { home: pos(1, "H"), away: pos(2, "J") },
  85: { home: pos(1, "B"), away: third("EFGIJ") },
  86: { home: pos(1, "J"), away: pos(2, "H") },
  87: { home: pos(1, "K"), away: third("DEIJL") },
  88: { home: pos(2, "D"), away: pos(2, "G") },
};

export type KoSrc = { win: number } | { lose: number };

/** Knockout wiring: where each match's participants come from (matches 89–104). */
export const KO_SOURCES: Record<number, { home: KoSrc; away: KoSrc }> = {
  89: { home: { win: 74 }, away: { win: 77 } },
  90: { home: { win: 73 }, away: { win: 75 } },
  91: { home: { win: 76 }, away: { win: 78 } },
  92: { home: { win: 79 }, away: { win: 80 } },
  93: { home: { win: 83 }, away: { win: 84 } },
  94: { home: { win: 81 }, away: { win: 82 } },
  95: { home: { win: 86 }, away: { win: 88 } },
  96: { home: { win: 85 }, away: { win: 87 } },
  97: { home: { win: 89 }, away: { win: 90 } },
  98: { home: { win: 93 }, away: { win: 94 } },
  99: { home: { win: 91 }, away: { win: 92 } },
  100: { home: { win: 95 }, away: { win: 96 } },
  101: { home: { win: 97 }, away: { win: 98 } },
  102: { home: { win: 99 }, away: { win: 100 } },
  103: { home: { lose: 101 }, away: { lose: 102 } },
  104: { home: { win: 101 }, away: { win: 102 } },
};

export const KO_MATCH_NUMS = Array.from({ length: 32 }, (_, i) => 73 + i);

export const slotKey = (num: number, side: "H" | "A") => `M${num}${side}`;
export const CHAMPION_SLOT = "CHAMPION";

export function roundOfSlot(slot: string): ScoringRound | "THIRD" {
  if (slot === CHAMPION_SLOT) return "CHAMPION";
  const num = Number(slot.slice(1, -1));
  const r = roundOfMatch(num);
  return r === "FINAL" ? "FINAL" : r;
}

/** Matches whose away side takes a third-placed team, with allowed groups. */
export const THIRD_SLOT_MATCHES = Object.entries(R32_SEEDS)
  .filter(([, v]) => v.away.kind === "third")
  .map(([num, v]) => ({ num: Number(num), groups: (v.away as { groups: string[] }).groups }))
  .sort((a, b) => a.num - b.num);

/**
 * Assign the 8 qualified third-placed groups to the 8 third-taking R32 slots,
 * respecting each slot's allowed-groups constraint. Deterministic backtracking:
 * slots in match order, candidates in thirds-ranking order. (FIFA's official
 * annex enumerates the combinations; this produces a valid, deterministic
 * assignment from the same constraints.)
 */
export function allocateThirds(qualifiedGroupsRanked: string[]): Record<number, string> | null {
  const slots = THIRD_SLOT_MATCHES;
  const used = new Set<string>();
  const out: Record<number, string> = {};

  function backtrack(i: number): boolean {
    if (i === slots.length) return true;
    const slot = slots[i];
    for (const g of qualifiedGroupsRanked) {
      if (used.has(g) || !slot.groups.includes(g)) continue;
      used.add(g);
      out[slot.num] = g;
      if (backtrack(i + 1)) return true;
      used.delete(g);
      delete out[slot.num];
    }
    return false;
  }

  return backtrack(0) ? out : null;
}

// ---------------------------------------------------------------------------
// The cascade: scores → group tables → qualifiers → R32 seeding → advancement.
// Pure; used for each player's predicted bracket.
// ---------------------------------------------------------------------------

export interface KoScoreEntry {
  homeScore: number;
  awayScore: number;
  /** Winner pick, required when the score is a draw. */
  winnerTeamId?: string | null;
  /** Snapshot of the participants the prediction was made against. */
  snapHomeTeamId?: string | null;
  snapAwayTeamId?: string | null;
}

export interface DeriveInput {
  /** The 72 group fixtures (real schedule). */
  groupMatches: { id: number; groupName: string; homeTeamId: string; awayTeamId: string }[];
  teamsByGroup: Record<string, string[]>;
  /** Predicted (or real) scores for group matches, by match id. */
  groupScores: Map<number, { homeScore: number; awayScore: number }>;
  /** Predicted (or real) knockout entries, by match num (73–104). */
  koScores: Map<number, KoScoreEntry>;
  fairPlay?: Record<string, number>;
  lotsSeed: string;
}

export interface DeriveResult {
  /** Ranked table per group — only groups whose 6 scores are all present. */
  groupTables: Record<string, TableRow[]>;
  /** All 12 thirds ranked best→worst; null until every group is complete. */
  thirdsRanked: ThirdRow[] | null;
  qualifiedThirdGroups: string[] | null;
  /** R32 match num → group whose third fills its away slot. */
  thirdAllocation: Record<number, string> | null;
  /** slotKey → teamId for every derivable slot, plus CHAMPION. */
  slots: Record<string, string>;
  /** Knockout matches whose stored snapshot disagrees with the cascade. */
  staleMatchNums: number[];
  /** Knockout matches with both participants known (i.e. predictable now). */
  openMatchNums: number[];
}

export function deriveBracket(input: DeriveInput): DeriveResult {
  const { groupMatches, teamsByGroup, groupScores, koScores, fairPlay, lotsSeed } = input;

  // 1. Group tables for complete groups.
  const groupTables: Record<string, TableRow[]> = {};
  const groups = Object.keys(teamsByGroup).sort();
  for (const g of groups) {
    const fixtures = groupMatches.filter((m) => m.groupName === g);
    const scored: ScoredMatch[] = [];
    for (const f of fixtures) {
      const s = groupScores.get(f.id);
      if (!s) continue;
      scored.push({ ...s, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId });
    }
    if (fixtures.length === 6 && scored.length === 6) {
      groupTables[g] = computeTable(teamsByGroup[g], scored, { fairPlay, lotsSeed });
    }
  }

  // 2. Thirds ranking + allocation — needs all 12 groups.
  let thirdsRanked: ThirdRow[] | null = null;
  let qualifiedThirdGroups: string[] | null = null;
  let thirdAllocation: Record<number, string> | null = null;
  if (groups.length === 12 && groups.every((g) => groupTables[g])) {
    const thirds: ThirdRow[] = groups.map((g) => ({ ...groupTables[g][2], groupName: g }));
    thirdsRanked = rankThirds(thirds, lotsSeed);
    qualifiedThirdGroups = thirdsRanked.slice(0, 8).map((t) => t.groupName);
    thirdAllocation = allocateThirds(qualifiedThirdGroups);
  }

  // 3. Seed R32 slots.
  const slots: Record<string, string> = {};
  const seedTeam = (num: number, ref: SeedRef): string | undefined => {
    if (ref.kind === "pos") return groupTables[ref.group]?.[ref.pos - 1]?.teamId;
    const g = thirdAllocation?.[num];
    return g ? groupTables[g][2].teamId : undefined;
  };
  for (const [numStr, seed] of Object.entries(R32_SEEDS)) {
    const num = Number(numStr);
    const h = seedTeam(num, seed.home);
    const a = seedTeam(num, seed.away);
    if (h) slots[slotKey(num, "H")] = h;
    if (a) slots[slotKey(num, "A")] = a;
  }

  // 4. Advance winners through the knockout wiring.
  const staleMatchNums: number[] = [];
  const openMatchNums: number[] = [];
  for (const num of KO_MATCH_NUMS) {
    const src = KO_SOURCES[num];
    if (src) {
      // fill participants from feeder results (already resolved: lower nums first)
      for (const side of ["home", "away"] as const) {
        const ref = src[side];
        const k = slotKey(num, side === "home" ? "H" : "A");
        if ("win" in ref) {
          const w = slots[`WIN${ref.win}`];
          if (w) slots[k] = w;
        } else {
          const l = slots[`LOSE${ref.lose}`];
          if (l) slots[k] = l;
        }
      }
    }
    const home = slots[slotKey(num, "H")];
    const away = slots[slotKey(num, "A")];
    if (!home || !away) continue;
    openMatchNums.push(num);

    const entry = koScores.get(num);
    if (!entry) continue;
    if (
      (entry.snapHomeTeamId && entry.snapHomeTeamId !== home) ||
      (entry.snapAwayTeamId && entry.snapAwayTeamId !== away)
    ) {
      staleMatchNums.push(num);
      continue; // stale prediction can't advance anyone
    }
    let winner: string | undefined;
    let loser: string | undefined;
    if (entry.homeScore > entry.awayScore) [winner, loser] = [home, away];
    else if (entry.awayScore > entry.homeScore) [winner, loser] = [away, home];
    else if (entry.winnerTeamId === home) [winner, loser] = [home, away];
    else if (entry.winnerTeamId === away) [winner, loser] = [away, home];
    else {
      staleMatchNums.push(num); // draw without a valid winner pick
      continue;
    }
    slots[`WIN${num}`] = winner;
    slots[`LOSE${num}`] = loser;
    if (num === 104) slots[CHAMPION_SLOT] = winner;
  }

  // WIN/LOSE markers were scaffolding, not real slots.
  for (const k of Object.keys(slots)) {
    if (k.startsWith("WIN") || k.startsWith("LOSE")) delete slots[k];
  }

  return {
    groupTables,
    thirdsRanked,
    qualifiedThirdGroups,
    thirdAllocation,
    slots,
    staleMatchNums,
    openMatchNums,
  };
}

/** Teams a slot-map places in each scoring round (THIRD excluded — not scored). */
export function reachedByRound(slots: Record<string, string>): Record<ScoringRound, Set<string>> {
  const out: Record<ScoringRound, Set<string>> = {
    R32: new Set(),
    R16: new Set(),
    QF: new Set(),
    SF: new Set(),
    FINAL: new Set(),
    CHAMPION: new Set(),
  };
  for (const [slot, teamId] of Object.entries(slots)) {
    const r = roundOfSlot(slot);
    if (r === "THIRD") continue;
    out[r].add(teamId);
  }
  return out;
}

export const EXPECTED_ROUND_SIZE: Record<ScoringRound, number> = {
  R32: 32,
  R16: 16,
  QF: 8,
  SF: 4,
  FINAL: 2,
  CHAMPION: 1,
};
