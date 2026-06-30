import { describe, expect, it } from "vitest";
import { fdWinnerId } from "../results";

describe("fdWinnerId", () => {
  const ger = "ger";
  const par = "par";

  it("resolves the winner when our row matches the feed orientation", () => {
    const db = { homeTeamId: ger, awayTeamId: par };
    expect(fdWinnerId({ winner: "AWAY" }, db, ger, par)).toBe(par);
    expect(fdWinnerId({ winner: "HOME" }, db, ger, par)).toBe(ger);
  });

  it("flips sides when our row stores the teams in the opposite order", () => {
    // feed reports GER home / PAR away, but our row has PAR home / GER away
    const db = { homeTeamId: par, awayTeamId: ger };
    expect(fdWinnerId({ winner: "AWAY" }, db, ger, par)).toBe(par);
    expect(fdWinnerId({ winner: "HOME" }, db, ger, par)).toBe(ger);
  });

  it("returns null when the feed reports no decisive winner (penalty draw)", () => {
    const db = { homeTeamId: ger, awayTeamId: par };
    expect(fdWinnerId({ winner: undefined }, db, ger, par)).toBeNull();
  });

  it("falls back to freshly resolved ids before the row is populated", () => {
    const db = { homeTeamId: null, awayTeamId: null };
    expect(fdWinnerId({ winner: "HOME" }, db, ger, par)).toBe(ger);
    expect(fdWinnerId({ winner: "AWAY" }, db, ger, par)).toBe(par);
  });
});
