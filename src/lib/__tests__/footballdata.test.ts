import { describe, expect, it } from "vitest";
import { parseFdMatches, canonicalTeamName, type FdResponse } from "../footballdata";

const res: FdResponse = {
  matches: [
    {
      utcDate: "2026-06-11T19:00:00Z",
      status: "IN_PLAY",
      group: "GROUP_A",
      homeTeam: { name: "Mexico", tla: "MEX" },
      awayTeam: { name: "South Africa", tla: "RSA" },
      score: { winner: null, duration: "REGULAR", fullTime: { home: 1, away: 0 }, halfTime: { home: 1, away: 0 } },
    },
    {
      utcDate: "2026-06-12T02:00:00Z",
      status: "TIMED", // not kicked off — parser must ignore
      homeTeam: { name: "Canada", tla: "CAN" },
      awayTeam: { name: "Panama", tla: "PAN" },
      score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
    },
    {
      utcDate: "2026-07-19T19:00:00Z",
      status: "FINISHED",
      homeTeam: { name: "Argentina", tla: "ARG" },
      awayTeam: { name: "Korea Republic", tla: "KOR" },
      // decided on penalties: fullTime excludes shootout goals, winner says who went through
      score: { winner: "AWAY_TEAM", duration: "PENALTY_SHOOTOUT", fullTime: { home: 2, away: 2 }, halfTime: { home: 1, away: 1 } },
    },
    {
      utcDate: "2026-06-30T19:00:00Z",
      status: "FINISHED", // finished but feed lost the score — unsafe, skip
      homeTeam: { name: "Spain", tla: "ESP" },
      awayTeam: { name: "Ghana", tla: "GHA" },
      score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
    },
  ],
};

describe("parseFdMatches", () => {
  const updates = parseFdMatches(res);

  it("keeps only in-play and finished matches", () => {
    expect(updates).toHaveLength(2);
    expect(updates.map((u) => u.status)).toEqual(["LIVE", "FINISHED"]);
  });

  it("carries the running score for live matches", () => {
    const live = updates[0];
    expect(live.homeCode).toBe("MEX");
    expect(live.homeScore).toBe(1);
    expect(live.awayScore).toBe(0);
    expect(live.winner).toBeUndefined();
  });

  it("reports the shootout winner with the after-ET score", () => {
    const final = updates[1];
    expect(final.homeScore).toBe(2);
    expect(final.awayScore).toBe(2);
    expect(final.winner).toBe("AWAY");
    expect(final.awayName).toBe("South Korea"); // alias applied
  });

  it("maps football-data names to our seeded names", () => {
    expect(canonicalTeamName("Czechia")).toBe("Czech Republic");
    expect(canonicalTeamName("Côte d'Ivoire")).toBe("Ivory Coast");
    expect(canonicalTeamName("United States")).toBe("USA");
    expect(canonicalTeamName("Brazil")).toBe("Brazil");
  });
});
