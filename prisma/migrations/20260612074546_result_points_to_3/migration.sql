-- League rule change (2026-06-12): a right result with the wrong score is now
-- worth 3 points instead of 2 (all stages). The default changed in code
-- (DEFAULT_SCORING), but an admin-saved `scoring` Setting row overrides the
-- default, so update any stored copy too. Points are computed on demand, so
-- already-finished matches regrade automatically.
UPDATE "Setting"
SET "value" = json_set("value", '$.result', 3)
WHERE "key" = 'scoring';
