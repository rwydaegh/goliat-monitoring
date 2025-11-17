import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { prisma } from '@/lib/prisma'

/**
 * Manual cleanup endpoint for screenshot directories.
 * Can be called periodically (e.g., via cron job) to clean up old screenshots.
 * 
 * Removes screenshots for:
 * - Workers that don't exist in database
 * - Stale workers (not seen in specified time)
 * - Screenshot directories older than specified time
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const staleThresholdHours = parseInt(searchParams.get('staleThresholdHours') || '1', 10)
    const maxAgeHours = parseInt(searchParams.get('maxAgeHours') || '24', 10)

    const screenshotsBaseDir = join(process.cwd(), 'public', 'gui-screenshots')
    
    if (!existsSync(screenshotsBaseDir)) {
      return NextResponse.json({ 
        success: true, 
        message: 'No screenshots directory found',
        cleaned: 0
      })
    }

    // Get all worker directories
    const workerDirs = await readdir(screenshotsBaseDir, { withFileTypes: true })
    
    // Get all active workers from database
    const staleThreshold = new Date(Date.now() - staleThresholdHours * 60 * 60 * 1000)
    const activeWorkers = await prisma.worker.findMany({
      where: {
        isStale: false,
        lastSeen: {
          gte: staleThreshold
        }
      },
      select: {
        id: true
      }
    })
    const activeWorkerIds = new Set(activeWorkers.map(w => w.id))

    let cleanedCount = 0
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000

    // Cleanup each worker directory
    const cleanupResults = await Promise.allSettled(
      workerDirs
        .filter(dirent => dirent.isDirectory())
        .map(async (dirent) => {
          const workerId = dirent.name
          const workerDir = join(screenshotsBaseDir, workerId)

          // Check if worker is active
          if (!activeWorkerIds.has(workerId)) {
            // Worker doesn't exist or is stale - remove directory
            await rm(workerDir, { recursive: true, force: true })
            return { workerId, reason: 'inactive_or_stale' }
          }

          // For active workers, check directory age as safety measure
          try {
            const dirStat = await stat(workerDir)
            const maxAgeTime = Date.now() - maxAgeMs
            
            if (dirStat.mtimeMs < maxAgeTime) {
              // Directory hasn't been modified recently
              const files = await readdir(workerDir)
              if (files.length > 0) {
                // Check if any files are recent
                const fileStats = await Promise.all(
                  files.map(f => stat(join(workerDir, f)))
                )
                const hasRecentFiles = fileStats.some(s => s.mtimeMs > maxAgeTime)
                
                if (!hasRecentFiles) {
                  // No recent files, clean up old screenshots
                  await rm(workerDir, { recursive: true, force: true })
                  return { workerId, reason: 'old_screenshots' }
                }
              }
            }
          } catch (err) {
            console.error(`Failed to check directory age for worker ${workerId}:`, err)
          }

          return null // No cleanup needed
        })
    )

    cleanedCount = cleanupResults.filter(
      r => r.status === 'fulfilled' && r.value !== null
    ).length

    return NextResponse.json({
      success: true,
      message: `Cleanup completed`,
      cleaned: cleanedCount,
      total: workerDirs.filter(d => d.isDirectory()).length
    })
  } catch (error) {
    console.error('Error during screenshot cleanup:', error)
    return NextResponse.json(
      {
        error: 'Failed to cleanup screenshots',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

