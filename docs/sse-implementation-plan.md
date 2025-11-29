# Server-Sent Events (SSE) Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to replace HTTP POST + polling with Server-Sent Events (SSE) for real-time log streaming in the GOLIAT monitoring dashboard. This addresses the fundamental latency issue where log messages take 5+ seconds to appear, despite being simple text messages.

**Estimated Complexity:** Medium (6/10)  
**Estimated Time:** 2-3 hours implementation + testing  
**Risk Level:** Low (graceful fallback to polling if SSE unavailable)

---

## Problem Analysis

### Current Architecture Issues

1. **HTTP POST Overhead**
   - Each batch requires full HTTP request/response cycle
   - TCP handshake, headers, network latency accumulate
   - Even with parallel sending (3 workers), individual requests take 5+ seconds

2. **Polling Delay**
   - Frontend polls every 1 second minimum
   - Messages can sit in database for up to 1 second before being displayed
   - Combined with HTTP latency, total delay is 5-6 seconds

3. **Database Transaction Overhead**
   - Each batch requires a Prisma transaction
   - Sorting, duplicate detection, JSON serialization
   - Adds 100-500ms per batch

4. **Why Screenshots Work**
   - Sent every 5 seconds (not 200ms)
   - User doesn't notice 5-second delay for visual updates
   - Less frequent = less overhead

### Root Cause

**HTTP POST + polling is fundamentally slow for real-time updates.** We're trying to achieve real-time streaming with a request/response model designed for discrete operations.

---

## Solution: Server-Sent Events (SSE)

### Why SSE Over WebSocket?

| Factor | SSE | WebSocket |
|--------|-----|-----------|
| **Complexity** | Low | Medium-High |
| **Next.js Support** | Native (App Router) | Requires library/server |
| **Railway Compatibility** | ✅ Works | ⚠️ May need custom server |
| **Bidirectional Needed?** | No (one-way streaming) | No |
| **Implementation Time** | 2-3 hours | 4-6 hours |
| **Python Client Changes** | Minimal | More complex |

**Decision: SSE is simpler and sufficient for one-way log streaming.**

### How SSE Works

1. **Client opens persistent connection** to `/api/logs/[workerId]/stream`
2. **Server keeps connection open** and streams events as they arrive
3. **Python worker sends HTTP POST** (no changes needed)
4. **API receives POST, broadcasts to all connected SSE clients**
5. **Frontend receives events instantly** (no polling delay)

### Architecture Flow

```
┌─────────────┐
│ Python      │
│ Worker      │──HTTP POST──┐
└─────────────┘             │
                             ▼
                    ┌─────────────────┐
                    │  Next.js API    │
                    │  /api/gui-update│
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
            ┌──────────────┐   ┌──────────────┐
            │  PostgreSQL  │   │  SSE Stream  │
            │  (persist)   │   │  (broadcast) │
            └──────────────┘   └──────┬───────┘
                                      │
                                      │ SSE Events
                                      ▼
                              ┌──────────────┐
                              │   Frontend   │
                              │  EventSource │
                              └──────────────┘
```

---

## Implementation Plan

### Phase 1: Backend SSE Endpoint

**File:** `goliat-monitoring/src/app/api/logs/[workerId]/stream/route.ts`

**Responsibilities:**
- Accept SSE connection from frontend
- Maintain connection registry (in-memory Map)
- Broadcast log messages to connected clients
- Handle connection cleanup on disconnect

**Key Implementation Details:**

```typescript
// Connection registry (in-memory, per-worker)
const connections = new Map<string, ReadableStreamDefaultController>()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  const { workerId } = await params
  
  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Register connection
      connections.set(workerId, controller)
      
      // Send initial connection message
      controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
      
      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        connections.delete(workerId)
        controller.close()
      })
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}

// Broadcast function (called from gui-update route)
export function broadcastLogs(workerId: string, logs: any[]) {
  const controller = connections.get(workerId)
  if (controller) {
    controller.enqueue(`data: ${JSON.stringify({ type: 'logs', logs })}\n\n`)
  }
}
```

**Challenges:**
- **Next.js serverless functions:** Each request is isolated
- **Solution:** Use in-memory Map (works for single instance) or Redis (for scaling)
- **Railway:** Single instance initially, can add Redis later if needed

### Phase 2: Modify GUI Update Route

**File:** `goliat-monitoring/src/app/api/gui-update/route.ts`

**Changes:**
- After saving to database, broadcast to SSE clients
- Import broadcast function from stream route
- Maintain backward compatibility (still save to DB)

**Key Changes:**

```typescript
import { broadcastLogs } from '../logs/[workerId]/stream/route'

// In log_batch handler, after saving to DB:
if (newLogs.length > 0) {
  // Broadcast to SSE clients (non-blocking)
  try {
    broadcastLogs(worker.id, newLogs)
  } catch (error) {
    // Don't fail the request if SSE broadcast fails
    console.error('SSE broadcast failed:', error)
  }
}
```

**Note:** SSE broadcast is fire-and-forget. If no clients connected, it's a no-op.

### Phase 3: Frontend SSE Client

**File:** `goliat-monitoring/src/app/workers/[id]/page.tsx`

**Changes:**
- Replace polling with EventSource connection
- Keep polling as fallback (if SSE unavailable)
- Merge SSE events with existing state

**Key Implementation:**

```typescript
useEffect(() => {
  let eventSource: EventSource | null = null
  let pollInterval: NodeJS.Timeout | null = null
  
  // Try SSE first
  try {
    eventSource = new EventSource(`/api/logs/${workerId}/stream`)
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'logs') {
        // Append new logs to state
        setGuiState(prev => {
          if (!prev) return prev
          
          const existingLogs = prev.logMessages || []
          const newLogs = data.logs.map((log: any) => ({
            ...log,
            sequence: log.sequence !== undefined ? log.sequence : -1
          }))
          
          // Merge and sort
          const merged = [...existingLogs, ...newLogs].sort((a, b) => {
            const seqA = a.sequence !== undefined ? a.sequence : -1
            const seqB = b.sequence !== undefined ? b.sequence : -1
            if (seqA !== seqB) return seqA - seqB
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          })
          
          return { ...prev, logMessages: merged }
        })
      }
    }
    
    eventSource.onerror = () => {
      // SSE failed, fallback to polling
      eventSource?.close()
      eventSource = null
      startPolling()
    }
  } catch (error) {
    // SSE not supported, use polling
    console.warn('SSE not available, falling back to polling')
    startPolling()
  }
  
  function startPolling() {
    // Existing polling logic (1 second interval)
    pollInterval = setInterval(fetchWorkerDetails, 1000)
  }
  
  return () => {
    eventSource?.close()
    if (pollInterval) clearInterval(pollInterval)
  }
}, [workerId])
```

**Fallback Strategy:**
- If SSE fails to connect → fallback to polling
- If SSE connection drops → reconnect automatically (EventSource handles this)
- If browser doesn't support SSE → use polling

### Phase 4: Python Client (No Changes Needed)

**File:** `goliat/goliat/utils/gui_bridge.py`

**Changes:** None!

The Python client continues sending HTTP POST requests exactly as before. The SSE implementation is transparent to the worker.

---

## Technical Considerations

### Connection Management

**Challenge:** Next.js serverless functions are stateless. Each request is isolated.

**Solution:** Use in-memory Map for connection registry. This works for:
- Single Railway instance (current setup)
- Development (single Next.js dev server)
- Small-scale deployments (< 50 concurrent connections)

**Future Scaling:** If needed, use Redis Pub/Sub:
- Store connections in Redis
- Publish events to Redis channel
- All instances subscribe and broadcast to their clients

### Message Ordering

**Current:** Sequence numbers ensure correct order even with parallel batches.

**SSE:** Events arrive in order on a single connection. However:
- Multiple batches might arrive simultaneously
- Need to maintain sequence-based sorting in frontend
- Same sorting logic as current implementation

### Duplicate Detection

**Current:** Server checks for duplicates before saving.

**SSE:** Broadcast happens after saving, so duplicates are already filtered. Frontend should still deduplicate as defensive measure.

### Error Handling

**Connection Drops:**
- EventSource automatically reconnects
- Frontend merges new events with existing state
- No data loss (messages persisted in DB)

**Server Errors:**
- SSE connection closes
- Frontend falls back to polling
- Messages still in database, polling picks them up

**Python Worker Errors:**
- HTTP POST fails → message not sent
- Same behavior as current (no retry, next batch will try)

### Performance Impact

**Backend:**
- Minimal: Broadcasting is O(1) per connection
- No database queries for SSE (only for persistence)
- Memory: ~1KB per connection (controller reference)

**Frontend:**
- Reduced: No polling requests (saves bandwidth)
- Lower CPU: No periodic fetch/parse cycles
- Better UX: Instant updates

**Network:**
- Persistent connection: ~1KB overhead
- Events: ~100 bytes per log message
- Much more efficient than HTTP POST + polling

---

## Migration Strategy

### Phase 1: Add SSE (Backward Compatible)

1. Implement SSE endpoint
2. Modify gui-update to broadcast
3. Frontend tries SSE, falls back to polling
4. **No breaking changes** - existing polling still works

### Phase 2: Test & Validate

1. Test with single worker
2. Test with multiple workers
3. Test connection drops/reconnects
4. Verify message ordering
5. Verify no duplicates

### Phase 3: Optimize

1. Remove polling fallback (optional)
2. Add connection metrics
3. Optimize broadcast logic if needed

---

## Testing Plan

### Unit Tests

1. **SSE Endpoint:**
   - Connection establishment
   - Message broadcasting
   - Connection cleanup
   - Multiple concurrent connections

2. **Broadcast Function:**
   - Broadcast to single client
   - Broadcast to multiple clients
   - Handle missing clients gracefully

3. **Frontend:**
   - SSE connection establishment
   - Event parsing and state updates
   - Fallback to polling
   - Reconnection handling

### Integration Tests

1. **End-to-End:**
   - Python worker → API → SSE → Frontend
   - Verify messages appear instantly (< 100ms)
   - Verify ordering maintained
   - Verify no duplicates

2. **Failure Scenarios:**
   - SSE connection drops → fallback works
   - Server restart → reconnection works
   - Network issues → graceful degradation

### Performance Tests

1. **Latency:**
   - Measure time from Python POST to frontend display
   - Target: < 200ms (vs current 5+ seconds)

2. **Throughput:**
   - Test with high message rate (100 messages/second)
   - Verify no message loss
   - Verify ordering maintained

3. **Concurrent Connections:**
   - Test with 10+ workers
   - Test with multiple browser tabs
   - Verify no performance degradation

---

## Rollback Plan

If SSE causes issues:

1. **Immediate:** Disable SSE endpoint (frontend falls back to polling)
2. **Revert:** Remove SSE code, restore polling-only
3. **No data loss:** All messages still in database

**Risk:** Low - SSE is additive, doesn't break existing functionality.

---

## Future Enhancements

### Phase 2 Features (Optional)

1. **Redis Pub/Sub:**
   - Scale to multiple Railway instances
   - Handle high concurrency

2. **Connection Metrics:**
   - Track active connections
   - Monitor message delivery rate
   - Dashboard showing SSE health

3. **Selective Streaming:**
   - Stream only logs (not progress)
   - Reduce bandwidth for progress-only views

4. **Compression:**
   - Gzip SSE stream
   - Reduce bandwidth for slow connections

---

## Success Criteria

### Primary Goals

- ✅ Log messages appear in < 200ms (vs current 5+ seconds)
- ✅ No message loss
- ✅ Correct ordering maintained
- ✅ Graceful fallback if SSE unavailable

### Secondary Goals

- ✅ Reduced server load (no polling requests)
- ✅ Better user experience (instant updates)
- ✅ Lower bandwidth usage (persistent connection vs polling)

---

## Implementation Checklist

### Backend

- [ ] Create `/api/logs/[workerId]/stream/route.ts`
- [ ] Implement connection registry (in-memory Map)
- [ ] Implement broadcast function
- [ ] Modify `/api/gui-update/route.ts` to broadcast
- [ ] Add error handling and logging
- [ ] Test connection lifecycle

### Frontend

- [ ] Add EventSource connection in worker detail page
- [ ] Implement event parsing and state updates
- [ ] Add fallback to polling
- [ ] Handle reconnection logic
- [ ] Test SSE vs polling fallback
- [ ] Verify message ordering

### Testing

- [ ] Unit tests for SSE endpoint
- [ ] Integration tests (Python → SSE → Frontend)
- [ ] Performance tests (latency, throughput)
- [ ] Failure scenario tests
- [ ] Multi-worker tests

### Documentation

- [ ] Update architecture.md
- [ ] Add SSE section to monitoring.md
- [ ] Document fallback behavior
- [ ] Add troubleshooting guide

---

## Estimated Timeline

- **Phase 1 (Backend SSE):** 1 hour
- **Phase 2 (Frontend Client):** 1 hour
- **Phase 3 (Testing):** 1 hour
- **Phase 4 (Documentation):** 30 minutes

**Total: 3.5 hours**

---

## Conclusion

SSE provides a clean, simple solution to the latency problem without requiring major architectural changes. It's backward compatible, has graceful fallback, and requires minimal changes to the Python client. The implementation is straightforward and low-risk, making it an ideal solution for real-time log streaming.

