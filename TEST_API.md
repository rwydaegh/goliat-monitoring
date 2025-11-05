# Quick API Test Script

## Usage

Set your Railway URL and run:

```bash
export RAILWAY_URL=https://your-app.railway.app
bash test-api.sh
```

Or test individual endpoints:

```bash
# Get all workers
curl https://your-app.railway.app/api/workers

# Send heartbeat
curl -X POST https://your-app.railway.app/api/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"machineId": "YOUR_IP_ADDRESS"}'

# Send GUI update
curl -X POST https://your-app.railway.app/api/gui-update \
  -H "Content-Type: application/json" \
  -d '{
    "machineId": "YOUR_IP_ADDRESS",
    "message": {
      "type": "status",
      "message": "Test message",
      "log_type": "default"
    },
    "timestamp": '$(date +%s)'
  }'
```

## What to Check

1. **`/api/workers`** - Should return JSON array (empty `[]` if no workers)
2. **`/api/heartbeat`** - Should return `{"success": true, "timestamp": "..."}`
3. **`/api/gui-update`** - Should return `{"success": true}`

If you get errors, check:
- Railway URL is correct
- Database is connected
- Migrations have been run

