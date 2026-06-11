"use client";

// Match Predictions tab (PLAN.MD §9.1): all 104 matches grouped by day,
// inline stepper editor, lock state, and result grading colors.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LockKeyhole, Minus, Plus, AlertTriangle, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { GRADE_BADGE, GRADE_CARD } from "@/lib/grade";
import type { MatchesPayload, MatchView, TeamView } from "@/lib/views";
import { Button, Chip } from "./ui";
import { LocalTime } from "./LocalTime";
import { LockCountdown } from "./LockCountdown";

type Filter = "all" | "today" | "group" | "knockout" | "todo";

const STAGE_LABEL: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  THIRD: "3rd place",
  FINAL: "Final",
};

function TeamSide({
  team,
  label,
  align,
}: {
  team: TeamView | null;
  label: string | null;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2",
        align === "right" && "flex-row-reverse text-right"
      )}
    >
      <span className="text-2xl leading-none">{team ? team.flag : "·"}</span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-100">
          {team ? team.name : (label ?? "TBD")}
        </div>
        {team && <div className="text-[11px] uppercase tracking-wider text-slate-500">{team.code}</div>}
      </div>
    </div>
  );
}

function Stepper({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 transition active:scale-95 disabled:opacity-30"
        aria-label="decrease"
      >
        <Minus size={16} />
      </button>
      <div className="font-display w-10 text-center text-2xl font-bold text-slate-100">{value}</div>
      <button
        type="button"
        disabled={disabled || value >= 20}
        onClick={() => onChange(value + 1)}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 transition active:scale-95 disabled:opacity-30"
        aria-label="increase"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

export function MatchEditor({
  match,
  onSaved,
  compact,
}: {
  match: MatchView;
  onSaved?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [home, setHome] = useState(match.pred?.homeScore ?? 0);
  const [away, setAway] = useState(match.pred?.awayScore ?? 0);
  const [winner, setWinner] = useState<string | null>(match.pred?.predWinnerTeamId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const isKo = match.stage !== "GROUP";
  const needsWinner = isKo && home === away;
  const homeTeam = isKo ? match.predHome : match.home;
  const awayTeam = isKo ? match.predAway : match.away;
  const dirty =
    home !== (match.pred?.homeScore ?? -1) ||
    away !== (match.pred?.awayScore ?? -1) ||
    (needsWinner && winner !== match.pred?.predWinnerTeamId);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: match.id,
        homeScore: home,
        awayScore: away,
        ...(needsWinner && winner ? { predWinnerTeamId: winner } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save");
      return;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
    onSaved?.();
    router.refresh();
  }

  if (match.locked) {
    return (
      <div className="flex items-center justify-center gap-2 py-2 text-xs text-slate-500">
        <LockKeyhole size={14} /> Locked
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", !compact && "pt-3")}>
      <div className="flex justify-center">
        <LockCountdown lockAt={match.lockAtUtc} />
      </div>
      <div className="flex items-center justify-center gap-4">
        <Stepper value={home} onChange={setHome} />
        <span className="text-lg font-bold text-slate-600">:</span>
        <Stepper value={away} onChange={setAway} />
      </div>

      {needsWinner && homeTeam && awayTeam && (
        <div>
          <p className="mb-1.5 text-center text-[11px] uppercase tracking-wide text-slate-500">
            Draw — who goes through?
          </p>
          <div className="flex justify-center gap-2">
            {[homeTeam, awayTeam].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setWinner(t.id)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-semibold ring-1 transition",
                  winner === t.id
                    ? "bg-pitch-500/20 text-pitch-300 ring-pitch-500/50"
                    : "bg-white/5 text-slate-400 ring-white/10 hover:text-slate-200"
                )}
              >
                {t.flag} {t.code}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-center text-xs text-red-400">{error}</p>}

      <Button
        className="w-full"
        disabled={saving || !dirty || (needsWinner && !winner)}
        onClick={save}
      >
        {saving ? "Saving…" : savedFlash ? "Saved ✓" : match.pred ? "Update prediction" : "Save prediction"}
      </Button>
    </div>
  );
}

function MatchCard({ match }: { match: MatchView }) {
  const [openEditor, setOpenEditor] = useState(false);
  const isKo = match.stage !== "GROUP";
  // prefer reality once knockout participants are official
  const homeTeam = isKo ? (match.home ?? match.predHome) : match.home;
  const awayTeam = isKo ? (match.away ?? match.predAway) : match.away;
  const finished = match.status === "FINISHED";
  const liveScore =
    match.status === "LIVE" && match.homeScore != null && match.awayScore != null;
  const canEdit = !match.locked && match.open && !finished;

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 transition-colors",
        GRADE_CARD[finished ? match.grade : "PENDING"],
        match.stale && "border-gold-400/40"
      )}
    >
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <Chip className="bg-white/5 text-slate-400">
            {match.stage === "GROUP" ? `Group ${match.groupName}` : STAGE_LABEL[match.stage]}
          </Chip>
          {match.boost && (
            <Chip className="bg-gradient-to-r from-red-500/15 to-gold-400/15 font-semibold text-gold-300 ring-1 ring-gold-400/40">
              🇪🇸 VAMOS BONUS ×{match.boost}
            </Chip>
          )}
          {match.status === "LIVE" && (
            <Chip className="bg-red-500/15 text-red-300 ring-1 ring-red-500/30">● LIVE</Chip>
          )}
          {match.stale && (
            <Chip className="bg-gold-400/10 text-gold-300 ring-1 ring-gold-400/30">
              <AlertTriangle size={11} /> re-pick
            </Chip>
          )}
        </span>
        <span className="flex items-center gap-1">
          <LocalTime iso={match.kickoffUtc} />
          {match.venue && (
            <span className="hidden items-center gap-0.5 sm:inline-flex">
              <MapPin size={10} /> {match.venue.split(" (")[0]}
            </span>
          )}
        </span>
      </div>

      <button
        type="button"
        className="flex w-full items-center gap-2"
        onClick={() => canEdit && setOpenEditor((v) => !v)}
      >
        <TeamSide team={homeTeam} label={match.homeSlotLabel} align="left" />

        <div className="flex flex-col items-center px-1">
          {finished || liveScore ? (
            <>
              <div
                className={cn(
                  "font-display text-xl font-bold",
                  finished ? "text-slate-100" : "text-red-300"
                )}
              >
                {match.homeScore}–{match.awayScore}
              </div>
              {match.pred && (
                <Chip className={cn("mt-0.5", GRADE_BADGE[match.grade])}>
                  you: {match.pred.homeScore}–{match.pred.awayScore}
                  {finished && match.points > 0 && ` · +${match.points}`}
                </Chip>
              )}
            </>
          ) : match.pred ? (
            <div className="font-display rounded-xl bg-white/5 px-3 py-1 text-xl font-bold text-pitch-300 ring-1 ring-white/10">
              {match.pred.homeScore}–{match.pred.awayScore}
            </div>
          ) : (
            <div className="font-display rounded-xl bg-white/5 px-3 py-1 text-xl font-bold text-slate-600 ring-1 ring-white/10">
              –:–
            </div>
          )}
          {canEdit && (
            <ChevronDown
              size={14}
              className={cn("mt-1 text-slate-500 transition-transform", openEditor && "rotate-180")}
            />
          )}
        </div>

        <TeamSide team={awayTeam} label={match.awaySlotLabel} align="right" />
      </button>

      {!match.open && !finished && isKo && !match.home && (
        <p className="mt-1.5 text-center text-[11px] text-slate-600">
          Predict the matches that feed this one first
        </p>
      )}

      {openEditor && canEdit && <MatchEditor match={match} onSaved={() => setOpenEditor(false)} />}
    </div>
  );
}

export function MatchList({ payload }: { payload: MatchesPayload }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const today = new Date().toDateString();

  // While a match is in play, re-pull the server payload so live scores and
  // status flips show up without a manual reload (poller cadence applies).
  // Background tabs skip the refresh and catch up when they regain focus.
  const anyLive = payload.matches.some((m) => m.status === "LIVE");
  useEffect(() => {
    if (!anyLive) return;
    let last = Date.now();
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, 60_000);
    // Catch up when the tab regains visibility, but alt-tabbing back and
    // forth shouldn't fire a request every time.
    const onVisible = () => {
      if (!document.hidden && Date.now() - last > 30_000) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [anyLive, router]);

  const filtered = useMemo(() => {
    return payload.matches.filter((m) => {
      if (filter === "today") return new Date(m.kickoffUtc).toDateString() === today;
      if (filter === "group") return m.stage === "GROUP";
      if (filter === "knockout") return m.stage !== "GROUP";
      if (filter === "todo") return !m.pred && m.status !== "FINISHED";
      return true;
    });
  }, [payload.matches, filter, today]);

  const days = useMemo(() => {
    const map = new Map<string, MatchView[]>();
    for (const m of filtered) {
      const key = m.kickoffUtc.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()];
  }, [filtered]);

  const todayCount = payload.matches.filter(
    (m) => new Date(m.kickoffUtc).toDateString() === today
  ).length;
  const todoCount = payload.matches.filter((m) => !m.pred && m.status !== "FINISHED").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-slate-100">Matches</h1>
        <Chip className="bg-white/5 text-slate-400">
          <LockKeyhole size={11} /> locks {payload.lockMinutes} min before kickoff
        </Chip>
      </div>

      {todayCount > 0 && (
        <div className="rounded-2xl bg-pitch-500/10 px-4 py-2.5 text-sm text-pitch-300 ring-1 ring-pitch-500/30">
          ⚽ {todayCount} match{todayCount > 1 ? "es" : ""} today
        </div>
      )}

      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {(
          [
            ["all", "All"],
            ["today", "Today"],
            ["group", "Groups"],
            ["knockout", "Knockout"],
            ["todo", `To do${todoCount ? ` (${todoCount})` : ""}`],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition",
              filter === f
                ? "bg-pitch-500/20 text-pitch-300 ring-pitch-500/50"
                : "bg-white/5 text-slate-400 ring-white/10 hover:text-slate-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {days.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center text-sm text-slate-500">
          Nothing here — try another filter.
        </div>
      )}

      {days.map(([day, matches]) => (
        <section key={day}>
          <h2 className="sticky top-16 z-30 mb-2 w-fit rounded-full bg-night-900/90 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400 ring-1 ring-white/10 backdrop-blur">
            <LocalTime iso={matches[0].kickoffUtc} mode="date" />
          </h2>
          <div className="space-y-2">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
