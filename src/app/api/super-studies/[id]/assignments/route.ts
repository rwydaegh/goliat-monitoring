import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: superStudyId } = await params

    const assignments = await prisma.assignment.findMany({
      where: {
        superStudyId
      },
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
            isStale: true
          }
        }
      }
    })

    // Resolve stale workers to their active counterparts
    const assignmentsWithResolvedWorkers = await Promise.all(
      assignments.map(async (assignment) => {
        if (!assignment.worker || !assignment.worker.isStale) {
          return assignment
        }

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
            isStale: true
          }
        })

        if (activeWorker) {
          return {
            ...assignment,
            worker: activeWorker
          }
        }

        return assignment
      })
    )

    return NextResponse.json(assignmentsWithResolvedWorkers)
  } catch (error) {
    console.error('Error fetching assignments:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch assignments',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

