import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

type WorkerWithGuiState = Prisma.WorkerGetPayload<{
  include: { 
    guiState: true
    assignments: true
  }
}>

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeStale = searchParams.get('includeStale') === 'true'

    const workers = await prisma.worker.findMany({
      where: includeStale ? {} : { isStale: false },
      orderBy: {
        lastSeen: 'desc'
      },
      include: {
        guiState: true,  // This will return an array, but due to unique constraint, there should only be one
        assignments: {
          where: {
            status: 'RUNNING'
          }
        }
      }
    })

    // Update stale workers: use heartbeat-based logic
    // - If worker has RUNNING assignment: use 60-second heartbeat timeout
    // - If worker has no RUNNING assignment: use 15-second timeout (for workers that finished but didn't send 'finished')
    const now = new Date()
    const fifteenSecondsAgo = new Date(now.getTime() - 15 * 1000)
    const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000)
    
    const staleWorkers = workers.filter((worker: WorkerWithGuiState) => {
      if (worker.status !== 'RUNNING') {
        return false
      }
      
      const hasRunningAssignment = worker.assignments && worker.assignments.length > 0
      
      if (hasRunningAssignment) {
        // Worker has RUNNING assignment - use heartbeat timeout (60 seconds)
        // During isolve execution, heartbeats continue but no GUI updates
        return worker.lastSeen < sixtySecondsAgo
      } else {
        // Worker has no RUNNING assignment - use shorter timeout (15 seconds)
        // This catches workers that finished but didn't send 'finished' message
        return worker.lastSeen < fifteenSecondsAgo
      }
    })

    // Update stale workers in database and track their IDs
    const staleWorkerIds = new Set<string>()
    if (staleWorkers.length > 0) {
      await Promise.all(
        staleWorkers.map((worker: WorkerWithGuiState) => {
          staleWorkerIds.add(worker.id)
          return prisma.worker.update({
            where: { id: worker.id },
            data: { status: 'IDLE' }
          })
        })
      )
    }

    // Return workers with GUI state included
    const updatedWorkers = workers.map((worker: WorkerWithGuiState) => {
      // Handle guiState as array (even though it should only have one element due to unique constraint)
      const latestGuiState = Array.isArray(worker.guiState) && worker.guiState.length > 0
        ? worker.guiState[0]
        : (worker.guiState as any) || null  // Fallback if it's not an array
      
      // Determine displayed status using same heartbeat-based logic
      // If worker was just marked as stale, use IDLE; otherwise check timeout
      let displayedStatus = staleWorkerIds.has(worker.id) ? 'IDLE' : worker.status
      if (displayedStatus === 'RUNNING') {
        const hasRunningAssignment = worker.assignments && worker.assignments.length > 0
        if (hasRunningAssignment && worker.lastSeen < sixtySecondsAgo) {
          displayedStatus = 'IDLE'
        } else if (!hasRunningAssignment && worker.lastSeen < fifteenSecondsAgo) {
          displayedStatus = 'IDLE'
        }
      }
      
      return {
        id: worker.id,
        ipAddress: worker.ipAddress,
        hostname: worker.hostname,
        status: displayedStatus,
        lastSeen: worker.lastSeen,
        machineLabel: worker.machineLabel,
        gpuName: worker.gpuName,
        cpuCores: worker.cpuCores,
        totalRamGB: worker.totalRamGB,
        createdAt: worker.createdAt,
        updatedAt: worker.updatedAt,
        guiState: latestGuiState ? {
          progress: latestGuiState.progress,
          stageProgress: latestGuiState.stageProgress || 0,
          stage: latestGuiState.stage,
          warningCount: latestGuiState.warningCount || 0,
          errorCount: latestGuiState.errorCount || 0,
          eta: latestGuiState.eta
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

    // Check if worker already exists (non-stale)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const existingWorker = await prisma.worker.findFirst({
      where: {
        ipAddress,
        isStale: false
      },
      orderBy: {
        lastSeen: 'desc'
      }
    })

    // If worker exists but hasn't been seen in 5 minutes, mark as stale
    if (existingWorker && existingWorker.lastSeen < fiveMinutesAgo) {
      await prisma.worker.update({
        where: { id: existingWorker.id },
        data: { isStale: true }
      })
    }

    if (existingWorker && existingWorker.lastSeen >= fiveMinutesAgo) {
      // Update existing active worker
      const updatedWorker = await prisma.worker.update({
        where: { id: existingWorker.id },
        data: {
          hostname,
          machineLabel,
          status: 'IDLE',
          lastSeen: new Date()
        }
      })
      return NextResponse.json(updatedWorker)
    }

    // Create new worker with new session
    const newWorker = await prisma.worker.create({
      data: {
        ipAddress,
        hostname,
        machineLabel,
        status: 'IDLE',
        isStale: false
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
