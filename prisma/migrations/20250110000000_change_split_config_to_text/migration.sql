-- AlterTable: Change splitConfig from JSONB to TEXT to preserve JSON key order
-- This migration converts existing JSONB data to TEXT format (stringified JSON)
-- to preserve the original key ordering that was lost due to JSONB's automatic sorting

-- Step 1: Add a temporary column to store the TEXT version
ALTER TABLE "assignments" ADD COLUMN "splitConfig_temp" TEXT;

-- Step 2: Convert existing JSONB data to TEXT (stringified JSON)
-- PostgreSQL's jsonb type automatically sorts keys, so we need to re-stringify
-- Note: This will preserve whatever order PostgreSQL stored it in, but future uploads will preserve order
UPDATE "assignments" SET "splitConfig_temp" = "splitConfig"::text WHERE "splitConfig" IS NOT NULL;

-- Step 3: Make the temporary column NOT NULL (since splitConfig is required)
ALTER TABLE "assignments" ALTER COLUMN "splitConfig_temp" SET NOT NULL;

-- Step 4: Drop the old JSONB column
ALTER TABLE "assignments" DROP COLUMN "splitConfig";

-- Step 5: Rename the temporary column to the original name
ALTER TABLE "assignments" RENAME COLUMN "splitConfig_temp" TO "splitConfig";

