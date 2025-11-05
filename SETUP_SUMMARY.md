# GOLIAT Monitoring - Setup Summary

## ✅ What's Been Done

### 1. API Endpoints Fixed
- **`/api/heartbeat`** - Now accepts `machineId` (matches WebGUIBridge API)
- **`/api/gui-update`** - Created to receive GUI messages from WebGUIBridge

### 2. API Compatibility Verified
- WebGUIBridge sends messages with format: `{machineId, message, timestamp}`
- Message types supported:
  - `overall_progress`: `{current, total}`
  - `stage_progress`: `{name, current, total, sub_stage?}`
  - `status`: `{message, log_type}`
  - `profiler_update`: `{eta_seconds}`
  - `finished`: `{}`
  - `fatal_error`: `{message}`

### 3. Documentation Created
- Environment variables guide: `docs/environment-variables-guide.md`

## 🚀 Quick Start for Testing

### Step 1: Get Your Railway URL
1. Go to [railway.app](https://railway.app)
2. Navigate to your goliat-monitoring project
3. Find your Next.js service URL (e.g., `https://your-app.railway.app`)
4. See [docs/find-railway-url.md](docs/find-railway-url.md) for detailed instructions

### Step 2: Set Environment Variables

**In Git Bash:**
```bash
cd goliat
source .bashrc
export GOLIAT_WEBGUI_ENABLED=true
export GOLIAT_MONITORING_URL=https://your-app.railway.app
```

**In PowerShell:**
```powershell
cd goliat
$env:GOLIAT_WEBGUI_ENABLED="true"
$env:GOLIAT_MONITORING_URL="https://your-app.railway.app"
```

### Step 3: Run Test Study
```bash
goliat study test
```

## 📋 Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOLIAT_WEBGUI_ENABLED` | Yes | Enable web monitoring | `true` |
| `GOLIAT_MONITORING_URL` | Yes | Railway dashboard URL | `https://your-app.railway.app` |
| `GOLIAT_MACHINE_ID` | No | Machine identifier (auto-detected if not set) | `192.168.1.100` |
| `OSPARC_API_KEY` | Optional | For cloud execution | `your_api_key` |
| `OSPARC_API_SECRET` | Optional | For cloud execution | `your_api_secret` |
| `DOWNLOAD_EMAIL` | Optional | For phantom downloads | `your_email@example.com` |

## 🔍 What to Expect

### On Your Machine (GOLIAT GUI)
- Normal GUI window opens
- Progress bars, logs, ETA display normally
- Study runs with software kernel (if no GPU)

### On Dashboard (Railway URL)
1. **Worker appears** within 5 seconds with status light
2. **Progress updates** every 2-3 seconds
3. **Log messages** appear in real-time
4. **Status changes**: idle → running → idle when done

## 📚 Documentation Files

- **Environment Variables Guide**: `docs/environment-variables-guide.md`
- **Railway URL Finding**: `docs/find-railway-url.md`
- **Railway Deployment**: `docs/railway-deployment.md`
- **API Specification**: `frontend_plan/api_spec.md`
- **Architecture**: `frontend_plan/architecture.md`

## 🐛 Troubleshooting

### Worker doesn't appear
- Verify `GOLIAT_MONITORING_URL` is correct
- Check `GOLIAT_WEBGUI_ENABLED=true` (not just `true`)
- Ensure Railway dashboard is accessible
- Check GOLIAT logs for WebGUIBridge errors

### No progress updates
- Verify `requests` library: `pip install requests`
- Check browser console (F12) for API errors
- Ensure GUI is running (not headless mode)

### Connection errors
- Verify Railway deployment is successful
- Check Railway environment variables (DATABASE_URL)
- Ensure database migrations have been run

## 🔗 How It Works

1. **GOLIAT Study** runs with GUI enabled
2. **ProgressGUI** initializes WebGUIBridge if env vars are set
3. **QueueHandler** processes messages and forwards to WebGUIBridge
4. **WebGUIBridge** sends:
   - Heartbeat every 30 seconds → `/api/heartbeat`
   - GUI updates (throttled to 5Hz) → `/api/gui-update`
5. **Dashboard** stores updates in PostgreSQL
6. **Frontend** polls `/api/workers` every 2-3 seconds

## 📝 Next Steps

After verifying the test works:
1. Set up worker agents on TensorDock VMs
2. Create super-studies via dashboard
3. Monitor multiple workers simultaneously

See `frontend_plan/implementation_plan.md` for detailed roadmap.

