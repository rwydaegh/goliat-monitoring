# Running Database Migrations on Railway

Since Railway doesn't have a terminal UI, here are your options:

## Option 1: Automatic via Build Script (Recommended)

The migrations are already included in the `build` script:
```json
"build": "prisma migrate deploy && prisma generate && next build"
```

Railway runs this automatically on deploy. If migrations haven't run yet:
1. **Trigger a new deployment** by pushing a small change, OR
2. **Manually redeploy** in Railway dashboard:
   - Go to your service → Deploy tab
   - Click "Redeploy" or "Deploy Latest"

## Option 2: Install Railway CLI

Install Railway CLI:
```bash
npm install -g @railway/cli
```

Then login and run migrations:
```bash
railway login
railway link  # Link to your project
railway run npx prisma migrate deploy
railway run npx prisma generate
```

## Option 3: Use Railway Dashboard

1. Go to Railway dashboard
2. Select your **Next.js service** (not PostgreSQL)
3. Go to **"Deploy"** tab
4. Look for **"Redeploy"** button
5. Click it - this will trigger a new build which runs migrations automatically

## Quick Fix: Force Redeploy

The easiest way is to trigger a redeploy:
1. Make a small change (like this file)
2. Commit and push
3. Railway will auto-deploy and run migrations

Or manually redeploy from the Railway dashboard.

