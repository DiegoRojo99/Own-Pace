DELETE FROM "MilestoneEffort" WHERE "distanceKey" = '5mi';

UPDATE "Activity"
SET "milestoneChecked" = false, "milestoneUnavailable" = false
WHERE "distance" >= 8000;
