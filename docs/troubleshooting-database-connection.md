# Troubleshooting Database Connection Issues

If you see errors like `P1001: Can't reach database server`, follow these steps:

## Step 1: Check Database Service Status

1. Go to your Railway project dashboard
2. Find your **PostgreSQL** service
3. Check if it shows as **"Running"** (green) or **"Paused"** (gray)

### If Database is Paused

When Railway runs out of credits, services are automatically paused. After adding credits:

1. Click on your PostgreSQL service
2. Click **"Start"** or **"Restart"** button
3. Wait for the service to fully start (usually 10-30 seconds)
4. Your app service will automatically retry connections

## Step 2: Verify Service Linking

Ensure your app service is linked to the database:

1. Go to your **app service** (not the database)
2. Click on **"Variables"** tab
3. Look for `DATABASE_URL` variable
4. It should show: `${{Postgres.DATABASE_URL}}` or a full connection string

### If DATABASE_URL is Missing

1. In your app service, go to **"Variables"** tab
2. Click **"New Variable"**
3. Name: `DATABASE_URL`
4. Value: `${{Postgres.DATABASE_URL}}`
5. Or copy the full connection string from your PostgreSQL service's **"Variables"** tab

## Step 3: Verify Database Connection String

1. Go to your **PostgreSQL service**
2. Click **"Variables"** tab
3. Copy the `DATABASE_URL` value
4. It should look like: `postgresql://user:password@host:port/database`

Common issues:
- Missing `postgresql://` prefix
- Incorrect port number
- Wrong hostname

## Step 4: Restart App Service

After ensuring database is running and linked:

1. Go to your **app service**
2. Click **"Deploy"** tab
3. Click **"Redeploy"** button
4. Watch the logs - migrations should now succeed

## Step 5: Manual Migration (If Needed)

If automatic migrations still fail, run manually:

### Option 1: Railway CLI
```bash
railway run npx prisma migrate deploy
```

### Option 2: Railway Dashboard
1. Go to your app service
2. Click **"Deploy"** tab
3. Click **"Deploy Logs"** or **"Shell"**
4. Run: `npx prisma migrate deploy`

## Common Causes

1. **Database paused**: Most common after running out of credits
2. **Services not linked**: App service can't access database
3. **Wrong DATABASE_URL**: Connection string is incorrect
4. **Database still starting**: Wait 30-60 seconds after starting
5. **Network issues**: Temporary Railway infrastructure problems

## Retry Logic

The application now includes automatic retry logic:
- Retries migrations up to 5 times
- Exponential backoff (2s, 4s, 8s, 16s, 32s)
- Clear error messages if all retries fail

If you see retry attempts in logs, the database is likely starting up. Wait for it to complete.

## Still Having Issues?

1. Check Railway status page: https://status.railway.app
2. Verify you have sufficient credits
3. Check Railway community forums
4. Contact Railway support if service is down

