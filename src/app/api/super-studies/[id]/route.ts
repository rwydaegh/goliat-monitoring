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

    return NextResponse.json({
      ...superStudy,
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

