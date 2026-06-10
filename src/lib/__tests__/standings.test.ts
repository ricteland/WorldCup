import { describe, expect, it } from "vitest";
import { computeTable, rankThirds, type ScoredMatch, type ThirdRow } from "../standings";

const TEAMS = ["A", "B", "C", "D"];

function m(home: string, away: string, hs: number, as: number): ScoredMatch {
  return { homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as };
}

describe("computeTable", () => {
  it("ranks by points first", () => {
    const table = computeTable(
      TEAMS,
      [m("A", "B", 2, 0), m("C", "D", 1, 1), m("A", "C", 3, 0), m("B", "D", 1, 0), m("A", "D", 1, 0), m("B", "C", 0, 0)],
      { lotsSeed: "t" }
    );
    expect(table.map((r) => r.teamId)).toEqual(["A", "B", "C", "D"]);
    expect(table[0].pts).toBe(9);
    expect(table[0].played).toBe(3);
    expect(table[0].gf).toBe(6);
    expect(table[0].ga).toBe(0);
  });

  it("breaks point ties by goal difference", () => {
    // B 9 pts; A 6 pts; C and D both 1 pt — D gd −3 beats C gd −4.
    const table = computeTable(
      TEAMS,
      [m("A", "C", 3, 0), m("A", "D", 2, 1), m("B", "C", 2, 1), m("B", "D", 3, 1), m("A", "B", 0, 1), m("C", "D", 1, 1)],
      { lotsSeed: "t" }
    );
    expect(table.map((r) => r.teamId)).toEqual(["B", "A", "D", "C"]);
    expect(table[2].gd).toBe(-3);
    expect(table[3].gd).toBe(-4);
  });

  it("uses GD then GF precisely", () => {
    // All teams 4 pts is hard; simpler: two teams on 6 pts.
    // A: beats C 4-0, beats D 1-0, loses B... no — keep A,B on 6 each:
    // A beats C 4-0, A beats D 1-0, A loses to B 0-3? then B has 3 wins.
    // Instead: A beats C, A beats D, B beats C, B beats D, A-B drawn 1-1 → both 7 pts.
    const table = computeTable(
      TEAMS,
      [m("A", "C", 4, 0), m("A", "D", 1, 0), m("B", "C", 2, 0), m("B", "D", 2, 0), m("A", "B", 1, 1), m("C", "D", 0, 0)],
      { lotsSeed: "t" }
    );
    // A: 7 pts, gd +5; B: 7 pts, gd +4 → A first on GD
    expect(table.map((r) => r.teamId).slice(0, 2)).toEqual(["A", "B"]);
    expect(table[0].gd).toBe(5);
    expect(table[1].gd).toBe(4);
  });

  it("falls back to head-to-head when pts/GD/GF are all level", () => {
    // A and B end level on pts (6), GD (+1), GF (3) — but A beat B.
    const table = computeTable(
      TEAMS,
      [m("A", "B", 1, 0), m("C", "A", 1, 0), m("A", "D", 2, 1), m("B", "C", 1, 0), m("B", "D", 2, 1), m("C", "D", 0, 0)],
      { lotsSeed: "t" }
    );
    const a = table.find((r) => r.teamId === "A")!;
    const b = table.find((r) => r.teamId === "B")!;
    expect([a.pts, a.gd, a.gf]).toEqual([b.pts, b.gd, b.gf]);
    expect(table.map((r) => r.teamId).indexOf("A")).toBeLessThan(table.map((r) => r.teamId).indexOf("B"));
  });

  it("uses fair play before lots when head-to-head is level too", () => {
    const allDraws = [m("A", "B", 0, 0), m("A", "C", 0, 0), m("A", "D", 0, 0), m("B", "C", 0, 0), m("B", "D", 0, 0), m("C", "D", 0, 0)];
    const table = computeTable(TEAMS, allDraws, { lotsSeed: "t", fairPlay: { A: 9, B: 1, C: 5, D: 7 } });
    expect(table.map((r) => r.teamId)).toEqual(["B", "C", "D", "A"]);
  });

  it("deterministic lots: stable order for the same seed, everything level", () => {
    const allDraws = [m("A", "B", 1, 1), m("A", "C", 1, 1), m("A", "D", 1, 1), m("B", "C", 1, 1), m("B", "D", 1, 1), m("C", "D", 1, 1)];
    const t1 = computeTable(TEAMS, allDraws, { lotsSeed: "player-1" });
    const t2 = computeTable(TEAMS, allDraws, { lotsSeed: "player-1" });
    expect(t1.map((r) => r.teamId)).toEqual(t2.map((r) => r.teamId));
    // every team still tied on all criteria — but order is total and stable
    expect(new Set(t1.map((r) => r.teamId)).size).toBe(4);
  });
});

describe("rankThirds", () => {
  it("ranks across groups by pts, gd, gf", () => {
    const row = (teamId: string, groupName: string, pts: number, gd: number, gf: number): ThirdRow => ({
      teamId, groupName, pts, gd, gf,
      played: 3, won: 0, drawn: 0, lost: 0, ga: gf - gd, fairPlay: 0,
    });
    const ranked = rankThirds(
      [row("x", "A", 4, 1, 3), row("y", "B", 6, -1, 2), row("z", "C", 4, 1, 5), row("w", "D", 3, 4, 8)],
      "seed"
    );
    expect(ranked.map((r) => r.teamId)).toEqual(["y", "z", "x", "w"]);
  });
});
