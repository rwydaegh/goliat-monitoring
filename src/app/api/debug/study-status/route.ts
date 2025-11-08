import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('id') || 'f9726047-ceb2-420f-bc4e-86f913c79cb4'
    const studyName = searchParams.get('name') || 'near_field_study_final'
    
    // Get super study with assignments and workers
    const superStudy = await prisma.superStudy.findFirst({
      where: {
        OR: [
          { id: studyId },
          { name: studyName }
        ]
      },
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
                status: true,
                isStale: true,
                lastSeen: true
              }
            }
          }
        }
      }
    })
    
    if (!superStudy) {
      return NextResponse.json({ error: 'Super study not found' }, { status: 404 })
    }
    
    // Status breakdown
    const statusCounts: Record<string, number> = {}
    superStudy.assignments.forEach(a => {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1
    })
    
    // Get running assignments with details
    const runningAssignments = superStudy.assignments
      .filter(a => a.status === 'RUNNING')
      .map(async (assignment) => {
        let workerHasThisAssignment = false
        let workerHasAnyRunningAssignment = false
        let anyRunningAssignmentId = null
        
        if (assignment.worker) {
          // Check if worker actually has this assignment as RUNNING
          const actualAssignment = await prisma.assignment.findFirst({
            where: {
              workerId: assignment.worker.id,
              status: 'RUNNING',
              id: assignment.id
            }
          })
          workerHasThisAssignment = !!actualAssignment
          
          // Check if worker has ANY RUNNING assignment
          const anyRunning = await prisma.assignment.findFirst({
            where: {
              workerId: assignment.worker.id,
              status: 'RUNNING'
            }
          })
          workerHasAnyRunningAssignment = !!anyRunning
          anyRunningAssignmentId = anyRunning?.id || null
        }
        
        return {
          index: assignment.index,
          assignmentId: assignment.id,
          status: assignment.status,
          progress: assignment.progress,
          startedAt: assignment.startedAt,
          completedAt: assignment.completedAt,
          worker: assignment.worker ? {
            id: assignment.worker.id,
            ipAddress: assignment.worker.ipAddress,
            hostname: assignment.worker.hostname,
            status: assignment.worker.status,
            isStale: assignment.worker.isStale,
            lastSeen: assignment.worker.lastSeen
          } : null,
          workerHasThisAssignment,
          workerHasAnyRunningAssignment,
          anyRunningAssignmentId
        }
      })
    
    const runningDetails = await Promise.all(runningAssignments)
    
    return NextResponse.json({
      study: {
        id: superStudy.id,
        name: superStudy.name,
        status: superStudy.status,
        totalAssignments: superStudy.totalAssignments,
        completedAssignments: superStudy.completedAssignments,
        masterProgress: superStudy.masterProgress
      },
      statusCounts,
      runningCount: runningDetails.length,
      runningAssignments: runningDetails,
      allAssignments: superStudy.assignments.map(a => ({
        index: a.index,
        id: a.id,
        status: a.status,
        progress: a.progress,
        worker: a.worker ? {
          id: a.worker.id,
          ipAddress: a.worker.ipAddress,
          status: a.worker.status,
          isStale: a.worker.isStale
        } : null
      }))
    })
  } catch (error) {
    console.error('Error checking study status:', error)
    return NextResponse.json(
      {
        error: 'Failed to check study status',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

