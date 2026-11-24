BEGIN;

CREATE TABLE "CityLookupCache" (
    "key" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CityLookupCache_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "CityLookupRateLimit" (
    "id" INTEGER NOT NULL,
    "leaseId" TEXT NOT NULL,
    "blockedUntil" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CityLookupRateLimit_pkey" PRIMARY KEY ("id")
);

COMMIT;
