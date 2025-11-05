# Environment Variables Setup Guide for GOLIAT Study Test

This guide helps you set up the environment variables needed to run `goliat study test` with web monitoring enabled.

## Required Environment Variables

### For Web Monitoring (Dashboard Integration)

These variables enable GOLIAT to send progress updates to the monitoring dashboard:

```bash
# Enable web GUI bridge
export GOLIAT_WEBGUI_ENABLED=true

# Railway dashboard URL (replace with your actual Railway URL)
export GOLIAT_MONITORING_URL=https://your-app-name.railway.app

# Machine ID (optional - will auto-detect IP if not set)
export GOLIAT_MACHINE_ID=your-ip-address
```

### Optional: For Cloud Execution (oSPARC)

If you're using cloud execution via oSPARC, you'll also need:

```bash
export OSPARC_API_KEY=your_api_key
export OSPARC_API_SECRET=your_api_secret
```

### Optional: For Phantom Downloads

If phantom downloads require an email:

```bash
export DOWNLOAD_EMAIL=your_email@example.com
```

## Quick Setup (Windows Git Bash)

From the `goliat/` directory:

```bash
# Navigate to goliat directory
cd goliat

# Source bashrc (if you have environment setup there)
source .bashrc

# Set environment variables
export GOLIAT_WEBGUI_ENABLED=true
export GOLIAT_MONITORING_URL=https://your-app-name.railway.app

# Optional: Set machine ID manually (or let it auto-detect)
# export GOLIAT_MACHINE_ID=$(hostname -I | awk '{print $1}')

# Run the test study
goliat study test
```

## Quick Setup (Windows PowerShell)

```powershell
# Navigate to goliat directory
cd goliat

# Set environment variables
$env:GOLIAT_WEBGUI_ENABLED="true"
$env:GOLIAT_MONITORING_URL="https://your-app-name.railway.app"

# Run the test study
goliat study test
```

## Quick Setup (Windows CMD)

```cmd
REM Navigate to goliat directory
cd goliat

REM Set environment variables
set GOLIAT_WEBGUI_ENABLED=true
set GOLIAT_MONITORING_URL=https://your-app-name.railway.app

REM Run the test study
goliat study test
```

## Using .env File (Recommended)

You can also create a `.env` file in the `goliat/` directory:

```bash
# .env file in goliat/ directory
GOLIAT_WEBGUI_ENABLED=true
GOLIAT_MONITORING_URL=https://your-app-name.railway.app

# Optional
GOLIAT_MACHINE_ID=auto-detect
OSPARC_API_KEY=your_api_key
OSPARC_API_SECRET=your_api_secret
DOWNLOAD_EMAIL=your_email@example.com
```

**Note:** GOLIAT doesn't automatically load `.env` files. You'll need to use a tool like `dotenv` or set them manually in your shell.

## Finding Your Railway URL

1. Go to [railway.app](https://railway.app) and login
2. Click on your project (goliat-monitoring)
3. Click on your Next.js service (not PostgreSQL)
4. Look for the URL in Settings → Domains or Deploy tab
5. The URL will look like: `https://your-app-name.railway.app`

See [docs/find-railway-url.md](../docs/find-railway-url.md) for detailed instructions.

## Verifying Setup

After setting environment variables, verify they're set:

```bash
# In Git Bash
echo $GOLIAT_WEBGUI_ENABLED
echo $GOLIAT_MONITORING_URL

# In PowerShell
echo $env:GOLIAT_WEBGUI_ENABLED
echo $env:GOLIAT_MONITORING_URL

# In CMD
echo %GOLIAT_WEBGUI_ENABLED%
echo %GOLIAT_MONITORING_URL%
```

## What Happens When You Run

1. **GOLIAT GUI opens** - Normal GUI window appears on your screen
2. **WebGUIBridge starts** - Connects to Railway dashboard
3. **Heartbeat sent** - Every 30 seconds to `/api/heartbeat`
4. **Progress updates** - GUI messages forwarded to `/api/gui-update`
5. **Dashboard updates** - You can see progress on the web dashboard

## Troubleshooting

### Worker doesn't appear on dashboard
- Check `GOLIAT_MONITORING_URL` is set correctly
- Check `GOLIAT_WEBGUI_ENABLED=true` (not just `true`)
- Verify Railway dashboard is accessible
- Check GOLIAT logs for WebGUIBridge errors

### No progress updates
- Verify `requests` library is installed: `pip install requests`
- Check browser console (F12) for API errors
- Verify network connectivity to Railway
- Check that GUI is running (not headless mode)

### Connection errors
- Make sure Railway dashboard is deployed and accessible
- Check Railway build logs for errors
- Verify DATABASE_URL is set in Railway environment variables
- Ensure database migrations have been run

## Expected Behavior

When running `goliat study test` with web monitoring enabled:

1. **In GOLIAT GUI**: Normal progress bars, logs, ETA
2. **On Dashboard**: 
   - Worker appears within 5 seconds
   - Status light turns green (running)
   - Progress bars update every 2-3 seconds
   - Log messages appear in real-time
   - Status changes: idle → running → idle when done

## Next Steps

After verifying the test works:
1. Set up worker agents on TensorDock VMs
2. Create super-studies via dashboard
3. Monitor multiple workers simultaneously

See [frontend_plan/implementation_plan.md](../frontend_plan/implementation_plan.md) for more details.

