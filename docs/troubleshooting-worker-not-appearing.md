# Troubleshooting: Worker not appearing

If your worker doesn't appear on the dashboard, check these:

## Quick checks

1. GOLIAT running with GUI? Web monitoring only works when GUI is enabled. Make sure `"use_gui": true` in your config (default).

2. Connection indicator: Check top-right corner of GOLIAT GUI:
   - Green dot = connected
   - Red dot = disconnected

3. Check logs: After starting GOLIAT, look for:
   ```
   Web GUI bridge enabled: https://goliat.waves-ugent.be, machine_id=YOUR_IP
   ```
   If you see this, the bridge is working.

4. Dashboard: Go to [https://goliat.waves-ugent.be](https://goliat.waves-ugent.be) and refresh. Worker should appear within 5-10 seconds.

## Common issues

Custom dashboard URL: If using a different dashboard:
```bash
export GOLIAT_MONITORING_URL=https://your-dashboard.com
```

Worker appears then disappears: Check your network connection. Workers go offline if connection is lost for 30+ seconds.

For testing API endpoints directly, see [test-api.md](./test-api.md).
