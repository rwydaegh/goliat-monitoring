import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ipAddress, status, stage, progress, eta } = body

    if (!ipAddress) {
      return NextResponse.json(
        { error: 'IP address is required' },
        { status: 400 }
      )
    }

    // Find or create worker
    let worker = await prisma.worker.findUnique({
      where: { ipAddress }
    })

    if (!worker) {
      worker = await prisma.worker.create({
        data: {
          ipAddress,
          status: status || 'IDLE'
        }
      })
    }

    // Update worker's last seen and status
    await prisma.worker.update({
      where: { ipAddress },
      data: {
        status: status || 'IDLE',
        lastSeen: new Date()
      }
    })

    // Update GUI state if provided
    if (stage !== undefined && progress !== undefined) {
      await prisma.guiState.upsert({
        where: { workerId: worker.id },
        update: {
          stage: stage || '',
          progress: progress || 0,
          eta: eta ? new Date(eta) : null,
          status: status || 'IDLE',
          updatedAt: new Date()
        },
        create: {
          workerId: worker.id,
          stage: stage || '',
          progress: progress || 0,
          eta: eta ? new Date(eta) : null,
          status: status || 'IDLE',
          logMessages: []
        }
      })
    }

    return NextResponse.json({ success: true })
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