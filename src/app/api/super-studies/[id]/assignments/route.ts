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
            machineLabel: true
          }
        }
      }
    })

    return NextResponse.json(assignments)
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

