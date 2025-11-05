# Railway Deployment Guide

## 🚀 Railway Deployment for Beginners

This guide will walk you through deploying GOLIAT Monitoring Dashboard to Railway step by step.

### Prerequisites
- GitHub account with the goliat-monitoring repository
- Railway account (free at [railway.app](https://railway.app))

## Step 1: Connect GitHub to Railway

1. Go to [railway.app](https://railway.app) and sign up/login
2. Click **"Deploy from GitHub repo"**
3. Select your **goliat-monitoring** repository
4. Railway will automatically detect it's a Next.js project

## Step 2: Add PostgreSQL Database

1. In your Railway dashboard, click **"Add Service"**
2. Select **"PostgreSQL"** from the database options
3. Railway will automatically create and configure the database
4. Note down the database connection string (you'll see it in the PostgreSQL service)

## Step 3: Configure Environment Variables

1. In your Railway project dashboard, go to **"Variables"** tab
2. Add these environment variables:

```bash
# Database connection (auto-populated by Railway)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Environment
NODE_ENV=production

# Optional: API Key for worker authentication
GOLIAT_API_KEY=your-secret-api-key-here
```

## Step 4: Deploy

1. Railway will automatically start building and deploying
2. Watch the build logs in the Railway dashboard
3. Once complete, you'll get a Railway-provided URL like: `https://your-app-name.railway.app`

## Step 5: Database Migrations (Automatic)

**Database migrations run automatically during the build process!** No manual steps needed.

The build script includes:
```json
"build": "prisma migrate deploy && prisma generate && next build"
```

Railway will automatically:
1. Run migrations on deploy
2. Generate Prisma client
3. Build the Next.js app

## Step 6: Test Your Deployment

1. Visit your Railway URL
2. You should see the dashboard with sample data
3. The API endpoints should be working:
   - `https://your-app.railway.app/api/workers`
   - `https://your-app.railway.app/api/heartbeat`

## 🔧 Development Workflow

### Local Development
1. Clone your repository:
   ```bash
   git clone https://github.com/your-username/goliat-monitoring.git
   cd goliat-monitoring
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up local environment:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your local database URL
   ```

4. Run database migrations:
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

### Deploy Changes
1. Make changes to your code
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
3. Railway will automatically redeploy!

## 🎯 Custom Domain (Optional)

1. In Railway dashboard, go to **"Settings"** → **"Domains"**
2. Add your custom domain
3. Follow Railway's DNS configuration instructions

## 💰 Railway Pricing

**Free Tier Includes:**
- 500 compute hours/month
- $5 in monthly credits
- 1GB database storage
- Automatic HTTPS
- Global CDN

**Perfect for:** Development, testing, and small-scale deployments

## 🆘 Troubleshooting

### Build Fails
- Check the build logs in Railway dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version compatibility

### Database Connection Issues
- Verify `DATABASE_URL` environment variable
- Check that PostgreSQL service is running
- Ensure migrations have been applied

### Workers Can't Connect
- Check the heartbeat endpoint: `https://your-app.railway.app/api/heartbeat`
- Verify CORS settings if needed
- Check worker agent configuration

## Next Steps

1. **Configure Worker Agents**: Set up Python worker agents on your TensorDock VMs
2. **Test Real-time Updates**: Create test super studies and monitor progress
3. **Add Authentication**: Implement API keys or user auth if needed
4. **Customize UI**: Modify the dashboard to your specific needs

Your GOLIAT Monitoring Dashboard is now ready for production! 🎉