// Script to drop the ipAddress unique index
// Run with: npx @railway/cli run node scripts/drop-ipaddress-index.js

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('Attempting to drop ipAddress unique index...')
  
  try {
    // Try dropping as index
    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "workers_ipAddress_key"')
    console.log('✓ Dropped index "workers_ipAddress_key"')
  } catch (e) {
    console.log('Index drop result:', e.message)
  }
  
  try {
    // Try dropping as constraint
    await prisma.$executeRawUnsafe('ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_ipAddress_key"')
    console.log('✓ Dropped constraint "workers_ipAddress_key"')
  } catch (e) {
    console.log('Constraint drop result:', e.message)
  }
  
  // Find and drop any unique index on ipAddress
  try {
    const indexes = await prisma.$queryRawUnsafe(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'workers' 
      AND indexdef LIKE '%ipAddress%' 
      AND indexdef LIKE '%UNIQUE%'
    `)
    
    if (indexes && indexes.length > 0) {
      for (const idx of indexes) {
        const indexName = idx.indexname
        console.log(`Found unique index: ${indexName}, dropping...`)
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${indexName}"`)
        console.log(`✓ Dropped index "${indexName}"`)
      }
    } else {
      console.log('No unique indexes on ipAddress found')
    }
  } catch (e) {
    console.log('Index search result:', e.message)
  }
  
  console.log('Done!')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

