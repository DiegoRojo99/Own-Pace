DELETE FROM "MilestoneEffort";

UPDATE "Activity"
SET "milestoneChecked" = false, "milestoneUnavailable" = false;

ALTER TABLE "MilestoneEffort" RENAME COLUMN "elapsedTime" TO "movingTime";
