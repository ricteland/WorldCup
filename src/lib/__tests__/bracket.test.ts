import { describe, expect, it } from "vitest";
import {
  allocateThirds,
  deriveBracket,
  reachedByRound,
  roundOfMatch,
  roundOfSlot,
  slotKey,
  R32_SEEDS,
  KO_SOURCES,
  KO_MATCH_NUMS,
  THIRD_SLOT_MATCHES,
  CHAMPION_SLOT,
  type DeriveInput,
  type KoScoreEntry,
} from "../bracket";

const GROUPS = "ABCDEFGHIJKL".split("");

// ---------------------------------------------------------------------------
// Synthetic tournament fixtures: teams "A1".."L4"; 72 group matches id 1..72.
// ---------------------------------------------------------------------------

const teamsByGroup = Object.fromEntries(
  GROUPS.map((g) => [g, [1, 2, 3, 4].map((i) => `${g}${i}`)])
);

const PAIRINGS: [number, number][] = [
  [1, 2],
  [3, 4],
  [1, 3],
  [2, 4],
  [1, 4],
  [2, 3],
];

const groupMatches = GROUPS.flatMap((g, gi) =>
  PAIRINGS.map(([h, a], mi) => ({
    id: gi * 6 + mi + 1,
    groupName: g,
    homeTeamId: `${g}${h}`,
    awayTeamId: `${g}${a}`,
  }))
);

/** Scores making team N finish in position N in every group (1 beats all, etc). */
function deterministicGroupScores(): Map<number, { homeScore: number; awayScore: number }> {
  const map = new Map<number, { homeScore: number; awayScore: number }>();
  for (const m of groupMatches) {
    const h = Number(m.homeTeamId[1]);
    const a = Number(m.awayTeamId[1]);
    // lower index wins, margin shrinks with index so GD also orders 1>2>3>4
    map.set(m.id, h < a ? { homeScore: 5 - h, awayScore: 0 } : { homeScore: 0, awayScore: 5 - a });
  }
  return map;
}

/** Knockout entries: home side always wins 2-1. */
function homeWinsKo(): Map<number, KoScoreEntry> {
  return new Map(KO_MATCH_NUMS.map((n) => [n, { homeScore: 2, awayScore: 1 }]));
}

function fullInput(overrides?: Partial<DeriveInput>): DeriveInput {
  return {
    groupMatches,
    teamsByGroup,
    groupScores: deterministicGroupScores(),
    koScores: homeWinsKo(),
    lotsSeed: "test",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("static bracket maps", () => {
  it("has 16 R32 matches, 8 of them taking a third-placed team", () => {
    expect(Object.keys(R32_SEEDS)).toHaveLength(16);
    expect(THIRD_SLOT_MATCHES).toHaveLength(8);
  });

  it("covers every group winner and runner-up exactly once", () => {
    const refs = Object.values(R32_SEEDS).flatMap((m) => [m.home, m.away]);
    for (const p of [1, 2] as const) {
      const groups = refs.filter((r) => r.kind === "pos" && r.pos === p).map((r) => (r as { group: string }).group);
      expect([...groups].sort()).toEqual(GROUPS);
    }
  });

  it("wires every R32/R16/QF winner into exactly one next-round slot", () => {
    const winRefs = Object.values(KO_SOURCES)
      .flatMap((m) => [m.home, m.away])
      .filter((r) => "win" in r)
      .map((r) => (r as { win: number }).win);
    // winners of 73..102 each appear once; 101/102 winners appear in the final
    expect([...winRefs].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 30 }, (_, i) => 73 + i)
    );
    const loseRefs = Object.values(KO_SOURCES)
      .flatMap((m) => [m.home, m.away])
      .filter((r) => "lose" in r)
      .map((r) => (r as { lose: number }).lose);
    expect(loseRefs.sort()).toEqual([101, 102]);
  });

  it("maps match numbers to rounds", () => {
    expect(roundOfMatch(73)).toBe("R32");
    expect(roundOfMatch(96)).toBe("R16");
    expect(roundOfMatch(100)).toBe("QF");
    expect(roundOfMatch(102)).toBe("SF");
    expect(roundOfMatch(103)).toBe("THIRD");
    expect(roundOfMatch(104)).toBe("FINAL");
    expect(roundOfSlot("M104H")).toBe("FINAL");
    expect(roundOfSlot(CHAMPION_SLOT)).toBe("CHAMPION");
  });
});

describe("allocateThirds", () => {
  it("solves every possible combination of 8 qualified thirds", () => {
    // C(12,8) = 495 combinations — all must be assignable per the constraints.
    const combos: string[][] = [];
    const pick = (start: number, acc: string[]) => {
      if (acc.length === 8) return combos.push([...acc]);
      for (let i = start; i < GROUPS.length; i++) pick(i + 1, [...acc, GROUPS[i]]);
    };
    pick(0, []);
    expect(combos).toHaveLength(495);
    for (const combo of combos) {
      const alloc = allocateThirds(combo);
      expect(alloc, `unsolvable: ${combo.join(",")}`).not.toBeNull();
      const assigned = Object.values(alloc!);
      expect(new Set(assigned).size).toBe(8);
      for (const { num, groups } of THIRD_SLOT_MATCHES) {
        expect(groups).toContain(alloc![num]);
      }
    }
  });

  it("is deterministic", () => {
    const q = ["A", "C", "E", "F", "H", "I", "J", "L"];
    expect(allocateThirds(q)).toEqual(allocateThirds(q));
  });
});

describe("deriveBracket — the cascade", () => {
  it("computes nothing for incomplete groups", () => {
    const scores = deterministicGroupScores();
    scores.delete(1); // group A missing one prediction
    const res = deriveBracket(fullInput({ groupScores: scores, koScores: new Map() }));
    expect(res.groupTables["A"]).toBeUndefined();
    expect(res.groupTables["B"]).toBeDefined();
    expect(res.thirdsRanked).toBeNull(); // thirds need all 12 groups
    // 1B-style slots for complete groups are seeded; third slots are not
    expect(res.slots[slotKey(85, "H")]).toBe("B1");
    expect(res.slots[slotKey(74, "A")]).toBeUndefined();
  });

  it("seeds all 32 R32 slots and cascades to a champion", () => {
    const res = deriveBracket(fullInput());
    // every group table ranked 1..4 by construction
    for (const g of GROUPS) {
      expect(res.groupTables[g].map((r) => r.teamId)).toEqual([`${g}1`, `${g}2`, `${g}3`, `${g}4`]);
    }
    // all thirds tie on pts/gd/gf by construction → ranking is via lots, but 8 qualify
    expect(res.qualifiedThirdGroups).toHaveLength(8);
    // 32 R32 slots + 16 R16 + 8 QF + 4 SF + 2 THIRD + 2 FINAL + champion
    const reached = reachedByRound(res.slots);
    expect(reached.R32.size).toBe(32);
    expect(reached.R16.size).toBe(16);
    expect(reached.QF.size).toBe(8);
    expect(reached.SF.size).toBe(4);
    expect(reached.FINAL.size).toBe(2);
    expect(reached.CHAMPION.size).toBe(1);
    expect(res.staleMatchNums).toHaveLength(0);
    expect(res.openMatchNums).toEqual(KO_MATCH_NUMS);
    // home always wins → champion is the home seed of the final
    expect(res.slots[CHAMPION_SLOT]).toBe(res.slots[slotKey(104, "H")]);
    // third-place match is fed by the semi-final losers
    expect(res.slots[slotKey(103, "H")]).toBe(res.slots[slotKey(101, "A")]);
  });

  it("requires a winner pick for drawn knockout scores", () => {
    const ko = homeWinsKo();
    ko.set(73, { homeScore: 1, awayScore: 1 }); // draw, no winner picked
    const res = deriveBracket(fullInput({ koScores: ko }));
    expect(res.staleMatchNums).toContain(73);
    // match 90 (W73 v W75) home side can't be filled
    expect(res.slots[slotKey(90, "H")]).toBeUndefined();
    expect(res.slots[slotKey(90, "A")]).toBeDefined(); // W75 still advanced
  });

  it("advances the picked winner on a drawn knockout score", () => {
    const ko = homeWinsKo();
    const res0 = deriveBracket(fullInput({ koScores: ko }));
    const away73 = res0.slots[slotKey(73, "A")];
    ko.set(73, { homeScore: 0, awayScore: 0, winnerTeamId: away73 });
    const res = deriveBracket(fullInput({ koScores: ko }));
    expect(res.staleMatchNums).toHaveLength(0);
    expect(res.slots[slotKey(90, "H")]).toBe(away73);
  });

  it("flags knockout predictions as stale when the cascade re-seeds participants", () => {
    const base = deriveBracket(fullInput({ koScores: new Map() }));
    const home73 = base.slots[slotKey(73, "H")]; // A2 under deterministic scores
    const away73 = base.slots[slotKey(73, "A")];
    const ko = new Map<number, KoScoreEntry>([
      [73, { homeScore: 2, awayScore: 0, snapHomeTeamId: home73, snapAwayTeamId: away73 }],
    ]);
    // sanity: snapshot matches → not stale
    expect(deriveBracket(fullInput({ koScores: ko })).staleMatchNums).toHaveLength(0);

    // now flip group A so A3 overtakes A2 → M73 home participant changes
    const scores = deterministicGroupScores();
    const rank = (n: number) => [0, 1, 3, 2, 4][n]; // A1 > A3 > A2 > A4
    for (const m of groupMatches.filter((gm) => gm.groupName === "A")) {
      const h = rank(Number(m.homeTeamId[1]));
      const a = rank(Number(m.awayTeamId[1]));
      scores.set(m.id, h < a ? { homeScore: 5 - h, awayScore: 0 } : { homeScore: 0, awayScore: 5 - a });
    }
    const res = deriveBracket(fullInput({ groupScores: scores, koScores: ko }));
    expect(res.slots[slotKey(73, "H")]).toBe("A3");
    expect(res.staleMatchNums).toContain(73);
    expect(res.slots[slotKey(90, "H")]).toBeUndefined(); // stale pred advanced nobody
  });
});
