# Testing API endpoints

Quick reference for testing dashboard API endpoints.

## Test script

```bash
export DASHBOARD_URL=https://goliat.waves-ugent.be
bash test-api.sh
```

## Individual endpoints

```bash
# Get all workers
curl https://goliat.waves-ugent.be/api/workers

# Send heartbeat
curl -X POST https://goliat.waves-ugent.be/api/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"machineId": "YOUR_IP_ADDRESS"}'

# Send GUI update
curl -X POST https://goliat.waves-ugent.be/api/gui-update \
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

## Expected responses

- `/api/workers`: JSON array (empty `[]` if no workers)
- `/api/heartbeat`: `{"success": true, "timestamp": "..."}`
- `/api/gui-update`: `{"success": true}`

If errors occur, verify dashboard URL, database connection, and migrations.

