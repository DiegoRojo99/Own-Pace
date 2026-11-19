ALTER TABLE "User"
ADD COLUMN "activityRefreshBefore" INTEGER,
ADD COLUMN "activityRefreshPage" INTEGER NOT NULL DEFAULT 1;
