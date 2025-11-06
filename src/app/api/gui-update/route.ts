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

    // Find or create worker (use most recent non-stale worker)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000)
    let worker = await prisma.worker.findFirst({
      where: {
        ipAddress: machineId,
        isStale: false
      },
      orderBy: {
        lastSeen: 'desc'
      }
    })

    // If worker exists but hasn't been seen in 1 minute, mark as stale
    if (worker && worker.lastSeen < oneMinuteAgo) {
      // Mark old worker as stale
      await prisma.worker.update({
        where: { id: worker.id },
        data: { isStale: true }
      })
      worker = null // Force creation of new worker
    }

    if (!worker) {
      // Create new worker with new session
      worker = await prisma.worker.create({
        data: {
          ipAddress: machineId,
          status: 'IDLE',
          isStale: false
        }
      })

      // Transfer any RUNNING assignments from stale workers with same IP to this new worker
      const staleWorkers = await prisma.worker.findMany({
        where: {
          ipAddress: machineId,
          isStale: true
        }
      })

      for (const staleWorker of staleWorkers) {
        await prisma.assignment.updateMany({
          where: {
            workerId: staleWorker.id,
            status: 'RUNNING'
          },
          data: {
            workerId: worker.id
          }
        })
      }
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
      where: { id: worker.id },
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
          status: 'IDLE',
          warningCount: 0,
          errorCount: 0
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
        // Store stage progress separately from overall progress
        updateData.stageProgress = (message.current / message.total) * 100
      }
    }

    // Handle status/log messages
    if (messageType === 'status' && message.message) {
      const logMessages = Array.isArray(guiState.logMessages) ? [...guiState.logMessages] : []
      const logType = message.log_type || 'default'
      
      // Track warnings and errors
      let warningCount = 0
      let errorCount = 0
      logMessages.forEach((log: any) => {
        const lt = log.logType || 'default'
        if (lt === 'warning' || lt === 'highlight') warningCount++
        if (lt === 'error' || lt === 'fatal') errorCount++
      })
      
      // Add new log message
      logMessages.push({
        message: message.message,
        logType: logType,
        timestamp: timestamp || new Date().toISOString()
      })
      
      // Update counts for new message
      if (logType === 'warning' || logType === 'highlight') warningCount++
      if (logType === 'error' || logType === 'fatal') errorCount++
      
      // Keep only last 100 log messages
      if (logMessages.length > 100) {
        logMessages.shift()
      }
      
      updateData.logMessages = logMessages
      updateData.warningCount = warningCount
      updateData.errorCount = errorCount
    }

    // Handle finished message - mark assignment as completed
    if (messageType === 'finished') {
      try {
        const activeAssignment = await prisma.assignment.findFirst({
          where: {
            workerId: worker.id,
            status: 'RUNNING'
          }
        })

        if (activeAssignment) {
          await prisma.assignment.update({
            where: { id: activeAssignment.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              progress: 100
            }
          })

          // Update super study progress
          const superStudy = await prisma.superStudy.findUnique({
            where: { id: activeAssignment.superStudyId },
            include: {
              assignments: true
            }
          })

          if (superStudy) {
            const completedCount = superStudy.assignments.filter(a => a.status === 'COMPLETED').length
            const totalAssignments = superStudy.totalAssignments
            const masterProgress = totalAssignments > 0 ? (completedCount / totalAssignments) * 100 : 0

            await prisma.superStudy.update({
              where: { id: superStudy.id },
              data: {
                completedAssignments: completedCount,
                masterProgress: masterProgress,
                status: completedCount === totalAssignments ? 'COMPLETED' : 'RUNNING'
              }
            })
          }
        }
      } catch (assignmentError) {
        console.warn('Failed to mark assignment as completed:', assignmentError)
      }
    }

    // Update GUI state
    await prisma.guiState.update({
      where: { workerId: worker.id },
      data: updateData
    })

    // Also update assignment progress if worker has an active assignment
    try {
      const activeAssignment = await prisma.assignment.findFirst({
        where: {
          workerId: worker.id,
          status: 'RUNNING'
        }
      })

      if (activeAssignment) {
        // Update assignment progress based on GUI state
        const newProgress = updateData.progress !== undefined ? updateData.progress : guiState.progress
        const newStage = updateData.stage !== undefined ? updateData.stage : guiState.stage

        await prisma.assignment.update({
          where: { id: activeAssignment.id },
          data: {
            progress: newProgress,
            currentStage: newStage || activeAssignment.currentStage,
            eta: updateData.eta || activeAssignment.eta
          }
        })

        // Update super study progress
        const superStudy = await prisma.superStudy.findUnique({
          where: { id: activeAssignment.superStudyId },
          include: {
            assignments: true
          }
        })

        if (superStudy) {
          const completedCount = superStudy.assignments.filter(a => a.status === 'COMPLETED').length
          const totalAssignments = superStudy.totalAssignments
          const masterProgress = totalAssignments > 0 ? (completedCount / totalAssignments) * 100 : 0

          await prisma.superStudy.update({
            where: { id: superStudy.id },
            data: {
              completedAssignments: completedCount,
              masterProgress: masterProgress,
              status: completedCount === totalAssignments ? 'COMPLETED' : 'RUNNING'
            }
          })
        }
      }
    } catch (assignmentError) {
      // Log but don't fail the request if assignment update fails
      console.warn('Failed to update assignment progress:', assignmentError)
    }

    // Also create a progress event for tracking (optional - don't fail if this fails)
    try {
      await prisma.progressEvent.create({
        data: {
          workerId: worker.id,
          eventType: messageType === 'overall_progress' ? 'PROGRESS' :
                     messageType === 'stage_progress' ? 'STAGE_CHANGE' :
                     messageType === 'status' ? 'LOG' :
                     messageType === 'finished' ? 'FINISHED' :
                     messageType === 'fatal_error' ? 'ERROR' :
                     messageType === 'profiler_update' ? 'ETA_UPDATE' : 'LOG',
          message: message.message || JSON.stringify(message).substring(0, 500), // Limit message length
          stage: message.name || updateData.stage || guiState.stage,
          progress: updateData.progress !== undefined ? updateData.progress : guiState.progress,
          eta: updateData.eta || guiState.eta,
          data: message
        }
      })
    } catch (eventError) {
      // Log but don't fail the request if progress event creation fails
      console.warn('Failed to create progress event:', eventError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing GUI update:', error)
    // Return detailed error for debugging
    return NextResponse.json(
      { 
        error: 'Failed to process GUI update',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
