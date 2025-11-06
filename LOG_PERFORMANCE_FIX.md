# Log Performance Issues - Root Cause Analysis & Fix

## Problems Identified

### 1. **Severe Throttling Bottleneck** 🔴
**Current behavior:**
```python
# Send ONE message at a time
message = self.internal_queue.get_nowait()
self._send_message(message)
time.sleep(self.throttle_interval)  # Wait 100ms (10 Hz)
```

**Result**: If 100 log messages are queued:
- 100 messages × 100ms delay = **10 seconds minimum**
- Plus network latency per request = **10-15+ seconds**

### 2. **ETA Not Being Sent** ⚠️
- `profiler_update` messages extract `eta_seconds` but API doesn't process it
- No ETA data reaches the database
- Frontend shows no "Time Remaining"

### 3. **Individual HTTP Requests Per Log**
- Each log = separate HTTP POST request
- Network overhead compounds the delay
- 100 logs = 100 HTTP requests

## Proposed Solutions

### Option A: **Batch Logging** (RECOMMENDED)
Send multiple log messages in a single request:

```python
# In gui_bridge.py - collect logs for 200ms, then send batch
def _forward_loop(self):
    log_batch = []
    batch_timeout = 0.2  # 200ms
    last_batch_send = time.time()
    
    while self.running:
        try:
            # Collect messages
            while time.time() - last_batch_send < batch_timeout:
                try:
                    msg = self.internal_queue.get(timeout=0.05)
                    if msg.get('type') == 'status':
                        log_batch.append(msg)
                    else:
                        # Send non-log messages immediately
                        self._send_message(msg)
                except Empty:
                    break
            
            # Send batch if we have logs
            if log_batch:
                self._send_log_batch(log_batch)
                log_batch = []
            
            last_batch_send = time.time()
```

**Benefits:**
- Send 50+ logs in one request
- ~5ms per log instead of 100ms+
- Near real-time updates

### Option B: **Remove Throttling for Logs**
Keep throttling for progress updates, remove for logs:

```python
if message_type in ['overall_progress', 'stage_progress', 'profiler_update']:
    time.sleep(self.throttle_interval)
# No delay for status/log messages
```

### Option C: **Increase Throttle Rate Drastically**
Change from 10 Hz to 50-100 Hz:

```python
throttle_hz: float = 50.0  # 50 messages/second = 20ms between
```

## ETA Fix

Add to `/api/gui-update/route.ts`:

```typescript
// Handle profiler_update with ETA
if (messageType === 'profiler_update' && message.eta_seconds !== undefined) {
  if (message.eta_seconds > 0) {
    const etaDate = new Date(Date.now() + message.eta_seconds * 1000)
    updateData.eta = etaDate
  }
}
```

## Recommended Implementation

**Phase 1**: Quick wins (5 min)
1. Remove throttling entirely for `status` messages
2. Add ETA handling to API
3. Increase throttle for other messages to 50 Hz

**Phase 2**: Optimal solution (15 min)
1. Implement batch logging
2. Send logs every 200ms in batches
3. Keep individual sends for progress/ETA updates

**Expected Results:**
- Logs appear within 200-500ms (vs 10+ seconds)
- ETA/Time Remaining displays correctly
- Smooth, near real-time updates

