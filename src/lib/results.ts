// Results ingestion (PLAN.MD §8): poll the openfootball JSON, update match
// scores/status, and resolve knockout participants as they become known.
// Grading and points are computed on demand from match rows, so updating the
// rows is all a sync needs to do.

import { prisma } from "./db";
import { getConfig } from "./config";
import { parseSourceFile, groupMatchKey, type SourceFile } from "./openfootball";

const LIVE_WINDOW_MS = 150 * 60 * 1000; // kickoff + 2.5h ≈ in play

export interface SyncReport {
  ok: boolean;
  source?: string;
  updated: number;
  finished: number;
  error?: string;
  ranAt: string;
}

export async function syncResults(): Promise<SyncReport> {
  const ranAt = new Date().toISOString();
  const { openfootballUrl } = await getConfig();

  let src: SourceFile;
  try {
    const res = await fetch(openfootballUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    src = (await res.json()) as SourceFile;
  } catch (e) {
    return { ok: false, updated: 0, finished: 0, error: String(e), ranAt };
  }

  const parsed = parseSourceFile(src);
  const teams = await prisma.team.findMany();
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));
  const dbMatches = await prisma.match.findMany();
  const byId = new Map(dbMatches.map((m) => [m.id, m]));
  const byExternal = new Map(dbMatches.map((m) => [m.externalId, m]));

  let updated = 0;
  let finished = 0;
  const now = Date.now();

  for (const p of parsed) {
    const key =
      p.stage === "GROUP"
        ? groupMatchKey({
            homeName: p.homeName,
            awayName: p.awayName,
            date: p.kickoffUtc.toISOString().slice(0, 10),
          })
        : `num:${p.num}`;
    const db = byId.get(p.num) ?? byExternal.get(key);
    if (!db) continue;

    const patch: Record<string, unknown> = {};

    // Knockout participants become real team names as the tournament unfolds.
    const homeId = p.homeName ? teamIdByName.get(p.homeName) : undefined;
    const awayId = p.awayName ? teamIdByName.get(p.awayName) : undefined;
    if (homeId && db.homeTeamId !== homeId) patch.homeTeamId = homeId;
    if (awayId && db.awayTeamId !== awayId) patch.awayTeamId = awayId;

    if (p.finished) {
      if (db.homeScore !== p.homeScore) patch.homeScore = p.homeScore;
      if (db.awayScore !== p.awayScore) patch.awayScore = p.awayScore;
      const winnerId = p.winnerName ? teamIdByName.get(p.winnerName) ?? null : null;
      if (winnerId && db.winnerTeamId !== winnerId) patch.winnerTeamId = winnerId;
      if (db.status !== "FINISHED") {
        patch.status = "FINISHED";
        finished++;
      }
    } else if (db.status !== "FINISHED") {
      // Don't downgrade results entered via the admin override.
      const kickoff = db.kickoffUtc.getTime();
      const status = now >= kickoff && now < kickoff + LIVE_WINDOW_MS ? "LIVE" : "SCHEDULED";
      if (db.status !== status) patch.status = status;
    }

    if (Object.keys(patch).length > 0) {
      await prisma.match.update({ where: { id: db.id }, data: patch });
      updated++;
    }
  }

  return { ok: true, source: openfootballUrl, updated, finished, ranAt };
}

// Lightweight status note for the admin screen, stored as a Setting row.
export async function recordSyncReport(report: SyncReport): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "lastSync" },
    update: { value: JSON.stringify(report) },
    create: { key: "lastSync", value: JSON.stringify(report) },
  });
}

export async function runSync(): Promise<SyncReport> {
  const report = await syncResults();
  await recordSyncReport(report);
  return report;
}
