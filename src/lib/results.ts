// Results ingestion (PLAN.MD §8): poll the openfootball JSON, update match
// scores/status, and resolve knockout participants as they become known.
// When a football-data.org key is configured, a second pass layers live
// in-play scores and faster full-time results on top. Grading and points are
// computed on demand from match rows, so updating the rows is all a sync
// needs to do.

import type { Match, Team } from "@prisma/client";
import { prisma } from "./db";
import { getConfig } from "./config";
import { parseSourceFile, groupMatchKey, type SourceFile } from "./openfootball";
import { fdToken, fetchFdUpdates, type FdUpdate } from "./footballdata";

const LIVE_WINDOW_MS = 150 * 60 * 1000; // kickoff + 2.5h ≈ in play

export interface SyncReport {
  ok: boolean;
  source?: string;
  updated: number;
  finished: number;
  error?: string;
  liveSource?: "football-data";
  liveError?: string;
  liveNow?: number; // matches currently LIVE — drives the faster poll cadence
  /** Ms until the next non-finished match kicks off (null if none left) — lets
   *  the poller wake up right at kickoff instead of on the slow idle cadence. */
  nextKickoffMs: number | null;
  ranAt: string;
}

async function syncOpenfootball(): Promise<{ updated: number; finished: number }> {
  const { openfootballUrl } = await getConfig();
  const res = await fetch(openfootballUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const src = (await res.json()) as SourceFile;

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
      // In-play scores from the source (when its feed carries them) are stored
      // as they come; grading stays gated on status FINISHED everywhere.
      if (p.homeScore != null && db.homeScore !== p.homeScore) patch.homeScore = p.homeScore;
      if (p.awayScore != null && db.awayScore !== p.awayScore) patch.awayScore = p.awayScore;
      // Only ever upgrade to LIVE here — never write SCHEDULED over a status
      // the admin set by hand. FINISHED (above) ends the live state, and the
      // admin screen can flip a match back manually if needed.
      const kickoff = db.kickoffUtc.getTime();
      const inWindow = now >= kickoff && now < kickoff + LIVE_WINDOW_MS;
      if ((inWindow || p.homeScore != null) && db.status !== "LIVE") patch.status = "LIVE";
    }

    if (Object.keys(patch).length > 0) {
      await prisma.match.update({ where: { id: db.id }, data: patch });
      updated++;
    }
  }

  return { updated, finished };
}

/** Find the DB match an update refers to: same two teams on the same UTC day,
 *  or — for knockouts whose participants we haven't resolved yet — the lone
 *  knockout match at that exact kickoff instant. */
function matchForUpdate(
  u: FdUpdate,
  dbMatches: Match[],
  teams: Team[]
): { db: Match; homeTeamId?: string; awayTeamId?: string } | null {
  const byCode = new Map(teams.map((t) => [t.code, t.id]));
  const byName = new Map(teams.map((t) => [t.name, t.id]));
  const homeTeamId = (u.homeCode && byCode.get(u.homeCode)) || (u.homeName && byName.get(u.homeName)) || undefined;
  const awayTeamId = (u.awayCode && byCode.get(u.awayCode)) || (u.awayName && byName.get(u.awayName)) || undefined;

  if (homeTeamId && awayTeamId) {
    const day = u.kickoffUtc.toISOString().slice(0, 10);
    const db = dbMatches.find(
      (m) =>
        m.kickoffUtc.toISOString().slice(0, 10) === day &&
        ((m.homeTeamId === homeTeamId && m.awayTeamId === awayTeamId) ||
          (m.homeTeamId === awayTeamId && m.awayTeamId === homeTeamId))
    );
    if (db) return { db, homeTeamId, awayTeamId };
  }

  // Knockout whose participants we haven't resolved yet (or teams we couldn't
  // map): only safe when exactly one KO match has that exact kickoff instant.
  const t = u.kickoffUtc.getTime();
  const candidates = dbMatches.filter((m) => m.id > 72 && m.kickoffUtc.getTime() === t);
  return candidates.length === 1 ? { db: candidates[0], homeTeamId, awayTeamId } : null;
}

async function syncFootballData(token: string): Promise<{ updated: number; finished: number }> {
  const updates = await fetchFdUpdates(token);
  let updated = 0;
  let finished = 0;
  if (updates.length === 0) return { updated, finished };

  const teams = await prisma.team.findMany();
  const dbMatches = await prisma.match.findMany();

  for (const u of updates) {
    const hit = matchForUpdate(u, dbMatches, teams);
    if (!hit) continue;
    const { db, homeTeamId, awayTeamId } = hit;
    // Admin override and already-graded results stay authoritative.
    if (db.status === "FINISHED") continue;

    const flipped = homeTeamId != null && db.homeTeamId === awayTeamId && db.awayTeamId === homeTeamId;
    const patch: Record<string, unknown> = {};

    if (homeTeamId && db.homeTeamId == null) patch.homeTeamId = homeTeamId;
    if (awayTeamId && db.awayTeamId == null) patch.awayTeamId = awayTeamId;

    const hs = flipped ? u.awayScore : u.homeScore;
    const as = flipped ? u.homeScore : u.awayScore;
    if (hs != null && db.homeScore !== hs) patch.homeScore = hs;
    if (as != null && db.awayScore !== as) patch.awayScore = as;

    if (u.status === "FINISHED") {
      const winnerSide = flipped ? (u.winner === "HOME" ? "AWAY" : u.winner === "AWAY" ? "HOME" : undefined) : u.winner;
      const winnerId =
        winnerSide === "HOME"
          ? (patch.homeTeamId as string | undefined) ?? db.homeTeamId
          : winnerSide === "AWAY"
            ? (patch.awayTeamId as string | undefined) ?? db.awayTeamId
            : null;
      if (winnerId && db.winnerTeamId !== winnerId) patch.winnerTeamId = winnerId;
      patch.status = "FINISHED";
      finished++;
    } else if (db.status !== "LIVE") {
      patch.status = "LIVE";
    }

    if (Object.keys(patch).length > 0) {
      await prisma.match.update({ where: { id: db.id }, data: patch });
      updated++;
    }
  }

  return { updated, finished };
}

export async function syncResults(): Promise<SyncReport> {
  const ranAt = new Date().toISOString();
  const { openfootballUrl } = await getConfig();

  let updated = 0;
  let finished = 0;
  let error: string | undefined;
  try {
    const of = await syncOpenfootball();
    updated += of.updated;
    finished += of.finished;
  } catch (e) {
    error = String(e);
  }

  // Live layer: even if the openfootball fetch failed, in-play scores keep flowing.
  const token = fdToken();
  let liveError: string | undefined;
  if (token) {
    try {
      const fd = await syncFootballData(token);
      updated += fd.updated;
      finished += fd.finished;
    } catch (e) {
      liveError = String(e);
    }
  }

  const liveNow = await prisma.match.count({ where: { status: "LIVE" } });
  const nextMatch = await prisma.match.findFirst({
    where: { status: { not: "FINISHED" }, kickoffUtc: { gte: new Date() } },
    orderBy: { kickoffUtc: "asc" },
    select: { kickoffUtc: true },
  });
  const nextKickoffMs = nextMatch ? nextMatch.kickoffUtc.getTime() - Date.now() : null;

  return {
    ok: !error,
    source: openfootballUrl,
    updated,
    finished,
    error,
    ...(token ? { liveSource: "football-data" as const } : {}),
    liveError,
    liveNow,
    nextKickoffMs,
    ranAt,
  };
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
  // Refresh the leaderboard momentum baseline so "since yesterday" movement
  // stays current. Best-effort: a snapshot hiccup must never fail a sync.
  try {
    const { captureStandingsSnapshot } = await import("./data");
    await captureStandingsSnapshot();
  } catch (e) {
    console.warn("[results-sync] snapshot failed:", e);
  }
  return report;
}
