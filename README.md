# ⚽ WC26 Predictor

A mobile-first PWA where a group of friends **predict the whole 2026 World Cup up
front** — every one of the 104 match scores. Those predictions cascade into each
player's own **predicted group tables** and **predicted knockout bracket**, then get
graded automatically against real results:

- 🟡 **golden yellow** — exact score
- 🟩 **light green** — right result, wrong score
- 🔴 **red** — wrong
- ⬜ neutral — not played yet

Built per [PLAN.MD](./PLAN.MD). Next.js (App Router) + TypeScript + Tailwind +
Prisma/SQLite, self-hosted with Docker + Caddy (automatic HTTPS).

## How the game works

1. Friends join with a shared **league code** + a display name (no passwords).
   Each player gets a private **recovery link** — that's how they log in elsewhere.
2. Players predict scores for all **72 group matches** → the standings engine builds
   their 12 group tables, ranks the **8 best third-placed teams**, and seeds their
   own **Round of 32** using the official pairing map.
3. They predict each knockout match round by round (a drawn score requires picking
   who goes through) all the way to a champion.
4. **Everything locks at once** at `PREDICTION_LOCK_AT` (default 30 min before the
   opener). No edits after that.
5. Results are polled from [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)
   (free, public domain, **no API key**) every 20 minutes; an admin can override any
   score by hand. Scoring (configurable live from the Admin screen):

   | Match outcome | Points |   | Bracket round | Per correct team |
   |---|---|---|---|---|
   | Exact score | **5** | | Round of 32 | 1 |
   | Right result | **2** | | Round of 16 | 2 |
   | Wrong | 0 | | Quarter-final | 4 |
   | | | | Semi-final | 6 |
   | | | | Reached final | 8 |
   | | | | Champion | 12 |

## Local development

```bash
cp .env.example .env          # defaults work out of the box for dev
npm install
npx prisma migrate dev        # creates dev.db + runs the seed (teams, 104 fixtures)
npm run dev                   # http://localhost:3000
```

Join with code `VAMOS2026` (dev default). The seeded admin logs in at
`/me/<ADMIN_RECOVERY_TOKEN>` (dev default: `/me/dev-admin-token-change-me`).

### Tests

```bash
npm test                      # vitest unit tests: standings engine, bracket
                              # cascade, thirds allocation (all 495 combos),
                              # grading, scoring, schedule parser
node scripts/smoke.mjs        # end-to-end API test against a running server
```

## Deployment (Hetzner or any Docker host)

```bash
# on the server, in the repo directory:
cp .env.example .env          # set SESSION_SECRET, LEAGUE_CODE, ADMIN_RECOVERY_TOKEN,
                              # APP_URL, DOMAIN (A record must point at the server)
docker compose up -d --build
```

The app container applies migrations and seeds on boot (idempotent); Caddy obtains
the Let's Encrypt certificate automatically. SQLite lives on the `dbdata` volume.

**Backups** — snapshot the SQLite file daily and ship it to your bucket, e.g.:

```bash
docker compose exec app cp /data/app.db /data/backup-$(date +%F).db
# then sync /var/lib/docker/volumes/<project>_dbdata/_data/backup-*.db to S3
```

## Assets & API keys (placeholders)

- **Logo**: `public/assets/logo.svg` and `src/components/Logo.tsx` are clearly
  marked placeholders — drop in real artwork and regenerate
  `public/assets/icon-192.png` / `icon-512.png` to match.
- **API keys**: none are required (openfootball is keyless). `.env.example`
  contains `FOOTBALL_API_KEY` / `API_FOOTBALL_KEY` placeholders only for the
  documented fallback sources (PLAN.MD §8); the code does not use them yet.

## Implementation notes

- **Official maps, verified by tests**: the R32 pairing map and knockout wiring in
  `src/lib/bracket.ts` are cross-checked in unit tests against the official
  schedule bundled at `src/data/worldcup-2026.json`.
- **Best-thirds assignment**: deterministic backtracking over the official per-slot
  group constraints (best-ranked third → earliest slot). A unit test proves every
  one of the 495 possible qualified-thirds combinations is assignable. FIFA's
  annex may assign specific combinations differently; reality always wins for
  grading because real R32 team assignments override the derivation.
- **Lock default**: PLAN.MD guessed a ~21:00 opener; the real opening kickoff is
  19:00 UTC, so the default lock is `2026-06-11T18:30:00Z` (30 min before, as
  intended).
- **Stale knockout picks**: knockout predictions snapshot the participants they
  were made against. If a player edits a group score and their cascade re-seeds a
  knockout match, that prediction is flagged "re-pick" and stops advancing teams
  until re-entered.
- **Drawn knockouts in reality**: graded against the 90/120-minute score; the
  shoot-out winner (from the feed, or the admin override) advances the bracket.
