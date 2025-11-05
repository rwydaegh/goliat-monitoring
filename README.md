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

Migrations run automatically during the build process.

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

## Configuration

### Web Monitoring (Hardcoded)

The GOLIAT client automatically connects to the monitoring dashboard:
- **Dashboard URL**: `https://goliat-monitoring.up.railway.app` (hardcoded in GOLIAT)
- **Machine ID**: Auto-detected (public IP or local IP)
- **Status Indicator**: Green/red connection status shown in GOLIAT GUI

No environment variables needed - everything is configured automatically!

## Documentation

- **[Architecture](./docs/architecture.md)** - System architecture and design decisions
- **[Railway Deployment](./docs/railway-deployment.md)** - Deployment guide
- **[Database Migrations](./docs/railway-migrations.md)** - Database setup and migration guide
- **[Troubleshooting](./docs/troubleshooting-worker-not-appearing.md)** - Common issues and solutions

## API Endpoints

- `GET /api/workers` - List all registered workers
- `GET /api/workers/[id]` - Get worker details
- `POST /api/heartbeat` - Worker heartbeat (automatic)
- `POST /api/gui-update` - GUI state updates (automatic)

## Testing

See `TEST_API.md` for API testing instructions.

## License

MIT
