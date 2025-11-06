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

    // If worker is stale, try to find the active worker with the same IP address
    if (worker.isStale) {
      const activeWorker = await prisma.worker.findFirst({
        where: {
          ipAddress: worker.ipAddress,
          isStale: false
        },
        orderBy: {
          lastSeen: 'desc'
        },
        include: {
          guiState: {
            orderBy: {
              updatedAt: 'desc'
            },
            take: 1
          }
        }
      })

      // If we found an active worker, use that instead
      if (activeWorker) {
        const latestGuiState = Array.isArray(activeWorker.guiState) && activeWorker.guiState.length > 0
          ? activeWorker.guiState[0]
          : null

        return NextResponse.json({
          worker: {
            id: activeWorker.id,
            ipAddress: activeWorker.ipAddress,
            hostname: activeWorker.hostname,
            status: activeWorker.status,
            lastSeen: activeWorker.lastSeen,
            machineLabel: activeWorker.machineLabel,
            gpuName: activeWorker.gpuName,
            cpuCores: activeWorker.cpuCores,
            totalRamGB: activeWorker.totalRamGB,
            createdAt: activeWorker.createdAt
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
          } : null,
          redirectedFromStale: true,
          staleWorkerId: worker.id
        })
      }
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
        machineLabel: worker.machineLabel,
        gpuName: worker.gpuName,
        cpuCores: worker.cpuCores,
        totalRamGB: worker.totalRamGB,
        createdAt: worker.createdAt
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workerId } = await params

    // Find all assignments for this worker before deleting
    const assignments = await prisma.assignment.findMany({
      where: { workerId },
      include: {
        superStudy: true
      }
    })

    // Unassign all assignments (reset to PENDING, clear workerId, reset progress)
    const assignmentUpdates = assignments.map(assignment =>
      prisma.assignment.update({
        where: { id: assignment.id },
        data: {
          workerId: null,
          status: 'PENDING',
          progress: 0,
          currentStage: null,
          eta: null,
          startedAt: null,
          completedAt: null
        }
      })
    )

    // Wait for all assignment updates to complete
    await Promise.all(assignmentUpdates)

    // Update super study progress for each affected super study
    // Fetch fresh data after assignments have been updated
    const superStudyIds = [...new Set(assignments.map(a => a.superStudyId))]
    
    for (const superStudyId of superStudyIds) {
      const superStudy = await prisma.superStudy.findUnique({
        where: { id: superStudyId },
        include: {
          assignments: true
        }
      })

      if (superStudy) {
        // Recalculate based on current assignment states (after updates)
        const completedCount = superStudy.assignments.filter(a => a.status === 'COMPLETED').length
        const totalAssignments = superStudy.totalAssignments
        const masterProgress = totalAssignments > 0 ? (completedCount / totalAssignments) * 100 : 0

        // Determine status based on assignments
        let status = superStudy.status
        if (completedCount === totalAssignments && totalAssignments > 0) {
          status = 'COMPLETED'
        } else if (superStudy.assignments.some(a => a.status === 'RUNNING')) {
          status = 'RUNNING'
        } else if (superStudy.assignments.every(a => a.status === 'PENDING')) {
          status = 'PENDING'
        }

        await prisma.superStudy.update({
          where: { id: superStudyId },
          data: {
            completedAssignments: completedCount,
            masterProgress: masterProgress,
            status: status
          }
        })
      }
    }

    // Now delete the worker (cascade delete will handle guiState and progressEvents)
    await prisma.worker.delete({
      where: { id: workerId }
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Worker deleted successfully. Assignments have been unassigned.' 
    })
  } catch (error) {
    console.error('Error deleting worker:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete worker',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

