import { describe, expect, it } from "vitest";
import {
  boostTeamId,
  computeBracketPoints,
  computeMatchPoints,
  computeRealProgress,
  gradeBracketSlot,
  koMultiplierFor,
  koOpenAndStale,
  matchPointsFor,
  perfectOrderGroups,
  predictedKoWinner,
  DEFAULT_SCORING,
  type RealMatch,
} from "../scoring";
import { slotKey, CHAMPION_SLOT } from "../bracket";

describe("matchPointsFor", () => {
  it("awards 5 / 3 / 0 by default", () => {
    expect(matchPointsFor("EXACT", DEFAULT_SCORING)).toBe(5);
    expect(matchPointsFor("RESULT", DEFAULT_SCORING)).toBe(3);
    expect(matchPointsFor("WRONG", DEFAULT_SCORING)).toBe(0);
    expect(matchPointsFor("PENDING", DEFAULT_SCORING)).toBe(0);
  });

  it("multiplies points for boosted matches (×3 by default)", () => {
    expect(matchPointsFor("EXACT", DEFAULT_SCORING, true)).toBe(15);
    expect(matchPointsFor("RESULT", DEFAULT_SCORING, true)).toBe(9);
    expect(matchPointsFor("WRONG", DEFAULT_SCORING, true)).toBe(0);
  });

  it("applies the knockout-round multiplier, stacking with the boost", () => {
    expect(matchPointsFor("EXACT", DEFAULT_SCORING, false, 4)).toBe(20); // 5 × 4
    expect(matchPointsFor("RESULT", DEFAULT_SCORING, false, 6)).toBe(18); // 3 × 6
    expect(matchPointsFor("EXACT", DEFAULT_SCORING, true, 4)).toBe(60); // 5 × 3 × 4
    expect(matchPointsFor("WRONG", DEFAULT_SCORING, false, 6)).toBe(0);
  });
});

describe("koMultiplierFor", () => {
  it("scales knockout games by round, leaving group and third place at ×1", () => {
    expect(koMultiplierFor(1, DEFAULT_SCORING)).toBe(1); // group game
    expect(koMultiplierFor(73, DEFAULT_SCORING)).toBe(2); // R32
    expect(koMultiplierFor(89, DEFAULT_SCORING)).toBe(3); // R16
    expect(koMultiplierFor(97, DEFAULT_SCORING)).toBe(4); // QF
    expect(koMultiplierFor(101, DEFAULT_SCORING)).toBe(5); // SF
    expect(koMultiplierFor(103, DEFAULT_SCORING)).toBe(1); // third place — not multiplied
    expect(koMultiplierFor(104, DEFAULT_SCORING)).toBe(6); // final
  });
});

describe("boostTeamId", () => {
  const teams = [
    { id: "cuid-esp", code: "ESP" },
    { id: "cuid-arg", code: "ARG" },
  ];

  it("resolves the boosted team by code (Spain by default)", () => {
    expect(boostTeamId(DEFAULT_SCORING, teams)).toBe("cuid-esp");
  });

  it("returns null when disabled or the team is unknown", () => {
    expect(boostTeamId({ ...DEFAULT_SCORING, boostTeamCode: null }, teams)).toBeNull();
    expect(boostTeamId({ ...DEFAULT_SCORING, boostMultiplier: 1 }, teams)).toBeNull();
    expect(boostTeamId({ ...DEFAULT_SCORING, boostTeamCode: "XXX" }, teams)).toBeNull();
  });
});

describe("computeMatchPoints", () => {
  const matches: RealMatch[] = [
    { id: 1, stage: "GROUP", homeTeamId: "x", awayTeamId: "y", homeScore: 2, awayScore: 1, status: "FINISHED" },
    { id: 2, stage: "GROUP", homeTeamId: "x", awayTeamId: "z", homeScore: 0, awayScore: 0, status: "FINISHED" },
    { id: 3, stage: "GROUP", homeTeamId: "y", awayTeamId: "z", status: "SCHEDULED" },
  ];

  it("sums exact + result points and skips unfinished matches", () => {
    const preds = new Map([
      [1, { homeScore: 2, awayScore: 1 }], // exact: 5
      [2, { homeScore: 1, awayScore: 1 }], // result: 3
      [3, { homeScore: 1, awayScore: 0 }], // pending
    ]);
    const { total, graded } = computeMatchPoints(preds, matches, DEFAULT_SCORING);
    expect(total).toBe(8);
    expect(graded.get(1)).toBe("EXACT");
    expect(graded.get(2)).toBe("RESULT");
    expect(graded.has(3)).toBe(false);
  });

  it("triples points only for matches involving the boosted team", () => {
    const preds = new Map([
      [1, { homeScore: 2, awayScore: 1 }], // exact, involves x: 5 × 3
      [2, { homeScore: 1, awayScore: 1 }], // result, involves x: 3 × 3
    ]);
    const { total } = computeMatchPoints(preds, matches, DEFAULT_SCORING, "x");
    expect(total).toBe(24);
    // boosted team not playing in either match → plain points
    expect(computeMatchPoints(preds, matches, DEFAULT_SCORING, "q").total).toBe(8);
  });
});

describe("computeRealProgress + bracket grading", () => {
  // Minimal knockout reality: R32 match 73 finished, 74 scheduled with teams,
  // semis/final unknown.
  const matches: RealMatch[] = [
    { id: 73, stage: "R32", homeTeamId: "t1", awayTeamId: "t2", homeScore: 1, awayScore: 0, status: "FINISHED" },
    { id: 74, stage: "R32", homeTeamId: "t3", awayTeamId: "t4", status: "SCHEDULED" },
    { id: 90, stage: "R16", status: "SCHEDULED" }, // W73 v W75 — not yet filled by source
  ];
  const teamsByGroup = { A: ["t1", "t2"], B: ["t3", "t4"] };

  it("collects reached teams from assignments and finished winners", () => {
    const p = computeRealProgress({ matches, teamsByGroup });
    expect(p.reached.R32).toEqual(new Set(["t1", "t2", "t3", "t4"]));
    expect(p.reached.R16).toEqual(new Set(["t1"])); // winner of 73 propagated to M90H
    expect(p.realSlots[slotKey(90, "H")]).toBe("t1");
    expect(p.eliminated.has("t2")).toBe(true);
    expect(p.complete.R32).toBe(false);
  });

  it("grades bracket slots: exact slot, right round, wrong, pending", () => {
    const p = computeRealProgress({ matches, teamsByGroup });
    expect(gradeBracketSlot(slotKey(73, "H"), "t1", p)).toBe("EXACT");
    expect(gradeBracketSlot(slotKey(74, "H"), "t4", p)).toBe("RESULT"); // reached R32, other slot
    expect(gradeBracketSlot(slotKey(90, "H"), "t2", p)).toBe("WRONG"); // eliminated
    expect(gradeBracketSlot(slotKey(90, "A"), "t3", p)).toBe("PENDING");
    expect(gradeBracketSlot(CHAMPION_SLOT, "t2", p)).toBe("WRONG");
    expect(gradeBracketSlot(CHAMPION_SLOT, "t1", p)).toBe("PENDING");
  });

  it("uses winnerTeamId for penalty shoot-outs", () => {
    const pens: RealMatch[] = [
      { id: 101, stage: "SF", homeTeamId: "a", awayTeamId: "b", homeScore: 1, awayScore: 1, winnerTeamId: "b", status: "FINISHED" },
    ];
    const p = computeRealProgress({ matches: pens, teamsByGroup: {} });
    expect(p.realSlots[slotKey(104, "H")]).toBe("b"); // winner → final
    expect(p.realSlots[slotKey(103, "H")]).toBe("a"); // loser → third-place match
    expect(p.reached.FINAL).toEqual(new Set(["b"]));
    expect(p.eliminated.has("a")).toBe(true);
  });

  it("scores bracket points: +1 per real R32 qualifier from the player's group tables", () => {
    const p = computeRealProgress({ matches, teamsByGroup });
    // predicted qualifiers from the player's group tables
    const groupSlots = {
      [slotKey(73, "H")]: "t1", // really in R32 ✓ (1pt)
      [slotKey(73, "A")]: "t9", // not reached (0)
      [slotKey(74, "H")]: "t4", // ✓ (1pt — membership, slot doesn't matter)
    };
    const { total } = computeBracketPoints({
      groupSlots,
      progress: p,
      cfg: DEFAULT_SCORING,
    });
    expect(total).toBe(2);
  });
});

describe("perfectOrderGroups", () => {
  const t = (ids: string[]) => ids.map((teamId) => ({ teamId }));

  it("returns settled groups whose exact 1st→4th order was predicted", () => {
    const pred = { A: t(["a1", "a2", "a3", "a4"]), B: t(["b1", "b2", "b3", "b4"]) };
    const real = { A: t(["a1", "a2", "a3", "a4"]), B: t(["b2", "b1", "b3", "b4"]) };
    expect(perfectOrderGroups(pred, real, ["A", "B"])).toEqual(["A"]);
  });

  it("only judges settled groups, even when tables happen to match", () => {
    const pred = { A: t(["a1", "a2", "a3", "a4"]) };
    const real = { A: t(["a1", "a2", "a3", "a4"]) };
    expect(perfectOrderGroups(pred, real, [])).toEqual([]);
  });

  it("skips groups the player hasn't fully predicted", () => {
    const real = { A: t(["a1", "a2", "a3", "a4"]) };
    expect(perfectOrderGroups({}, real, ["A"])).toEqual([]);
  });
});

describe("predictedKoWinner", () => {
  it("resolves the winner from the score or the draw pick", () => {
    expect(predictedKoWinner({ homeScore: 2, awayScore: 0 }, "h", "a")).toBe("h");
    expect(predictedKoWinner({ homeScore: 0, awayScore: 1 }, "h", "a")).toBe("a");
    expect(predictedKoWinner({ homeScore: 1, awayScore: 1, winnerTeamId: "a" }, "h", "a")).toBe("a");
    // a draw without a valid pick names nobody
    expect(predictedKoWinner({ homeScore: 1, awayScore: 1 }, "h", "a")).toBeNull();
    expect(predictedKoWinner({ homeScore: 1, awayScore: 1, winnerTeamId: "x" }, "h", "a")).toBeNull();
  });
});

describe("koOpenAndStale", () => {
  const matches: RealMatch[] = [
    { id: 73, stage: "R32", homeTeamId: "t1", awayTeamId: "t2", homeScore: 1, awayScore: 0, status: "FINISHED" },
    { id: 74, stage: "R32", homeTeamId: "t3", awayTeamId: "t4", status: "SCHEDULED" },
    { id: 90, stage: "R16", status: "SCHEDULED" }, // only M90H known (winner of 73)
  ];
  const teamsByGroup = { A: ["t1", "t2"], B: ["t3", "t4"] };

  it("opens a match once both real participants are known", () => {
    const p = computeRealProgress({ matches, teamsByGroup });
    const { open } = koOpenAndStale(new Map(), p);
    expect(open.has(73)).toBe(true);
    expect(open.has(74)).toBe(true);
    expect(open.has(90)).toBe(false); // away side still undecided
  });

  it("flags picks whose snapshot disagrees with the real matchup", () => {
    const p = computeRealProgress({ matches, teamsByGroup });
    const { stale } = koOpenAndStale(
      new Map([
        [73, { snapHomeTeamId: "t1", snapAwayTeamId: "t2" }], // matches reality
        [74, { snapHomeTeamId: "t3", snapAwayTeamId: "tX" }], // matchup changed
      ]),
      p
    );
    expect(stale.has(73)).toBe(false);
    expect(stale.has(74)).toBe(true);
  });
});

describe("computeMatchPoints with knockout snapshots", () => {
  const matches: RealMatch[] = [
    { id: 73, stage: "R32", homeTeamId: "t1", awayTeamId: "t2", homeScore: 1, awayScore: 0, status: "FINISHED" },
  ];

  it("grades a pick made against the real matchup, skips a stale one", () => {
    const good = new Map([
      [73, { homeScore: 1, awayScore: 0, snapHomeTeamId: "t1", snapAwayTeamId: "t2" }],
    ]);
    // match 73 is R32 → exact score scores 5 × the ×2 round multiplier
    expect(computeMatchPoints(good, matches, DEFAULT_SCORING).total).toBe(10);

    const stale = new Map([
      [73, { homeScore: 1, awayScore: 0, snapHomeTeamId: "tX", snapAwayTeamId: "t2" }],
    ]);
    const { total, graded } = computeMatchPoints(stale, matches, DEFAULT_SCORING);
    expect(total).toBe(0);
    expect(graded.get(73)).toBe("PENDING");
  });
});
