import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
      const body = await request.json()
      // Support both machineId (from WebGUIBridge) and ipAddress (backward compatibility)
      const machineId = body.machineId || body.ipAddress
      const { gpuName, cpuCores, totalRamGB, hostname } = body

      if (!machineId) {
        return NextResponse.json(
          { error: 'machineId is required' },
          { status: 400 }
        )
      }

      try {
        // Check for existing non-stale workers with same IP
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
        
        // If found but idle for 10+ minutes, mark as stale (catches old workers)
        if (worker && worker.lastSeen < tenMinutesAgo && worker.status === 'IDLE') {
          await prisma.worker.update({
            where: { id: worker.id },
            data: { isStale: true }
          })
          worker = null // Force creation of new worker
        }

        // Priority 2: Check for recent workers with RUNNING assignments (likely from claim)
        // This handles IP changes between claim and GUI start
        if (!worker && hostname) {
          const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
          
          // Look for recent workers with RUNNING assignments that don't have a hostname yet
          // (barebones workers created during claim)
          const recentWorkerWithAssignment = await prisma.worker.findFirst({
            where: {
              isStale: false,
              createdAt: {
                gte: twoMinutesAgo // Created within last 2 minutes
              },
              assignments: {
                some: {
                  status: 'RUNNING'
                }
              },
              // Match workers that don't have hostname (barebones from claim)
              // OR haven't been updated recently (old matching logic)
              OR: [
                { hostname: null },
                { hostname: '' },
                { lastSeen: { lt: new Date(Date.now() - 30 * 1000) } }
              ]
            },
            orderBy: {
              createdAt: 'desc'
            }
          })

          if (recentWorkerWithAssignment) {
            // Use this worker, update its IP and hostname
            worker = await prisma.worker.update({
              where: { id: recentWorkerWithAssignment.id },
              data: {
                ipAddress: machineId,
                hostname: hostname
              }
            })
          }
        }

        // Priority 3: If no worker found by IP or recent assignment, try matching by hostname
        // This handles VPN IP changes where the same machine gets a different IP
        if (!worker && hostname) {
          worker = await prisma.worker.findFirst({
            where: {
              hostname: hostname,
              isStale: false,
              lastSeen: {
                gte: fiveMinutesAgo // Only match if seen recently (within 5 min)
              }
            },
            orderBy: {
              lastSeen: 'desc'
            }
          })

          // If found by hostname, update its IP to the new one
          if (worker) {
            await prisma.worker.update({
              where: { id: worker.id },
              data: {
                ipAddress: machineId // Update to new IP
              }
            })
          }
        }

        // If worker exists but hasn't been seen in 5 minutes, mark as stale
        if (worker && worker.lastSeen < fiveMinutesAgo) {
          // Mark old worker as stale (assignments will be transferred to new worker below)
          await prisma.worker.update({
            where: { id: worker.id },
            data: { isStale: true }
          })
          worker = null // Force creation of new worker
        }

        if (!worker) {
          // Create new worker with new session
          worker = await prisma.worker.create({
            data: {
              ipAddress: machineId,
              hostname: hostname || null,
              gpuName: gpuName || null,
              cpuCores: cpuCores || null,
              totalRamGB: totalRamGB || null,
              status: 'IDLE',
              isStale: false
            }
          })

          // Transfer any RUNNING assignments from stale workers with same IP OR hostname to this new worker
          const staleWorkers = await prisma.worker.findMany({
            where: {
              OR: [
                { ipAddress: machineId, isStale: true },
                ...(hostname ? [{ hostname: hostname, isStale: true }] : [])
              ]
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
        } else {
          // Update existing active worker with system info
          await prisma.worker.update({
            where: { id: worker.id },
            data: {
              lastSeen: new Date(),
              hostname: hostname || worker.hostname,
              gpuName: gpuName || worker.gpuName,
              cpuCores: cpuCores !== undefined ? cpuCores : worker.cpuCores,
              totalRamGB: totalRamGB !== undefined ? totalRamGB : worker.totalRamGB
            }
          })
        }

      return NextResponse.json({ 
        success: true,
        timestamp: new Date().toISOString()
      })
    } catch (dbError) {
      console.error('Database error in heartbeat:', dbError)
      // Return error but log details
      return NextResponse.json(
        { 
          error: 'Database error',
          details: dbError instanceof Error ? dbError.message : String(dbError)
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error updating heartbeat:', error)
    return NextResponse.json(
      { error: 'Failed to update heartbeat' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const ipAddress = request.nextUrl.searchParams.get('ipAddress')

    if (!ipAddress) {
      return NextResponse.json(
        { error: 'IP address parameter is required' },
        { status: 400 }
      )
    }

    // Find most recent non-stale worker with this IP
    const worker = await prisma.worker.findFirst({
      where: {
        ipAddress,
        isStale: false
      },
      orderBy: {
        lastSeen: 'desc'
      },
      include: {
        guiState: true,
        assignments: {
          where: {
            status: 'RUNNING'
          }
        }
      }
    })

    if (!worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      )
    }

    // Check if worker is offline (no heartbeat in 30 seconds)
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000)
    const isOffline = worker.lastSeen < thirtySecondsAgo

    if (isOffline && worker.status !== 'OFFLINE') {
      await prisma.worker.update({
        where: { id: worker.id },
        data: { status: 'OFFLINE' }
      })
    }

    return NextResponse.json({
      ...worker,
      isOffline
    })
  } catch (error) {
    console.error('Error fetching heartbeat:', error)
    return NextResponse.json(
      { error: 'Failed to fetch heartbeat' },
      { status: 500 }
    )
  }
}