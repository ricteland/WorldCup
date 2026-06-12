"use client";

// Welcome rules popup (PLAN.MD §9): shown on first visit, reopenable from the
// "?" button in the top bar. Context keeps the trigger and dialog in sync.

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";
import type { ScoringConfig } from "@/lib/scoring";
import { Button, Card, Chip } from "./ui";

const WelcomeCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useWelcome = () => useContext(WelcomeCtx);

// bump the suffix when the rules change so everyone sees the dialog again
const SEEN_KEY = "wc26:welcomed:v2";
const subscribeNever = () => () => {};

export function WelcomeProvider({
  lockMinutes,
  scoring,
  children,
}: {
  lockMinutes: number;
  scoring: ScoringConfig;
  children: ReactNode;
}) {
  // open on first visit (server snapshot: closed), unless the user has acted
  const firstVisit = useSyncExternalStore(
    subscribeNever,
    () => !localStorage.getItem(SEEN_KEY),
    () => false
  );
  const [userChoice, setUserChoice] = useState<boolean | null>(null);
  const show = userChoice ?? firstVisit;

  const close = () => {
    localStorage.setItem(SEEN_KEY, "1");
    setUserChoice(false);
  };

  return (
    <WelcomeCtx.Provider value={{ open: () => setUserChoice(true) }}>
      {children}
      {show && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          onClick={close}
        >
          <Card
            className="animate-pop m-3 max-h-[85dvh] w-full max-w-lg overflow-y-auto bg-night-900/95 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <h2 className="font-display text-xl font-bold text-slate-100">How it works</h2>
              <button onClick={close} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-white/5">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <p>
                You predict the <strong className="text-slate-100">whole group stage up front</strong> — a
                score for all 72 group games. Your scores build{" "}
                <strong className="text-slate-100">your own group tables</strong>, which decide who you
                send to the Round of 32. The knockouts are different:{" "}
                <strong className="text-slate-100">each game opens for predictions once its real
                matchup is decided</strong>, so you pick round by round as the actual bracket fills in.
                If you predict a knockout draw, you also pick who goes through.
              </p>

              <div>
                <h3 className="mb-1.5 font-semibold text-slate-100">Match points</h3>
                <ul className="space-y-1">
                  <li className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5">
                    <span>Exact score</span>
                    <span className="font-display font-bold text-emerald-300">{scoring.exact} pts</span>
                  </li>
                  <li className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5">
                    <span>Right result, wrong score</span>
                    <span className="font-display font-bold text-emerald-500">{scoring.result} pts</span>
                  </li>
                  <li className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5">
                    <span>Wrong</span>
                    <span className="font-display font-bold text-slate-500">0</span>
                  </li>
                </ul>
                {scoring.boostTeamCode && scoring.boostMultiplier !== 1 && (
                  <p className="mt-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300 ring-1 ring-red-500/20">
                    {scoring.boostTeamCode === "ESP" ? "🇪🇸 " : ""}
                    <strong>×{scoring.boostMultiplier} bonus:</strong> match points are multiplied
                    for every game involving{" "}
                    {scoring.boostTeamCode === "ESP" ? "Spain" : scoring.boostTeamCode}. ¡Vamos!
                  </p>
                )}
              </div>

              <div>
                <h3 className="mb-1.5 font-semibold text-slate-100">Bracket points</h3>
                <p className="mb-1.5 text-xs text-slate-400">
                  R32: +{scoring.bracket.R32} per team your group tables correctly send through,
                  and +{scoring.groupOrder} per settled group whose final order (1st→4th) you
                  called exactly. Later rounds: when the winner you picked in a knockout game
                  really goes through, you earn the round they advance to:
                </p>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  {Object.entries(scoring.bracket).map(([round, pts]) => (
                    <div key={round} className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        {round === "CHAMPION" ? "Champion" : round === "FINAL" ? "Final" : round}
                      </div>
                      <div className="font-display font-bold text-gold-300">+{pts}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-1.5 font-semibold text-slate-100">Color key</h3>
                <div className="flex flex-wrap gap-1.5">
                  <Chip className="bg-gold-400 text-night-950">exact score</Chip>
                  <Chip className="bg-emerald-900/80 text-emerald-300 ring-1 ring-emerald-500/40">
                    right result
                  </Chip>
                  <Chip className="bg-red-950/80 text-red-400 ring-1 ring-red-500/40">wrong</Chip>
                  <Chip className="bg-white/5 text-slate-400">not played yet</Chip>
                </div>
              </div>

              <div className="rounded-xl bg-gold-400/5 p-3 ring-1 ring-gold-400/20">
                <p className="text-xs text-slate-300">
                  <strong className="text-gold-300">Rolling deadlines:</strong> each match locks{" "}
                  {lockMinutes} minutes before its own kickoff and can&apos;t be changed after
                  that. Everything else stays open — you can keep predicting and tweaking
                  upcoming matches all tournament long. Once a game kicks off, tap it to see
                  everyone&apos;s predictions — and once it ends, who scored what on it.
                </p>
              </div>
            </div>

            <Button className="mt-4 w-full" onClick={close}>
              Let&apos;s predict ⚽
            </Button>
          </Card>
        </div>
      )}
    </WelcomeCtx.Provider>
  );
}
