"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Pencil } from "lucide-react";
import { Button, Card, Input } from "./ui";
import { CopyButton } from "./CopyButton";
import { GamblingCorner } from "./GamblingCorner";

export interface ProfileData {
  displayName: string;
  recoveryUrl: string;
  matchPoints: number;
  bracketPoints: number;
  total: number;
  predictionsMade: number;
  isAdmin: boolean;
  gambleBalance: number;
}

export function ProfileView({ profile }: { profile: ProfileData }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.displayName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not rename");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-slate-100">Profile</h1>

      <Card className="space-y-4 p-4">
        {editing ? (
          <form onSubmit={rename} className="space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1">
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-lg font-bold text-slate-100">
                {profile.displayName}
                {profile.isAdmin && <span className="ml-2 text-xs text-gold-400">admin</span>}
              </div>
              <div className="text-xs text-slate-500">{profile.predictionsMade}/104 predictions made</div>
            </div>
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setEditing(true)}>
              <Pencil size={13} /> Rename
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["Match pts", profile.matchPoints, "text-pitch-300"],
              ["Bracket pts", profile.bracketPoints, "text-gold-300"],
              ["Total", profile.total, "text-slate-100"],
            ] as const
          ).map(([label, value, color]) => (
            <div key={label} className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/5">
              <div className={`font-display text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold text-slate-200">Your private login link</h2>
        <p className="text-xs text-slate-400">
          Open this on any device to sign back in as <strong>{profile.displayName}</strong>. Keep
          it secret — anyone with the link is you.
        </p>
        <div className="flex items-center gap-2 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <Link2 size={16} className="shrink-0 text-pitch-400" />
          <span className="truncate text-xs text-slate-300">{profile.recoveryUrl}</span>
        </div>
        <CopyButton text={profile.recoveryUrl} label="Copy link" />
      </Card>

      <GamblingCorner initialBalance={profile.gambleBalance} />
    </div>
  );
}
