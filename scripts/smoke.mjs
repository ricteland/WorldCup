// End-to-end smoke test against a running server (default http://localhost:3000).
// Exercises: join → predict 72 group matches → cascade seeds R32 → predict all
// knockouts (incl. a draw + winner pick) → bracket complete → admin override →
// leaderboard points → lock enforcement → stale re-pick detection.

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
// matches already finished/locked before this run (dirty dev DB) can't be
// predicted — expected counts below shrink accordingly
let unplayable = { group: 0, ko: 0 };
{
  const res = await player.req("GET", "/api/matches");
  matches = res.json?.matches;
  check("104 matches", matches?.length === 104);
  check("lock window present", Number.isFinite(res.json?.lockMinutes), `lockMinutes=${res.json?.lockMinutes}`);
  check("per-match lock time present", typeof matches?.[0]?.lockAtUtc === "string");
  check("KO matches closed before group preds", matches?.find((m) => m.id === 73)?.open === false);
  for (const m of matches) {
    if (m.status === "FINISHED" || m.locked) unplayable[m.stage === "GROUP" ? "group" : "ko"]++;
  }
  if (unplayable.group + unplayable.ko > 0) {
    console.log(`  (${unplayable.group + unplayable.ko} match(es) already finished/locked in this DB)`);
  }
}

console.log("3. group predictions (all 72)");
{
  let okCount = 0;
  for (const m of matches.filter((m) => m.stage === "GROUP")) {
    const res = await player.req("POST", "/api/predictions", {
      matchId: m.id,
      homeScore: (m.id % 3) + 1, // varied scores, never drawn vs awayScore below
      awayScore: m.id % 2,
    });
    if (res.status === 200) okCount++;
  }
  check("72 group predictions saved", okCount === 72 - unplayable.group, `got ${okCount}`);
}

console.log("4. cascade seeds the bracket");
{
  const res = await player.req("GET", "/api/bracket");
  const r32Slots = Object.keys(res.json?.slots ?? {}).filter((s) => {
    const num = Number(s.slice(1, -1));
    return num >= 73 && num <= 88;
  });
  check("32 R32 slots seeded", r32Slots.length === 32, `got ${r32Slots.length}`);
  check("8 qualified thirds", res.json?.qualifiedThirdGroups?.length === 8);
}

console.log("5. knockout predictions (incl. draw + winner)");
{
  // draw without winner must fail
  const noWinner = await player.req("POST", "/api/predictions", {
    matchId: 73,
    homeScore: 1,
    awayScore: 1,
  });
  check("KO draw without winner rejected", noWinner.status === 400);

  // fetch participants of M73, then pick the away side on a draw
  const b = await player.req("GET", "/api/bracket");
  const away73 = b.json.slots["M73A"]?.teamId;
  const withWinner = await player.req("POST", "/api/predictions", {
    matchId: 73,
    homeScore: 1,
    awayScore: 1,
    predWinnerTeamId: away73,
  });
  check("KO draw with winner accepted", withWinner.status === 200);

  // skipping ahead must fail until feeders are done
  const tooEarly = await player.req("POST", "/api/predictions", {
    matchId: 104,
    homeScore: 2,
    awayScore: 0,
  });
  check("final rejected before semis predicted", tooEarly.status === 409);

  // predict the rest of the knockout in order, home always wins
  let okCount = 1;
  for (let num = 74; num <= 104; num++) {
    const res = await player.req("POST", "/api/predictions", { matchId: num, homeScore: 2, awayScore: 0 });
    if (res.status === 200) okCount++;
  }
  check("all 32 KO predictions saved", okCount === 32 - unplayable.ko, `got ${okCount}`);

  const done = await player.req("GET", "/api/bracket");
  check("champion derived", !!done.json.slots["CHAMPION"]);
  check("drawn-match winner advanced", done.json.slots["M90H"]?.teamId === away73);
  check("no stale picks", done.json.staleMatchNums.length === 0);
}

console.log("6. me + leaderboard before results");
{
  const me = await player.req("GET", "/api/me");
  const expected = 104 - unplayable.group - unplayable.ko;
  check(`${expected} predictions made`, me.json?.predictionsMade === expected, `got ${me.json?.predictionsMade}`);
  check("0 points before results", me.json?.total === 0);
}

console.log("7. admin override + scoring");
{
  const login = await admin.req("GET", `/me/${ADMIN_TOKEN}`);
  check("admin recovery link logs in", login.status === 307 || login.status === 302);

  const notAdmin = await player.req("POST", "/api/admin/sync");
  check("non-admin blocked from admin api", notAdmin.status === 403);

  // match 1 predicted (1%3)+1=2 : 1%2=1 → set real 2-1 → EXACT (5 pts)
  const set = await admin.req("POST", "/api/admin/match", {
    matchId: 1,
    homeScore: 2,
    awayScore: 1,
    status: "FINISHED",
  });
  check("admin sets result", set.status === 200, JSON.stringify(set.json));

  const lb = await player.req("GET", "/api/leaderboard");
  const row = lb.json?.rows?.find((r) => r.displayName === name);
  check("exact score worth 5 match points", row?.matchPoints === 5, `got ${row?.matchPoints}`);

  const m = await player.req("GET", "/api/matches");
  check("match graded EXACT", m.json.matches.find((x) => x.id === 1)?.grade === "EXACT");

  // reset so reruns stay clean
  await admin.req("POST", "/api/admin/match", { matchId: 1, homeScore: null, awayScore: null, status: "SCHEDULED" });
}

console.log("8. stale knockout detection");
{
  // flip a group-A result hard enough to change the qualifiers
  const groupA = matches.filter((m) => m.groupName === "A");
  const res = await player.req("POST", "/api/predictions", {
    matchId: groupA[0].id,
    homeScore: 0,
    awayScore: 9,
  });
  check("group score edit accepted", res.status === 200);
  const b = await player.req("GET", "/api/bracket");
  check("downstream KO picks flagged stale", b.json.staleMatchNums.length > 0, `stale=${b.json.staleMatchNums}`);
}

console.log("9. per-match lock");
{
  // a huge lock window puts every match past its rolling deadline
  const lock = await admin.req("POST", "/api/admin/settings", { lockMinutes: "100000000" });
  check("admin can set lock window", lock.status === 200);
  const denied = await player.req("POST", "/api/predictions", { matchId: 2, homeScore: 1, awayScore: 0 });
  check("predictions rejected inside lock window", denied.status === 423);
  await admin.req("POST", "/api/admin/settings", { lockMinutes: "30" });
  const allowed = await player.req("POST", "/api/predictions", { matchId: 2, homeScore: 1, awayScore: 0 });
  check("predictions allowed again outside lock window", allowed.status === 200);
}

console.log(failures === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
