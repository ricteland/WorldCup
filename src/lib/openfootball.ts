// Parser for openfootball/worldcup.json (2026). Pure — no DB access — so it can
// be unit-tested and shared by the seed script and the results poller.

export type Stage = "GROUP" | "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";

export interface SourceMatch {
  round: string;
  date: string; // "2026-06-11"
  time?: string; // "13:00 UTC-6"
  team1: string | { name: string };
  team2: string | { name: string };
  group?: string; // "Group A"
  ground?: string;
  num?: number;
  status?: string; // some feeds flag in-play matches ("LIVE", "IN PLAY", "HT", …)
  // result shapes seen across openfootball files
  score1?: number;
  score2?: number;
  score1et?: number;
  score2et?: number;
  score1p?: number;
  score2p?: number;
  score?: { ft?: [number, number]; et?: [number, number]; pen?: [number, number] };
}

export interface SourceFile {
  name: string;
  matches: SourceMatch[];
}

export interface ParsedMatch {
  num: number; // 1..104 (group matches numbered chronologically)
  stage: Stage;
  groupName?: string; // "A".."L"
  matchday?: string;
  venue?: string;
  kickoffUtc: Date;
  homeName?: string; // real team name, when known
  awayName?: string;
  homeSlot?: string; // placeholder label for knockouts: "1E", "3A/B/C/D/F", "W74", "L101"
  awaySlot?: string;
  homeScore?: number; // full-time (incl. extra time when present)
  awayScore?: number;
  winnerName?: string; // knockout winner when decided on penalties
  finished: boolean; // false while in play, even when partial scores are present
}

const PLACEHOLDER_RE = /^([12][A-L]|3[A-L](\/[A-L])+|W\d+|L\d+)$/;
const LIVE_STATUS_RE = /live|in[ _-]?play|playing|^ht$|half/i;

function teamName(t: string | { name: string }): string {
  return typeof t === "string" ? t : t.name;
}

export function isPlaceholder(name: string): boolean {
  return PLACEHOLDER_RE.test(name);
}

export function stageOfRound(round: string, hasGroup: boolean): Stage {
  if (hasGroup) return "GROUP";
  const r = round.toLowerCase();
  if (r.includes("32")) return "R32";
  if (r.includes("16")) return "R16";
  if (r.startsWith("quarter")) return "QF";
  if (r.startsWith("semi")) return "SF";
  if (r.includes("third")) return "THIRD";
  if (r.includes("final")) return "FINAL";
  throw new Error(`Unknown round: ${round}`);
}

export function parseKickoffUtc(date: string, time?: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  if (!time) return new Date(Date.UTC(y, mo - 1, d, 18, 0));
  const m = time.match(/^(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})?(?::(\d{2}))?$/);
  if (!m) return new Date(Date.UTC(y, mo - 1, d, 18, 0));
  const [, hh, mm, off, offMin] = m;
  const offsetMs =
    (off ? Number(off) : 0) * 3600_000 +
    (offMin ? Math.sign(Number(off ?? 0)) * Number(offMin) * 60_000 : 0);
  return new Date(Date.UTC(y, mo - 1, d, Number(hh), Number(mm)) - offsetMs);
}

function extractScore(m: SourceMatch): {
  homeScore?: number;
  awayScore?: number;
  penHome?: number;
  penAway?: number;
} {
  const ft = m.score?.ft ?? (m.score1 != null && m.score2 != null ? [m.score1, m.score2] : undefined);
  const et =
    m.score?.et ?? (m.score1et != null && m.score2et != null ? [m.score1et, m.score2et] : undefined);
  const pen =
    m.score?.pen ?? (m.score1p != null && m.score2p != null ? [m.score1p, m.score2p] : undefined);
  const final = et ?? ft; // grade vs the score after ET when it went there
  return {
    homeScore: final?.[0],
    awayScore: final?.[1],
    penHome: pen?.[0],
    penAway: pen?.[1],
  };
}

/**
 * Parse the whole source file into 104 numbered matches.
 * Group matches carry no `num` in the source — they are numbered 1..72 in
 * kickoff order (deterministic tie-break by group then team name). Knockout
 * matches use their official numbers; the third-place match and final carry
 * no `num` and become 103/104.
 */
export function parseSourceFile(src: SourceFile): ParsedMatch[] {
  const group: ParsedMatch[] = [];
  const knockout: ParsedMatch[] = [];

  for (const m of src.matches) {
    const stage = stageOfRound(m.round, m.group != null);
    const kickoffUtc = parseKickoffUtc(m.date, m.time);
    const t1 = teamName(m.team1);
    const t2 = teamName(m.team2);
    const { homeScore, awayScore, penHome, penAway } = extractScore(m);
    const live = m.status != null && LIVE_STATUS_RE.test(m.status);
    const finished = homeScore != null && awayScore != null && !live;

    let winnerName: string | undefined;
    if (finished && stage !== "GROUP" && !isPlaceholder(t1) && !isPlaceholder(t2)) {
      if (homeScore! > awayScore!) winnerName = t1;
      else if (awayScore! > homeScore!) winnerName = t2;
      else if (penHome != null && penAway != null) winnerName = penHome > penAway ? t1 : t2;
    }

    const base: Omit<ParsedMatch, "num"> = {
      stage,
      groupName: m.group?.replace("Group ", ""),
      matchday: m.group ? m.round : undefined,
      venue: m.ground,
      kickoffUtc,
      homeName: isPlaceholder(t1) ? undefined : t1,
      awayName: isPlaceholder(t2) ? undefined : t2,
      homeSlot: isPlaceholder(t1) ? t1 : undefined,
      awaySlot: isPlaceholder(t2) ? t2 : undefined,
      homeScore,
      awayScore,
      winnerName,
      finished,
    };

    if (stage === "GROUP") {
      group.push({ ...base, num: 0 });
    } else {
      const num = m.num ?? (stage === "THIRD" ? 103 : stage === "FINAL" ? 104 : undefined);
      if (num == null) throw new Error(`Knockout match without num: ${m.round} ${t1} v ${t2}`);
      knockout.push({ ...base, num });
    }
  }

  group.sort(
    (a, b) =>
      a.kickoffUtc.getTime() - b.kickoffUtc.getTime() ||
      (a.groupName ?? "").localeCompare(b.groupName ?? "") ||
      (a.homeName ?? "").localeCompare(b.homeName ?? "")
  );
  group.forEach((g, i) => (g.num = i + 1));

  return [...group, ...knockout].sort((a, b) => a.num - b.num);
}

/** Stable key to match a group game between source refreshes (no num in source). */
export function groupMatchKey(p: { homeName?: string; awayName?: string; date: string }): string {
  return `${p.date}|${p.homeName}|${p.awayName}`;
}
