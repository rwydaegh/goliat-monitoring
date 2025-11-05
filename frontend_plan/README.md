# GOLIAT Monitoring Dashboard - Planning Documents

This directory contains the planning documents for building a web-based monitoring dashboard for GOLIAT simulation studies across multiple TensorDock Windows VMs.

## Documents Overview

### [architecture.md](./architecture.md)
High-level system architecture, technology stack, design decisions, and data flow diagrams. Start here to understand the overall system.

### [implementation_plan.md](./implementation_plan.md)
Step-by-step implementation roadmap broken into phases. Use this as your development checklist.

### [worker_agent.md](./worker_agent.md)
Detailed design for the Python worker agent that runs on each TensorDock VM. Includes code structure, environment variables, and installation instructions.

### [api_spec.md](./api_spec.md)
Complete API specification for all endpoints. Reference this when building the Next.js API routes.

## Quick Start

1. **Read architecture.md** to understand the system design
2. **Follow implementation_plan.md** Phase 1 to set up the Next.js project
3. **Refer to api_spec.md** when building API endpoints
4. **Use worker_agent.md** to build the worker agent script

## Key Decisions Made

1. **Storage**: Vercel Postgres + Vercel Blob (staying within Vercel ecosystem)
2. **GUI**: Both desktop GUI (for RDP) and web replica (for dashboard)
3. **Worker ID**: Use IP address as primary identifier
4. **Message Flow**: QueueHandler forwards messages to WebGUIBridge after updating GUI
5. **Minimal V1**: Basic progress bars, logs, status lights - no charts/screenshots initially

## Next Steps

1. Create new repo `goliat-monitoring` (separate from goliat repo)
2. Initialize Next.js 14 project
3. Set up Vercel Postgres and Blob
4. Begin Phase 1 implementation (see implementation_plan.md)

## Questions?

Refer to the individual planning documents for detailed information. Each document focuses on a specific aspect of the system.
