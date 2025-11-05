import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

type WorkerWithGuiState = Prisma.WorkerGetPayload<{
  include: { guiState: true }
}>

export async function GET(request: NextRequest) {
  try {
    const workers = await prisma.worker.findMany({
      orderBy: {
        lastSeen: 'desc'
      },
      include: {
        guiState: true  // This will return an array, but due to unique constraint, there should only be one
      }
    })

    // Update stale workers: if RUNNING and lastSeen > 15 seconds ago, mark as IDLE
    const now = new Date()
    const fifteenSecondsAgo = new Date(now.getTime() - 15 * 1000)
    
    const staleWorkers = workers.filter((worker: WorkerWithGuiState) => 
      worker.status === 'RUNNING' && worker.lastSeen < fifteenSecondsAgo
    )

    // Update stale workers in database
    if (staleWorkers.length > 0) {
      await Promise.all(
        staleWorkers.map((worker: WorkerWithGuiState) =>
          prisma.worker.update({
            where: { id: worker.id },
            data: { status: 'IDLE' }
          })
        )
      )
    }

    // Return workers with GUI state included
    const updatedWorkers = workers.map((worker: WorkerWithGuiState) => {
      // Handle guiState as array (even though it should only have one element due to unique constraint)
      const latestGuiState = Array.isArray(worker.guiState) && worker.guiState.length > 0
        ? worker.guiState[0]
        : (worker.guiState as any) || null  // Fallback if it's not an array
      
      return {
        id: worker.id,
        ipAddress: worker.ipAddress,
        hostname: worker.hostname,
        status: worker.status === 'RUNNING' && worker.lastSeen < fifteenSecondsAgo ? 'IDLE' : worker.status,
        lastSeen: worker.lastSeen,
        machineLabel: worker.machineLabel,
        createdAt: worker.createdAt,
        updatedAt: worker.updatedAt,
        guiState: latestGuiState ? {
          progress: latestGuiState.progress,
          stage: latestGuiState.stage,
          warningCount: latestGuiState.warningCount || 0,
          errorCount: latestGuiState.errorCount || 0
        } : null
      }
    })

    return NextResponse.json(updatedWorkers)
  } catch (error) {
    console.error('Error fetching workers:', error)
    // Return more detailed error in development and production for debugging
    return NextResponse.json(
      { 
        error: 'Failed to fetch workers',
        details: error instanceof Error ? error.message : String(error)
      },
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
