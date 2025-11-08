# Database migrations

Migrations run automatically during Railway deployment. The `build` script includes:

```json
"build": "prisma migrate deploy && prisma generate && next build"
```

No manual steps required.

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
