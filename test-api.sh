#!/bin/bash
# Test script for GOLIAT Monitoring API endpoints

# Set your Railway URL here
RAILWAY_URL="${RAILWAY_URL:-https://your-app.railway.app}"

echo "Testing GOLIAT Monitoring API at: $RAILWAY_URL"
echo "================================================"
echo ""

echo "1. Testing /api/workers endpoint..."
echo "-----------------------------------"
curl -s "$RAILWAY_URL/api/workers" | jq '.' || curl -s "$RAILWAY_URL/api/workers"
echo ""
echo ""

echo "2. Testing /api/heartbeat endpoint (GET with ipAddress)..."
echo "----------------------------------------------------------"
# Try with a sample IP
curl -s "$RAILWAY_URL/api/heartbeat?ipAddress=192.168.1.100" | jq '.' || curl -s "$RAILWAY_URL/api/heartbeat?ipAddress=192.168.1.100"
echo ""
echo ""

echo "3. Testing /api/heartbeat endpoint (POST)..."
echo "---------------------------------------------"
curl -s -X POST "$RAILWAY_URL/api/heartbeat" \
  -H "Content-Type: application/json" \
  -d '{"machineId": "192.168.1.100"}' | jq '.' || \
curl -s -X POST "$RAILWAY_URL/api/heartbeat" \
  -H "Content-Type: application/json" \
  -d '{"machineId": "192.168.1.100"}'
echo ""
echo ""

echo "4. Testing /api/gui-update endpoint..."
echo "--------------------------------------"
curl -s -X POST "$RAILWAY_URL/api/gui-update" \
  -H "Content-Type: application/json" \
  -d '{
    "machineId": "192.168.1.100",
    "message": {
      "type": "status",
      "message": "Test message",
      "log_type": "default"
    },
    "timestamp": '$(date +%s)'
  }' | jq '.' || \
curl -s -X POST "$RAILWAY_URL/api/gui-update" \
  -H "Content-Type: application/json" \
  -d '{
    "machineId": "192.168.1.100",
    "message": {
      "type": "status",
      "message": "Test message",
      "log_type": "default"
    },
    "timestamp": '$(date +%s)'
  }'
echo ""
echo ""

echo "Done! Check the output above for any errors."

