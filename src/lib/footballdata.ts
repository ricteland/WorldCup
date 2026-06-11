// football-data.org v4 live layer (PLAN.MD §8 fallback, now the in-play
// source): one request returns all World Cup matches with live status and
// running scores. Parsing is pure — no DB access — so it can be unit-tested.

export interface FdTeam {
  name?: string | null;
  tla?: string | null;
}

export interface FdScorePair {
  home?: number | null;
  away?: number | null;
}

export interface FdMatch {
  utcDate: string;
  status: string; // TIMED | SCHEDULED | IN_PLAY | PAUSED | FINISHED | AWARDED | ...
  group?: string | null;
  homeTeam?: FdTeam | null;
  awayTeam?: FdTeam | null;
  score?: {
    winner?: string | null; // HOME_TEAM | AWAY_TEAM | DRAW
    duration?: string | null;
    fullTime?: FdScorePair | null;
    halfTime?: FdScorePair | null;
  } | null;
}

export interface FdResponse {
  matches?: FdMatch[];
}

// Only states the sync layer acts on; anything else stays with the
// openfootball pass and the kickoff-window heuristic.
export interface FdUpdate {
  kickoffUtc: Date;
  homeCode?: string;
  homeName?: string;
  awayCode?: string;
  awayName?: string;
  status: "LIVE" | "FINISHED";
  homeScore?: number;
  awayScore?: number;
  winner?: "HOME" | "AWAY";
}

// football-data names that differ from the openfootball names we seeded with.
const NAME_ALIASES: Record<string, string> = {
  Czechia: "Czech Republic",
  "Türkiye": "Turkey",
  "Côte d'Ivoire": "Ivory Coast",
  "Cabo Verde": "Cape Verde",
  "Korea Republic": "South Korea",
  "IR Iran": "Iran",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "Congo DR": "DR Congo",
  "United States": "USA",
};

export function canonicalTeamName(name: string): string {
  return NAME_ALIASES[name] ?? name;
}

const STATUS_MAP: Record<string, FdUpdate["status"]> = {
  IN_PLAY: "LIVE",
  PAUSED: "LIVE", // half-time / break before extra time
  FINISHED: "FINISHED",
  AWARDED: "FINISHED",
};

export function parseFdMatches(res: FdResponse): FdUpdate[] {
  const out: FdUpdate[] = [];
  for (const m of res.matches ?? []) {
    const status = STATUS_MAP[m.status];
    if (!status) continue;

    // fullTime carries the running score while in play (penalties excluded),
    // matching the grading convention of "score after extra time".
    const s = m.score?.fullTime ?? m.score?.halfTime;
    const homeScore = s?.home ?? undefined;
    const awayScore = s?.away ?? undefined;
    // A finished match without a score is useless to us (and unsafe to grade).
    if (status === "FINISHED" && (homeScore == null || awayScore == null)) continue;

    out.push({
      kickoffUtc: new Date(m.utcDate),
      homeCode: m.homeTeam?.tla ?? undefined,
      homeName: m.homeTeam?.name ? canonicalTeamName(m.homeTeam.name) : undefined,
      awayCode: m.awayTeam?.tla ?? undefined,
      awayName: m.awayTeam?.name ? canonicalTeamName(m.awayTeam.name) : undefined,
      status,
      homeScore,
      awayScore,
      winner:
        m.score?.winner === "HOME_TEAM" ? "HOME" : m.score?.winner === "AWAY_TEAM" ? "AWAY" : undefined,
    });
  }
  return out;
}

export function fdToken(): string | undefined {
  const token = process.env.FOOTBALL_API_KEY;
  if (!token || token.startsWith("YOUR_")) return undefined; // .env.example placeholder
  return token;
}

const FD_MATCHES_URL = "https://api.football-data.org/v4/competitions/WC/matches";

export async function fetchFdUpdates(token: string): Promise<FdUpdate[]> {
  const res = await fetch(FD_MATCHES_URL, {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`football-data HTTP ${res.status}`);
  return parseFdMatches((await res.json()) as FdResponse);
}
