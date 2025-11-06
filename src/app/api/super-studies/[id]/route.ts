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
                isStale: true
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

    // Resolve stale workers to their active counterparts
    const assignmentsWithResolvedWorkers = await Promise.all(
      superStudy.assignments.map(async (assignment) => {
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

