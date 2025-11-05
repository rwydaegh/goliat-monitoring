# Troubleshooting: Worker Not Appearing on Dashboard

## Issue: Your worker isn't showing up on the dashboard

Since web monitoring is now hardcoded into GOLIAT, if your worker isn't appearing, check the following:

## Quick Checks

### 1. Verify GOLIAT is Running with GUI

The web monitoring bridge only works when the GUI is enabled (which is the default). Make sure you're running:
```bash
goliat study test --no-cache
```

Not in headless mode.

### 2. Check GOLIAT Logs for WebGUIBridge Messages

After starting the study, look for these messages in your logs:

```
Web GUI bridge enabled: https://goliat-monitoring.up.railway.app, machine_id=YOUR_IP
```

If you see this message, the bridge is working!

### 3. Check Dashboard

1. Go to your Railway dashboard URL: `https://goliat-monitoring.up.railway.app`
2. Refresh the page
3. Your worker should appear within 5-10 seconds
4. The IP address will be your machine's IP (auto-detected)

### 4. Check Browser Console

Open browser dev tools (F12) and check:
- Network tab: Should see calls to `/api/workers` every 3 seconds
- Console tab: Should see no errors

## What to Look For

### ✅ Success Indicators:
- Log shows: "Web GUI bridge enabled"
- Dashboard shows your worker
- Heartbeat updates every 30 seconds
- Progress updates appear
- Connection status indicator shows green in GOLIAT GUI

### ❌ Failure Indicators:
- No "Web GUI bridge enabled" message in logs
- Worker doesn't appear on dashboard
- Connection status indicator shows red in GOLIAT GUI

## Common Issues

### Missing `requests` Library

If you see "requests library not available":
```bash
pip install requests
```

### Network Connectivity Issues

Test if Railway is accessible:
```bash
# Test if Railway is accessible
curl https://goliat-monitoring.up.railway.app/api/workers

# Should return JSON (empty array if no workers)
```

### Database Migration Issues

If you see database errors:
- Check Railway dashboard for build errors
- Verify PostgreSQL service is running
- Migrations run automatically during build

### Connection Status Indicator

Check the GOLIAT GUI top-right corner:
- **Green dot** = Connected to dashboard
- **Red dot** = Disconnected (check network/Railway status)

## Still Not Working?

### Check Railway Deployment

1. Go to [railway.app](https://railway.app)
2. Find your project → Next.js service
3. Check build status:
   - 🟢 **Successful** = Should work
   - 🟡 **Building** = Wait a few minutes
   - 🔴 **Failed** = Check build logs

### Check Railway Logs

In Railway dashboard:
1. Go to your Next.js service
2. Click "Deploy" tab
3. Click on latest deployment
4. Check logs for errors

### Verify Database Migrations

Migrations should run automatically during build. If you see database errors:
1. Check Railway build logs
2. Verify PostgreSQL service is running
3. Try manually redeploying

## Next Steps

Once your worker appears:
1. You'll see it update every 3 seconds
2. Status will change from "idle" → "running" → "idle"
3. Progress bars will update in real-time
4. Log messages will appear
5. Connection status indicator in GOLIAT GUI will show green


