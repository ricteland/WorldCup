"use client";

// Renders a UTC kickoff in the viewer's timezone. The server snapshot is a
// placeholder, so SSR output can't mismatch the user's locale.

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

function format(iso: string, mode: "time" | "datetime" | "date"): string {
  const d = new Date(iso);
  if (mode === "time") return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (mode === "date")
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// True when `iso` falls on the viewer's local "today". Server snapshot is
// false so SSR never renders a stale badge before the client knows the date.
export function useIsToday(iso: string): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => new Date(iso).toDateString() === new Date().toDateString(),
    () => false
  );
}

export function LocalTime({
  iso,
  mode = "time",
  className,
}: {
  iso: string;
  mode?: "time" | "datetime" | "date";
  className?: string;
}) {
  const text = useSyncExternalStore(
    subscribeNever,
    () => format(iso, mode),
    () => "–:–"
  );

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
