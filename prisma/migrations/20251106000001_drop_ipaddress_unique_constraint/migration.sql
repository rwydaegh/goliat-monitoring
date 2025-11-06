-- Drop unique constraint on ipAddress if it still exists
-- This handles cases where the constraint name might be different
DO $$ 
BEGIN
    -- Try to drop the constraint if it exists
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'workers_ipAddress_key' 
        AND conrelid = 'workers'::regclass
    ) THEN
        ALTER TABLE "workers" DROP CONSTRAINT "workers_ipAddress_key";
    END IF;
    
    -- Also try alternative constraint names that PostgreSQL might use
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname LIKE '%ipAddress%' 
        AND conrelid = 'workers'::regclass
        AND contype = 'u'
    ) THEN
        -- Find and drop any unique constraint on ipAddress
        EXECUTE (
            SELECT 'ALTER TABLE "workers" DROP CONSTRAINT ' || conname || ';'
            FROM pg_constraint
            WHERE conname LIKE '%ipAddress%'
            AND conrelid = 'workers'::regclass
            AND contype = 'u'
            LIMIT 1
        );
    END IF;
END $$;

