CREATE TYPE "MilestoneTimeBasis" AS ENUM ('MOVING', 'ELAPSED');
CREATE TYPE "MilestoneSource" AS ENUM ('STREAM', 'SPLITS');

ALTER TABLE "MilestoneEffort" RENAME COLUMN "movingTime" TO "duration";
ALTER TABLE "MilestoneEffort"
ADD COLUMN "timeBasis" "MilestoneTimeBasis" NOT NULL DEFAULT 'MOVING',
ADD COLUMN "source" "MilestoneSource" NOT NULL DEFAULT 'STREAM';

UPDATE "Activity"
SET "milestoneChecked" = false, "milestoneUnavailable" = false
WHERE "milestoneUnavailable" = true;
