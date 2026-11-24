-- Explorer tiles are derived data; rebuild them from the stored activity routes.
BEGIN;
DELETE FROM "UserTile";
UPDATE "Activity" SET "tilesProcessed" = false WHERE "tilesProcessed" = true;
COMMIT;
