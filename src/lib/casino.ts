// Gambling-corner easter egg: a single-zero (European) roulette. Pure logic —
// the API route rolls the number and moves the money; this file only knows
// the rules, so it can be unit-tested.

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type RouletteBet =
  | { type: "straight"; number: number } // pays 35:1
  | { type: "red" }
  | { type: "black" }
  | { type: "even" }
  | { type: "odd" }
  | { type: "low" } // 1–18
  | { type: "high" } // 19–36
  | { type: "dozen"; dozen: 1 | 2 | 3 }; // pays 2:1

export function rollColor(roll: number): "green" | "red" | "black" {
  return roll === 0 ? "green" : RED_NUMBERS.has(roll) ? "red" : "black";
}

/** Total returned on a winning bet, as a multiple of the stake (stake included). */
export function payoutMultiplier(bet: RouletteBet): number {
  if (bet.type === "straight") return 36;
  if (bet.type === "dozen") return 3;
  return 2;
}

/** The single zero loses every outside bet — that's the house edge. */
export function betWins(bet: RouletteBet, roll: number): boolean {
  switch (bet.type) {
    case "straight":
      return roll === bet.number;
    case "red":
      return RED_NUMBERS.has(roll);
    case "black":
      return roll !== 0 && !RED_NUMBERS.has(roll);
    case "even":
      return roll !== 0 && roll % 2 === 0;
    case "odd":
      return roll % 2 === 1;
    case "low":
      return roll >= 1 && roll <= 18;
    case "high":
      return roll >= 19 && roll <= 36;
    case "dozen":
      return roll >= (bet.dozen - 1) * 12 + 1 && roll <= bet.dozen * 12;
  }
}

/** Validate an untrusted bet payload from the client. */
export function parseBet(raw: unknown): RouletteBet | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as { type?: unknown; number?: unknown; dozen?: unknown };
  switch (b.type) {
    case "straight":
      return Number.isInteger(b.number) && (b.number as number) >= 0 && (b.number as number) <= 36
        ? { type: "straight", number: b.number as number }
        : null;
    case "dozen":
      return b.dozen === 1 || b.dozen === 2 || b.dozen === 3
        ? { type: "dozen", dozen: b.dozen }
        : null;
    case "red":
    case "black":
    case "even":
    case "odd":
    case "low":
    case "high":
      return { type: b.type };
    default:
      return null;
  }
}
