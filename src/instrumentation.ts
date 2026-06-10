// Starts the results poller inside the app process (PLAN.MD §3/§8):
// poll the openfootball source every RESULTS_POLL_MINUTES (default 20).
// No real-time requirement — a modest interval is the design.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __wc26Poller?: boolean };
  if (g.__wc26Poller) return;
  g.__wc26Poller = true;

  const { runSync } = await import("./lib/results");
  const minutes = Number(process.env.RESULTS_POLL_MINUTES ?? 20);

  const tick = async () => {
    try {
      const report = await runSync();
      if (!report.ok) console.warn("[results-sync] failed:", report.error);
      else if (report.updated > 0) console.log(`[results-sync] updated ${report.updated} matches`);
    } catch (e) {
      console.warn("[results-sync] crashed:", e);
    }
  };

  setTimeout(tick, 15_000); // first pass shortly after boot
  setInterval(tick, Math.max(1, minutes) * 60_000);
  console.log(`[results-sync] polling every ${minutes} min`);
}
