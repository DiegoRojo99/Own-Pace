BEGIN;

CREATE TYPE "OsmElementType" AS ENUM ('WAY', 'RELATION');

CREATE TABLE "Tile" (
    "zoom" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    CONSTRAINT "Tile_pkey" PRIMARY KEY ("zoom", "x", "y")
);

CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "osmType" "OsmElementType" NOT NULL,
    "osmId" BIGINT NOT NULL,
    "boundary" JSONB NOT NULL,
    "boundaryFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CityTile" (
    "cityId" TEXT NOT NULL,
    "zoom" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    CONSTRAINT "CityTile_pkey" PRIMARY KEY ("cityId", "zoom", "x", "y")
);

CREATE UNIQUE INDEX "City_osmType_osmId_key" ON "City"("osmType", "osmId");
CREATE INDEX "CityTile_zoom_x_y_idx" ON "CityTile"("zoom", "x", "y");
CREATE INDEX "UserTile_zoom_x_y_userId_idx" ON "UserTile"("zoom", "x", "y", "userId");
ALTER TABLE "CityTile" ADD CONSTRAINT "CityTile_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CityTile" ADD CONSTRAINT "CityTile_zoom_x_y_fkey" FOREIGN KEY ("zoom", "x", "y") REFERENCES "Tile"("zoom", "x", "y") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
