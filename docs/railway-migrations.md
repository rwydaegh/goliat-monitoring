# Database migrations

Migrations run automatically when the application starts on Railway. The `start` script includes:

```json
"start": "prisma migrate deploy && next start"
```

This ensures migrations run after the build completes and the database is accessible. No manual steps required.

## Manual migration (if needed)

If migrations fail or you need to run manually:

Option 1: Railway CLI
```bash
railway run npx prisma migrate deploy
railway run npx prisma generate
```

Option 2: Trigger redeploy (Railway dashboard → Deploy tab → Redeploy)

Option 3: Make a small change, commit and push (triggers automatic redeploy)

## Verification

After deployment, verify migrations worked:
- Visit `https://your-app.railway.app/api/workers`
- Should return JSON (empty array `[]` if no workers, but no errors)

## Troubleshooting

If migrations fail with `P1001: Can't reach database server`:

1. **Check database service**: Ensure PostgreSQL service is running (not paused) in Railway
2. **Verify linking**: Check that `DATABASE_URL` is set in your app service variables
3. **Wait for retries**: The app automatically retries migrations up to 5 times with exponential backoff
4. **Restart database**: If paused, click "Start" on your PostgreSQL service in Railway

See [Database Connection Troubleshooting](./troubleshooting-database-connection.md) for detailed steps.
