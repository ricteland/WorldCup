// [CONFIG] resolution: Setting row (live-editable by admin) → env var → default.

import { prisma } from "./db";
import { DEFAULT_SCORING, type ScoringConfig } from "./scoring";

export interface AppConfig {
  leagueCode: string;
  /** Each match locks this many minutes before its own kickoff. */
  lockMinutes: number;
  scoring: ScoringConfig;
  appUrl: string;
  openfootballUrl: string;
  pollMinutes: number;
  /** Admin kill switch: every match is closed for predictions while true,
   *  regardless of its rolling kickoff-based deadline. */
  predictionsLocked: boolean;
}

const DEFAULTS = {
  leagueCode: "VAMOS2026",
  lockMinutes: 30,
  appUrl: "http://localhost:3000",
  openfootballUrl:
    "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
  pollMinutes: 20,
};

export async function getSettingRows(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getConfig(): Promise<AppConfig> {
  const s = await getSettingRows();
  let scoring = DEFAULT_SCORING;
  if (s.scoring) {
    try {
      scoring = { ...DEFAULT_SCORING, ...JSON.parse(s.scoring) };
    } catch {
      // keep defaults on malformed JSON
    }
  }
  const lockMinutes = Number(
    s.lockMinutes ?? process.env.PREDICTION_LOCK_MINUTES ?? DEFAULTS.lockMinutes
  );
  return {
    leagueCode: s.leagueCode ?? process.env.LEAGUE_CODE ?? DEFAULTS.leagueCode,
    lockMinutes: Number.isFinite(lockMinutes) && lockMinutes >= 0 ? lockMinutes : DEFAULTS.lockMinutes,
    scoring,
    appUrl: process.env.APP_URL ?? DEFAULTS.appUrl,
    openfootballUrl: process.env.OPENFOOTBALL_URL ?? DEFAULTS.openfootballUrl,
    pollMinutes: Number(process.env.RESULTS_POLL_MINUTES ?? DEFAULTS.pollMinutes),
    predictionsLocked: s.predictionsLocked === "1",
  };
}

/** When predictions for a match freeze: lockMinutes before its kickoff. */
export function matchLockAt(kickoffUtc: Date, lockMinutes: number): Date {
  return new Date(kickoffUtc.getTime() - lockMinutes * 60_000);
}

export function isMatchLocked(kickoffUtc: Date, lockMinutes: number): boolean {
  return Date.now() >= matchLockAt(kickoffUtc, lockMinutes).getTime();
}
