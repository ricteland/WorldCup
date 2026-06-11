"use client";

// Bracket tab (PLAN.MD §9.3, round-by-round edition): the real knockout
// bracket as it fills in, with the player's pick per match. Each match opens
// for predictions once its real matchup is decided. Horizontal round scroller
// on mobile; the picked side colors gold/red once the match is played.

import { useState } from "react";
import { Crown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { GRADE_TEXT, GRADE_CARD } from "@/lib/grade";
import type { BracketPayload, BracketMatchView, BracketSideView } from "@/lib/views";
import type { MatchView } from "@/lib/views";
import { Chip } from "./ui";
import { MatchEditor } from "./MatchList";
import { LocalTime } from "./LocalTime";

function Side({
  side,
  picked,
  score,
}: {
  side: BracketSideView;
  picked: boolean;
  score: number | null;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5",
        picked && "bg-white/[0.05]"
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-lg leading-none">{side.team?.flag ?? "·"}</span>
        <span
          className={cn(
            "truncate text-xs font-semibold",
            side.team
              ? side.grade !== "PENDING"
                ? GRADE_TEXT[side.grade]
                : picked
                  ? "text-slate-100"
                  : "text-slate-300"
              : "text-slate-600"
          )}
        >
          {side.team?.name ?? side.label ?? "TBD"}
        </span>
        {side.grade === "EXACT" && <span className="text-[10px] text-gold-300">✓</span>}
        {side.grade === "WRONG" && <span className="text-[10px] text-red-400">✗</span>}
      </div>
      {score != null && <span className="font-display text-sm font-bold text-slate-200">{score}</span>}
    </div>
  );
}

/** Adapt a bracket match into the MatchView shape MatchEditor expects. */
function toMatchView(m: BracketMatchView): MatchView {
  return {
    id: m.num,
    stage: m.round,
    groupName: null,
    matchday: null,
    venue: m.venue,
    kickoffUtc: m.kickoffUtc,
    status: m.realStatus,
    home: m.realHome,
    away: m.realAway,
    homeSlotLabel: m.home.label,
    awaySlotLabel: m.away.label,
    homeScore: m.realHomeScore,
    awayScore: m.realAwayScore,
    predHome: m.home.team,
    predAway: m.away.team,
    pred: m.pred,
    grade: "PENDING",
    points: 0,
    boost: null,
    locked: m.locked,
    lockAtUtc: m.lockAtUtc,
    open: m.open,
    stale: m.stale,
  };
}

function BracketCard({ match }: { match: BracketMatchView }) {
  const [editing, setEditing] = useState(false);
  const winnerId =
    match.pred &&
    (match.pred.homeScore > match.pred.awayScore
      ? match.home.team?.id
      : match.pred.awayScore > match.pred.homeScore
        ? match.away.team?.id
        : match.pred.predWinnerTeamId);
  const canEdit = !match.locked && match.open && match.realStatus !== "FINISHED";
  const finished = match.realStatus === "FINISHED";

  return (
    <div
      className={cn(
        "w-60 shrink-0 rounded-2xl border p-2",
        GRADE_CARD.PENDING,
        match.stale && "border-gold-400/40"
      )}
    >
      <div className="mb-1 flex items-center justify-between px-1 text-[10px] text-slate-600">
        <span>M{match.num}</span>
        <span className="flex items-center gap-1">
          {match.stale && (
            <Chip className="bg-gold-400/10 text-gold-300">
              <AlertTriangle size={10} /> re-pick
            </Chip>
          )}
          <LocalTime iso={match.kickoffUtc} mode="date" />
        </span>
      </div>

      <button
        type="button"
        className="block w-full space-y-1 text-left"
        onClick={() => canEdit && setEditing((v) => !v)}
      >
        <Side
          side={match.home}
          picked={!!winnerId && winnerId === match.home.team?.id}
          score={finished ? match.realHomeScore : (match.pred?.homeScore ?? null)}
        />
        <Side
          side={match.away}
          picked={!!winnerId && winnerId === match.away.team?.id}
          score={finished ? match.realAwayScore : (match.pred?.awayScore ?? null)}
        />
      </button>

      {!match.open && !finished && (
        <p className="mt-1 px-1 text-[10px] text-slate-600">Waiting for the real matchup…</p>
      )}
      {match.pred && finished && (
        <p className="mt-1 px-1 text-[10px] text-slate-500">
          you: {match.pred.homeScore}–{match.pred.awayScore}
        </p>
      )}

      {editing && canEdit && (
        <div className="mt-2 border-t border-white/5">
          <MatchEditor match={toMatchView(match)} onSaved={() => setEditing(false)} compact />
        </div>
      )}
    </div>
  );
}

export function BracketView({ payload }: { payload: BracketPayload }) {
  const [round, setRound] = useState("R32");
  const current = payload.rounds.find((r) => r.round === round)!;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-100">Knockout bracket</h1>
        <p className="mt-1 text-sm text-slate-400">
          The real bracket, round by round — each match opens for predictions once its matchup is
          decided.{" "}
          {!payload.groupsFinal
            ? "The Round of 32 unlocks when the group stage ends."
            : payload.openCount > 0
              ? `${payload.openCount} match${payload.openCount > 1 ? "es" : ""} open for picks.`
              : ""}
        </p>
      </div>

      {payload.champion && (
        <div
          className={cn(
            "glass flex items-center justify-center gap-3 rounded-2xl border-gold-400/30 bg-gold-400/5 p-4"
          )}
        >
          <Crown size={22} className="text-gold-400" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold-300/80">
              Your champion
            </div>
            <div
              className={cn(
                "font-display text-lg font-bold",
                payload.champion.grade !== "PENDING"
                  ? GRADE_TEXT[payload.champion.grade]
                  : "text-slate-100"
              )}
            >
              {payload.champion.team.flag} {payload.champion.team.name}
            </div>
          </div>
        </div>
      )}

      {payload.staleCount > 0 && (
        <div className="rounded-2xl bg-gold-400/10 px-4 py-2.5 text-xs text-gold-300 ring-1 ring-gold-400/30">
          <AlertTriangle size={13} className="mr-1 inline" />
          {payload.staleCount} knockout pick{payload.staleCount > 1 ? "s" : ""} where the matchup
          changed — re-enter them.
        </div>
      )}

      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {payload.rounds.map((r) => (
          <button
            key={r.round}
            onClick={() => setRound(r.round)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition",
              round === r.round
                ? "bg-pitch-500/20 text-pitch-300 ring-pitch-500/50"
                : "bg-white/5 text-slate-400 ring-white/10 hover:text-slate-200"
            )}
          >
            {r.title}
          </button>
        ))}
      </div>

      <div className="no-scrollbar -mx-3 flex flex-wrap justify-center gap-2 overflow-x-auto px-3 pb-2">
        {current.matches.map((m) => (
          <BracketCard key={m.num} match={m} />
        ))}
      </div>
    </div>
  );
}
