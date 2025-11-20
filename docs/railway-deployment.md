# Railway deployment

Step-by-step guide for deploying the monitoring dashboard to Railway.

## Prerequisites

- GitHub account with access to goliat-monitoring repository
- Railway account (free at [railway.app](https://railway.app))

## Step 1: Connect GitHub to Railway

1. Go to [railway.app](https://railway.app) and sign up/login
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your goliat-monitoring repository
4. Railway automatically detects Next.js project

## Step 2: Add PostgreSQL database

1. In Railway dashboard, click "Add Service"
2. Select "PostgreSQL" from database options
3. Railway creates and configures database automatically
4. Connection string available in PostgreSQL service variables

## Step 3: Configure environment variables

Railway automatically links PostgreSQL connection string. Verify in "Variables" tab:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}  # Auto-populated
NODE_ENV=production
```

No other environment variables required for basic operation.

## Step 4: Deploy

1. Railway automatically starts building and deploying
2. Watch build logs in Railway dashboard
3. Once complete, Railway provides URL: `https://your-app-name.railway.app`

## Step 5: Database migrations

Migrations run automatically when the application starts. The `start` script includes:

```json
"start": "prisma migrate deploy && next start"
```

This ensures migrations run after the build completes and the database is accessible, keeping the database up-to-date on every deployment.

## Step 6: Test deployment

1. Visit your Railway URL
2. Dashboard should load (empty if no workers)
3. Test API endpoints:
   - `https://your-app.railway.app/api/workers` (should return `[]`)
   - `https://your-app.railway.app/api/heartbeat` (should return error without params)

## Custom domain

1. In Railway dashboard: Settings → Domains
2. Add custom domain
3. Follow Railway DNS configuration instructions
4. Update `GOLIAT_MONITORING_URL` environment variable on workers if needed

## Railway pricing

Free tier includes:
- 500 compute hours/month
- $5 in monthly credits
- PostgreSQL database (1GB storage)
- Automatic HTTPS
- Global CDN

Sufficient for development and small-scale deployments.

## Troubleshooting

### Build fails

- Check build logs in Railway dashboard
- Verify all dependencies in `package.json`
- Check Node.js version compatibility (Next.js 14 requires Node 18+)

### Database connection issues

- Verify `DATABASE_URL` environment variable exists
- Check PostgreSQL service is running
- Ensure migrations completed (check build logs)

### Workers can't connect

- Test heartbeat endpoint: `https://your-app.railway.app/api/heartbeat`
- Verify dashboard URL is accessible from worker machines
- Check CORS settings if needed (not required by default)

### Migrations not running

- Check build logs for Prisma errors
- Verify PostgreSQL service is running
- Try manual redeploy: Deploy tab → Redeploy

## Deploying changes

1. Make code changes
2. Commit and push to GitHub
3. Railway automatically redeploys

## Next steps

1. Configure workers: Set `GOLIAT_MONITORING_URL` environment variable on worker machines (optional, defaults to `https://monitor.goliat.waves-ugent.be`)
2. Test monitoring: Run a GOLIAT study and verify worker appears on dashboard
3. Create super study: Test distributed execution workflow
4. Monitor results: Verify result file uploads and downloads work
