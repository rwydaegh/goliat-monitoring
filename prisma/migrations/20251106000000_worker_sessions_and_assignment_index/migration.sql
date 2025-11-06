-- AlterTable: Remove unique constraint from ipAddress, add sessionId and isStale
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_ipAddress_key";

-- AlterTable: Add sessionId column with unique constraint
ALTER TABLE "workers" ADD COLUMN "sessionId" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "workers" ADD CONSTRAINT "workers_sessionId_key" UNIQUE ("sessionId");

-- AlterTable: Add isStale column
ALTER TABLE "workers" ADD COLUMN "isStale" BOOLEAN NOT NULL DEFAULT false;

-- Data migration: Mark all existing workers as stale
UPDATE "workers" SET "isStale" = true;

-- AlterTable: Add index column to assignments
ALTER TABLE "assignments" ADD COLUMN "index" INTEGER NOT NULL DEFAULT 0;

-- Data migration: Set index for existing assignments based on creation order within each super study
WITH ranked_assignments AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY "superStudyId" ORDER BY "createdAt" ASC) - 1 AS row_index
  FROM "assignments"
)
UPDATE "assignments" 
SET "index" = ranked_assignments.row_index
FROM ranked_assignments
WHERE "assignments".id = ranked_assignments.id;

