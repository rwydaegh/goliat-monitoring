# Message Loss Debugging Summary

## Problem Statement

Log messages (specifically "Done in X.XXs" messages) were intermittently disappearing from the web dashboard, even though they appeared correctly in the local GUI. Messages were being sent successfully from the Python worker but not consistently appearing on the web interface.

## Initial Symptoms

- **Local GUI**: All messages displayed correctly
- **Web Dashboard**: Some messages missing, specifically:
  - "Done in 5.23s" (Load phantom)
  - "Done in 25.95s" (Configure scene)
  - "Done in 2.42s" (Assign materials)
  - "Done in 0.06s" (Configure solver)
  - "Done in 24.58s" (Voxelize simulation)
  - "Done in 9.30s" (Write input file)
  - "Write input file..." message

## Investigation Timeline

### Phase 1: Initial Fixes - Batching and Ordering

**Problem Identified**: Messages might arrive out of order, causing display issues.

**Solutions Implemented**:
1. Added timestamps to each log message in `queue_gui.py`
2. Added sequence numbers to batches in `gui_bridge.py`
3. Implemented sorting logic in API `route.ts` to handle out-of-order batches

**Key Code Snippets**:

```python
# goliat/goliat/gui/queue_gui.py
def log(self, message: str, level: str = "verbose", log_type: str = "default") -> None:
    if level == "progress":
        import time
        self.queue.put(
            {
                "type": "status",
                "message": message,
                "log_type": log_type,
                "timestamp": time.time(),  # Add timestamp when message is created
            }
        )
```

```python
# goliat/goliat/utils/gui_bridge.py
# Added sequence counter (thread-safe)
self._sequence_lock = threading.Lock()
self._sequence_counter = 0

# In _send_log_batch_sync:
with self._sequence_lock:
    sequence = self._sequence_counter
    self._sequence_counter += 1

batch_message = {
    "type": "log_batch",
    "logs": log_messages,
    "sequence": sequence,  # Sequence number for proper ordering
}
```

```typescript
// goliat-monitoring/src/app/api/gui-update/route.ts
// Sort logs by timestamp, then sequence
logMessages.sort((a: any, b: any) => {
  const timeA = new Date(a.timestamp).getTime()
  const timeB = new Date(b.timestamp).getTime()
  if (timeA !== timeB) {
    return timeA - timeB
  }
  // If timestamps are equal, use sequence number
  if (a.sequence !== undefined && b.sequence !== undefined) {
    return a.sequence - b.sequence
  }
  return 0
})
```

**Result**: Partial improvement, but messages still missing.

---

### Phase 2: TypeScript Type Errors

**Error Encountered**:
```
Type error: Type 'JsonValue[]' is not assignable to type 'InputJsonValue[] | GuiStateUpdatelogMessagesInput | undefined'
```

**Fix Applied**:
```typescript
// Cast to any to satisfy Prisma Json[] type requirement
logMessages: logMessages as any
```

**Result**: Type errors resolved, but message loss persisted.

---

### Phase 3: Debug Logging Not Appearing

**Problem**: Debug messages added to `WebGUIBridge` were not appearing in verbose logs.

**Root Cause**: `WebGUIBridge` was using a dedicated logger (`"web_gui_bridge"`) that wasn't configured to output debug messages.

**Fix Applied**:
```python
# goliat/goliat/utils/gui_bridge.py
# Changed from dedicated logger to main loggers
self.verbose_logger = logging.getLogger("verbose")
self.progress_logger = logging.getLogger("progress")
```

**Result**: Debug messages now visible in logs, enabling better diagnosis.

---

### Phase 4: BaseSetup Missing GUI Parameter

**Problem**: Messages from `BaseSetup` methods weren't being forwarded to GUI/web.

**Root Cause**: `BaseSetup.__init__` didn't accept `gui` parameter, so `_log` calls couldn't forward messages.

**Fix Applied**:
```python
# goliat/goliat/setups/base_setup.py
def __init__(self, config: "Config", verbose_logger: "Logger", progress_logger: "Logger", gui: Optional["QueueGUI"] = None):
    self.gui = gui
    # ... rest of init
```

```python
# goliat/goliat/setups/near_field_setup.py and far_field_setup.py
super().__init__(config, verbose_logger, progress_logger, gui=gui)
```

**Result**: Some missing messages fixed, but issue persisted for others.

---

### Phase 5: HTTP Request Failures and Retry Logic

**Problem**: HTTP requests failing intermittently, causing message loss.

**Solutions Implemented**:

1. **Retry Logic with Exponential Backoff**:
```python
# goliat/goliat/utils/gui_bridge.py
max_retries = 3
retry_delay = 0.5  # Start with 500ms delay
success = False
for attempt in range(max_retries):
    success = self.http_client.post_gui_update(batch_message)
    if success:
        self.is_connected = True
        break
    else:
        if attempt < max_retries - 1:
            time.sleep(retry_delay)
            retry_delay *= 2  # Exponential backoff
        else:
            self._log(f"[DEBUG] Batch seq={sequence} FAILED after {max_retries} attempts - MESSAGES LOST", ...)
```

2. **Aggressive Batch Flushing**:
```python
# Flush batches if they exceed 1 second age (instead of 300ms)
if time.time() - batch_start_time > 1.0:
    self._log(f"[DEBUG] Sending batch of {len(log_batch)} messages (timeout (1s))", ...)
    self._send_log_batch(log_batch)
    log_batch = []
    batch_start_time = time.time()
```

**Result**: Reduced message loss from network failures, but core issue remained.

---

### Phase 6: Critical Discovery - Prisma Transaction Race Condition

**Error Encountered**:
```
GUI update (log_batch) returned status 500: {"error":"Failed to process GUI update","details":"\nInvalid `prisma.guiState.create()` invocation:\
```

**Root Cause**: 
- `guiState` was being created outside the transaction (line 147)
- `log_batch` handler used a transaction that re-read `guiState`
- If `guiState` didn't exist when transaction started, it returned early without creating it
- This caused Prisma errors and silent message loss

**Fix Applied**:
```typescript
// goliat-monitoring/src/app/api/gui-update/route.ts
await prisma.$transaction(async (tx) => {
  // Re-read GUI state within transaction, or create if it doesn't exist
  let currentGuiState = await tx.guiState.findUnique({
    where: { workerId: worker.id }
  })
  
  if (!currentGuiState) {
    // Create GUI state if it doesn't exist (can happen in race conditions)
    console.log(`[DEBUG] Creating GUI state for worker ${worker.id} within transaction`)
    currentGuiState = await tx.guiState.create({
      data: {
        workerId: worker.id,
        stage: '',
        progress: 0,
        logMessages: [],
        status: workerStatus,
        warningCount: 0,
        errorCount: 0
      }
    })
  }
  // ... rest of transaction
})
```

**Result**: 500 errors eliminated, but some messages still missing.

---

### Phase 7: Duplicate Detection Issues

**Problem**: Messages being incorrectly filtered as duplicates.

**Initial Duplicate Detection**:
```typescript
// Used message + timestamp as key
const key = `${log.message}|${log.timestamp}`
```

**Issues**:
- Same message text with different timestamps/sequences could be filtered
- Retries with same sequence number weren't distinguished from actual duplicates

**Improved Duplicate Detection**:
```typescript
// Include sequence and batchIndex in key
const seq = log.sequence !== undefined ? log.sequence : 'none'
const batchIdx = log.batchIndex !== undefined ? log.batchIndex : 'none'
const key = `${log.message}|${log.timestamp}|${seq}|${batchIdx}`
```

**Added Batch Index Support**:
```python
# goliat/goliat/utils/gui_bridge.py
# Add per-message index within batch to preserve order
for idx, msg in enumerate(log_messages):
    msg["batch_index"] = idx
```

**Improved Sorting**:
```typescript
// Sort by timestamp, then sequence, then batchIndex
logMessages.sort((a: any, b: any) => {
  const timeA = new Date(a.timestamp).getTime()
  const timeB = new Date(b.timestamp).getTime()
  if (timeA !== timeB) {
    return timeA - timeB
  }
  if (a.sequence !== undefined && b.sequence !== undefined) {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence
    }
    // If same sequence (same batch), use batchIndex
    if (a.batchIndex !== undefined && b.batchIndex !== undefined) {
      return a.batchIndex - b.batchIndex
    }
  }
  return 0
})
```

**Result**: Better duplicate detection, but messages still missing.

---

### Phase 8: Timeout Issues

**Error Encountered**:
```
GUI update (log_batch) returned status 502: {"status":"error","code":502,"message":"Application failed to respond","request_id":"..."}
```

**Root Cause**: Railway/Vercel default timeout is 10 seconds, but long-running transactions could exceed this.

**Fix Applied**:
```typescript
// goliat-monitoring/src/app/api/gui-update/route.ts
// Increase timeout for long-running transactions
export const maxDuration = 30 // 30 seconds (Railway/Vercel default is 10s)
```

**Result**: 502 errors reduced, but some messages still missing.

---

### Phase 9: Current Status - Messages Saved But Not Displayed

**Discovery from Railway Logs**:
- Batches are being received successfully
- Messages are being saved to database (confirmed by log counts: 43→44, 44→45)
- No duplicate filtering occurring
- No transaction errors

**Example from Logs**:
```
[DEBUG] Received log_batch seq=12 with 1 messages: [ '    - Write input file...' ]
[DEBUG] Batch seq=12: 43 -> 44 logs (added 1 unique, filtered 0 duplicates)
[DEBUG] Batch seq=12 messages: [ '    - Write input file...' ]

[DEBUG] Received log_batch seq=13 with 1 messages: [ '      - Done in 9.22s' ]
[DEBUG] Batch seq=13: 44 -> 45 logs (added 1 unique, filtered 0 duplicates)
[DEBUG] Batch seq=13 messages: [ '      - Done in 9.22s' ]
```

**But on Web Dashboard**:
- "Write input file..." message missing
- "Done in 9.22s" message missing

**Conclusion**: Messages ARE in the database but NOT appearing on the frontend.

---

## Current Hypothesis

The issue appears to be **frontend-related** rather than backend:

1. **Messages are saved**: Database logs confirm messages are being stored
2. **No filtering**: Duplicate detection isn't removing them
3. **No errors**: Transactions complete successfully
4. **Frontend polling**: Frontend polls every 1 second, should pick up new messages

**Possible Causes**:
- Frontend caching issue (old data being cached)
- Message sorting issue (messages appearing out of order or hidden)
- React state update issue (state not updating when new messages arrive)
- Display filtering (messages present but not rendered)

---

## Key Code Snippets for Future Investigation

### Backend - Transaction Handling
```typescript
// goliat-monitoring/src/app/api/gui-update/route.ts
// Lines 214-372
await prisma.$transaction(async (tx) => {
  // Create guiState if missing
  // Process batch
  // Sort messages
  // Update database
})
```

### Backend - Duplicate Detection
```typescript
// goliat-monitoring/src/app/api/gui-update/route.ts
// Lines 280-316
const existingMessageKeys = new Set<string>()
logMessages.forEach((log: any) => {
  const seq = log.sequence !== undefined ? log.sequence : 'none'
  const batchIdx = log.batchIndex !== undefined ? log.batchIndex : 'none'
  const key = `${log.message}|${log.timestamp}|${seq}|${batchIdx}`
  existingMessageKeys.add(key)
})
```

### Frontend - Message Display
```typescript
// goliat-monitoring/src/app/workers/[id]/page.tsx
// Lines 583-608
{guiState.logMessages.map((log: any, idx: number) => {
  return (
    <div key={idx} className={`text-sm ${colorClass} font-mono whitespace-pre`}>
      <span className="text-gray-600 text-xs">
        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
      </span>
      {' '}
      {log.message}
    </div>
  )
})}
```

### Frontend - Polling
```typescript
// goliat-monitoring/src/app/workers/[id]/page.tsx
// Lines 216-261
useEffect(() => {
  const fetchWorkerDetails = async () => {
    const response = await fetch(`/api/workers/${workerId}`)
    const data = await response.json()
    setGuiState(data.guiState)
  }
  
  fetchWorkerDetails()
  const interval = setInterval(fetchWorkerDetails, 1000)
  return () => clearInterval(interval)
}, [workerId])
```

### Python - Batch Index
```python
# goliat/goliat/utils/gui_bridge.py
# Lines 311-315
# Add per-message index within batch
for idx, msg in enumerate(log_messages):
    msg["batch_index"] = idx
```

---

## Files Modified

### Python Side (`goliat/`):
1. `goliat/gui/queue_gui.py` - Added timestamps to messages
2. `goliat/utils/gui_bridge.py` - Added sequence numbers, batch_index, retry logic, debug logging
3. `goliat/setups/base_setup.py` - Added `gui` parameter
4. `goliat/setups/near_field_setup.py` - Pass `gui` to BaseSetup
5. `goliat/setups/far_field_setup.py` - Pass `gui` to BaseSetup

### API Side (`goliat-monitoring/`):
1. `src/app/api/gui-update/route.ts` - Transaction handling, duplicate detection, sorting, timeout, error logging

---

## Next Steps

1. **Test latest deployment** with all fixes applied
2. **Check Railway logs** for:
   - `[DEBUG] Batch seq=X: Transaction completed successfully`
   - `[DEBUG] Batch seq=X: Transaction failed`
   - Any duplicate filtering messages
3. **Verify frontend**:
   - Check browser console for errors
   - Verify API responses contain all messages
   - Check if messages are sorted correctly
   - Verify React state updates are working
4. **If messages still missing**:
   - Investigate frontend caching
   - Check message sorting logic
   - Verify React key prop isn't causing re-render issues
   - Check if messages are being filtered on display

---

## Debugging Commands

### Check Railway Logs
```bash
# Search for specific batch
"Batch seq=12"

# Search for duplicates
"Skipping duplicate" OR "Filtered message"

# Search for errors
"error" OR "Error" OR "ERROR" OR "500" OR "502"

# Search for transaction completion
"Transaction completed" OR "Transaction failed"
```

### Check Python Logs
```bash
# Search for batch sending
"[DEBUG] Sending batch seq="

# Search for failures
"[DEBUG] Batch seq=.*FAILED"

# Search for retries
"[DEBUG] Batch seq=.*failed.*retrying"
```

---

## Summary

We've implemented comprehensive fixes for:
- ✅ Message ordering (timestamps + sequence numbers)
- ✅ Race conditions (transaction-based guiState creation)
- ✅ Network failures (retry logic with exponential backoff)
- ✅ Duplicate detection (improved with batchIndex)
- ✅ Timeout issues (increased maxDuration)
- ✅ Debug logging (comprehensive logging throughout)

**Current Status**: Messages are being saved to the database successfully, but some are not appearing on the web dashboard. This suggests a frontend display/sorting issue rather than a backend problem.

**Next Investigation**: Focus on frontend message fetching, sorting, and display logic.



