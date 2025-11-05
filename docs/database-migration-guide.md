# 🚀 Database Migration - No CLI Required!

## Option 1: Use Railway Web Terminal (Easier!)

Since CLI installation is having issues on Windows, let's use Railway's built-in terminal:

### Step 1: Open Railway Web Terminal
1. Go to your Railway dashboard
2. Find your **Next.js service** (not PostgreSQL)
3. Click on it to open the service details
4. Go to **"Deploy"** tab
5. Look for **"Open Terminal"** button
6. Click it - a web terminal will open!

### Step 2: Run Database Commands
In the web terminal, run these commands one by one:

```bash
# Navigate to your app directory (usually /app)
cd /app

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy
```

### Step 3: Test the Database
After migrations complete, test your API:

1. **Visit your Railway URL** (should work now!)
2. **Test API endpoints:**
   - `https://your-app.railway.app/api/workers`
   - `https://your-app.railway.app/api/heartbeat`

---

## Option 2: If Web Terminal Doesn't Work

### Alternative: Use Railway Dashboard Variables
1. In Railway dashboard, go to your **Next.js service**
2. Click **"Variables"** tab
3. Add these if missing:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   NODE_ENV=production
   ```
4. **Redeploy** the service
5. Check if your app now works!

---

## ✅ Success Indicators

- ✅ Migration commands complete without errors
- ✅ Your Railway URL loads the dashboard
- ✅ API endpoints return JSON (even if empty)
- ✅ No "DATABASE_URL" errors

---

## Troubleshooting

**"Command not found" errors?**
- Make sure you're in the right service (Next.js, not PostgreSQL)
- Try `ls` first to see the files

**Database connection errors?**
- Check Variables tab has `DATABASE_URL`
- Make sure PostgreSQL service is running (green status)

**Permission errors?**
- Try `sudo` before commands: `sudo npx prisma migrate deploy`

---

Let me know what you see when you open the web terminal!