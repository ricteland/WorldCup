// Correctness overlay (PLAN.MD §7b). One shared helper + one color-token set
// drives every screen: bright green = exact, light green = right result,
// red = wrong, neutral = pending.

export type Grade = "EXACT" | "RESULT" | "WRONG" | "PENDING";

export interface Score {
  homeScore: number;
  awayScore: number;
}

export function gradeScore(pred: Score | null | undefined, actual: Score | null | undefined): Grade {
  if (!actual || actual.homeScore == null || actual.awayScore == null) return "PENDING";
  if (!pred) return "PENDING";
  if (pred.homeScore === actual.homeScore && pred.awayScore === actual.awayScore) return "EXACT";
  if (Math.sign(pred.homeScore - pred.awayScore) === Math.sign(actual.homeScore - actual.awayScore))
    return "RESULT";
  return "WRONG";
}

// Tailwind class tokens per grade — the single source of truth for the color key.
export const GRADE_BADGE: Record<Grade, string> = {
  EXACT: "bg-emerald-400 text-emerald-950",
  RESULT: "bg-emerald-900/80 text-emerald-300 ring-1 ring-emerald-500/40",
  WRONG: "bg-red-950/80 text-red-400 ring-1 ring-red-500/40",
  PENDING: "bg-white/5 text-slate-400",
};

export const GRADE_CARD: Record<Grade, string> = {
  EXACT: "border-emerald-400/70 bg-emerald-400/10",
  RESULT: "border-emerald-600/40 bg-emerald-500/5",
  WRONG: "border-red-500/40 bg-red-500/5",
  PENDING: "border-white/10 bg-white/[0.03]",
};

export const GRADE_TEXT: Record<Grade, string> = {
  EXACT: "text-emerald-300",
  RESULT: "text-emerald-500",
  WRONG: "text-red-400",
  PENDING: "text-slate-400",
};
