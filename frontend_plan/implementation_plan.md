# Implementation Plan - GOLIAT Monitoring Dashboard

## Phase 1: Foundation (Week 1)

### 1.1 Setup Next.js Project
- [ ] Create new repo: `goliat-monitoring` (separate from goliat repo)
- [ ] Initialize Next.js 14 with TypeScript
- [ ] Configure Vercel Postgres (Neon) integration
- [ ] Configure Vercel Blob integration
- [ ] Set up basic project structure:
  ```
  goliat-monitoring/
  ├── app/
  │   ├── api/
  │   ├── (dashboard)/
  │   └── layout.tsx
  ├── components/
  ├── lib/
  │   ├── db.ts (Postgres client)
  │   └── blob.ts (Blob client)
  └── types/
  ```

### 1.2 Database Schema
- [ ] Create migration for `workers` table:
  ```sql
  CREATE TABLE workers (
    ip TEXT PRIMARY KEY,
    name TEXT,
    last_heartbeat TIMESTAMP,
    current_study_id TEXT,
    status TEXT -- 'idle', 'running', 'error'
  );
  ```

- [ ] Create migration for `super_studies` table:
  ```sql
  CREATE TABLE super_studies (
    id TEXT PRIMARY KEY,
    name TEXT,
    base_config_url TEXT, -- Blob URL
    num_splits INTEGER,
    created_at TIMESTAMP,
    status TEXT -- 'pending', 'running', 'completed'
  );
  ```

- [ ] Create migration for `assignments` table:
  ```sql
  CREATE TABLE assignments (
    id TEXT PRIMARY KEY,
    super_study_id TEXT REFERENCES super_studies(id),
    worker_ip TEXT REFERENCES workers(ip),
    split_index INTEGER,
    config_url TEXT, -- Blob URL to split config
    status TEXT, -- 'pending', 'assigned', 'running', 'completed', 'failed'
    assigned_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
  );
  ```

- [ ] Create migration for `gui_state` table:
  ```sql
  CREATE TABLE gui_state (
    worker_ip TEXT REFERENCES workers(ip),
    message_type TEXT, -- 'overall_progress', 'stage_progress', 'status', etc.
    payload JSONB,
    timestamp TIMESTAMP,
    PRIMARY KEY (worker_ip, timestamp)
  );
  CREATE INDEX idx_gui_state_worker ON gui_state(worker_ip, timestamp DESC);
  ```

### 1.3 Basic API Endpoints
- [ ] `POST /api/heartbeat` - Worker heartbeat handler
- [ ] `GET /api/workers` - List all workers with status
- [ ] `GET /api/workers/[ip]` - Get single worker details
- [ ] Basic error handling and CORS setup

### 1.4 Dashboard UI Foundation
- [ ] Layout component with navigation
- [ ] Workers overview page: grid/list of worker cards
- [ ] Worker card component: IP, name, status light (green/red), last heartbeat
- [ ] Basic styling (Tailwind or CSS Modules)

## Phase 2: GOLIAT Integration (Week 2)

### 2.1 Fix WebGUIBridge in GOLIAT
- [ ] Refactor `goliat/utils/gui_bridge.py`:
  - Change from polling multiprocessing queue to using internal queue
  - Add `enqueue(msg)` method that worker calls
  - Keep `_forward_loop` reading from internal queue
  - Add throttling (max 5 messages/second)

- [ ] Integrate into `goliat/gui/components/queue_handler.py`:
  - After processing each message, call `self.gui.web_bridge.enqueue(msg)` if bridge exists
  - Initialize bridge in `ProgressGUI.__init__` if env vars set:
    ```python
    if os.environ.get('GOLIAT_WEBGUI_ENABLED') == 'true':
        server_url = os.environ.get('GOLIAT_MONITORING_URL')
        machine_id = os.environ.get('GOLIAT_MACHINE_ID')  # IP address
        if server_url and machine_id:
            self.web_bridge = WebGUIBridge(server_url, machine_id)
            self.web_bridge.start()  # No queue arg needed now
    ```

- [ ] Add `requests` to `pyproject.toml` dependencies (or make optional)

### 2.2 Worker Agent Script
- [ ] Create `worker_agent.py` script:
  - Parse environment variables: `GOLIAT_MONITORING_URL`, `GOLIAT_MACHINE_ID` (IP)
  - Heartbeat loop: POST to `/api/heartbeat` every 5 seconds
  - Assignment polling: GET `/api/assignment?machineId=<ip>` every 10 seconds
  - When assignment received:
    - Download config JSON from Blob URL
    - Save locally
    - Run `goliat study <config>` with `GOLIAT_WEBGUI_ENABLED=true`
  - Listen for GUI updates from WebGUIBridge (via local HTTP endpoint or file)
  - Forward updates to `/api/gui-update`

- [ ] Alternative simpler approach: 
  - Worker agent sets env vars before calling `goliat study`
  - WebGUIBridge POSTs directly to Vercel API
  - Agent just monitors process and sends heartbeat

### 2.3 API Endpoints for Workers
- [ ] `GET /api/assignment?machineId=<ip>` - Return next pending assignment
- [ ] `POST /api/gui-update` - Receive GUI state updates from workers
- [ ] Update assignment status when worker starts/completes

## Phase 3: Super-Study Management (Week 3)

### 3.1 Config Splitting Integration
- [ ] Create API endpoint `POST /api/super-studies`:
  - Accept base config JSON upload
  - Store in Blob
  - Call Python splitting logic (either via subprocess or port to JS)
  - Create `super_study` record
  - Create `assignment` records for each split

- [ ] Add `num_splits` parameter to endpoint

### 3.2 Super-Study UI
- [ ] Create super-study list page
- [ ] Create super-study detail page:
  - Master progress bar (weighted average)
  - List of assignments with worker assignments
  - Overall status

### 3.3 Progress Aggregation
- [ ] `GET /api/super-studies/[id]` endpoint:
  - Aggregate progress from all assignments
  - Calculate master progress percentage
  - Calculate estimated time remaining

## Phase 4: GUI Replica (Week 4)

### 4.1 Log Viewer Component
- [ ] Fetch latest GUI state messages from `gui_state` table
- [ ] Display logs with color coding based on `log_type`:
  - `success` → green
  - `warning` → yellow
  - `error` / `fatal` → red
  - `default` → gray
- [ ] Auto-scroll to bottom
- [ ] Filter by message type

### 4.2 Progress Bars
- [ ] Overall progress bar component:
  - Read from `gui_state` where `message_type='overall_progress'`
  - Display percentage and current/total

- [ ] Stage progress bar component:
  - Read from `gui_state` where `message_type='stage_progress'`
  - Display stage name, percentage, sub-stage

### 4.3 Worker Detail Page
- [ ] Full worker detail view:
  - Status light
  - Overall progress bar
  - Stage progress bar
  - Log viewer
  - ETA display (from profiler_update messages)
  - Current simulation details

### 4.4 Real-time Updates
- [ ] Implement polling: Refresh every 2-3 seconds
- [ ] Show "last updated" timestamp
- [ ] Optional: Add WebSocket support later

## Phase 5: Polish & Testing (Week 5)

### 5.1 Error Handling
- [ ] Handle network failures gracefully
- [ ] Show error states in UI
- [ ] Retry logic for worker agent

### 5.2 Testing
- [ ] Test with 1 worker locally
- [ ] Test config splitting
- [ ] Test progress updates
- [ ] Test worker heartbeat timeout

### 5.3 Documentation
- [ ] Write setup guide for worker agent
- [ ] Document environment variables
- [ ] Update cloud_setup.md with worker agent installation

## Phase 6: Artifact Management (Future)

### 6.1 Upload Endpoint
- [ ] `POST /api/artifacts/upload` - Get signed upload URL
- [ ] Worker agent uploads files after completion
- [ ] Store artifact URLs in assignments table

### 6.2 Download UI
- [ ] Show download links in super-study detail page
- [ ] Generate signed download URLs from Blob

## Notes

- **Order matters**: Phase 1 & 2 are critical foundation, Phase 3-4 can be parallelized
- **Start simple**: Get basic worker status working before adding super-studies
- **Test incrementally**: Verify each phase before moving to next
- **Keep it minimal**: Don't add features beyond scope until core works
