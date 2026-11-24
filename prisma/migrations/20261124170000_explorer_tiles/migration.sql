ALTER TABLE "Activity" ADD COLUMN "tilesProcessed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "UserTile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "zoom" INTEGER NOT NULL,
    "firstActivityId" TEXT,
    "firstVisitedAt" TIMESTAMP(3) NOT NULL,
    "visitCount" INTEGER NOT NULL,
    CONSTRAINT "UserTile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserTile_userId_zoom_x_y_key" ON "UserTile"("userId", "zoom", "x", "y");
CREATE INDEX "UserTile_userId_zoom_idx" ON "UserTile"("userId", "zoom");
CREATE INDEX "UserTile_firstActivityId_idx" ON "UserTile"("firstActivityId");
ALTER TABLE "UserTile" ADD CONSTRAINT "UserTile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserTile" ADD CONSTRAINT "UserTile_firstActivityId_fkey" FOREIGN KEY ("firstActivityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
