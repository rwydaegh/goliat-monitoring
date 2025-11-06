-- Drop unique INDEX on ipAddress (it was created as an INDEX, not a CONSTRAINT)
-- This is a safety migration in case the previous migration didn't drop it properly

-- Drop the unique index (this is what Prisma actually created)
DROP INDEX IF EXISTS "workers_ipAddress_key";

-- Also try dropping as a constraint (in case it was created differently)
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_ipAddress_key";

-- Also try dropping any unique constraint/index on ipAddress using a more generic approach
DO $$ 
DECLARE
    constraint_name text;
    index_name text;
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
    
    -- Find any unique index on ipAddress column
    SELECT indexname INTO index_name
    FROM pg_indexes
    WHERE tablename = 'workers'
    AND indexdef LIKE '%ipAddress%'
    AND indexdef LIKE '%UNIQUE%'
    LIMIT 1;
    
    -- Drop it if found
    IF index_name IS NOT NULL THEN
        EXECUTE format('DROP INDEX IF EXISTS %I', index_name);
    END IF;
END $$;



