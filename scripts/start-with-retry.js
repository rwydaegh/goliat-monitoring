#!/usr/bin/env node

const { execSync } = require('child_process');
const { setTimeout } = require('timers/promises');

const MAX_RETRIES = 5;
const INITIAL_DELAY = 2000; // 2 seconds

async function runMigrationsWithRetry() {
  console.log('Waiting for database to be ready...\n');

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
        console.error('Please check:');
        console.error('1. PostgreSQL service is running in Railway');
        console.error('2. DATABASE_URL environment variable is set correctly');
        console.error('3. Database service is not paused');
        console.error('4. Database service is linked to your app service');
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

