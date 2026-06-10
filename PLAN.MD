# World Cup 2026 Prediction App — Build Plan

> A mobile-first web app where a group of friends **predict the whole tournament up front**:
> they predict **every match score**, and those predictions cascade into their own
> **predicted group tables** and **predicted knockout bracket**. Predictions are then graded
> automatically against real results (bright green = exact score, light green = right result,
> red = wrong). Friends join with a shared code and a display name (no passwords). Self-hosted
> on a Hetzner server.
>
> This document is the brief for Claude Code. Build it phase by phase (see
> [Milestones](#11-build-milestones)). Anything marked **[CONFIG]** should be easy to
> change in one place.

---

## 1. Goals & constraints

- **Audience:** a private group of friends (expect ~5–50 players, one league).
- **Predictions:** (a) exact score for every match, (b) a knockout bracket.
- **Auth:** join with a shared league code + pick a display name. No passwords.
- **Mobile-first:** must feel like a native app on a phone. Installable as a PWA.
- **Self-hosting:** one Docker stack on a Hetzner box, automatic HTTPS, SQLite (no DB server to run).
- **Automatic scoring:** results pulled from a football data API on a schedule, with a manual admin override.

---

## 2. Tournament facts (build the data model around these)

The 2026 World Cup uses a **new 48-team format** — do not reuse a 32-team structure.

- **48 teams**, drawn into **12 groups of 4** (Groups A–L).
- **104 matches total**: 72 group-stage + 32 knockout.
- **Group stage:** each team plays 3 matches. Runs ~June 11–27, 2026.
- **Advancement:** top 2 of each group (24 teams) **+ the 8 best third-placed teams** = **32** into the knockouts.
- **Knockout rounds:** Round of 32 → Round of 16 → Quarter-finals → Semi-finals → Third-place play-off → Final.
- **Final:** July 19, 2026.
- **Group tiebreakers (in order):** goal difference → goals scored → head-to-head → fair-play record → drawing of lots.

> The "8 best third-placed teams" rule and the Round of 32 are the two things that
> break naive World Cup code. Make `qualified_as` an enum (`winner`, `runner_up`,
> `best_third`) and compute third-place ranking across all 12 groups.

---

## 3. Tech stack

Chosen for **single-process self-hosting** — one app, one container, one file-based DB.

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)** | UI + API routes in one deployable Node process. |
| Language | TypeScript | — |
| DB | **SQLite** | No separate DB server. Just a file on a mounted volume. Plenty for this scale. |
| ORM | **Prisma** | Reliable migrations; SQLite provider. (Drizzle + better-sqlite3 is a lighter alt.) |
| Styling | **Tailwind CSS** + **shadcn/ui** | Fast, clean, mobile-first components. |
| Auth | Custom: signed `httpOnly` cookie (use `iron-session` or a small JWT). | No password system needed. |
| Scheduling | `node-cron` inside the app (or a system cron hitting an admin endpoint). | Polls results. |
| Reverse proxy | **Caddy** | Automatic Let's Encrypt HTTPS from one line of config. |
| Packaging | **Docker + docker-compose** | App container + Caddy container + a volume for the SQLite file. |

---

## 4. Auth model (passwordless, multi-device)

Goal: dead-simple to join, but a player can still return on a second device without impersonation risk.

1. App owner sets a **league join code** **[CONFIG]** (e.g. `VAMOS2026`).
2. New friend opens the site → enters the join code → picks a **display name**.
3. On join, the server creates a `Player` and a unique **recovery token**. The app shows
   a personal **"your private link"** (`/me/<recoveryToken>`) and stores it in a cookie.
   Tell the user to bookmark it — it's how they log in elsewhere.
4. Returning on a new device = open the recovery link, **or** re-enter the join code and
   claim an existing name *only* via the recovery link (do **not** let anyone claim an
   existing name just by typing it — that's impersonation).
5. Session = signed `httpOnly` cookie holding `playerId`. No expiry pressure for a friends' app.
6. **Admin** is a player flagged `is_admin` (seeded via an env var **[CONFIG]** `ADMIN_RECOVERY_TOKEN`, or first joiner).

---

## 5. Data model (Prisma schema sketch)

```
Team        id, name, code (FIFA 3-letter), groupName (A..L), flagEmoji
Group       name (A..L)  // optional; can derive from Team.groupName
Player      id, displayName, recoveryToken (unique), isAdmin, createdAt
Match       id, externalId (API id), stage (GROUP|R32|R16|QF|SF|THIRD|FINAL),
            groupName?, kickoffUtc, homeTeamId, awayTeamId,
            homeScore?, awayScore?, status (SCHEDULED|LIVE|FINISHED),
            slot?           // bracket slot key for knockout wiring, see §7
ScorePred   id, playerId, matchId, homeScore, awayScore, predWinnerTeamId?, createdAt, lockedAt?
            // one per (player, match), covers ALL matches incl. knockout.
            // predWinnerTeamId is required only when a knockout score is a draw, so the
            // cascade always has a winner to advance. Editable until the global lock (§7).
BracketPick id, playerId, slot, teamId, round (R32..CHAMPION)
            // player's predicted team for each bracket slot. DERIVED from the cascade
            // (predicted group tables -> qualifiers -> knockout winners), persisted so it
            // stays consistent with the player's score predictions. See §7.
Setting     key, value      // league code, scoring weights, phase flags [CONFIG]
```

Add a unique index on `(playerId, matchId)` for `ScorePred` and `(playerId, slot)` for `BracketPick`.

---

## 6. Scoring rules **[CONFIG]**

All weights live in `Setting` so they can be tuned without a redeploy. Sensible defaults:

**Match score predictions**
| Outcome | Points |
|---|---|
| Exact score correct | **5** |
| Correct result (W/D/L) but wrong score | **2** |
| Wrong | 0 |

**Knockout bracket** (points per correctly predicted team in each round)
| Round | Points per correct team |
|---|---|
| Round of 32 | 1 |
| Round of 16 | 2 |
| Quarter-final | 4 |
| Semi-final | 6 |
| Final (reached final) | 8 |
| Champion | 12 |

> Compute bracket points as: for each round, +N for every team the player placed in that
> round who actually reached it. Keep match-score points and bracket points as separate
> columns on the leaderboard so people can see both.

---

## 7. Predictions, the cascade & locking

This is a **predict-the-whole-tournament** model. A player predicts every match score, and
those predictions **derive** their own group tables and knockout bracket — the Groups and
Bracket tabs are *previews of the player's own predictions*, not views of reality.

**The cascade**
1. Player predicts scores for all 72 group matches → the **standings engine** (§7a) computes
   their predicted table for each of the 12 groups (1st / 2nd / 3rd) and the **8 best
   third-placed teams** → their predicted **32 qualifiers**.
2. Qualifiers auto-seed the **Round-of-32 slots** via the official 2026 R32 pairing map
   (fixed by group position, including the 8-thirds assignment table).
3. Player predicts each knockout match (a score; if drawn, a required `predWinnerTeamId`).
   Each winner advances to the next slot, filling `R16` → `QF` → `SF` → `FINAL` → `CHAMPION`.
4. A downstream slot only becomes editable once its feeding slots are set, so the bracket is
   always internally consistent (a team can't reach the final unless you advanced it there).

Represent the bracket as fixed **slots** (`R32-1`…`R32-16`, `R16-1`…, `QF-1`…, `SF-1`,
`SF-2`, `FINAL`, `CHAMPION`); each `BracketPick` is the team the cascade placed in that slot.

**Locking — single global lock [CONFIG]**
- One deadline for **everything**: `PREDICTION_LOCK_AT` **[CONFIG]** = **2026-06-11 20:30**
  (30 min before the first match's ~21:00 kickoff). Store/compare in UTC; the default is the
  local tournament time of the opener.
- Until the deadline, players can freely create/edit any prediction (group scores, knockout
  scores, bracket). **At the deadline, all predictions for all 104 matches lock at once** and
  no new or changed bets are allowed for the rest of the tournament — so nobody can adjust a
  bet after seeing how things unfold. Per-match locking is intentionally **not** used: editing
  a group score after a bracket is locked would desync the cascade.
- After lock, every predict control is read-only (`lockedAt` set); grading (§7b) begins as
  real games finish.
- Don't reveal other players' predictions until the global lock (no copying).
- *(Phase-2 option: per-round locking. More work and requires re-deriving downstream rounds
  on each lock — deferred.)*

### 7a. Standings engine
A **pure function**: given a player's predicted scores for a group's 6 matches → a table
(played, W/D/L, GF, GA, GD, Pts) → apply the **official tournament tiebreakers in order**
(§2): GD → GF → head-to-head (points, then GD, then GF among the tied teams) → fair-play →
drawing of lots. GD, GF, and head-to-head are all computable from predicted scores; fair-play
has no equivalent in predictions, so it's a no-op there; the final fallback (lots) is a
deterministic pseudo-random order (seeded so it's stable for a given prediction set). **Reuse
the same function for the real standings** (fed real scores, where fair-play data is
available) so predicted and actual share one code path. Rank all 12 predicted thirds the same
way to pick the **8 best**.

### 7b. Correctness overlay
A shared helper `gradeScore(pred, actual) → EXACT | RESULT | WRONG | PENDING` drives one
color-token set used everywhere: **bright green** = exact score, **light green** = correct
result (W/D/L) but wrong score, **red** = wrong, neutral = not yet played. Used on:
- **Matches** — per match prediction vs. real score.
- **Groups** — per predicted qualifier vs. the real qualifier for that slot.
- **Bracket** — per predicted advancement vs. the real bracket.
The same grading drives the point recompute (§6) and the leaderboard.

---

## 8. Results ingestion

Two jobs: **seed** (once) and **poll** (scheduled).

**Seeding teams + fixtures.** Pick one source:
- `openfootball/worldcup.json` (GitHub) — free, public domain, no API key, includes the 2026
  schedule/results as JSON. Good for the initial fixtures + groups.
- `football-data.org` — free tier with an API key; clean fixtures + results. A good simple choice for a basic predictor.
- `API-Football (api-sports.io)` — free account tier; `fixtures?league=1&season=2026` returns all 104 matches with stable `fixture_id`s. More robust for live polling.

> **Decision: use `openfootball/worldcup.json` for both seeding and result updates.** It's
> free, public-domain, **no API key**, and the most frictionless option. Real-time updates
> are **not** required, so polling a static JSON source on a modest interval is fine — no
> live API, no key management. (football-data.org / API-Football remain documented fallbacks
> if openfootball's results lag; if adopted later, store their `externalId` on each `Match`.)

**Polling job (periodic — e.g. every ~15–30 min, no real-time requirement):**
1. Fetch finished/live matches.
2. Update `Match.homeScore/awayScore/status`.
3. On a match transitioning to `FINISHED`, recompute that match's score-prediction points and
   re-grade it (§7b) for every player.
4. After the real group stage finishes, run the **standings engine (§7a) on real scores** to
   get the real qualifiers and real R32 seeding — used only to **grade** each player's
   predicted groups/bracket (the player's predicted bracket was available from the start).
5. As knockout results come in, recompute bracket points and re-grade bracket slots.

**Admin manual override (important):** a protected page to edit any match's score/status by
hand, in case the API lags or is wrong. Manual edits must trigger the same recompute.

---

## 9. Screens (mobile-first, bottom-nav)

Design for a phone first: large tap targets, a fixed **bottom tab bar**, no hover-only UI.
Make it a **PWA** (web manifest + service worker) so friends can "Add to Home Screen".

**Join** (pre-app, not a tab) — enter join code + display name, or open recovery link. Show
the private recovery link after joining.

**Welcome rules popup** — shown on first visit (and reachable later from a small "?" button):
the rules — how to predict, how scoring works (5 / 2 / 0 and bracket points), the **color
key** (bright green / light green / red), and the **lock deadline**. Dismissible.

**Four bottom tabs:**
1. **Match Predictions** (default) — all 104 matches grouped by day; tap a match to enter/edit
   a score prediction with a simple stepper (− 2 +). Shows locked state after the global lock
   and recolors green/green/red against the real result once played.
2. **Groups Preview** — all 12 groups (A–L) as standings tables **computed from the player's
   own predicted scores** (§7a), showing predicted 1st / 2nd / 3rd and which thirds qualify.
   Recolors per-team against the real standings once final.
3. **Bracket Preview** — the player's knockout bracket, **seeded from their predicted
   qualifiers** and filled round by round (§7); horizontal scroll or round-by-round on mobile.
   Read-only after lock; recolors each matchup/advancement against the real bracket.
4. **Leaderboard** — ranked league players with total / match-points / bracket-points columns;
   highlight "you". Sort by total points; players level on points are ordered **randomly**
   (no tiebreaker).

**Secondary (off the tab bar):**
- **Profile / Me** (behind an avatar/settings icon) — points breakdown, private recovery link
  (copy button), edit display name.
- **Admin** (admin only, protected route) — manual score entry, trigger a manual sync, edit
  league settings/scoring.

UI niceties: country flag emojis on teams, a "matches today" banner, optimistic save on
prediction edits, skeleton loaders.

---

## 10. API routes (Next.js route handlers)

```
POST /api/join                 { code, displayName } -> sets cookie, returns recovery link
GET  /api/me                   current player + points
POST /api/predictions          { matchId, homeScore, awayScore }  (rejects if locked)
GET  /api/matches              matches + (own) predictions + results
POST /api/bracket              { picks: [{slot, teamId}] }  (rejects if locked/invalid)
GET  /api/bracket              own bracket + correctness once known
GET  /api/leaderboard          ranked players
POST /api/admin/match          (admin) set score/status -> recompute
POST /api/admin/sync           (admin) trigger results poll now
POST /api/admin/settings       (admin) update [CONFIG] values
```

Protect admin routes by checking `isAdmin` on the session.

---

## 11. Build milestones

1. **Scaffold** — Next.js + TS + Tailwind + shadcn + Prisma/SQLite; Dockerfile + docker-compose + Caddy; "hello world" deploys on Hetzner over HTTPS.
2. **Data + seed** — schema; seed teams, groups, and all 104 fixtures from a source in §8; encode the official **R32 pairing map** and **8-best-thirds assignment table**.
3. **Auth** — join flow, recovery links, sessions, admin flag.
4. **Match predictions** — stepper UI for all matches, the **single global lock** (§7), hide-others-until-lock.
5. **Standings engine** — pure function (§7a) + **Groups Preview** tab computed from a player's predictions.
6. **Bracket cascade** — auto-seed R32 from predicted qualifiers, round-by-round picks with validation, **Bracket Preview** tab (§7).
7. **Results + grading** — polling job + manual admin override; `gradeScore` coloring (§7b) across Matches/Groups/Bracket; recompute match + bracket points; **Leaderboard**.
8. **Welcome + secondary screens** — welcome rules popup; Profile/Me and Admin behind icons/protected routes.
9. **Polish** — PWA/installable, mobile bottom-nav, flags, loading/empty/locked states.
10. **(Optional)** per-round bracket locking; multiple leagues; push notifications for kickoff/results.

---

## 12. Deployment (Hetzner)

- `docker-compose.yml`: `app` (Next.js) + `caddy` (reverse proxy), shared network, a named
  volume for the SQLite file so data survives redeploys.
- `Caddyfile`: point a domain (A record → server IP) and Caddy handles HTTPS automatically.
- Env vars **[CONFIG]**: `LEAGUE_CODE`, `ADMIN_RECOVERY_TOKEN`, `PREDICTION_LOCK_AT=2026-06-11T20:30` (§7), `DATABASE_URL=file:/data/app.db`, `APP_URL`. `FOOTBALL_API_KEY` is **optional** — only needed if you switch result updates from openfootball to a keyed fallback (§8).
- Run migrations + seed on first boot (an entrypoint script).
- Back up the SQLite file (a daily `cp`/`sqlite3 .backup` to your existing S3 bucket works).

---

## 13. Open decisions to confirm before/while building

**Resolved (this revision):**
- Product model: predict-the-whole-tournament cascade; Groups & Bracket tabs preview the
  player's own predictions, graded against reality. Multiplayer league.
- Navigation: welcome rules popup + 4 tabs (Match Predictions, Groups Preview, Bracket
  Preview, Leaderboard); Profile/Admin off the tab bar.

- **Lock model:** confirmed — one global deadline `PREDICTION_LOCK_AT` = **2026-06-11 20:30**
  (30 min before the opener); everything locks at once, no edits afterward (§7).
- **Knockout draws:** confirmed — if a predicted knockout score is a draw, the player must
  still pick a winner (`predWinnerTeamId`) so the cascade advances a team.
- **Leaderboard ties:** no tiebreaker — players level on total points are ordered **randomly**
  among themselves; ranking otherwise by total points.

- **Prediction tiebreakers** (within a group table): use the **official tournament order**
  (§2/§7a) — GD → GF → H2H → fair-play (no-op for predictions) → deterministic lots.
- **Data source:** `openfootball/worldcup.json` for both seeding and result updates — no API
  key, no real-time requirement (§8). football-data.org / API-Football are documented
  fallbacks only.

All open decisions are now resolved.

---

## 14. Reference — data sources

- Tournament format/schedule: FIFA / Britannica / Olympics.com (48 teams, 12 groups, 104 matches, Jun 11–Jul 19 2026).
- `openfootball/worldcup.json` — free public-domain JSON fixtures/results, no key.
- `football-data.org` — free tier, API key, simple fixtures + results.
- `API-Football` (api-sports.io) — free account tier, `league=1&season=2026`, stable fixture IDs.
