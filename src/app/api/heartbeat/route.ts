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
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000)
        let worker = await prisma.worker.findFirst({
          where: {
            ipAddress: machineId,
            isStale: false
          },
          orderBy: {
            lastSeen: 'desc'
          }
        })

        // If worker exists but hasn't been seen in 1 minute, mark as stale
        if (worker && worker.lastSeen < oneMinuteAgo) {
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