# GOLIAT Monitoring Dashboard - Architecture Overview

## Purpose

A web-based monitoring dashboard for orchestrating and monitoring GOLIAT simulation studies across multiple TensorDock Windows VMs. The system allows you to:

- See green/red status lights for each worker machine (IP-based identification)
- View a minimal web replica of each worker's GUI (progress bars, logs, ETA)
- Coordinate "super-studies" where a base config is split across multiple workers
- Track master progress across all workers combined
- Access simulation artifacts (JSON, PNG, pickle files) via download links

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Railway Dashboard (Next.js)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Dashboard  │  │ Super-Study  │  │   Worker     │         │
│  │   Overview   │  │   Manager    │  │   Details    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Next.js API Routes                          │  │
│  │  /api/heartbeat  /api/gui-update  /api/assignment        │  │
│  │  /api/workers   /api/super-studies  /api/artifacts      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                          ▲                    ▲
                          │                    │
              ┌───────────┘                    └───────────┐
              │                                            │
┌─────────────▼──────────────┐         ┌─────────────────▼─────────────┐
│   Railway PostgreSQL       │         │     Railway File Storage       │
│   (State & Metadata)       │         │     (Artifacts)                 │
│                            │         │                                 │
│  - workers                 │         │  - config files                 │
│  - super_studies           │         │  - result JSON/PNG/pickle      │
│  - assignments             │         │  - log files                    │
│  - progress_events         │         │                                 │
│  - gui_state               │         │                                 │
└────────────────────────────┘         └─────────────────────────────────┘
              ▲
              │
              │ HTTP POST/GET
              │
┌─────────────┴─────────────────────────────────────────────────┐
│              TensorDock Windows VMs (8-16 machines)            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Worker Agent (Python script)                             │ │
│  │  - Polls /api/assignment for work                          │ │
│  │  - Runs: goliat study <split_config>                      │ │
│  │  - Forwards GUI queue messages to /api/gui-update         │ │
│  │  - Sends heartbeat to /api/heartbeat every 5s             │ │
│  │  - Uploads artifacts to /api/artifacts on completion     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  GOLIAT Study Process (with GUI)                          │ │
│  │  - ProgressGUI (PySide6) shows on-screen                  │ │
│  │  - QueueHandler processes messages                        │ │
│  │  - WebGUIBridge.enqueue() forwards to worker agent        │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend (Railway)
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React hooks + API polling/SSR

### Backend Services (Railway)
- **Database**: Railway PostgreSQL - Free tier: 500 hours/month + $5 credit
- **File Storage**: Railway Persistent Storage - 1GB included
- **API**: Next.js API Routes (serverless functions)

### Worker Agent (Python)
- **Language**: Python 3.11+
- **Dependencies**: `requests` (for HTTP), existing GOLIAT packages
- **Execution**: Simple script or batch file, no Windows service required

## Key Design Decisions

### 1. Storage Strategy
- **Railway PostgreSQL** for all state/metadata (workers, assignments, progress events)
- **Railway Storage** for artifact storage (configs, results, logs)
- **Rationale**: Everything within Railway ecosystem, excellent free tier for development

### 2. GUI Integration
- **Both GUI and web updates**: Workers run with `use_gui=true` so RDP users see the native Qt GUI
- **Message forwarding**: `QueueHandler` processes messages for GUI, then calls `WebGUIBridge.enqueue()` to forward copy to web
- **No queue contention**: Bridge uses internal queue, doesn't drain multiprocessing queue

### 3. Worker Identification
- **Primary key**: Public IP address (simple, unique per VM)
- **Optional**: Custom name/label set in dashboard UI
- **Heartbeat timeout**: 30 seconds (worker marked red if no heartbeat)

### 4. Super-Study Orchestration
- **Split on dashboard**: Upload base config → server runs existing `goliat parallel` splitting logic
- **Assignment**: Workers poll `/api/assignment?machineId=<ip>` → server assigns next unclaimed split
- **Master progress**: Weighted average of all worker progress percentages

### 5. Minimal Initial Features
- ✅ Worker status lights (green/red)
- ✅ Overall progress bar per worker
- ✅ Stage progress per worker
- ✅ Color-coded log viewer
- ✅ Master progress bar (super-study level)
- ✅ ETA display
- ❌ Charts/graphs (future)
- ❌ Screenshot streaming (future)
- ❌ Artifact uploads (phase 2)

## Data Flow

### Worker Startup
1. VM deployed manually via TensorDock
2. Worker agent script installed/copied to VM
3. Agent starts, sends initial heartbeat with IP
4. Dashboard registers worker, shows as "idle" (yellow)

### Study Assignment
1. User creates super-study in dashboard, uploads base config
2. Server splits config using existing `split_config()` logic
3. Server stores split configs in Railway Storage, creates assignments in PostgreSQL
4. Worker polls `/api/assignment` → receives split config JSON
5. Worker saves config locally, starts `goliat study <config>`

### Progress Updates
1. GOLIAT study sends messages to multiprocessing queue
2. `QueueHandler` processes message, updates Qt GUI
3. `QueueHandler` calls `web_bridge.enqueue(msg)` 
4. `WebGUIBridge` forwards message to worker agent's internal queue
5. Worker agent POSTs to `/api/gui-update` (throttled to ~5Hz)
6. Server stores in PostgreSQL `gui_state` table
7. Dashboard polls `/api/workers` every 2-3 seconds, displays updates

### Completion
1. Study finishes, sends `{"type": "finished"}` message
2. Worker agent uploads artifacts to Railway Storage (optional)
3. Worker agent marks assignment complete in PostgreSQL
4. Dashboard shows worker as "idle" again

## Scalability Considerations

- **8-16 workers**: Well within Railway limits
- **Update frequency**: Throttled to 5Hz per worker = ~40-80 req/s total (manageable)
- **Storage**: 1GB included, plenty for development
- **PostgreSQL**: 500 hours/month free tier sufficient for development

## Security Notes

- **No authentication initially**: Public access (as requested)
- **Simple API key**: Optional shared secret in headers to prevent random spam
- **Future**: Can add auth later if needed

## Future Enhancements

- Screenshot streaming of GUI windows
- Advanced charts/graphs (time series, comparisons)
- WebSocket support for real-time updates (instead of polling)
- Auto-retry failed assignments
- Worker health metrics (CPU, RAM, GPU utilization)
- Email/Slack notifications on completion