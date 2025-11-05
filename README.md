# GOLIAT Monitoring Dashboard

A web-based monitoring dashboard for orchestrating and monitoring GOLIAT simulation studies across multiple TensorDock Windows VMs.

## Quick Start

### Development
```bash
npm install
npm run dev
```

### Deployment
This project is configured for Railway deployment with built-in PostgreSQL.

1. Fork/clone this repository
2. Connect to Railway
3. Add PostgreSQL service
4. Deploy! 🚀

## Features

- 🟢🔴 Real-time worker status monitoring (green/red lights)
- 📊 Progress tracking across multiple workers
- 📝 Live log streaming from worker agents
- ⚡ Super-study orchestration across multiple VMs
- 📁 Artifact management and downloads
- 🎯 Weighted progress aggregation

## Technology Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **Database**: Railway PostgreSQL
- **Deployment**: Railway
- **Worker Agent**: Python 3.11+ with `requests` library

## Architecture

See [docs/architecture.md](./docs/architecture.md) for detailed system architecture and design decisions.

## License

MIT