# Troubleshooting: Worker Not Appearing on Dashboard

## Issue: Your worker isn't showing up on the dashboard

Based on your logs, the GOLIAT study is running but **WebGUIBridge is not initializing**. This means the environment variables aren't set.

## Quick Fix

You need to set the environment variables **before** running `goliat study test`. Here's how:

### Option 1: Set in Git Bash (Current Session)

```bash
cd goliat
source .bashrc

# Set environment variables
export GOLIAT_WEBGUI_ENABLED=true
export GOLIAT_MONITORING_URL=https://your-railway-url.railway.app

# Verify they're set
echo $GOLIAT_WEBGUI_ENABLED
echo $GOLIAT_MONITORING_URL

# Now run the study
goliat study test --no-cache
```

### Option 2: Set in PowerShell (Current Session)

```powershell
cd goliat

# Set environment variables
$env:GOLIAT_WEBGUI_ENABLED="true"
$env:GOLIAT_MONITORING_URL="https://your-railway-url.railway.app"

# Verify they're set
echo $env:GOLIAT_WEBGUI_ENABLED
echo $env:GOLIAT_MONITORING_URL

# Now run the study
goliat study test --no-cache
```

### Option 3: Add to .bashrc (Persistent)

Add these lines to your `goliat/.bashrc` file:

```bash
export GOLIAT_WEBGUI_ENABLED=true
export GOLIAT_MONITORING_URL=https://your-railway-url.railway.app
```

Then:
```bash
cd goliat
source .bashrc
goliat study test --no-cache
```

## How to Verify It's Working

### 1. Check GOLIAT Logs for WebGUIBridge Messages

After starting the study, look for these messages in your logs:

```
Web GUI bridge enabled: https://your-railway-url.railway.app, machine_id=YOUR_IP
```

If you see this message, the bridge is working!

### 2. Check Dashboard

1. Go to your Railway dashboard URL
2. Refresh the page
3. Your worker should appear within 5-10 seconds
4. The IP address will be your machine's IP (auto-detected)

### 3. Check Browser Console

Open browser dev tools (F12) and check:
- Network tab: Should see calls to `/api/workers` every 3 seconds
- Console tab: Should see no errors

## What to Look For

### ✅ Success Indicators:
- Log shows: "Web GUI bridge enabled"
- Dashboard shows your worker
- Heartbeat updates every 30 seconds
- Progress updates appear

### ❌ Failure Indicators:
- No "Web GUI bridge enabled" message in logs
- Worker doesn't appear on dashboard
- Check that environment variables are actually set

## Common Mistakes

1. **Forgot to export variables** - Variables set in one terminal session don't persist
2. **Wrong URL format** - Must include `https://` and end with `.railway.app`
3. **Typo in variable name** - Must be exactly `GOLIAT_WEBGUI_ENABLED` (case-sensitive)
4. **Value not "true"** - Must be exactly `true` (lowercase string)

## Still Not Working?

### Check Railway URL
1. Go to [railway.app](https://railway.app)
2. Find your project → Next.js service
3. Get the URL from Settings → Domains

### Check Network Connectivity
```bash
# Test if Railway is accessible
curl https://your-railway-url.railway.app/api/workers

# Should return JSON (empty array if no workers)
```

### Check GOLIAT Logs
Look for errors like:
- "Failed to initialize web GUI bridge"
- "requests library not available"
- Network connection errors

### Install requests Library
If you see "requests library not available":
```bash
pip install requests
```

## Next Steps

Once your worker appears:
1. You'll see it update every 3 seconds
2. Status will change from "idle" → "running" → "idle"
3. Progress bars will update in real-time
4. Log messages will appear

