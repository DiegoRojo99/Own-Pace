DELETE FROM "MilestoneEffort" WHERE "source" = 'STREAM';

ALTER TABLE "MilestoneEffort" ALTER COLUMN "source" DROP DEFAULT;
ALTER TYPE "MilestoneSource" RENAME TO "MilestoneSource_old";
CREATE TYPE "MilestoneSource" AS ENUM ('STRAVA', 'SPLITS');
ALTER TABLE "MilestoneEffort"
ALTER COLUMN "source" TYPE "MilestoneSource"
USING "source"::text::"MilestoneSource";
ALTER TABLE "MilestoneEffort" ALTER COLUMN "source" SET DEFAULT 'STRAVA';
DROP TYPE "MilestoneSource_old";

UPDATE "Activity"
SET "milestoneChecked" = false, "milestoneUnavailable" = false;
