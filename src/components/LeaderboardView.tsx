"use client";

// Leaderboard tab (PLAN.MD §9.4): total / match / bracket points, "you"
// highlighted. Equal totals are served in random order — no tiebreaker.

import { cn } from "@/lib/cn";
import type { LeaderboardRow } from "@/lib/data";

const MEDALS = ["🥇", "🥈", "🥉"];

// Rank movement since the end of yesterday. Up is good (green), down red, a
// held position a muted dash. null (no baseline / just joined) shows nothing.
function RankMove({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  if (delta === 0) return <span className="text-[10px] text-slate-600">–</span>;
  const up = delta > 0;
  return (
    <span
      className={cn("text-[10px] font-semibold tabular-nums", up ? "text-pitch-400" : "text-red-400")}
      title={`${up ? "Up" : "Down"} ${Math.abs(delta)} since yesterday`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

export function LeaderboardView({ rows, you }: { rows: LeaderboardRow[]; you: string }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-slate-100">Leaderboard</h1>

      {rows.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-slate-500">
          No players yet — share the join code!
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2.5 text-left font-medium">#</th>
                <th className="py-2.5 text-left font-medium">Player</th>
                <th className="w-14 py-2.5 text-center font-medium" title="Match points">
                  ⚽
                </th>
                <th className="w-14 py-2.5 text-center font-medium" title="Bracket points">
                  🏆
                </th>
                <th className="w-16 px-3 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isYou = r.playerId === you;
                return (
                  <tr
                    key={r.playerId}
                    className={cn(
                      "border-b border-white/[0.03] last:border-0",
                      isYou && "bg-pitch-500/10"
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-center leading-none">
                        <span className="font-display font-bold text-slate-400">
                          {MEDALS[r.rank - 1] ?? r.rank}
                        </span>
                        <RankMove delta={r.rankDelta} />
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span className={cn("font-semibold", isYou ? "text-pitch-300" : "text-slate-200")}>
                        {r.displayName}
                      </span>
                      {r.bankrupt && (
                        <span
                          className="ml-1.5 cursor-default text-[10px] font-bold uppercase tracking-wide text-red-400"
                          title="Went bankrupt in the gambling corner 🫵😂"
                        >
                          bad gambler 2026
                        </span>
                      )}
                      {isYou && <span className="ml-1.5 text-[10px] text-pitch-400">you</span>}
                    </td>
                    <td className="py-2.5 text-center text-slate-400">{r.matchPoints}</td>
                    <td className="py-2.5 text-center text-slate-400">{r.bracketPoints}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex flex-col items-end leading-none">
                        <span className="font-display text-base font-bold text-slate-100">{r.total}</span>
                        {r.pointsToday != null && r.pointsToday > 0 && (
                          <span
                            className="mt-0.5 text-[10px] font-semibold text-pitch-400"
                            title="Points earned today"
                          >
                            +{r.pointsToday}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-center text-[11px] text-slate-600">
        ⚽ match points · 🏆 bracket points · ▲▼ movement since yesterday · ties shown in random order
      </p>
    </div>
  );
}
