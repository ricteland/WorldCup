// End-to-end smoke test against a running server (default http://localhost:3000).
// Exercises the round-by-round flow: join → predict 72 group matches → knockouts
// stay closed until the REAL matchups are decided → admin finishes the group
// stage → R32 opens with real teams (incl. a draw + winner pick) → feeder
// results open the dependent R16 match early → advance bonuses + match points →
// matchup-change staleness → lock enforcement.
//
// Run it against a throwaway copy of the DB — it overwrites match results:
//   cp prisma/dev.db /tmp/wc-smoke.db
//   DATABASE_URL="file:/tmp/wc-smoke.db" npx next start -p 3017 &
//   BASE_URL=http://localhost:3017 node scripts/smoke.mjs

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;

function check(name, cond, extra = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

function client() {
  let cookie = "";
  return {
    async req(method, path, body) {
      const res = await fetch(BASE + path, {
        method,
        redirect: "manual",
        headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      let json = null;
      try {
        json = await res.json();
      } catch {}
      return { status: res.status, json };
    },
  };
}

// the player's (and the admin's "real") score for a group match — keeping them
// identical makes every grade EXACT and the predicted tables equal the real ones
const score = (id) => ({ homeScore: (id % 3) + 1, awayScore: id % 2 });

const player = client();
const admin = client();
const ADMIN_TOKEN = process.env.ADMIN_RECOVERY_TOKEN ?? "dev-admin-token-change-me";
const name = `Smoke${Date.now() % 100000}`;

console.log("1. join flow");
{
  const bad = await player.req("POST", "/api/join", { code: "WRONG", displayName: name });
  check("wrong code rejected", bad.status === 403);
  const ok = await player.req("POST", "/api/join", { code: "VAMOS2026", displayName: name });
  check("join succeeds", ok.status === 200, JSON.stringify(ok.json));
  check("recovery url returned", ok.json?.recoveryUrl?.includes("/me/"));
  const dup = await client().req("POST", "/api/join", { code: "VAMOS2026", displayName: name });
  check("duplicate name rejected", dup.status === 409);
}

console.log("2. matches payload");
let matches;
// matches already finished/locked before this run (dirty DB copy) can't be
// predicted — expected counts below shrink accordingly
let unplayable = { group: 0, ko: 0 };
let dbGroupsFinal = false;
{
  const res = await player.req("GET", "/api/matches");
  matches = res.json?.matches;
  check("104 matches", matches?.length === 104);
  check("lock window present", Number.isFinite(res.json?.lockMinutes), `lockMinutes=${res.json?.lockMinutes}`);
  check("per-match lock time present", typeof matches?.[0]?.lockAtUtc === "string");
  dbGroupsFinal = matches.filter((m) => m.stage === "GROUP" && m.status === "FINISHED").length === 72;
  if (!dbGroupsFinal) {
    check("KO matches closed while real matchups unknown", matches.find((m) => m.id === 73)?.open === false);
  }
  for (const m of matches) {
    if (m.status === "FINISHED" || m.locked) unplayable[m.stage === "GROUP" ? "group" : "ko"]++;
  }
  if (unplayable.group + unplayable.ko > 0) {
    console.log(`  (${unplayable.group + unplayable.ko} match(es) already finished/locked in this DB)`);
  }
}

console.log("3. group predictions (all 72)");
let groupPredsSaved = 0;
{
  for (const m of matches.filter((m) => m.stage === "GROUP")) {
    const res = await player.req("POST", "/api/predictions", { matchId: m.id, ...score(m.id) });
    if (res.status === 200) groupPredsSaved++;
  }
  check("72 group predictions saved", groupPredsSaved === 72 - unplayable.group, `got ${groupPredsSaved}`);
}
const cleanGroups = groupPredsSaved === 72;

console.log("4. knockouts gated on the real bracket");
if (!dbGroupsFinal) {
  const early = await player.req("POST", "/api/predictions", { matchId: 73, homeScore: 2, awayScore: 0 });
  check("KO pick rejected before the matchup is decided", early.status === 409, `status=${early.status}`);
  const b = await player.req("GET", "/api/bracket");
  check("bracket reports group stage unfinished", b.json?.groupsFinal === false);
  check("no KO matches open yet", b.json?.openCount === 0, `openCount=${b.json?.openCount}`);
} else {
  console.log("  (skipped — groups already final in this DB)");
}

console.log("5. admin finishes the group stage");
{
  const login = await admin.req("GET", `/me/${ADMIN_TOKEN}`);
  check("admin recovery link logs in", login.status === 307 || login.status === 302);
  const notAdmin = await player.req("POST", "/api/admin/sync");
  check("non-admin blocked from admin api", notAdmin.status === 403);

  let okCount = 0;
  for (const m of matches.filter((m) => m.stage === "GROUP")) {
    const res = await admin.req("POST", "/api/admin/match", {
      matchId: m.id,
      ...score(m.id),
      status: "FINISHED",
    });
    if (res.status === 200) okCount++;
  }
  check("all 72 group results set", okCount === 72, `got ${okCount}`);

  const res = await player.req("GET", "/api/matches");
  matches = res.json.matches;
  const m73 = matches.find((m) => m.id === 73);
  check("R32 match now open", m73?.open === true);
  check("R32 match has real participants", !!m73?.predHome?.id && !!m73?.predAway?.id);

  const b = await player.req("GET", "/api/bracket");
  check("bracket reports group stage final", b.json?.groupsFinal === true);
  check("exactly the 16 R32 matches open", b.json?.openCount === 16, `openCount=${b.json?.openCount}`);
}

console.log("6. R32 predictions (incl. draw + winner)");
const away73 = matches.find((m) => m.id === 73)?.predAway?.id;
{
  const noWinner = await player.req("POST", "/api/predictions", { matchId: 73, homeScore: 1, awayScore: 1 });
  check("KO draw without winner rejected", noWinner.status === 400);

  const withWinner = await player.req("POST", "/api/predictions", {
    matchId: 73,
    homeScore: 1,
    awayScore: 1,
    predWinnerTeamId: away73,
  });
  check("KO draw with winner accepted", withWinner.status === 200, JSON.stringify(withWinner.json));

  const tooEarly = await player.req("POST", "/api/predictions", { matchId: 104, homeScore: 2, awayScore: 0 });
  check("final rejected while its matchup is unknown", tooEarly.status === 409);

  let okCount = 1;
  for (let num = 74; num <= 88; num++) {
    const res = await player.req("POST", "/api/predictions", { matchId: num, homeScore: 2, awayScore: 0 });
    if (res.status === 200) okCount++;
  }
  check("all 16 R32 predictions saved", okCount === 16, `got ${okCount}`);

  const r16early = await player.req("POST", "/api/predictions", { matchId: 89, homeScore: 1, awayScore: 0 });
  check("R16 rejected before its feeders finish", r16early.status === 409);
}

console.log("7. feeder results open the next round early");
{
  // M89 = winner of 74 vs winner of 77 — finish just those two feeders
  const m73 = matches.find((m) => m.id === 73);
  const finish = async (num, homeScore, awayScore, winnerTeamId = null) => {
    const m = matches.find((x) => x.id === num);
    return admin.req("POST", "/api/admin/match", {
      matchId: num,
      homeTeamId: m.predHome.id,
      awayTeamId: m.predAway.id,
      homeScore,
      awayScore,
      winnerTeamId,
      status: "FINISHED",
    });
  };
  // 73: real 1–1, away through on penalties — exactly the player's pick
  check("M73 finished (pens)", (await finish(73, 1, 1, m73.predAway.id)).status === 200);
  check("M74 finished", (await finish(74, 2, 0)).status === 200);
  check("M77 finished", (await finish(77, 2, 0)).status === 200);

  const res = await player.req("GET", "/api/matches");
  matches = res.json.matches;
  const m89 = matches.find((m) => m.id === 89);
  const unplayed = matches.filter((m) => m.stage === "R32" && m.status !== "FINISHED").length;
  check("R32 round still unfinished", unplayed > 0, `unplayed=${unplayed}`);
  check("R16 match opens as soon as its matchup is known", m89?.open === true);
  const home74 = matches.find((m) => m.id === 74)?.predHome?.id;
  check("R16 match seeded with the real winner of M74", m89?.predHome?.id === home74);

  const pick89 = await player.req("POST", "/api/predictions", { matchId: 89, homeScore: 1, awayScore: 0 });
  check("R16 prediction accepted", pick89.status === 200, JSON.stringify(pick89.json));
}

console.log("8. scoring: match points + advance bonuses");
{
  // self-consistency: the per-match points shown on the matches tab must sum
  // to the leaderboard's matchPoints
  const expectedMatchPts = matches
    .filter((m) => m.status === "FINISHED")
    .reduce((s, m) => s + m.points, 0);
  const lb = await player.req("GET", "/api/leaderboard");
  const row = lb.json?.rows?.find((r) => r.displayName === name);
  check("leaderboard matches per-match points", row?.matchPoints === expectedMatchPts,
    `lb=${row?.matchPoints} matches=${expectedMatchPts}`);
  check("match points earned on knockout results", expectedMatchPts > 0);

  if (cleanGroups) {
    // predicted tables == real tables → all 32 qualifiers right (32 × 1pt),
    // plus three R32 winners through: 73 (pens pick), 74, 77 (3 × 2pts)
    check("bracket points = 32 R32 bonus + 3 advance bonuses", row?.bracketPoints === 38,
      `got ${row?.bracketPoints}`);
  } else {
    check("advance bonuses awarded", row?.bracketPoints >= 6, `got ${row?.bracketPoints}`);
  }
}

console.log("8b. per-match league view (everyone's picks)");
{
  const anon = await client().req("GET", "/api/matches/73/predictions");
  check("league view requires sign-in", anon.status === 401);
  const unknown = await player.req("GET", "/api/matches/99999/predictions");
  check("unknown match is 404", unknown.status === 404);
  // M75 is predicted (2–0 in section 6) but still SCHEDULED — picks stay private
  const hidden = await player.req("GET", "/api/matches/75/predictions");
  check("picks hidden while the match is scheduled", hidden.status === 403);

  // live: picks visible, nothing graded yet
  await admin.req("POST", "/api/admin/match", { matchId: 75, status: "LIVE" });
  const live = await player.req("GET", "/api/matches/75/predictions");
  const liveRow = live.json?.rows?.find((r) => r.name === name);
  check("picks served once the match is live", live.status === 200 && live.json?.finished === false);
  check("own live pick visible and ungraded",
    liveRow?.isYou === true && liveRow?.pred?.homeScore === 2 && liveRow?.grade === "PENDING" && liveRow?.points === 0,
    JSON.stringify(liveRow));
  await admin.req("POST", "/api/admin/match", { matchId: 75, status: "SCHEDULED" });

  // finished: M73 ended 1–1 with the away side through on pens — exactly the
  // player's pick, so EXACT match points plus the R16 advance bonus
  const fin = await player.req("GET", "/api/matches/73/predictions");
  const finRow = fin.json?.rows?.find((r) => r.name === name);
  check("finished match serves a single-game leaderboard", fin.status === 200 && fin.json?.finished === true);
  check("exact pick graded with points", finRow?.grade === "EXACT" && finRow?.points > 0, JSON.stringify(finRow));
  check("advance bonus attributed to the deciding match", finRow?.bonus > 0, `bonus=${finRow?.bonus}`);
  check("draw pick shows the winner pick", finRow?.pred?.winner?.id === away73, JSON.stringify(finRow?.pred));
  const sorted = fin.json.rows.every(
    (r, i, a) => i === 0 || a[i - 1].points + a[i - 1].bonus >= r.points + r.bonus
  );
  check("leaderboard sorted by points", sorted);
}

console.log("9. matchup change flags the pick stale");
{
  const m89 = matches.find((m) => m.id === 89);
  const otherTeam = matches.find((m) => m.id === 75)?.predHome?.id; // any team not in M89
  const swap = await admin.req("POST", "/api/admin/match", { matchId: 89, homeTeamId: otherTeam });
  check("admin can correct a matchup", swap.status === 200);

  let res = await player.req("GET", "/api/matches");
  check("pick flagged stale after the matchup changed",
    res.json.matches.find((m) => m.id === 89)?.stale === true);
  const b = await player.req("GET", "/api/bracket");
  check("bracket reports the stale pick", b.json?.staleCount >= 1, `staleCount=${b.json?.staleCount}`);

  // restore reality → the original pick is valid again
  await admin.req("POST", "/api/admin/match", { matchId: 89, homeTeamId: m89.predHome.id });
  res = await player.req("GET", "/api/matches");
  check("pick valid again once the matchup is restored",
    res.json.matches.find((m) => m.id === 89)?.stale === false);
}

console.log("10. per-match lock");
{
  const lock = await admin.req("POST", "/api/admin/settings", { lockMinutes: "100000000" });
  check("admin can set lock window", lock.status === 200);
  const denied = await player.req("POST", "/api/predictions", { matchId: 75, homeScore: 1, awayScore: 0 });
  check("predictions rejected inside lock window", denied.status === 423);
  await admin.req("POST", "/api/admin/settings", { lockMinutes: "30" });
  const allowed = await player.req("POST", "/api/predictions", { matchId: 75, homeScore: 1, awayScore: 0 });
  check("predictions allowed again outside lock window", allowed.status === 200);

  // manual league-wide lock overrides the rolling window entirely
  await admin.req("POST", "/api/admin/settings", { predictionsLocked: "1" });
  const closed = await player.req("POST", "/api/predictions", { matchId: 75, homeScore: 2, awayScore: 0 });
  check("predictions rejected while manually closed", closed.status === 423);
  const m = await player.req("GET", "/api/matches");
  check("matches payload reports the manual lock", m.json?.manualLock === true);
  await admin.req("POST", "/api/admin/settings", { predictionsLocked: "0" });
  const reopened = await player.req("POST", "/api/predictions", { matchId: 75, homeScore: 2, awayScore: 0 });
  check("predictions allowed again after reopening", reopened.status === 200);
}

console.log("11. admin deletes a player");
{
  // a second throwaway account, then the admin removes it (duplicate-account case)
  const dupe = client();
  const dupeName = `${name}-dupe`;
  const joined = await dupe.req("POST", "/api/join", { code: "VAMOS2026", displayName: dupeName });
  check("second account joins", joined.status === 200);
  await dupe.req("POST", "/api/predictions", { matchId: 75, homeScore: 1, awayScore: 0 });

  const playerId = joined.json?.playerId
    ?? (await dupe.req("GET", "/api/me")).json?.playerId;
  const notAdmin = await player.req("DELETE", "/api/admin/player", { playerId });
  check("non-admin blocked from deleting players", notAdmin.status === 403);

  const del = await admin.req("DELETE", "/api/admin/player", { playerId });
  check("admin deletes the duplicate account", del.status === 200, JSON.stringify(del.json));
  const gone = await dupe.req("GET", "/api/me");
  check("deleted player's session is dead", gone.status === 401);
  const lb = await player.req("GET", "/api/leaderboard");
  check("deleted player off the leaderboard", !lb.json?.rows?.some((r) => r.displayName === dupeName));

  const adminId = (await admin.req("GET", "/api/me")).json?.playerId;
  const self = await admin.req("DELETE", "/api/admin/player", { playerId: adminId });
  check("admin accounts can't be deleted", self.status === 400);
}

console.log(failures === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
