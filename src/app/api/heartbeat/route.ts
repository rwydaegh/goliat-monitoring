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
        // Find or create worker
        let worker = await prisma.worker.findUnique({
          where: { ipAddress: machineId }
        })

        if (!worker) {
          worker = await prisma.worker.create({
            data: {
              ipAddress: machineId,
              hostname: hostname || null,
              gpuName: gpuName || null,
              cpuCores: cpuCores || null,
              totalRamGB: totalRamGB || null,
              status: 'IDLE'
            }
          })
        } else {
          // Update worker with system info
          await prisma.worker.update({
            where: { ipAddress: machineId },
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

    const worker = await prisma.worker.findUnique({
      where: { ipAddress },
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
        where: { ipAddress },
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