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

- Check Railway build logs for Prisma errors
- Verify PostgreSQL service is running
- Ensure database connection string is correct
