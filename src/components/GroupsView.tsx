"use client";

// Groups tab (PLAN.MD §9.2): toggle between the 12 group tables computed from
// the player's own predicted scores (with qualification highlighting and the
// correctness overlay once the real group stage is final) and the real tables
// building up live as results come in.

import { useState } from "react";
import { cn } from "@/lib/cn";
import { GRADE_TEXT } from "@/lib/grade";
import type { GroupsPayload } from "@/lib/views";
import { Chip } from "./ui";

const QUAL_STYLE: Record<string, string> = {
  winner: "bg-pitch-500/15 ring-1 ring-pitch-500/20",
  runner_up: "bg-pitch-500/8 ring-1 ring-pitch-500/10",
  best_third: "bg-gold-400/10 ring-1 ring-gold-400/20",
};

export function GroupsView({ payload }: { payload: GroupsPayload }) {
  const [view, setView] = useState<"pred" | "real">("pred");
  const real = view === "real";
  const groups = real ? payload.realGroups : payload.groups;
  const thirdGroups = real ? payload.realQualifiedThirdGroups : payload.qualifiedThirdGroups;

  const done = payload.groups.filter((g) => g.complete).length;
  const realDone = payload.realGroups.filter((g) => g.complete).length;
  const realStarted = payload.realGroups.some((g) => g.predsMade > 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-100">
          {real ? "Real groups" : "Your groups"}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {real ? (
            !realStarted ? (
              "Built from real results — tables fill in as matches are played."
            ) : payload.realFinal ? (
              "Final real tables — best thirds highlighted in gold."
            ) : (
              `Built from real results so far — ${realDone}/12 groups finished.`
            )
          ) : (
            <>
              Built from <span className="text-slate-200">your</span> predicted scores — not real
              results.{" "}
              {done < 12
                ? `${done}/12 groups fully predicted.`
                : payload.qualifiedThirdGroups
                  ? "All groups predicted — best thirds highlighted in gold."
                  : ""}
            </>
          )}
        </p>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            ["pred", "Your prediction"],
            ["real", "Real"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition",
              view === key
                ? "bg-pitch-500/20 text-pitch-300 ring-pitch-500/50"
                : "bg-white/5 text-slate-400 ring-white/10 hover:text-slate-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <div
            key={g.name}
            className={cn(
              "glass rounded-2xl p-3",
              g.orderPerfect && "bg-gold-400/10 ring-1 ring-gold-400/50"
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-200">Group {g.name}</h2>
              <span className="flex items-center gap-1.5">
                {g.orderPerfect && (
                  <Chip className="bg-gold-400 font-semibold text-night-950">
                    exact order +{payload.orderBonus}
                  </Chip>
                )}
                {!g.complete ? (
                  <Chip className="bg-white/5 text-slate-500">
                    {g.predsMade}/6 {real ? "played" : "predicted"}
                  </Chip>
                ) : thirdGroups?.includes(g.name) ? (
                  <Chip className="bg-gold-400/10 text-gold-300 ring-1 ring-gold-400/30">
                    3rd qualifies
                  </Chip>
                ) : null}
              </span>
            </div>

            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-600">
                  <th className="pb-1 text-left font-medium">Team</th>
                  <th className="w-7 pb-1 text-center font-medium">P</th>
                  <th className="w-7 pb-1 text-center font-medium">GD</th>
                  <th className="w-7 pb-1 text-center font-medium">Pts</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.team.id}>
                    <td className="py-0.5">
                      <div
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-1.5 py-1",
                          r.qualifies && QUAL_STYLE[r.qualifies]
                        )}
                      >
                        <span className="w-3 text-[10px] text-slate-600">{r.pos}</span>
                        <span className="text-base leading-none">{r.team.flag}</span>
                        <span
                          className={cn(
                            "truncate font-medium",
                            r.grade !== "PENDING" ? GRADE_TEXT[r.grade] : "text-slate-200"
                          )}
                        >
                          {r.team.name}
                        </span>
                        {r.grade === "EXACT" && <span className="text-gold-300">✓</span>}
                        {r.grade === "WRONG" && <span className="text-red-400">✗</span>}
                      </div>
                    </td>
                    <td className="text-center text-slate-400">{r.played}</td>
                    <td className="text-center text-slate-400">
                      {r.gd > 0 ? `+${r.gd}` : r.gd}
                    </td>
                    <td className="text-center font-bold text-slate-200">{r.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500">
        <Chip className="bg-pitch-500/15 text-pitch-300">1st &amp; 2nd qualify</Chip>
        <Chip className="bg-gold-400/10 text-gold-300">8 best 3rds qualify</Chip>
        {!real && (
          <Chip className="bg-gold-400 text-night-950">
            exact group order +{payload.orderBonus} pts
          </Chip>
        )}
      </div>
    </div>
  );
}
