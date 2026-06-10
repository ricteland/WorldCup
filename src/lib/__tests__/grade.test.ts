import { describe, expect, it } from "vitest";
import { gradeScore } from "../grade";

const s = (homeScore: number, awayScore: number) => ({ homeScore, awayScore });

describe("gradeScore", () => {
  it("EXACT on the exact score", () => {
    expect(gradeScore(s(2, 1), s(2, 1))).toBe("EXACT");
    expect(gradeScore(s(0, 0), s(0, 0))).toBe("EXACT");
  });

  it("RESULT on the right outcome with the wrong score", () => {
    expect(gradeScore(s(3, 1), s(2, 1))).toBe("RESULT"); // home win
    expect(gradeScore(s(0, 1), s(1, 4))).toBe("RESULT"); // away win
    expect(gradeScore(s(1, 1), s(2, 2))).toBe("RESULT"); // draw
  });

  it("WRONG on the wrong outcome", () => {
    expect(gradeScore(s(2, 1), s(1, 1))).toBe("WRONG");
    expect(gradeScore(s(0, 2), s(2, 0))).toBe("WRONG");
  });

  it("PENDING without a result or without a prediction", () => {
    expect(gradeScore(s(1, 0), null)).toBe("PENDING");
    expect(gradeScore(null, s(1, 0))).toBe("PENDING");
  });
});
