"use client";

// Admin screen: manual score override, sync-now, live [CONFIG] settings.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Card, Chip, Input } from "./ui";
import { LocalTime } from "./LocalTime";

export interface AdminMatchRow {
  id: number;
  label: string;
  stage: string;
  kickoffUtc: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeName: string;
  awayName: string;
}

export interface AdminPlayerRow {
  id: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  predictions: number;
}

export interface AdminData {
  matches: AdminMatchRow[];
  players: AdminPlayerRow[];
  settings: { leagueCode: string; lockMinutes: string; scoring: string };
  lastSync: { ok: boolean; ranAt: string; updated: number; finished: number; error?: string } | null;
}

function MatchRow({ m }: { m: AdminMatchRow }) {
  const router = useRouter();
  const [home, setHome] = useState(m.homeScore?.toString() ?? "");
  const [away, setAway] = useState(m.awayScore?.toString() ?? "");
  const [status, setStatus] = useState(m.status);
  const [winner, setWinner] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isKo = m.stage !== "GROUP";
  const drawn = home !== "" && home === away;

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: m.id,
        homeScore: home === "" ? null : Number(home),
        awayScore: away === "" ? null : Number(away),
        status,
        ...(isKo && drawn && winner ? { winnerTeamId: winner } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMsg(body.error ?? "Failed");
      return;
    }
    setMsg("Saved");
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-200">
          M{m.id} · {m.label}
        </span>
        <span className="text-slate-500">
          <LocalTime iso={m.kickoffUtc} mode="datetime" />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          className="w-16 px-2 py-1.5 text-center text-sm"
          value={home}
          onChange={(e) => setHome(e.target.value.replace(/\D/g, ""))}
          placeholder="–"
          aria-label={`${m.homeName} score`}
        />
        <span className="text-slate-600">:</span>
        <Input
          inputMode="numeric"
          className="w-16 px-2 py-1.5 text-center text-sm"
          value={away}
          onChange={(e) => setAway(e.target.value.replace(/\D/g, ""))}
          placeholder="–"
          aria-label={`${m.awayName} score`}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl bg-white/5 px-2 py-2 text-xs text-slate-200 ring-1 ring-white/10"
        >
          <option value="SCHEDULED">Scheduled</option>
          <option value="LIVE">Live</option>
          <option value="FINISHED">Finished</option>
        </select>
        <Button variant="ghost" className="ml-auto px-3 py-1.5 text-xs" disabled={busy} onClick={save}>
          <Save size={13} /> Save
        </Button>
      </div>
      {isKo && drawn && (
        <select
          value={winner}
          onChange={(e) => setWinner(e.target.value)}
          className="w-full rounded-xl bg-white/5 px-2 py-2 text-xs text-slate-200 ring-1 ring-white/10"
        >
          <option value="">Winner (pens)…</option>
          {m.homeTeamId && <option value={m.homeTeamId}>{m.homeName}</option>}
          {m.awayTeamId && <option value={m.awayTeamId}>{m.awayName}</option>}
        </select>
      )}
      {msg && <p className={cn("text-xs", msg === "Saved" ? "text-pitch-400" : "text-red-400")}>{msg}</p>}
    </div>
  );
}

function PlayerRow({ p }: { p: AdminPlayerRow }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/player", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: p.id }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed");
      setConfirming(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-slate-200">{p.displayName}</span>
          {p.isAdmin && <Chip className="bg-gold-400/10 text-gold-300">admin</Chip>}
        </div>
        <div className="text-[11px] text-slate-500">
          joined <LocalTime iso={p.createdAt} mode="date" /> · {p.predictions} prediction
          {p.predictions === 1 ? "" : "s"}
        </div>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>
      {!p.isAdmin &&
        (confirming ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              className="px-2.5 py-1.5 text-xs text-red-300 ring-1 ring-red-500/40"
              disabled={busy}
              onClick={remove}
            >
              {busy ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button
              variant="ghost"
              className="px-2.5 py-1.5 text-xs"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            className="shrink-0 px-2.5 py-1.5 text-xs text-slate-400 hover:text-red-300"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${p.displayName}`}
          >
            <Trash2 size={13} />
          </Button>
        ))}
    </div>
  );
}

export function AdminView({ data }: { data: AdminData }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [settings, setSettings] = useState(data.settings);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function syncNow() {
    setSyncing(true);
    await fetch("/api/admin/sync", { method: "POST" });
    setSyncing(false);
    router.refresh();
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsMsg(null);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const body = await res.json().catch(() => ({}));
    setSettingsMsg(res.ok ? "Settings saved" : (body.error ?? "Failed"));
  }

  const visible = data.matches.filter(
    (m) => query === "" || m.label.toLowerCase().includes(query.toLowerCase()) || String(m.id) === query
  );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-slate-100">
        Admin <span className="text-sm font-normal text-gold-400">league control</span>
      </h1>

      <Card className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Results sync</h2>
          <Button variant="gold" className="px-3 py-1.5 text-xs" disabled={syncing} onClick={syncNow}>
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
        {data.lastSync ? (
          <p className="text-xs text-slate-500">
            Last run <LocalTime iso={data.lastSync.ranAt} mode="datetime" /> ·{" "}
            {data.lastSync.ok ? (
              <Chip className="bg-pitch-500/10 text-pitch-300">
                {data.lastSync.updated} updated, {data.lastSync.finished} newly finished
              </Chip>
            ) : (
              <Chip className="bg-red-500/10 text-red-300">failed: {data.lastSync.error}</Chip>
            )}
          </p>
        ) : (
          <p className="text-xs text-slate-500">Never run.</p>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold text-slate-200">League settings [CONFIG]</h2>
        <form onSubmit={saveSettings} className="space-y-2">
          <label className="block text-xs text-slate-400">
            Join code
            <Input
              className="mt-1"
              value={settings.leagueCode}
              onChange={(e) => setSettings({ ...settings, leagueCode: e.target.value })}
            />
          </label>
          <label className="block text-xs text-slate-400">
            Lock window (minutes before each kickoff)
            <Input
              className="mt-1"
              value={settings.lockMinutes}
              onChange={(e) => setSettings({ ...settings, lockMinutes: e.target.value })}
            />
          </label>
          <label className="block text-xs text-slate-400">
            Scoring weights (JSON)
            <Input
              className="mt-1 font-mono text-xs"
              value={settings.scoring}
              onChange={(e) => setSettings({ ...settings, scoring: e.target.value })}
            />
          </label>
          {settingsMsg && (
            <p className={cn("text-xs", settingsMsg.includes("saved") ? "text-pitch-400" : "text-red-400")}>
              {settingsMsg}
            </p>
          )}
          <Button type="submit" variant="ghost" className="w-full">
            Save settings
          </Button>
        </form>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold text-slate-200">
          Players <span className="text-xs font-normal text-slate-500">({data.players.length})</span>
        </h2>
        <p className="text-xs text-slate-500">
          Deleting a player removes their predictions and points permanently.
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {data.players.map((p) => (
            <PlayerRow key={p.id} p={p} />
          ))}
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold text-slate-200">Manual score override</h2>
        <Input
          placeholder="Filter by team or match number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-[28rem] space-y-2 overflow-y-auto">
          {visible.map((m) => (
            <MatchRow key={m.id} m={m} />
          ))}
        </div>
      </Card>
    </div>
  );
}
