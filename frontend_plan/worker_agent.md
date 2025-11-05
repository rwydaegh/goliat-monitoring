# Worker Agent Design

## Overview

The worker agent is a lightweight Python script that runs on each TensorDock Windows VM. It coordinates with the Vercel dashboard to:
1. Register itself and send periodic heartbeats
2. Poll for work assignments (split configs)
3. Execute GOLIAT studies with web monitoring enabled
4. Forward GUI updates to the dashboard
5. Report completion status

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Worker Agent (worker_agent.py)                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Main Loop                                         │ │
│  │  - Heartbeat every 5s                             │ │
│  │  - Poll assignment every 10s (if idle)            │ │
│  │  - Monitor goliat process                          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Assignment Handler                                 │ │
│  │  - Download config from Blob                        │ │
│  │  - Set environment variables                        │ │
│  │  - Launch goliat study                             │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Process Monitor                                    │ │
│  │  - Watch goliat process                            │ │
│  │  - Handle completion/errors                         │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          │ subprocess
                          ▼
┌─────────────────────────────────────────────────────────┐
│  GOLIAT Study Process                                   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ProgressGUI (PySide6)                              │ │
│  │  - Shows on-screen (visible via RDP)               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  QueueHandler                                       │ │
│  │  - Processes queue messages                        │ │
│  │  - Updates GUI                                      │ │
│  │  - Calls web_bridge.enqueue(msg)                   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  WebGUIBridge                                       │ │
│  │  - Receives messages via enqueue()                 │ │
│  │  - Throttles to 5Hz                                │ │
│  │  - POSTs to /api/gui-update                        │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Implementation Approaches

### Approach A: Direct Bridge (Simpler)

**How it works:**
- Worker agent sets environment variables
- Worker agent launches `goliat study` as subprocess
- WebGUIBridge inside GOLIAT POSTs directly to Vercel API
- Worker agent just monitors process and sends heartbeat

**Pros:**
- Simpler architecture
- Less code in worker agent
- Direct communication (no intermediate hop)

**Cons:**
- Requires network access from GOLIAT process
- Harder to debug if network issues occur

### Approach B: Agent Proxy (More Control)

**How it works:**
- Worker agent runs local HTTP server (or reads from file)
- WebGUIBridge POSTs to localhost endpoint
- Worker agent forwards to Vercel API
- Worker agent can buffer/retry messages

**Pros:**
- Better error handling/retry logic
- Can buffer messages if network fails
- Easier to debug (see all messages locally)

**Cons:**
- More complex architecture
- Additional HTTP server in agent

## Recommended: Approach A (Direct Bridge)

Use Approach A for simplicity. Worker agent responsibilities:
1. Heartbeat loop
2. Assignment polling
3. Process management
4. Environment variable setup

GOLIAT's WebGUIBridge handles all communication directly.

## Worker Agent Script Structure

```python
#!/usr/bin/env python3
"""GOLIAT Worker Agent - Coordinates with monitoring dashboard."""

import os
import sys
import time
import json
import subprocess
import requests
from pathlib import Path
from typing import Optional, Dict, Any

class WorkerAgent:
    def __init__(self, monitoring_url: str, machine_id: str):
        self.monitoring_url = monitoring_url.rstrip('/')
        self.machine_id = machine_id  # IP address
        self.current_assignment: Optional[Dict] = None
        self.current_process: Optional[subprocess.Popen] = None
        self.running = True
        
    def heartbeat(self) -> bool:
        """Send heartbeat to dashboard."""
        try:
            response = requests.post(
                f"{self.monitoring_url}/api/heartbeat",
                json={"machineId": self.machine_id},
                timeout=5
            )
            return response.status_code == 200
        except Exception as e:
            print(f"Heartbeat failed: {e}")
            return False
    
    def poll_assignment(self) -> Optional[Dict]:
        """Poll for next assignment."""
        try:
            response = requests.get(
                f"{self.monitoring_url}/api/assignment",
                params={"machineId": self.machine_id},
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                return data if data.get("config") else None
            return None
        except Exception as e:
            print(f"Assignment poll failed: {e}")
            return None
    
    def download_config(self, config_url: str, output_path: Path) -> bool:
        """Download config file from Blob storage."""
        try:
            response = requests.get(config_url, timeout=30)
            if response.status_code == 200:
                output_path.write_text(response.text)
                return True
            return False
        except Exception as e:
            print(f"Config download failed: {e}")
            return False
    
    def run_study(self, config_path: Path) -> subprocess.Popen:
        """Launch goliat study with web monitoring enabled."""
        env = os.environ.copy()
        env['GOLIAT_WEBGUI_ENABLED'] = 'true'
        env['GOLIAT_MONITORING_URL'] = self.monitoring_url
        env['GOLIAT_MACHINE_ID'] = self.machine_id
        
        cmd = [sys.executable, '-m', 'goliat', 'study', str(config_path)]
        return subprocess.Popen(cmd, env=env)
    
    def handle_assignment(self, assignment: Dict):
        """Handle a new assignment."""
        config_url = assignment['config_url']
        config_path = Path(f"assigned_config_{assignment['split_index']}.json")
        
        print(f"Downloading config from {config_url}...")
        if not self.download_config(config_url, config_path):
            print("Failed to download config")
            return
        
        print(f"Starting study with config {config_path}...")
        self.current_process = self.run_study(config_path)
        
    def main_loop(self):
        """Main agent loop."""
        heartbeat_interval = 5  # seconds
        assignment_poll_interval = 10  # seconds
        
        last_heartbeat = 0
        last_assignment_poll = 0
        
        while self.running:
            current_time = time.time()
            
            # Send heartbeat
            if current_time - last_heartbeat >= heartbeat_interval:
                self.heartbeat()
                last_heartbeat = current_time
            
            # Poll for assignment if idle
            if self.current_process is None:
                if current_time - last_assignment_poll >= assignment_poll_interval:
                    assignment = self.poll_assignment()
                    if assignment:
                        self.handle_assignment(assignment)
                    last_assignment_poll = current_time
            else:
                # Check if process finished
                if self.current_process.poll() is not None:
                    return_code = self.current_process.returncode
                    print(f"Study completed with return code {return_code}")
                    self.current_process = None
                    self.current_assignment = None
            
            time.sleep(1)  # Small delay to prevent tight loop

def main():
    monitoring_url = os.environ.get('GOLIAT_MONITORING_URL')
    machine_id = os.environ.get('GOLIAT_MACHINE_ID')  # IP address
    
    if not monitoring_url or not machine_id:
        print("Error: GOLIAT_MONITORING_URL and GOLIAT_MACHINE_ID must be set")
        sys.exit(1)
    
    agent = WorkerAgent(monitoring_url, machine_id)
    try:
        agent.main_loop()
    except KeyboardInterrupt:
        print("Shutting down...")
        if agent.current_process:
            agent.current_process.terminate()

if __name__ == '__main__':
    main()
```

## Environment Variables

Worker agent requires:
- `GOLIAT_MONITORING_URL`: Base URL of Vercel dashboard (e.g., `https://goliat-monitoring.vercel.app`)
- `GOLIAT_MACHINE_ID`: IP address of this machine (can be auto-detected or set manually)

GOLIAT process will also need these (set by agent):
- `GOLIAT_WEBGUI_ENABLED=true`
- `GOLIAT_MONITORING_URL` (same as above)
- `GOLIAT_MACHINE_ID` (same as above)

## Installation on TensorDock VM

1. Copy `worker_agent.py` to VM (via RDP file transfer or Git clone)
2. Install dependencies: `pip install requests` (if not already in GOLIAT)
3. Set environment variables (or create `.env` file)
4. Run: `python worker_agent.py`

### Optional: Run as Windows Service

For production, can wrap in Windows service using `pywin32` or `nssm` (Non-Sucking Service Manager), but not required for initial version.

## Error Handling

- **Network failures**: Heartbeat/assignment poll failures are logged but don't crash agent
- **Config download failures**: Assignment rejected, will retry on next poll
- **GOLIAT process crashes**: Agent detects via `poll()`, logs error, goes back to idle
- **API errors**: Logged, agent continues running

## Future Enhancements

- Retry logic with exponential backoff
- Local message buffering if network unavailable
- Health checks (CPU, RAM, GPU utilization)
- Auto-restart on GOLIAT crash
- Log file rotation
- Windows service wrapper
