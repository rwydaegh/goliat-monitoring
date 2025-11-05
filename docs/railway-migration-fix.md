# 🚀 Railway Database Migration - Working Methods

## Method 1: Modify package.json (Recommended!)

Since the web terminal isn't available, let's automate the migrations during build:

### Step 1: Update package.json
Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "build": "next build",
    "migrate": "prisma migrate deploy",
    "postinstall": "prisma generate",
    "start": "next start"
  },
  "postinstall": "prisma generate"
}
```

### Step 2: Railway Will Run Automatically
Railway will now:
1. Install dependencies → runs `postinstall` → generates Prisma client
2. Build the app → runs `build`
3. Deploy → your database is ready!

---

## Method 2: Create Migration Script

Create a file called `prisma-migrate.js` in your root:

```javascript
const { execSync } = require('child_process');

console.log('Running database migrations...');

try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('✅ Migrations completed successfully!');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}
```

Update your `package.json`:

```json
{
  "scripts": {
    "build": "node prisma-migrate.js && next build"
  }
}
```

---

## Method 3: Environment Variable Check

Make sure your Variables tab has this:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
```

---

## 🔧 Quick Fix Right Now

1. **Go to your repository**: https://github.com/rwydaegh/goliat-monitoring
2. **Edit package.json**
3. **Add the `postinstall` script**
4. **Commit and push**
5. **Railway will redeploy automatically** with migrations!

---

## ✅ Test After Fix

1. **Visit your Railway URL**
2. **Go to**: `https://your-app.railway.app/api/workers`
3. **Should return**: `[]` (empty array, but no errors)

---

Let me update your package.json file right now to fix this!