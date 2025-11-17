#!/usr/bin/env node

const { execSync } = require('child_process');
const { setTimeout } = require('timers/promises');

const MAX_RETRIES = 5;
const INITIAL_DELAY = 2000; // 2 seconds

function maskDatabaseUrl(url) {
  if (!url) return '(not set)';
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.username}:****@${urlObj.hostname}:${urlObj.port}${urlObj.pathname}`;
  } catch {
    // If URL parsing fails, mask password manually
    return url.replace(/:([^:@]+)@/, ':****@');
  }
}

async function runMigrationsWithRetry() {
  const dbUrl = process.env.DATABASE_URL;
  console.log('Waiting for database to be ready...\n');
  console.log('DATABASE_URL:', maskDatabaseUrl(dbUrl));
  console.log('');

  if (!dbUrl) {
    console.error('✗ ERROR: DATABASE_URL environment variable is not set!');
    console.error('Please set DATABASE_URL in your Railway app service variables.');
    process.exit(1);
  }

  let delay = INITIAL_DELAY;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`Attempt ${attempt}/${MAX_RETRIES}: Running migrations...`);
    
    try {
      execSync('npx prisma migrate deploy', { 
        stdio: 'inherit',
        env: process.env 
      });
      console.log('\n✓ Migrations completed successfully!\n');
      return true;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error('\n✗ ERROR: Failed to run migrations after', MAX_RETRIES, 'attempts\n');
        console.error('Current DATABASE_URL:', maskDatabaseUrl(dbUrl));
        console.error('\nPlease check in Railway dashboard:');
        console.error('1. PostgreSQL service status:');
        console.error('   - Go to your PostgreSQL service');
        console.error('   - Ensure it shows "Running" (not "Paused" or "Stopped")');
        console.error('   - If paused, click "Start" or "Restart"');
        console.error('2. After database resize, the service may need a restart');
        console.error('3. Verify DATABASE_URL in your app service Variables tab');
        console.error('   - Should be: ${{Postgres.DATABASE_URL}}');
        console.error('   - Or copy the full URL from PostgreSQL service Variables');
        console.error('4. Ensure app service is linked to PostgreSQL service');
        console.error('5. Wait 1-2 minutes after starting/restarting database');
        process.exit(1);
      }
      
      console.log(`Migration failed, retrying in ${delay / 1000}s...\n`);
      await setTimeout(delay);
      delay *= 2; // Exponential backoff
    }
  }
}

async function start() {
  await runMigrationsWithRetry();
  
  console.log('Starting Next.js application...\n');
  execSync('next start', { 
    stdio: 'inherit',
    env: process.env 
  });
}

start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

