// Starts the results poller inside the app process (PLAN.MD §3/§8):
// poll the openfootball source every RESULTS_POLL_MINUTES (default 20).
// When a football-data.org key is configured and a match is in play, the
// cadence tightens to LIVE_POLL_SECONDS (default 60) so live scores flow.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __wc26Poller?: boolean };
  if (g.__wc26Poller) return;
  g.__wc26Poller = true;

  const { runSync } = await import("./lib/results");
  const { fdToken } = await import("./lib/footballdata");
  const minutes = Number(process.env.RESULTS_POLL_MINUTES ?? 20);
  const liveSeconds = Number(process.env.LIVE_POLL_SECONDS ?? 60);
  const idleMs = Math.max(1, minutes) * 60_000;
  const liveMs = Math.max(30, liveSeconds) * 1000;

  const tick = async () => {
    let delay = idleMs;
    try {
      const report = await runSync();
      if (!report.ok) console.warn("[results-sync] failed:", report.error);
      else if (report.updated > 0) console.log(`[results-sync] updated ${report.updated} matches`);
      if (report.liveError) console.warn("[results-sync] live layer failed:", report.liveError);
      // Fast cadence only pays off when the live source is configured.
      if (fdToken() && (report.liveNow ?? 0) > 0) delay = liveMs;
      // A match starts before the next idle poll: wake right as it kicks off so
      // live coverage begins within one fast tick, not up to RESULTS_POLL_MINUTES late.
      else if (report.nextKickoffMs != null && report.nextKickoffMs < idleMs)
        delay = Math.max(liveMs, report.nextKickoffMs + 5_000);
    } catch (e) {
      console.warn("[results-sync] crashed:", e);
    }
    setTimeout(tick, delay);
  };

  setTimeout(tick, 15_000); // first pass shortly after boot
  console.log(`[results-sync] polling every ${minutes} min (${liveSeconds}s while live)`);
}
