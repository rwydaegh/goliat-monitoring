import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const workers = await prisma.worker.findMany({
      include: {
        assignments: {
          where: {
            status: {
              in: ['PENDING', 'RUNNING']
            }
          }
        }
      },
      orderBy: {
        lastSeen: 'desc'
      }
    })

    return NextResponse.json(workers)
  } catch (error) {
    console.error('Error fetching workers:', error)
    // Return more detailed error in development
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        { 
          error: 'Failed to fetch workers',
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to fetch workers' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ipAddress, hostname, machineLabel } = body

    if (!ipAddress) {
      return NextResponse.json(
        { error: 'IP address is required' },
        { status: 400 }
      )
    }

    // Check if worker already exists
    const existingWorker = await prisma.worker.findUnique({
      where: { ipAddress }
    })

    if (existingWorker) {
      // Update existing worker
      const updatedWorker = await prisma.worker.update({
        where: { ipAddress },
        data: {
          hostname,
          machineLabel,
          status: 'IDLE',
          lastSeen: new Date()
        }
      })
      return NextResponse.json(updatedWorker)
    }

    // Create new worker
    const newWorker = await prisma.worker.create({
      data: {
        ipAddress,
        hostname,
        machineLabel,
        status: 'IDLE'
      }
    })

    return NextResponse.json(newWorker)
  } catch (error) {
    console.error('Error creating/updating worker:', error)
    return NextResponse.json(
      { error: 'Failed to create/update worker' },
      { status: 500 }
    )
  }
}