"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Link2 } from "lucide-react";
import { Button, Card, Input } from "./ui";
import { CopyButton } from "./CopyButton";

export function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "bad-link" ? "That recovery link doesn't exist." : null
  );
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, displayName: name }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Something went wrong");
      return;
    }
    setRecoveryUrl(body.recoveryUrl);
  }

  if (recoveryUrl) {
    return (
      <Card className="animate-pop w-full max-w-sm space-y-4 p-6">
        <h2 className="font-display text-xl font-bold text-slate-100">You&apos;re in! 🎉</h2>
        <p className="text-sm text-slate-300">
          This is your <strong className="text-gold-300">private login link</strong>. It&apos;s the
          only way back in on another device — <strong>bookmark it or save it somewhere safe</strong>.
        </p>
        <div className="flex items-center gap-2 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <Link2 size={16} className="shrink-0 text-pitch-400" />
          <span className="truncate text-xs text-slate-300">{recoveryUrl}</span>
        </div>
        <div className="flex gap-2">
          <CopyButton text={recoveryUrl} label="Copy link" />
          <Button className="flex-1" onClick={() => router.push("/matches")}>
            Start predicting <ArrowRight size={16} />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <form onSubmit={join} className="space-y-3">
        <div>
          <label htmlFor="code" className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
            League code
          </label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. VAMOS2026"
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
            Your name
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How friends will see you"
            maxLength={24}
            required
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Joining…" : "Join the league"}
        </Button>
        <p className="pt-1 text-center text-xs text-slate-500">
          Been here before? Open your private recovery link to sign back in.
        </p>
      </form>
    </Card>
  );
}
