import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const superStudy = await prisma.superStudy.findUnique({
      where: { id },
      include: {
        assignments: {
          orderBy: {
            index: 'asc'
          },
          include: {
            worker: {
              select: {
                id: true,
                ipAddress: true,
                hostname: true,
                machineLabel: true,
                gpuName: true,
                cpuCores: true,
                totalRamGB: true,
                isStale: true,
                status: true
              }
            }
          }
        }
      }
    })

    if (!superStudy) {
      return NextResponse.json(
        { error: 'Super study not found' },
        { status: 404 }
      )
    }

    // Parse baseConfigPath JSON string if it exists
    let parsedBaseConfig = null
    if (superStudy.baseConfigPath) {
      try {
        parsedBaseConfig = JSON.parse(superStudy.baseConfigPath)
      } catch (e) {
        console.error('Error parsing baseConfigPath:', e)
      }
    }

    // Resolve stale workers to their active counterparts and fix inconsistent statuses
    const assignmentsWithResolvedWorkers = await Promise.all(
      superStudy.assignments.map(async (assignment) => {
        let resolvedAssignment = assignment
        let resolvedWorker = assignment.worker

        // Resolve stale workers to their active counterparts
        if (assignment.worker && assignment.worker.isStale) {
          // Find active worker with same IP
          const activeWorker = await prisma.worker.findFirst({
            where: {
              ipAddress: assignment.worker.ipAddress,
              isStale: false
            },
            orderBy: {
              lastSeen: 'desc'
            },
            select: {
              id: true,
              ipAddress: true,
              hostname: true,
              machineLabel: true,
              gpuName: true,
              cpuCores: true,
              totalRamGB: true,
              isStale: true,
              status: true
            }
          })

          if (activeWorker) {
            resolvedWorker = activeWorker
          }
        }

        // Fix inconsistent status: if assignment is RUNNING but worker is IDLE (and not stale),
        // derive the correct status from the worker's current state
        let derivedStatus = assignment.status
        
        // If assignment is RUNNING but has no worker assigned, it should be PENDING
        if (assignment.status === 'RUNNING' && !resolvedWorker) {
          derivedStatus = 'PENDING'
        } else if (resolvedWorker && !resolvedWorker.isStale) {
          if (assignment.status === 'RUNNING' && resolvedWorker.status === 'IDLE') {
            // Worker is idle but assignment shows as running - check if worker actually has any RUNNING assignment
            const workerHasAnyRunningAssignment = await prisma.assignment.findFirst({
              where: {
                workerId: resolvedWorker.id,
                status: 'RUNNING'
              }
            })
            
            // If worker is IDLE and doesn't have any RUNNING assignment, this assignment shouldn't be RUNNING
            // Check if assignment was completed (has completedAt) or should be reset to PENDING
            if (!workerHasAnyRunningAssignment) {
              if (assignment.completedAt) {
                // Assignment was completed but status wasn't updated
                derivedStatus = 'COMPLETED'
              } else {
                // Assignment should be available to claim again
                derivedStatus = 'PENDING'
              }
            }
          } else if (assignment.status === 'RUNNING' && resolvedWorker.status === 'ERROR') {
            // Worker has error, assignment should reflect that
            derivedStatus = 'FAILED'
          }
        } else if (resolvedWorker && resolvedWorker.isStale && assignment.status === 'RUNNING') {
          // If worker is stale and assignment is RUNNING, check if it was completed
          if (assignment.completedAt) {
            derivedStatus = 'COMPLETED'
          } else {
            // Stale worker with RUNNING assignment - reset to PENDING so it can be claimed again
            derivedStatus = 'PENDING'
          }
        }

        return {
          ...resolvedAssignment,
          worker: resolvedWorker,
          status: derivedStatus
        }
      })
    )

    return NextResponse.json({
      ...superStudy,
      assignments: assignmentsWithResolvedWorkers,
      baseConfig: parsedBaseConfig
    })
  } catch (error) {
    console.error('Error fetching super study:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch super study',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Delete super study and all its assignments (cascade delete)
    await prisma.superStudy.delete({
      where: { id }
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Super study deleted successfully' 
    })
  } catch (error) {
    console.error('Error deleting super study:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete super study',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

