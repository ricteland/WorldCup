import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/session";
import { JoinForm } from "@/components/JoinForm";
import { Logo, Wordmark } from "@/components/Logo";

export default async function JoinPage() {
  const player = await getCurrentPlayer();
  if (player) redirect("/matches");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={72} />
        <Wordmark />
        <p className="max-w-xs text-sm text-slate-400">
          The 2026 World Cup, called in advance. Predict the groups, conquer the bracket round
          by round, beat your friends. ¡Vamos!
        </p>
      </div>
      <Suspense>
        <JoinForm />
      </Suspense>
      <p className="text-[11px] text-slate-600">June 11 – July 19, 2026 · 48 teams · 16 cities</p>
    </main>
  );
}
