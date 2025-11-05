# Environment Variables Guide

## Web Monitoring (Hardcoded)

**Note:** Web monitoring is now **hardcoded** into GOLIAT. No environment variables are needed for basic monitoring functionality.

The dashboard URL is automatically set to: `https://goliat-monitoring.up.railway.app`

## Optional Environment Variables

### For Cloud Execution (oSPARC)

If you're using cloud execution via oSPARC:

```bash
export OSPARC_API_KEY=your_api_key
export OSPARC_API_SECRET=your_api_secret
```

### For Phantom Downloads

If phantom downloads require an email:

```bash
export DOWNLOAD_EMAIL=your_email@example.com
```

## Connection Status Indicator

The GOLIAT GUI now shows a connection status indicator in the top-right corner:
- **Green dot** = Connected to dashboard ✅
- **Red dot** = Disconnected (check network/Railway status) ❌

This helps you verify that web monitoring is working without checking logs.

## Verifying Connection

1. **In GOLIAT GUI**: Look for green/red indicator in top-right corner
2. **In Logs**: Look for "Web GUI bridge enabled" message
3. **On Dashboard**: Worker should appear within 5-10 seconds

## Troubleshooting

See [troubleshooting guide](./troubleshooting-worker-not-appearing.md) for more help.


