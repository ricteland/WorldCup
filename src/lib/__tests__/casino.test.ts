import { describe, expect, it } from "vitest";
import { betWins, parseBet, payoutMultiplier, rollColor, RED_NUMBERS } from "../casino";

describe("roulette rules", () => {
  it("colors the wheel like a real single-zero table", () => {
    expect(rollColor(0)).toBe("green");
    expect(rollColor(32)).toBe("red");
    expect(rollColor(15)).toBe("black");
    expect(RED_NUMBERS.size).toBe(18);
  });

  it("pays 36×/3×/2× the stake (35:1, 2:1, 1:1)", () => {
    expect(payoutMultiplier({ type: "straight", number: 17 })).toBe(36);
    expect(payoutMultiplier({ type: "dozen", dozen: 2 })).toBe(3);
    expect(payoutMultiplier({ type: "red" })).toBe(2);
    expect(payoutMultiplier({ type: "high" })).toBe(2);
  });

  it("settles straight and outside bets", () => {
    expect(betWins({ type: "straight", number: 17 }, 17)).toBe(true);
    expect(betWins({ type: "straight", number: 17 }, 18)).toBe(false);
    expect(betWins({ type: "red" }, 32)).toBe(true);
    expect(betWins({ type: "black" }, 15)).toBe(true);
    expect(betWins({ type: "even" }, 4)).toBe(true);
    expect(betWins({ type: "odd" }, 4)).toBe(false);
    expect(betWins({ type: "low" }, 18)).toBe(true);
    expect(betWins({ type: "high" }, 18)).toBe(false);
    expect(betWins({ type: "dozen", dozen: 1 }, 12)).toBe(true);
    expect(betWins({ type: "dozen", dozen: 2 }, 12)).toBe(false);
    expect(betWins({ type: "dozen", dozen: 3 }, 36)).toBe(true);
  });

  it("the zero beats every outside bet — the house edge", () => {
    for (const bet of [
      { type: "red" },
      { type: "black" },
      { type: "even" },
      { type: "odd" },
      { type: "low" },
      { type: "high" },
      { type: "dozen", dozen: 1 },
    ] as const) {
      expect(betWins(bet, 0)).toBe(false);
    }
    expect(betWins({ type: "straight", number: 0 }, 0)).toBe(true);
  });

  it("rejects malformed bets from the client", () => {
    expect(parseBet({ type: "straight", number: 37 })).toBeNull();
    expect(parseBet({ type: "straight", number: -1 })).toBeNull();
    expect(parseBet({ type: "straight", number: 1.5 })).toBeNull();
    expect(parseBet({ type: "dozen", dozen: 4 })).toBeNull();
    expect(parseBet({ type: "martingale" })).toBeNull();
    expect(parseBet(null)).toBeNull();
    expect(parseBet({ type: "red" })).toEqual({ type: "red" });
    expect(parseBet({ type: "straight", number: 0 })).toEqual({ type: "straight", number: 0 });
  });
});
