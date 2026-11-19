ALTER TABLE "Activity"
ADD COLUMN "milestoneChecked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "milestoneUnavailable" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MilestoneEffort" (
    "activityId" TEXT NOT NULL,
    "distanceKey" TEXT NOT NULL,
    "elapsedTime" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "MilestoneEffort_pkey" PRIMARY KEY ("activityId", "distanceKey")
);

ALTER TABLE "MilestoneEffort"
ADD CONSTRAINT "MilestoneEffort_activityId_fkey"
FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
