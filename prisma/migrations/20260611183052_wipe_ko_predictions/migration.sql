-- One-time data wipe for the round-by-round knockout rules (2026-06-11):
-- knockout picks are now made against the real bracket as each matchup is
-- decided, so predictions made under the old derive-from-your-groups cascade
-- (and the persisted cascade snapshots) are meaningless. Group predictions
-- are untouched.
DELETE FROM "ScorePred" WHERE "matchId" >= 73;
DELETE FROM "BracketPick";
