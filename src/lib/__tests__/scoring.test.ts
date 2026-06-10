import { describe, expect, it } from "vitest";
import {
  computeBracketPoints,
  computeMatchPoints,
  computeRealProgress,
  gradeBracketSlot,
  matchPointsFor,
  DEFAULT_SCORING,
  type RealMatch,
} from "../scoring";
import { slotKey, CHAMPION_SLOT } from "../bracket";

describe("matchPointsFor", () => {
  it("awards 5 / 2 / 0 by default", () => {
    expect(matchPointsFor("EXACT", DEFAULT_SCORING)).toBe(5);
    expect(matchPointsFor("RESULT", DEFAULT_SCORING)).toBe(2);
    expect(matchPointsFor("WRONG", DEFAULT_SCORING)).toBe(0);
    expect(matchPointsFor("PENDING", DEFAULT_SCORING)).toBe(0);
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
      [2, { homeScore: 1, awayScore: 1 }], // result: 2
      [3, { homeScore: 1, awayScore: 0 }], // pending
    ]);
    const { total, graded } = computeMatchPoints(preds, matches, DEFAULT_SCORING);
    expect(total).toBe(7);
    expect(graded.get(1)).toBe("EXACT");
    expect(graded.get(2)).toBe("RESULT");
    expect(graded.has(3)).toBe(false);
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

  it("scores bracket points per round", () => {
    const p = computeRealProgress({ matches, teamsByGroup });
    const playerSlots = {
      [slotKey(73, "H")]: "t1", // in R32 ✓ (1pt)
      [slotKey(73, "A")]: "t9", // not reached (0)
      [slotKey(74, "H")]: "t4", // ✓ (1pt)
      [slotKey(90, "H")]: "t1", // reached R16 ✓ (2pts)
      [slotKey(104, "H")]: "t1", // final unknown (0 for now)
    };
    const { total, byRound } = computeBracketPoints(playerSlots, p, DEFAULT_SCORING);
    expect(byRound.R32).toBe(2);
    expect(byRound.R16).toBe(2);
    expect(byRound.FINAL).toBe(0);
    expect(total).toBe(4);
  });
});
