import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assignmentId } = await params
    const body = await request.json()
    const { machineId } = body

    if (!machineId) {
      return NextResponse.json(
        { error: 'machineId is required' },
        { status: 400 }
      )
    }

    // Find or create worker (use most recent non-stale worker)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
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
      worker = null // Force creation of new worker
    }

    if (!worker) {
      // Create new worker with new session
      worker = await prisma.worker.create({
        data: {
          ipAddress: machineId,
          status: 'IDLE',
          isStale: false
        }
      })
    }

    // Claim the assignment
    const assignment = await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        workerId: worker.id,
        status: 'RUNNING',
        startedAt: new Date()
      },
      include: {
        worker: true
      }
    })

    // Update worker status
    await prisma.worker.update({
      where: { id: worker.id },
      data: {
        status: 'RUNNING',
        lastSeen: new Date()
      }
    })

    // Update super study status if needed
    await prisma.superStudy.update({
      where: { id: assignment.superStudyId },
      data: {
        status: 'RUNNING'
      }
    })

    return NextResponse.json(assignment)
  } catch (error) {
    console.error('Error claiming assignment:', error)
    return NextResponse.json(
      {
        error: 'Failed to claim assignment',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

