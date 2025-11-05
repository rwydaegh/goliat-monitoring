import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// API routes for managing super studies
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Super study ID is required' },
        { status: 400 }
      )
    }

    // Delete super study and all its assignments (cascade delete)
    await prisma.superStudy.delete({
      where: { id }
    })

    return NextResponse.json({ success: true, message: 'Super study deleted successfully' })
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')

    let where = {}
    if (name) {
      where = { name }
    }

    const superStudies = await prisma.superStudy.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        assignments: {
          select: {
            id: true,
            status: true,
            workerId: true
          }
        }
      }
    })

    return NextResponse.json(superStudies)
  } catch (error) {
    console.error('Error fetching super studies:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch super studies',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, baseConfig, assignments } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (!assignments || !Array.isArray(assignments)) {
      return NextResponse.json(
        { error: 'Assignments array is required' },
        { status: 400 }
      )
    }

    // Create super study with assignments
    const superStudy = await prisma.superStudy.create({
      data: {
        name,
        description: description || '',
        baseConfigPath: JSON.stringify(baseConfig),
        status: 'PENDING',
        totalAssignments: assignments.length,
        completedAssignments: 0,
        masterProgress: 0,
        assignments: {
          create: assignments.map((assignment: any, index: number) => ({
            splitConfig: assignment.splitConfig,
            status: assignment.status || 'PENDING',
            progress: 0
          }))
        }
      },
      include: {
        assignments: true
      }
    })

    return NextResponse.json(superStudy)
  } catch (error) {
    console.error('Error creating super study:', error)
    return NextResponse.json(
      {
        error: 'Failed to create super study',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

