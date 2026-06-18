"use client";

// Match Predictions tab (PLAN.MD §9.1): all 104 matches grouped by day,
// inline stepper editor, lock state, and result grading colors.

import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LockKeyhole, Minus, Plus, AlertTriangle, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { GRADE_BADGE, GRADE_CARD } from "@/lib/grade";
import type { MatchesPayload, MatchLeaguePayload, MatchView, TeamView } from "@/lib/views";
import { Button, Chip } from "./ui";
import { LocalTime, useIsToday } from "./LocalTime";
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

// Everyone's pick for one match, fetched when the card is expanded. While the
// match is live it's just the picks; once finished it becomes a ranked
// single-game leaderboard with the points each pick earned.
function LeaguePanel({ match }: { match: MatchView }) {
  const [data, setData] = useState<MatchLeaguePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refetch when the result moves (live score ticks, status flips to
  // FINISHED) so an open panel keeps up with router.refresh().
  const resultKey = `${match.status}:${match.homeScore}-${match.awayScore}`;
  useEffect(() => {
    let on = true;
    fetch(`/api/matches/${match.id}/predictions`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Could not load predictions");
        }
        return res.json() as Promise<MatchLeaguePayload>;
      })
      .then((d) => {
        if (on) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => on && setError(e.message));
    return () => {
      on = false;
    };
  }, [match.id, resultKey]);

  if (error) return <p className="mt-3 text-center text-xs text-red-400">{error}</p>;
  if (!data) return <p className="mt-3 text-center text-xs text-slate-500">Loading picks…</p>;

  const finished = data.finished;
  let rank = 0;
  let prevTotal = -1;

  return (
    <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {finished ? "Match leaderboard" : "League predictions"}
      </p>
      {data.rows.map((r, i) => {
        const total = r.points + r.bonus;
        if (finished && total !== prevTotal) {
          rank = i + 1;
          prevTotal = total;
        }
        const drawPick = r.pred && r.pred.homeScore === r.pred.awayScore ? r.pred.winner : null;
        return (
          <div
            key={r.playerId}
            className={cn(
              "flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5",
              r.isYou ? "bg-pitch-500/10 ring-1 ring-pitch-500/30" : "bg-white/[0.03]"
            )}
          >
            <span className="min-w-0 truncate text-xs font-medium text-slate-200">
              {finished && <span className="mr-1.5 text-slate-500">{rank}.</span>}
              {r.name}
              {r.isYou && <span className="text-pitch-300"> (you)</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {r.stale && <AlertTriangle size={12} className="text-gold-300" />}
              {r.pred ? (
                <Chip className={GRADE_BADGE[finished ? r.grade : "PENDING"]}>
                  {r.pred.homeScore}–{r.pred.awayScore}
                  {drawPick && ` · ${drawPick.flag} ${drawPick.code}`}
                </Chip>
              ) : (
                <span className="text-[11px] text-slate-600">no prediction</span>
              )}
              {finished && r.bonus > 0 && (
                <Chip className="bg-gold-400/10 text-gold-300 ring-1 ring-gold-400/30">
                  adv +{r.bonus}
                </Chip>
              )}
              {finished && (
                <span
                  className={cn(
                    "font-display w-9 text-right text-sm font-bold",
                    total > 0 ? "text-slate-100" : "text-slate-600"
                  )}
                >
                  +{total}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MatchCard({
  match,
  innerRef,
}: {
  match: MatchView;
  innerRef?: Ref<HTMLDivElement>;
}) {
  const [openEditor, setOpenEditor] = useState(false);
  const [openLeague, setOpenLeague] = useState(false);
  const isKo = match.stage !== "GROUP";
  // prefer reality once knockout participants are official
  const homeTeam = isKo ? (match.home ?? match.predHome) : match.home;
  const awayTeam = isKo ? (match.away ?? match.predAway) : match.away;
  const finished = match.status === "FINISHED";
  const liveScore =
    match.status === "LIVE" && match.homeScore != null && match.awayScore != null;
  const canEdit = !match.locked && match.open && !finished;
  // once a match is underway, tapping it reveals the whole league's picks
  const canPeek = !canEdit && (match.status === "LIVE" || finished);

  return (
    <div
      ref={innerRef}
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
        onClick={() => {
          if (canEdit) setOpenEditor((v) => !v);
          else if (canPeek) setOpenLeague((v) => !v);
        }}
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
          {(canEdit || canPeek) && (
            <ChevronDown
              size={14}
              className={cn(
                "mt-1 text-slate-500 transition-transform",
                (canEdit ? openEditor : openLeague) && "rotate-180"
              )}
            />
          )}
        </div>

        <TeamSide team={awayTeam} label={match.awaySlotLabel} align="right" />
      </button>

      {!match.open && !finished && isKo && (
        <p className="mt-1.5 text-center text-[11px] text-slate-600">
          Opens once the real matchup is decided
        </p>
      )}

      {openEditor && canEdit && <MatchEditor match={match} onSaved={() => setOpenEditor(false)} />}

      {openLeague && canPeek && <LeaguePanel match={match} />}
    </div>
  );
}

function DayHeading({ iso }: { iso: string }) {
  const isToday = useIsToday(iso);
  return (
    <h2
      className={cn(
        "sticky top-16 z-30 mb-2 flex w-fit items-center gap-2 rounded-full bg-night-900/90 px-3 py-1 text-xs font-semibold uppercase tracking-wider ring-1 backdrop-blur",
        isToday
          ? "text-amber-100 ring-amber-300/40 shadow-[0_0_16px_-2px_rgba(251,191,36,0.45)]"
          : "text-slate-400 ring-white/10"
      )}
    >
      <LocalTime iso={iso} mode="date" />
      {isToday && (
        <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-amber-200 ring-1 ring-amber-300/40">
          Today
        </span>
      )}
    </h2>
  );
}

export function MatchList({ payload }: { payload: MatchesPayload }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const today = new Date().toDateString();

  // Scroll the current game into view: whatever is live now, else the next one
  // to kick off, else (tournament over) the most recent. Friends were having to
  // scroll past every finished game to reach the action. We anchor two games
  // earlier in the schedule, so the current game lands a little below the top —
  // with a couple of games visible above it for context — rather than pinned to
  // the very top. Used by the open-on-mount jump and the "matches today" shortcut.
  const cardRefs = useRef(new Map<number, HTMLDivElement>());
  const scrollToCurrent = useCallback(() => {
    const chrono = [...payload.matches].sort(
      (a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()
    );
    const now = Date.now();
    const target =
      chrono.find((m) => m.status === "LIVE") ??
      chrono.find((m) => m.status !== "FINISHED" && new Date(m.kickoffUtc).getTime() >= now) ??
      chrono.at(-1);
    if (!target) return;
    const anchorId = chrono[Math.max(0, chrono.indexOf(target) - 2)]?.id;
    if (anchorId == null) return;
    const el = cardRefs.current.get(anchorId);
    if (!el) return;
    // offset clears the sticky top bar + day header
    const HEADER_OFFSET = 100;
    const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
    window.scrollTo({ top: Math.max(0, top) });
  }, [payload.matches]);

  // Land on the current game when the tab opens — once. router.refresh()
  // preserves scroll, so live ticks never yank the view back. Two frames so
  // layout (incl. LocalTime hydration) has settled before we measure.
  const didScroll = useRef(false);
  useEffect(() => {
    if (didScroll.current) return;
    didScroll.current = true;
    const raf = requestAnimationFrame(() => requestAnimationFrame(scrollToCurrent));
    return () => cancelAnimationFrame(raf);
  }, [scrollToCurrent]);

  // Keep the live game fresh without a manual reload. While a match is on
  // (live, or just inside its kickoff window) re-pull the server payload every
  // 30s; otherwise sit idle but wake once right at the next kickoff so an open
  // tab starts following the game on its own. Background tabs skip the refresh
  // and catch up when they regain focus.
  useEffect(() => {
    const now = Date.now();
    const LIVE_WINDOW_MS = 150 * 60 * 1000; // kickoff + 2.5h ≈ in play
    const hot = payload.matches.some((m) => {
      if (m.status === "LIVE") return true;
      if (m.status === "FINISHED") return false;
      const ko = new Date(m.kickoffUtc).getTime();
      return now >= ko && now < ko + LIVE_WINDOW_MS;
    });

    if (hot) {
      let last = Date.now();
      const refresh = () => {
        last = Date.now();
        router.refresh();
      };
      const id = setInterval(() => {
        if (!document.hidden) refresh();
      }, 30_000);
      const onVisible = () => {
        if (!document.hidden && Date.now() - last > 15_000) refresh();
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        clearInterval(id);
        document.removeEventListener("visibilitychange", onVisible);
      };
    }

    // Idle: nothing in play. Wake once when the next match kicks off.
    const future = payload.matches
      .map((m) => new Date(m.kickoffUtc).getTime())
      .filter((t) => t > now);
    if (future.length === 0) return;
    const delay = Math.min(Math.min(...future) - now + 2_000, 0x7fffffff);
    const id = setTimeout(() => router.refresh(), delay);
    return () => clearTimeout(id);
  }, [payload.matches, router]);

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
        {payload.manualLock ? (
          <Chip className="bg-red-500/10 text-red-300 ring-1 ring-red-500/30">
            <LockKeyhole size={11} /> predictions closed by the admin
          </Chip>
        ) : (
          <Chip className="bg-white/5 text-slate-400">
            <LockKeyhole size={11} /> locks {payload.lockMinutes} min before kickoff
          </Chip>
        )}
      </div>

      {todayCount > 0 && (
        <button
          type="button"
          onClick={scrollToCurrent}
          className="block w-full rounded-2xl bg-pitch-500/10 px-4 py-2.5 text-left text-sm text-pitch-300 ring-1 ring-pitch-500/30 transition hover:bg-pitch-500/15 active:scale-[0.99]"
        >
          ⚽ {todayCount} match{todayCount > 1 ? "es" : ""} today
        </button>
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
          <DayHeading iso={matches[0].kickoffUtc} />
          <div className="space-y-2">
            {matches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                innerRef={(el) => {
                  if (el) cardRefs.current.set(m.id, el);
                  else cardRefs.current.delete(m.id);
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
