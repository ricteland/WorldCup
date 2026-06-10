// [CONFIG] resolution: Setting row (live-editable by admin) → env var → default.

import { prisma } from "./db";
import { DEFAULT_SCORING, type ScoringConfig } from "./scoring";

export interface AppConfig {
  leagueCode: string;
  lockAt: Date;
  scoring: ScoringConfig;
  appUrl: string;
  openfootballUrl: string;
  pollMinutes: number;
}

const DEFAULTS = {
  leagueCode: "VAMOS2026",
  // 30 minutes before the opener (Mexico v South Africa, 19:00 UTC).
  lockAt: "2026-06-11T18:30:00Z",
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
  return {
    leagueCode: s.leagueCode ?? process.env.LEAGUE_CODE ?? DEFAULTS.leagueCode,
    lockAt: new Date(s.lockAt ?? process.env.PREDICTION_LOCK_AT ?? DEFAULTS.lockAt),
    scoring,
    appUrl: process.env.APP_URL ?? DEFAULTS.appUrl,
    openfootballUrl: process.env.OPENFOOTBALL_URL ?? DEFAULTS.openfootballUrl,
    pollMinutes: Number(process.env.RESULTS_POLL_MINUTES ?? DEFAULTS.pollMinutes),
  };
}

export async function isLocked(): Promise<boolean> {
  const { lockAt } = await getConfig();
  return Date.now() >= lockAt.getTime();
}
