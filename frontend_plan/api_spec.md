# API Specification - GOLIAT Monitoring Dashboard

## Base URL

All endpoints are relative to the Vercel deployment URL:
- Development: `http://localhost:3000`
- Production: `https://goliat-monitoring.vercel.app`

## Authentication

Currently no authentication required. Optional API key header for basic spam protection:
```
Authorization: Bearer <optional-api-key>
```

## Endpoints

### Worker Endpoints

#### POST /api/heartbeat
Worker sends periodic heartbeat to indicate it's alive.

**Request:**
```json
{
  "machineId": "123.45.67.89"
}
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Status Codes:**
- `200 OK`: Heartbeat received
- `400 Bad Request`: Invalid machineId
- `500 Internal Server Error`: Database error

---

#### GET /api/assignment
Worker polls for next available assignment.

**Query Parameters:**
- `machineId` (required): IP address of worker

**Response (no assignment):**
```json
{
  "assigned": false
}
```

**Response (assignment available):**
```json
{
  "assigned": true,
  "assignment": {
    "id": "assignment-123",
    "super_study_id": "study-456",
    "split_index": 2,
    "config_url": "https://blob.vercel-storage.com/configs/split_2.json",
    "created_at": "2024-01-15T10:00:00Z"
  }
}
```

**Status Codes:**
- `200 OK`: Assignment check successful
- `400 Bad Request`: Missing machineId
- `500 Internal Server Error`: Database error

**Behavior:**
- Returns next `pending` assignment for this worker
- Marks assignment as `assigned` and updates `assigned_at` timestamp
- If no assignment available, returns `{"assigned": false}`

---

#### POST /api/gui-update
Worker sends GUI state updates from GOLIAT study.

**Request:**
```json
{
  "machineId": "123.45.67.89",
  "message": {
    "type": "overall_progress",
    "current": 45,
    "total": 100
  },
  "timestamp": 1705315800.123
}
```

**Message Types:**
- `overall_progress`: `{current: number, total: number}`
- `stage_progress`: `{name: string, current: number, total: number, sub_stage?: string}`
- `status`: `{message: string, log_type: string}`
- `sim_details`: `{count: number, total: number, details: string}`
- `profiler_update`: `{profiler: object}` (for ETA calculations)
- `finished`: `{}`
- `fatal_error`: `{message: string}`

**Response:**
```json
{
  "success": true
}
```

**Status Codes:**
- `200 OK`: Update stored
- `400 Bad Request`: Invalid payload
- `429 Too Many Requests`: Rate limit exceeded (throttle client)
- `500 Internal Server Error`: Database error

**Rate Limiting:**
- Recommended: 5 updates/second per worker
- Server should accept but may throttle if exceeded

---

### Dashboard Endpoints

#### GET /api/workers
Get list of all registered workers.

**Response:**
```json
{
  "workers": [
    {
      "ip": "123.45.67.89",
      "name": "Worker-1",
      "last_heartbeat": "2024-01-15T10:29:55Z",
      "status": "running",
      "current_study_id": "study-456",
      "current_progress": {
        "overall": 45.5,
        "stage": "Running Simulation",
        "stage_percent": 60
      },
      "eta_seconds": 3600
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Success

**Notes:**
- Workers with `last_heartbeat` > 30 seconds ago should have `status: "offline"`
- `current_progress` is latest from `gui_state` table
- `eta_seconds` calculated from `profiler_update` messages

---

#### GET /api/workers/[ip]
Get detailed information about a specific worker.

**Response:**
```json
{
  "ip": "123.45.67.89",
  "name": "Worker-1",
  "last_heartbeat": "2024-01-15T10:29:55Z",
  "status": "running",
  "current_study_id": "study-456",
  "gui_state": [
    {
      "type": "overall_progress",
      "payload": {"current": 45, "total": 100},
      "timestamp": "2024-01-15T10:29:50Z"
    },
    {
      "type": "status",
      "payload": {"message": "Starting simulation...", "log_type": "default"},
      "timestamp": "2024-01-15T10:29:48Z"
    }
  ]
}
```

**Query Parameters:**
- `limit` (optional): Number of recent GUI messages to return (default: 100)

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Worker not found

---

#### GET /api/super-studies
Get list of all super-studies.

**Response:**
```json
{
  "super_studies": [
    {
      "id": "study-456",
      "name": "Near-Field Study - Jan 2024",
      "num_splits": 8,
      "status": "running",
      "master_progress": 62.5,
      "created_at": "2024-01-15T09:00:00Z",
      "assignments": {
        "completed": 3,
        "running": 4,
        "pending": 1
      }
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Success

---

#### GET /api/super-studies/[id]
Get detailed information about a super-study.

**Response:**
```json
{
  "id": "study-456",
  "name": "Near-Field Study - Jan 2024",
  "num_splits": 8,
  "status": "running",
  "master_progress": 62.5,
  "created_at": "2024-01-15T09:00:00Z",
  "assignments": [
    {
      "id": "assignment-123",
      "split_index": 0,
      "worker_ip": "123.45.67.89",
      "status": "running",
      "progress": 75.0,
      "assigned_at": "2024-01-15T09:05:00Z",
      "started_at": "2024-01-15T09:05:30Z"
    }
  ],
  "estimated_time_remaining_seconds": 7200
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Super-study not found

**Notes:**
- `master_progress` is weighted average of all assignment progress values
- `estimated_time_remaining_seconds` calculated from slowest worker

---

#### POST /api/super-studies
Create a new super-study by uploading base config.

**Request:**
```json
{
  "name": "Near-Field Study - Jan 2024",
  "base_config": {
    "study_type": "near_field",
    "phantoms": [...],
    "antenna_config": {...}
  },
  "num_splits": 8
}
```

**Response:**
```json
{
  "id": "study-456",
  "name": "Near-Field Study - Jan 2024",
  "num_splits": 8,
  "assignments_created": 8,
  "status": "pending"
}
```

**Status Codes:**
- `201 Created`: Super-study created
- `400 Bad Request`: Invalid config or num_splits
- `500 Internal Server Error`: Splitting or storage error

**Behavior:**
1. Validate config JSON
2. Upload base config to Blob storage
3. Run splitting logic (same as `goliat parallel --num-splits N`)
4. Upload each split config to Blob
5. Create `super_study` record
6. Create `assignment` records (status: `pending`)

---

#### POST /api/artifacts/upload (Future)
Get signed URL for uploading artifacts.

**Request:**
```json
{
  "assignment_id": "assignment-123",
  "filename": "results.json",
  "content_type": "application/json"
}
```

**Response:**
```json
{
  "upload_url": "https://blob.vercel-storage.com/...",
  "download_url": "https://blob.vercel-storage.com/..."
}
```

**Status Codes:**
- `200 OK`: Upload URL generated
- `400 Bad Request`: Invalid parameters

---

## Database Schema Reference

### workers
```sql
CREATE TABLE workers (
  ip TEXT PRIMARY KEY,
  name TEXT,
  last_heartbeat TIMESTAMP NOT NULL,
  current_study_id TEXT,
  status TEXT CHECK(status IN ('idle', 'running', 'error', 'offline'))
);
```

### super_studies
```sql
CREATE TABLE super_studies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  base_config_url TEXT NOT NULL,
  num_splits INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed'))
);
```

### assignments
```sql
CREATE TABLE assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  super_study_id TEXT NOT NULL REFERENCES super_studies(id),
  worker_ip TEXT REFERENCES workers(ip),
  split_index INTEGER NOT NULL,
  config_url TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending', 'assigned', 'running', 'completed', 'failed')),
  assigned_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  artifact_urls JSONB
);
```

### gui_state
```sql
CREATE TABLE gui_state (
  worker_ip TEXT NOT NULL REFERENCES workers(ip),
  message_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (worker_ip, timestamp)
);
CREATE INDEX idx_gui_state_worker ON gui_state(worker_ip, timestamp DESC);
```

## Error Responses

All errors follow this format:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common error codes:
- `INVALID_REQUEST`: Invalid request parameters
- `NOT_FOUND`: Resource not found
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server error
