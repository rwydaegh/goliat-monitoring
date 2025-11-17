import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir, readdir, stat, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

/**
 * Cleanup old screenshot directories.
 * Removes screenshots for:
 * - Workers that don't exist anymore
 * - Stale workers (not seen in 1 hour)
 * - Screenshot directories older than 24 hours (for safety)
 */
async function cleanupOldScreenshots() {
  try {
    const screenshotsBaseDir = join(process.cwd(), 'public', 'gui-screenshots')
    
    if (!existsSync(screenshotsBaseDir)) {
      return // Nothing to clean
    }

    // Get all worker directories
    const workerDirs = await readdir(screenshotsBaseDir, { withFileTypes: true })
    
    // Get all active workers from database
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const activeWorkers = await prisma.worker.findMany({
      where: {
        isStale: false,
        lastSeen: {
          gte: oneHourAgo
        }
      },
      select: {
        id: true
      }
    })
    const activeWorkerIds = new Set(activeWorkers.map(w => w.id))

    // Cleanup each worker directory
    const cleanupPromises = workerDirs
      .filter(dirent => dirent.isDirectory())
      .map(async (dirent) => {
        const workerId = dirent.name
        const workerDir = join(screenshotsBaseDir, workerId)

        // Check if worker is active
        if (!activeWorkerIds.has(workerId)) {
          // Worker doesn't exist or is stale - remove directory
          try {
            await rm(workerDir, { recursive: true, force: true })
            console.log(`Cleaned up screenshots for inactive worker: ${workerId}`)
          } catch (err) {
            console.error(`Failed to remove directory for worker ${workerId}:`, err)
          }
          return
        }

        // For active workers, check directory age as safety measure
        // (in case worker exists but screenshots are very old)
        try {
          const dirStat = await stat(workerDir)
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
          
          if (dirStat.mtimeMs < oneDayAgo) {
            // Directory hasn't been modified in 24 hours, but worker is active
            // This shouldn't happen normally, but clean up as safety measure
            const files = await readdir(workerDir)
            if (files.length > 0) {
              // Check if any files are recent
              const fileStats = await Promise.all(
                files.map(f => stat(join(workerDir, f)))
              )
              const hasRecentFiles = fileStats.some(s => s.mtimeMs > oneDayAgo)
              
              if (!hasRecentFiles) {
                // No recent files, clean up old screenshots
                await rm(workerDir, { recursive: true, force: true })
                console.log(`Cleaned up old screenshots for worker: ${workerId}`)
              }
            }
          }
        } catch (err) {
          console.error(`Failed to check directory age for worker ${workerId}:`, err)
        }
      })

    await Promise.all(cleanupPromises)
  } catch (error) {
    console.error('Error during screenshot cleanup:', error)
    // Don't throw - cleanup is best effort
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const machineId = formData.get('machineId') as string

    if (!machineId) {
      return NextResponse.json(
        { error: 'machineId is required' },
        { status: 400 }
      )
    }

    // Find or create worker (same logic as gui-update)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    let worker = await prisma.worker.findFirst({
      where: {
        ipAddress: machineId,
        isStale: false
      },
      orderBy: {
        lastSeen: 'desc'
      }
    })

    // If worker exists but hasn't been seen in 5 minutes, mark as stale
    if (worker && worker.lastSeen < fiveMinutesAgo) {
      await prisma.worker.update({
        where: { id: worker.id },
        data: { isStale: true }
      })
      worker = null
    }
    
    // Also check if worker is idle for 10+ minutes - mark as stale
    if (worker && worker.lastSeen < tenMinutesAgo && worker.status === 'IDLE') {
      await prisma.worker.update({
        where: { id: worker.id },
        data: { isStale: true }
      })
      worker = null
    }

    if (!worker) {
      // Before creating new worker, check if there's a very recent worker with RUNNING assignment
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
      const recentWorkerWithAssignment = await prisma.worker.findFirst({
        where: {
          isStale: false,
          createdAt: {
            gte: twoMinutesAgo
          },
          assignments: {
            some: {
              status: 'RUNNING'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      if (recentWorkerWithAssignment) {
        worker = await prisma.worker.update({
          where: { id: recentWorkerWithAssignment.id },
          data: {
            ipAddress: machineId
          }
        })
      } else {
        // Create new worker
        worker = await prisma.worker.create({
          data: {
            ipAddress: machineId,
            status: 'IDLE',
            isStale: false
          }
        })

        // Transfer any RUNNING assignments from stale workers with same IP
        const staleWorkers = await prisma.worker.findMany({
          where: {
            ipAddress: machineId,
            isStale: true
          }
        })

        for (const staleWorker of staleWorkers) {
          await prisma.assignment.updateMany({
            where: {
              workerId: staleWorker.id,
              status: 'RUNNING'
            },
            data: {
              workerId: worker.id
            }
          })
        }
      }
    }

    // Update worker lastSeen
    await prisma.worker.update({
      where: { id: worker.id },
      data: {
        lastSeen: new Date()
      }
    })

    // Process screenshot files
    const screenshotsDir = join(process.cwd(), 'public', 'gui-screenshots', worker.id)
    
    // Create directory if it doesn't exist
    if (!existsSync(screenshotsDir)) {
      await mkdir(screenshotsDir, { recursive: true })
    }

    // Extract all file fields from formData (excluding machineId)
    const fileFields: Array<{ name: string; file: File }> = []
    // Use Array.from() to iterate over FormData entries (compatible with TypeScript compilation)
    const entries = Array.from(formData.entries())
    for (const [key, value] of entries) {
      if (key !== 'machineId' && value instanceof File) {
        // Convert tab name back from field name (replace underscores with spaces)
        const tabName = key.replace(/_/g, ' ')
        fileFields.push({ name: tabName, file: value })
      }
    }

    // Write each screenshot file
    const writePromises = fileFields.map(async ({ name, file }) => {
      try {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const filename = `${name.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`
        const filepath = join(screenshotsDir, filename)
        await writeFile(filepath, buffer)
      } catch (error) {
        console.error(`Failed to write screenshot for tab "${name}":`, error)
        // Continue with other files even if one fails
      }
    })

    await Promise.all(writePromises)

    // Cleanup old screenshot directories (optional background task)
    // Only run cleanup occasionally to avoid overhead on every request
    if (Math.random() < 0.1) { // 10% chance to run cleanup
      cleanupOldScreenshots().catch(err => {
        console.error('Background screenshot cleanup failed:', err)
        // Don't fail the request if cleanup fails
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing GUI screenshots:', error)
    return NextResponse.json(
      { 
        error: 'Failed to process GUI screenshots',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

