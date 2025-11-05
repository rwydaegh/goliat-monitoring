# Database Migrations on Railway

## Automatic Migrations (Recommended)

**Migrations run automatically during the build process!** No manual steps needed.

The `build` script in `package.json` includes:
```json
"build": "prisma migrate deploy && prisma generate && next build"
```

Railway automatically runs this on every deployment, so your database is always up-to-date.

## Manual Migration (If Needed)

If you need to run migrations manually:

### Option 1: Railway CLI

```bash
npm install -g @railway/cli
railway login
railway link
railway run npx prisma migrate deploy
railway run npx prisma generate
```

### Option 2: Trigger Redeploy

1. Make a small change to any file
2. Commit and push
3. Railway will redeploy and run migrations automatically

### Option 3: Manual Redeploy

1. Go to Railway dashboard
2. Select your Next.js service
3. Go to "Deploy" tab
4. Click "Redeploy" or "Deploy Latest"

## Verification

After deployment, verify migrations worked:
- Visit `https://your-app.railway.app/api/workers`
- Should return JSON (empty array `[]` if no workers, but no errors)
- No database connection errors in Railway logs


