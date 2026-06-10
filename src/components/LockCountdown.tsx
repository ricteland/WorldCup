"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, Timer } from "lucide-react";
import { Chip } from "./ui";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export function LockCountdown({ lockAt }: { lockAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = new Date(lockAt).getTime() - now;
  if (remaining <= 0) {
    return (
      <Chip className="bg-red-500/10 text-red-300 ring-1 ring-red-500/30">
        <LockKeyhole size={12} /> Predictions locked
      </Chip>
    );
  }
  return (
    <Chip className="bg-gold-400/10 text-gold-300 ring-1 ring-gold-400/30" suppressHydrationWarning>
      <Timer size={12} /> Locks in {fmt(remaining)}
    </Chip>
  );
}
