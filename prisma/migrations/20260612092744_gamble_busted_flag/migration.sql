-- Bankruptcy is forever: once the roulette bankroll hits $0 the player wears
-- the leaderboard tag permanently, even if the (secret) per-point income
-- later refills the balance. Backfill anyone already sitting at $0.
ALTER TABLE "Player" ADD COLUMN "gambleBusted" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Player" SET "gambleBusted" = true WHERE "gambleBalance" <= 0 AND "isAdmin" = false;
