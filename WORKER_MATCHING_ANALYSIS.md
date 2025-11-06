# Worker Matching Logic Analysis

## Current Problem

When `goliat worker` runs, three worker instances are created instead of one:
1. **Worker A** (IP: 157.193.240.188) - Created during assignment claim, IDLE, linked to super study
2. **Worker B** (IP: 157.193.240.190) - Created by heartbeat, IDLE, minimal info
3. **Worker C** (IP: 157.193.240.190) - Created by GUI-update, RUNNING, full details

## Root Cause

The VPN changes the public IP between different stages:
- `goliat worker` (claim): `157.193.240.188`
- GUI (heartbeat/updates): `157.193.240.190`

## Current Logic Flow

### 1. Assignment Claim (`/api/assignments/[id]/claim`)
```
- Input: machineId (IP), no hostname
- Creates Worker A with:
  - ipAddress: 157.193.240.188
  - hostname: null
  - assignments: [assignment]
  - status: RUNNING
```

### 2. Heartbeat (`/api/heartbeat`)
```
- Input: machineId (IP: 157.193.240.190), hostname (UG-GNS0S34)
- Looks for worker by IP → NOT FOUND
- Looks for worker by hostname → NOT FOUND (Worker A has no hostname!)
- Creates Worker B with:
  - ipAddress: 157.193.240.190
  - hostname: UG-GNS0S34
  - no assignments
  - status: IDLE
```

### 3. GUI Update (`/api/gui-update`)
```
- Input: machineId (IP: 157.193.240.190), no hostname
- Looks for worker by IP → FINDS Worker B
- Updates Worker B with GUI state
- Worker B remains separate from Worker A
```

## Why Hostname Matching Fails

The hostname matching in heartbeat only works if the existing worker has a hostname. But Worker A (created during claim) has no hostname, so it can't be matched.

## Why GUI-Update's "Recent Worker" Logic Fails

GUI-update has logic to find recent workers with RUNNING assignments, but heartbeat runs FIRST (every 30 seconds), creating Worker B before GUI-update ever runs.

## Requirements

1. **Single session**: Same machine running one assignment = one worker instance
2. **Multiple sessions**: Same machine can run multiple assignments at different times = separate worker instances
3. **Handle IP changes**: VPN/network changes shouldn't create duplicates

## Proposed Solution

**Priority-based Worker Matching Algorithm**

When any endpoint receives a worker identification (IP + optional hostname):

### Priority 1: Exact IP Match (existing logic)
```typescript
worker = findFirst({ ipAddress: machineId, isStale: false })
```

### Priority 2: Recent Worker with RUNNING Assignment (NEW - applies to ALL endpoints)
```typescript
if (!worker) {
  // Check for very recent workers (within 2 min) with RUNNING assignments
  // This catches workers created by claim before GUI starts
  worker = findFirst({
    isStale: false,
    createdAt: { gte: twoMinutesAgo },
    assignments: { some: { status: 'RUNNING' } },
    lastSeen: { lt: thirtySecondsAgo } // Not actively being updated
  })
  
  if (worker) {
    // Update IP and hostname (if provided)
    update(worker, { ipAddress: machineId, hostname: hostname || worker.hostname })
  }
}
```

### Priority 3: Hostname Match (existing logic in heartbeat only)
```typescript
if (!worker && hostname) {
  worker = findFirst({
    hostname: hostname,
    isStale: false,
    lastSeen: { gte: fiveMinutesAgo }
  })
  
  if (worker) {
    update(worker, { ipAddress: machineId })
  }
}
```

### Priority 4: Create New Worker
```typescript
if (!worker) {
  worker = create({
    ipAddress: machineId,
    hostname: hostname || null,
    status: 'IDLE'
  })
  
  // Transfer RUNNING assignments from stale workers (same IP or hostname)
}
```

## Key Changes

1. **Add Priority 2 to heartbeat route** - Currently only in GUI-update
2. **Make Priority 2 universal** - Check for recent workers with RUNNING assignments in ALL routes
3. **Check last updated time** - Only match if worker hasn't been updated in 30s (avoids matching active workers)

## Session Separation

To allow the same machine to run multiple assignments:
- Workers are only matched if they have RUNNING assignments AND haven't been updated recently
- After 5 minutes of no updates, a worker becomes stale
- New assignments create new workers if no suitable match is found

## Expected Behavior After Fix

With IP 157.193.240.188 → 157.193.240.190:

1. Claim creates Worker A (IP 188)
2. Heartbeat (IP 190):
   - Priority 1: No match by IP
   - Priority 2: Finds Worker A (recent, has RUNNING assignment, not updated)
   - Updates Worker A: IP → 190, hostname → UG-GNS0S34
3. GUI-update (IP 190):
   - Priority 1: Finds Worker A by IP
   - Updates Worker A with GUI state
4. Result: ONE worker instance with full details

## Implementation Files

- `/api/heartbeat/route.ts` - Add Priority 2 logic
- `/api/gui-update/route.ts` - Already has Priority 2, ensure consistency
- `/api/assignments/[id]/claim/route.ts` - Add Priority 2 logic
- `/api/workers/route.ts` - Add Priority 2 logic if POST endpoint is used

