import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workerId } = await params

    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
      include: {
        guiState: {
          orderBy: {
            updatedAt: 'desc'
          },
          take: 1
        }
      }
    })

    if (!worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      )
    }

    // Check if worker is stale (RUNNING but no heartbeat for >15 seconds)
    const now = new Date()
    const fifteenSecondsAgo = new Date(now.getTime() - 15 * 1000)
    let workerStatus = worker.status

    if (worker.status === 'RUNNING' && worker.lastSeen < fifteenSecondsAgo) {
      workerStatus = 'IDLE'
      // Update database
      await prisma.worker.update({
        where: { id: workerId },
        data: { status: 'IDLE' }
      })
    }

    // Get latest GUI state (should only be one due to unique constraint, but handle as array)
    const latestGuiState = Array.isArray(worker.guiState) && worker.guiState.length > 0
      ? worker.guiState[0]
      : null

    return NextResponse.json({
      worker: {
        id: worker.id,
        ipAddress: worker.ipAddress,
        hostname: worker.hostname,
        status: workerStatus,
        lastSeen: worker.lastSeen,
        machineLabel: worker.machineLabel
      },
      guiState: latestGuiState ? {
        id: latestGuiState.id,
        workerId: latestGuiState.workerId,
        stage: latestGuiState.stage,
        progress: latestGuiState.progress,
        stageProgress: latestGuiState.stageProgress || 0,
        logMessages: latestGuiState.logMessages,
        eta: latestGuiState.eta,
        status: latestGuiState.status,
        warningCount: latestGuiState.warningCount || 0,
        errorCount: latestGuiState.errorCount || 0,
        updatedAt: latestGuiState.updatedAt
      } : null
    })
  } catch (error) {
    console.error('Error fetching worker details:', error)
    return NextResponse.json(
      { error: 'Failed to fetch worker details' },
      { status: 500 }
    )
  }
}

