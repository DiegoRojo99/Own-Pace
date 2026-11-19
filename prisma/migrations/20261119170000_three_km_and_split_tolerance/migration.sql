UPDATE "Activity"
SET "milestoneChecked" = false, "milestoneUnavailable" = false
WHERE "distance" >= 1000
   OR EXISTS (
     SELECT 1 FROM "MilestoneEffort"
     WHERE "MilestoneEffort"."activityId" = "Activity"."id" AND "MilestoneEffort"."source" = 'SPLITS'
   );

DELETE FROM "MilestoneEffort" WHERE "source" = 'SPLITS';
