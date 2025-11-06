# Worker Session Management & Fixes Plan

## Issues Identified

### 1. Assignment Index Permanence Issue ✓
**Problem**: When workers claim assignments, the assignment indices seem to shift around instead of maintaining their position. Worker claiming assignment 0 should get assignment 0, not fill from the bottom.

**Root Cause**: Assignments are fetched ordered by `createdAt`, and both frontend and CLI use array index. However, if assignments are re-fetched or reordered, the index can mismatch.

**Solution**: 
- Add an `index` field to the `Assignment` model to store the permanent index (0, 1, 2, 3...)
- Use this stored index instead of array position
- Ensure assignments are always returned in index order
- Migration must set index for existing assignments based on their createdAt order within each super study

### 2. View Worker Link Issue ⚠️
**Problem**: "View Worker" button in super study assignments table links to an old/stale worker instead of the current active worker.

**Root Cause**: This is likely a symptom of issue #4 (worker session management). The assignment is linked to an old worker session from a previous run, and when the same machine reconnects, it creates/reuses that old worker instead of creating a new session. The old worker has minimal data (just IP, status, last seen) while the current worker has full GUI state.

**Solution**:
- This will be fixed by implementing proper worker session management (issue #4)
- The link itself is correct (`/workers/${assignment.worker.id}`) and uses proper Next.js routing
- No need to change the link - just ensure assignments are linked to active worker sessions

### 3. Delete Functionality Missing ⚠️
**Problem**: Limited delete functionality in the UI.

**Current State**:
- ✓ Super study DELETE API exists at `/api/super-studies/[id]` 
- ✓ Super study delete button exists on list page (`/super-studies`)
- ✗ Super study detail page has no delete button
- ✗ Worker DELETE API doesn't exist
- ✗ Worker pages have no delete buttons

**Solution**:
- Add delete button to super study detail page (red button with confirmation)
- Implement DELETE handler in `/api/workers/[id]/route.ts`
- Add delete button to worker detail page (red button with confirmation)
- Add delete button to workers list page
- Ensure cascade deletes work properly (guiState, progressEvents should cascade via onDelete: Cascade)

### 4. Worker Session Management (Major Refactor) 🔴
**Problem**: Workers are identified by IP address with `@unique` constraint, causing data mixing between sessions. If a PC disconnects and reconnects, it reuses the same worker object, mixing data from different runs.

**User Requirements**:
- Workers should be considered "stale" after 1 minute of no heartbeat
- New connections from the same PC/IP should create NEW worker objects
- Existing workers should be immediately marked as STALE
- Each worker session should be independent

**Solution**:
- Remove `@unique` constraint from `ipAddress` in Worker model
- Add `isStale: Boolean @default(false)` field to Worker model  
- Add `sessionId: String @default(uuid()) @unique` to track unique sessions
- Modify heartbeat logic:
  - Check for existing ACTIVE (non-stale) workers with same IP
  - If found and lastSeen > 1 minute ago, mark as STALE
  - Always create new worker for new connections (don't reuse)
- Modify assignment claiming to only work with non-stale workers
- Update all queries to filter out stale workers by default (or show separately)
- Create migration to mark all existing workers as STALE immediately

## Critical Implementation Details

### Breaking Change: ipAddress uniqueness removal
**Current code relies on `findUnique({ where: { ipAddress } })`** which will break when `@unique` is removed.

**Files that need updating** (9 occurrences found):
1. `goliat-monitoring/src/app/api/gui-update/route.ts` (2 occurrences, lines 25, 49)
2. `goliat-monitoring/src/app/api/heartbeat/route.ts` (4 occurrences, lines 21, 38, 85, 109)
3. `goliat-monitoring/src/app/api/workers/route.ts` (2 occurrences, lines 98, 104)
4. `goliat-monitoring/src/app/api/assignments/[id]/claim/route.ts` (1 occurrence, line 22)

**Required changes**:
- Change from `prisma.worker.findUnique({ where: { ipAddress: machineId } })`
- To `prisma.worker.findFirst({ where: { ipAddress: machineId, isStale: false }, orderBy: { lastSeen: 'desc' } })`
- This finds the most recent non-stale worker for that IP

### Assignment Index Storage
When creating assignments in `/api/super-studies/route.ts`, must explicitly set index:

```typescript
assignments: {
  create: assignments.map((assignment: any, index: number) => ({
    index: index,  // ADD THIS
    splitConfig: assignment.splitConfig,
    status: assignment.status || 'PENDING',
    progress: 0
  }))
}
```

## Implementation Plan

### Phase 1: Database Schema Changes 🔴 CRITICAL
1. Update `prisma/schema.prisma`:
   ```prisma
   model Worker {
     id            String   @id @default(uuid())
     ipAddress     String   // Remove @unique
     sessionId     String   @default(uuid()) @unique
     isStale       Boolean  @default(false)
     hostname      String?
     // ... rest of fields unchanged
   }
   
   model Assignment {
     id           String   @id @default(uuid())
     index        Int      // ADD THIS
     workerId     String?
     superStudyId String
     // ... rest of fields unchanged
   }
   ```

2. Create migration file:
   - Remove unique constraint from ipAddress
   - Add sessionId column with unique constraint
   - Add isStale column (default false)
   - Add index column to assignments
   - Mark ALL existing workers as `isStale: true` (data migration)
   - Set index for existing assignments using ROW_NUMBER() based on createdAt within each superStudyId

### Phase 2: Update All ipAddress Queries 🔴 CRITICAL (MUST DO BEFORE PHASE 1)
**This must happen BEFORE removing the unique constraint, or deploy will break!**

1. Update `/api/gui-update/route.ts`:
   - Replace `findUnique` with `findFirst` + `isStale: false` filter
   
2. Update `/api/heartbeat/route.ts`:
   - Replace `findUnique` with `findFirst` + `isStale: false` filter
   - Implement stale checking logic: mark workers with lastSeen > 60s as stale
   - Create new worker for each new connection (don't reuse)
   
3. Update `/api/workers/route.ts`:
   - Replace `findUnique` with `findFirst` + `isStale: false` filter
   - Add `?includeStale=true` query param support
   
4. Update `/api/assignments/[id]/claim/route.ts`:
   - Replace `findUnique` with `findFirst` + `isStale: false` filter
   - Verify worker is not stale before allowing claim

### Phase 3: Assignment Index Fix
1. Update `/api/super-studies/route.ts` POST handler:
   - Set `index` field when creating assignments (see code above)
   
2. Update `/api/super-studies/[id]/assignments/route.ts`:
   - Change `orderBy: { createdAt: 'asc' }` to `orderBy: { index: 'asc' }`
   
3. Update frontend `/super-studies/[id]/page.tsx`:
   - Use `assignment.index` instead of array index
   - Ensure sorting by index before mapping
   
4. Update CLI `/goliat/cli/run_worker.py`:
   - Use `assignment['index']` to verify correct assignment
   - Sort assignments by index before selecting

### Phase 4: Delete Functionality
1. Add DELETE handler to `/api/workers/[id]/route.ts`:
   ```typescript
   export async function DELETE(request, { params }) {
     const { id } = await params
     await prisma.worker.delete({ where: { id } })
     return NextResponse.json({ success: true })
   }
   ```

2. Update `/super-studies/[id]/page.tsx`:
   - Add delete button in header (next to back button)
   - Implement confirmation dialog
   - Call `/api/super-studies/[id]` DELETE endpoint
   
3. Update `/workers/page.tsx`:
   - Add delete button in Actions column
   - Implement confirmation dialog
   
4. Update `/workers/[id]/page.tsx`:
   - Add delete button in header
   - Implement confirmation dialog
   - Redirect to /workers after successful delete

### Phase 5: UI Improvements for Stale Workers
1. Update `/api/workers` GET endpoint:
   - By default filter `isStale: false`
   - Support `?includeStale=true` to show all
   
2. Update worker pages:
   - Show sessionId in worker details
   - Add visual indicator for stale workers (gray badge)
   - Add "Show Historical Sessions" toggle
   
3. Update worker status enum:
   - Consider adding STALE to WorkerStatus enum (optional)
   - Or handle as a separate flag

## Database Migration SQL (for reference)

```sql
-- Migration: worker_sessions_and_assignment_index

-- Add new columns to workers
ALTER TABLE "workers" ADD COLUMN "sessionId" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "workers" ADD COLUMN "isStale" BOOLEAN NOT NULL DEFAULT false;

-- Remove unique constraint from ipAddress
ALTER TABLE "workers" DROP CONSTRAINT "workers_ipAddress_key";

-- Add unique constraint to sessionId
ALTER TABLE "workers" ADD CONSTRAINT "workers_sessionId_key" UNIQUE ("sessionId");

-- Mark all existing workers as stale
UPDATE "workers" SET "isStale" = true;

-- Add index column to assignments
ALTER TABLE "assignments" ADD COLUMN "index" INTEGER NOT NULL DEFAULT 0;

-- Set index for existing assignments based on creation order within each super study
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
```

## Deployment Order (CRITICAL!)

1. **Deploy Phase 2 first** (update all ipAddress queries to use findFirst)
   - This is backwards compatible - works with or without unique constraint
   - Test thoroughly before proceeding
   
2. **Deploy Phase 1** (schema changes + migration)
   - Run migration on database
   - This will mark all existing workers as stale
   
3. **Deploy Phase 3** (assignment index fixes)
   - Should work immediately as index is now populated
   
4. **Deploy Phase 4** (delete functionality)
   - Independent feature, can be deployed anytime
   
5. **Deploy Phase 5** (UI improvements)
   - Polish, can be deployed anytime after Phase 1

## Testing Checklist

- [ ] Assignment indices remain stable across page refreshes
- [ ] Assignment indices remain stable when workers claim them
- [ ] CLI `goliat worker N <study>` claims the correct assignment (index N)
- [ ] New worker connections create new worker objects even with same IP
- [ ] Old workers are marked stale after 1 minute of no heartbeat
- [ ] Stale workers don't show up in active workers list by default
- [ ] View Worker links go to correct worker detail page (the active one)
- [ ] Delete super study works from both list and detail pages
- [ ] Delete worker works with cascade (guiState deleted too)
- [ ] Deleting a super study cascades to assignments
- [ ] Existing workers are marked as stale after migration
- [ ] All queries that used ipAddress still work after schema change

## Risk Assessment

**High Risk**:
- Removing `@unique` constraint from ipAddress while code uses `findUnique` → **WILL BREAK DEPLOYMENT**
- Solution: Deploy Phase 2 (code changes) BEFORE Phase 1 (schema changes)

**Medium Risk**:
- Migration that marks existing workers as stale → all current workers will disappear from active view
- Solution: This is expected behavior per user requirements

**Low Risk**:
- Assignment index changes should be transparent to users
- Delete functionality is additive only

## Open Questions

1. Should we keep stale workers in the database indefinitely, or add a cleanup job?
2. Should sessionId be visible in the UI? (plan says yes)
3. Should we add STALE to the WorkerStatus enum, or keep it as a separate boolean?
4. What should happen to assignments when a worker becomes stale? (Currently they stay assigned)
