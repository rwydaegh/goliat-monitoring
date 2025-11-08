# Environment variables

Environment variables for configuring the monitoring dashboard and worker connections.

## Dashboard URL

Workers connect to the monitoring dashboard automatically. The default URL is:

```
https://goliat.waves-ugent.be
```

### Custom dashboard URL

To use a different dashboard URL, set on worker machines:

```bash
export GOLIAT_MONITORING_URL=https://your-dashboard.com
```

This overrides the default URL. Workers will connect to your custom dashboard instead.

## Railway deployment

### Required variables

Railway automatically sets these:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}  # Auto-populated from PostgreSQL service
NODE_ENV=production
```

No manual configuration needed.

### Optional variables

None required for basic operation. Add custom variables as needed for your deployment.

## Worker configuration

### Automatic connection

No environment variables needed on worker machines. GOLIAT automatically:
1. Detects machine IP (public or local)
2. Connects to dashboard
3. Sends heartbeats every 30 seconds
4. Forwards GUI messages

### Custom dashboard URL

If using custom dashboard:

```bash
export GOLIAT_MONITORING_URL=https://your-dashboard.com
```

Set before running GOLIAT studies.

## Verifying connection

1. GOLIAT GUI: Green dot in top-right corner = connected
2. Logs: Look for "Web GUI bridge enabled" message
3. Dashboard: Worker should appear within 5-10 seconds

See [troubleshooting guide](./troubleshooting-worker-not-appearing.md) for connection issues.
