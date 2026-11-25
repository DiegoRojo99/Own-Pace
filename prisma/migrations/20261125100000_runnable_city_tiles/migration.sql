BEGIN;

ALTER TABLE "City" ADD COLUMN "runnableTiles" JSONB;
DELETE FROM "CityTile";
UPDATE "City" SET "tileZoom" = NULL, "tileNextX" = NULL, "tileNextY" = NULL, "tilesReady" = false;

COMMIT;
