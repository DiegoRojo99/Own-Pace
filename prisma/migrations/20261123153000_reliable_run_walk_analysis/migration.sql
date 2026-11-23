CREATE TYPE "RunWalkSource" AS ENUM ('CADENCE', 'SPEED');

ALTER TABLE "Activity"
ADD COLUMN "cadenceVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cadenceSource" "RunWalkSource";
