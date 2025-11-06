-- Drop unique constraint on ipAddress if it still exists
-- This is a safety migration in case the previous migration didn't drop it properly

-- First, try the standard Prisma constraint name
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_ipAddress_key";

-- Also try dropping any unique constraint on ipAddress using a more generic approach
DO $$ 
DECLARE
    constraint_name text;
BEGIN
    -- Find any unique constraint on ipAddress column
    SELECT conname INTO constraint_name
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE t.relname = 'workers'
    AND a.attname = 'ipAddress'
    AND c.contype = 'u'
    LIMIT 1;
    
    -- Drop it if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END IF;
END $$;


