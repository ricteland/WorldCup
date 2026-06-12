"use client";

// Gambling-corner easter egg (profile page, very bottom): a single-zero
// roulette. Everyone gets $100 once — there are no refills, and hitting $0
// puts the 💸 badge next to your name on the leaderboard forever.

import { useRef, useState } from "react";
import { Dices } from "lucide-react";
import { cn } from "@/lib/cn";
import { rollColor, type RouletteBet } from "@/lib/casino";
import { Button, Card, Chip } from "./ui";

interface SpinResult {
  roll: number;
  color: "green" | "red" | "black";
  win: boolean;
  payout: number;
  balance: number;
}

const OUTSIDE_BETS: { label: string; bet: RouletteBet }[] = [
  { label: "Red", bet: { type: "red" } },
  { label: "Black", bet: { type: "black" } },
  { label: "Even", bet: { type: "even" } },
  { label: "Odd", bet: { type: "odd" } },
  { label: "1–18", bet: { type: "low" } },
  { label: "19–36", bet: { type: "high" } },
  { label: "1st 12", bet: { type: "dozen", dozen: 1 } },
  { label: "2nd 12", bet: { type: "dozen", dozen: 2 } },
  { label: "3rd 12", bet: { type: "dozen", dozen: 3 } },
];

const AMOUNTS = [1, 5, 10, 25];

const ROLL_STYLE: Record<string, string> = {
  green: "bg-emerald-600 text-white",
  red: "bg-red-600 text-white",
  black: "bg-night-950 text-slate-100 ring-1 ring-white/20",
};

const betLabel = (bet: RouletteBet) =>
  bet.type === "straight"
    ? `Number ${bet.number}`
    : (OUTSIDE_BETS.find((o) => JSON.stringify(o.bet) === JSON.stringify(bet))?.label ?? bet.type);

export function GamblingCorner({ initialBalance }: { initialBalance: number }) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState<RouletteBet | null>(null);
  const [amount, setAmount] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState<number | null>(null);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const bankrupt = balance <= 0;
  const stake = Math.min(amount, balance);

  async function spin() {
    if (!bet || spinning || bankrupt) return;
    setSpinning(true);
    setResult(null);
    setError(null);
    ticker.current = setInterval(() => setDisplay(Math.floor(Math.random() * 37)), 70);

    const [res] = await Promise.all([
      fetch("/api/casino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet, amount: stake }),
      }),
      new Promise((r) => setTimeout(r, 1300)), // let the wheel spin a moment
    ]);
    if (ticker.current) clearInterval(ticker.current);
    setSpinning(false);

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDisplay(null);
      setError(body.error ?? "The croupier is on a break");
      return;
    }
    const r = body as SpinResult;
    setDisplay(r.roll);
    setResult(r);
    setBalance(r.balance);
    setHistory((h) => [r.roll, ...h].slice(0, 10));
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mx-auto flex items-center gap-1.5 text-xs text-slate-600 transition-colors hover:text-gold-300"
      >
        <Dices size={13} /> gambling corner
      </button>
    );
  }

  return (
    <Card className="space-y-4 border-gold-400/20 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-bold text-gold-300">🎰 Gambling corner</h2>
        <Chip className={cn(bankrupt ? "bg-red-500/15 text-red-300" : "bg-white/5 text-slate-300")}>
          balance ${balance}
        </Chip>
      </div>

      {bankrupt ? (
        <div className="space-y-1 rounded-xl bg-red-500/5 p-4 text-center ring-1 ring-red-500/20">
          <div className="text-3xl">💸</div>
          <p className="text-sm font-semibold text-red-300">Bankrupt.</p>
          <p className="text-xs text-slate-500">
            You turned $100 into nothing. The badge of shame now follows your name on the
            leaderboard. The house thanks you for your patronage.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            One zero, no refills, no credit. What could possibly go wrong?
          </p>

          {/* outside bets */}
          <div className="flex flex-wrap gap-1.5">
            {OUTSIDE_BETS.map((o) => (
              <button
                key={o.label}
                onClick={() => setBet(o.bet)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition",
                  JSON.stringify(bet) === JSON.stringify(o.bet)
                    ? "bg-gold-400/20 text-gold-300 ring-gold-400/50"
                    : "bg-white/5 text-slate-400 ring-white/10 hover:text-slate-200"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* straight numbers, 35:1 */}
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">
              or a single number (pays 35:1)
            </p>
            <div className="grid grid-cols-9 gap-1">
              {Array.from({ length: 37 }, (_, n) => (
                <button
                  key={n}
                  onClick={() => setBet({ type: "straight", number: n })}
                  className={cn(
                    "flex h-7 items-center justify-center rounded-md text-[11px] font-semibold transition",
                    ROLL_STYLE[rollColor(n)],
                    bet?.type === "straight" && bet.number === n
                      ? "scale-110 ring-2 ring-gold-400"
                      : "opacity-70 hover:opacity-100"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* stake */}
          <div className="flex flex-wrap items-center gap-1.5">
            {AMOUNTS.filter((a) => a <= balance).map((a) => (
              <button
                key={a}
                onClick={() => setAmount(a)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                  stake === a && amount === a
                    ? "bg-pitch-500/20 text-pitch-300 ring-pitch-500/50"
                    : "bg-white/5 text-slate-400 ring-white/10 hover:text-slate-200"
                )}
              >
                ${a}
              </button>
            ))}
            <button
              onClick={() => setAmount(balance)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition",
                amount >= balance
                  ? "bg-red-500/20 text-red-300 ring-red-500/50"
                  : "bg-white/5 text-slate-400 ring-white/10 hover:text-red-300"
              )}
            >
              All in (${balance})
            </button>
          </div>

          {/* the wheel */}
          <div className="flex items-center justify-center gap-4 py-1">
            <div
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold transition-transform",
                display == null ? "bg-white/5 text-slate-600" : ROLL_STYLE[rollColor(display)],
                spinning && "animate-pulse"
              )}
            >
              {display ?? "?"}
            </div>
            <div className="space-y-1">
              <Button onClick={spin} disabled={!bet || spinning} className="px-5">
                {spinning
                  ? "No more bets…"
                  : bet
                    ? `Spin — $${stake} on ${betLabel(bet)}`
                    : "Pick a bet"}
              </Button>
              {result && (
                <p
                  className={cn(
                    "text-center text-xs font-semibold",
                    result.win ? "text-gold-300" : "text-red-400"
                  )}
                >
                  {result.win ? `You win $${result.payout - stake}! 🎉` : `Lost $${stake}.`}
                </p>
              )}
              {error && <p className="text-center text-xs text-red-400">{error}</p>}
            </div>
          </div>

          {history.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-600">last</span>
              {history.map((n, i) => (
                <span
                  key={i}
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                    ROLL_STYLE[rollColor(n)]
                  )}
                >
                  {n}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
