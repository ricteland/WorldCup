// Standings engine — a pure function shared by predicted tables (fed a player's
// predicted scores) and real tables (fed real results). See PLAN.MD §7a.
//
// Tiebreaker order (official 2026 rules, PLAN.MD §2):
//   points → goal difference → goals scored → head-to-head among the tied teams
//   (points, then GD, then GF) → fair play (no-op when data is absent, e.g. for
//   predictions) → deterministic "drawing of lots" (seeded hash, stable for a
//   given prediction set).

export interface ScoredMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface TableRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  fairPlay: number; // penalty points, lower is better; 0 when unknown
}

/** FNV-1a hash — the deterministic stand-in for "drawing of lots". */
export function lotsHash(seed: string, teamId: string): number {
  let h = 0x811c9dc5;
  const s = `${seed}:${teamId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function buildRows(
  teamIds: string[],
  matches: ScoredMatch[],
  fairPlay?: Record<string, number>
): Map<string, TableRow> {
  const rows = new Map<string, TableRow>();
  for (const id of teamIds) {
    rows.set(id, {
      teamId: id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      pts: 0,
      fairPlay: fairPlay?.[id] ?? 0,
    });
  }
  for (const m of matches) {
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.gf += m.homeScore;
    home.ga += m.awayScore;
    away.gf += m.awayScore;
    away.ga += m.homeScore;
    if (m.homeScore > m.awayScore) {
      home.won++;
      away.lost++;
      home.pts += 3;
    } else if (m.homeScore < m.awayScore) {
      away.won++;
      home.lost++;
      away.pts += 3;
    } else {
      home.drawn++;
      away.drawn++;
      home.pts++;
      away.pts++;
    }
  }
  for (const r of rows.values()) r.gd = r.gf - r.ga;
  return rows;
}

const byPtsGdGf = (a: TableRow, b: TableRow) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;

/**
 * Compute a ranked group table. `lotsSeed` makes the final fallback
 * deterministic (use something stable per context, e.g. the player id).
 */
export function computeTable(
  teamIds: string[],
  matches: ScoredMatch[],
  opts: { fairPlay?: Record<string, number>; lotsSeed: string }
): TableRow[] {
  const rows = [...buildRows(teamIds, matches, opts.fairPlay).values()];
  rows.sort(byPtsGdGf);

  // Resolve runs still tied on pts+gd+gf via head-to-head → fair play → lots.
  const out: TableRow[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && byPtsGdGf(rows[i], rows[j]) === 0) j++;
    const tied = rows.slice(i, j);
    if (tied.length > 1) {
      const ids = new Set(tied.map((r) => r.teamId));
      const h2hMatches = matches.filter((m) => ids.has(m.homeTeamId) && ids.has(m.awayTeamId));
      const h2h = buildRows([...ids], h2hMatches);
      tied.sort((a, b) => {
        const ha = h2h.get(a.teamId)!;
        const hb = h2h.get(b.teamId)!;
        return (
          hb.pts - ha.pts ||
          hb.gd - ha.gd ||
          hb.gf - ha.gf ||
          a.fairPlay - b.fairPlay || // fewer penalty points wins
          lotsHash(opts.lotsSeed, a.teamId) - lotsHash(opts.lotsSeed, b.teamId)
        );
      });
    }
    out.push(...tied);
    i = j;
  }
  return out;
}

export interface ThirdRow extends TableRow {
  groupName: string;
}

/**
 * Rank the 12 third-placed teams to find the 8 best (PLAN.MD §2). Same
 * criteria minus head-to-head (they never met): pts → GD → GF → fair play →
 * deterministic lots.
 */
export function rankThirds(thirds: ThirdRow[], lotsSeed: string): ThirdRow[] {
  return [...thirds].sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.fairPlay - b.fairPlay ||
      lotsHash(lotsSeed, a.teamId) - lotsHash(lotsSeed, b.teamId)
  );
}
