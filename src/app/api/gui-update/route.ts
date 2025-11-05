import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { machineId, message, timestamp } = body

    if (!machineId) {
      return NextResponse.json(
        { error: 'machineId is required' },
        { status: 400 }
      )
    }

    if (!message || !message.type) {
      return NextResponse.json(
        { error: 'message with type is required' },
        { status: 400 }
      )
    }

    // Find or create worker
    let worker = await prisma.worker.findUnique({
      where: { ipAddress: machineId }
    })

    if (!worker) {
      worker = await prisma.worker.create({
        data: {
          ipAddress: machineId,
          status: 'IDLE'
        }
      })
    }

    // Update worker status based on message type
    let workerStatus = worker.status
    if (message.type === 'finished') {
      workerStatus = 'IDLE'
    } else if (message.type === 'fatal_error') {
      workerStatus = 'ERROR'
    } else if (message.type === 'overall_progress' || message.type === 'stage_progress') {
      workerStatus = 'RUNNING'
    }

    // Update worker status
    await prisma.worker.update({
      where: { ipAddress: machineId },
      data: {
        status: workerStatus,
        lastSeen: new Date()
      }
    })

    // Handle different message types
    const messageType = message.type

    // Get or create GUI state
    let guiState = await prisma.guiState.findUnique({
      where: { workerId: worker.id }
    })

    if (!guiState) {
      guiState = await prisma.guiState.create({
        data: {
          workerId: worker.id,
          stage: '',
          progress: 0,
          logMessages: [],
          status: 'IDLE'
        }
      })
    }

    // Update GUI state based on message type
    const updateData: any = {
      updatedAt: new Date(),
      status: workerStatus
    }

    // Handle overall_progress
    if (messageType === 'overall_progress' && message.current !== undefined && message.total !== undefined) {
      updateData.progress = (message.current / message.total) * 100
    }

    // Handle stage_progress
    if (messageType === 'stage_progress') {
      if (message.name) {
        updateData.stage = message.name
      }
      if (message.current !== undefined && message.total !== undefined) {
        // Store stage progress separately, but update overall progress based on stage
        updateData.progress = (message.current / message.total) * 100
      }
    }

    // Handle status/log messages
    if (messageType === 'status' && message.message) {
      const logMessages = Array.isArray(guiState.logMessages) ? [...guiState.logMessages] : []
      logMessages.push({
        message: message.message,
        logType: message.log_type || 'default',
        timestamp: timestamp || new Date().toISOString()
      })
      // Keep only last 100 log messages
      if (logMessages.length > 100) {
        logMessages.shift()
      }
      updateData.logMessages = logMessages
    }

    // Handle profiler_update (ETA)
    if (messageType === 'profiler_update' && message.eta_seconds !== undefined) {
      const etaDate = new Date(Date.now() + message.eta_seconds * 1000)
      updateData.eta = etaDate
    }

    // Update GUI state
    await prisma.guiState.update({
      where: { workerId: worker.id },
      data: updateData
    })

    // Also create a progress event for tracking
    await prisma.progressEvent.create({
      data: {
        workerId: worker.id,
        eventType: messageType === 'overall_progress' ? 'PROGRESS' :
                   messageType === 'stage_progress' ? 'STAGE_CHANGE' :
                   messageType === 'status' ? 'LOG' :
                   messageType === 'finished' ? 'FINISHED' :
                   messageType === 'fatal_error' ? 'ERROR' :
                   messageType === 'profiler_update' ? 'ETA_UPDATE' : 'LOG',
        message: message.message || JSON.stringify(message),
        stage: message.name || updateData.stage || guiState.stage,
        progress: updateData.progress !== undefined ? updateData.progress : guiState.progress,
        eta: updateData.eta || guiState.eta,
        data: message
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing GUI update:', error)
    return NextResponse.json(
      { error: 'Failed to process GUI update' },
      { status: 500 }
    )
  }
}

