import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { broadcastLogs, broadcastProgress } from '@/lib/sse-connections'

// Increase timeout for long-running transactions
export const maxDuration = 30 // 30 seconds (Railway/Vercel default is 10s)

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
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    let worker = await prisma.worker.findFirst({
      where: {
        ipAddress: machineId,
        isStale: false
      },
      orderBy: {
        lastSeen: 'desc'
      }
    })

    // If worker exists but hasn't been seen in 5 minutes, mark as stale
    if (worker && worker.lastSeen < fiveMinutesAgo) {
      // Mark old worker as stale
      await prisma.worker.update({
        where: { id: worker.id },
        data: { isStale: true }
      })
      worker = null // Force creation of new worker
    }
    
    // Also check if worker is idle for 10+ minutes - mark as stale (catches old workers)
    if (worker && worker.lastSeen < tenMinutesAgo && worker.status === 'IDLE') {
      await prisma.worker.update({
        where: { id: worker.id },
        data: { isStale: true }
      })
      worker = null // Force creation of new worker
    }

    if (!worker) {
      // Before creating new worker, check if there's a very recent worker (likely from claim)
      // that has a RUNNING assignment - this handles IP changes
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
      const recentWorkerWithAssignment = await prisma.worker.findFirst({
        where: {
          isStale: false,
          createdAt: {
            gte: twoMinutesAgo // Created within last 2 minutes
          },
          assignments: {
            some: {
              status: 'RUNNING'
            }
          }
          // Removed the lastSeen check - match ANY recent worker with RUNNING assignment
          // even if it was just created/updated
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      if (recentWorkerWithAssignment) {
        // Use this worker instead of creating a new one, update its IP
        worker = await prisma.worker.update({
          where: { id: recentWorkerWithAssignment.id },
          data: {
            ipAddress: machineId // Update to new IP
          }
        })
      } else {
        // Create new worker with new session
        worker = await prisma.worker.create({
          data: {
            ipAddress: machineId,
            status: 'IDLE',
            isStale: false
          }
        })

        // Transfer any RUNNING assignments from stale workers with same IP
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

    // Get or create GUI state (use upsert to handle race conditions)
    let guiState = await prisma.guiState.upsert({
      where: { workerId: worker.id },
      update: {}, // Don't update anything if it exists
      create: {
        workerId: worker.id,
        stage: '',
        progress: 0,
        logMessages: [],
        status: 'IDLE',
        warningCount: 0,
        errorCount: 0
      }
    })

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

    // Handle profiler_update with ETA
    if (messageType === 'profiler_update' && message.eta_seconds !== undefined) {
      if (message.eta_seconds && message.eta_seconds > 0) {
        // Convert eta_seconds to future timestamp
        const etaDate = new Date(Date.now() + message.eta_seconds * 1000)
        updateData.eta = etaDate
      }
    }

    // Handle simulation_details
    if (messageType === 'simulation_details') {
      if (message.simulation_count !== undefined) {
        updateData.simulationCount = message.simulation_count
      }
      if (message.total_simulations !== undefined) {
        updateData.totalSimulations = message.total_simulations
      }
      if (message.current_case !== undefined) {
        updateData.currentCase = message.current_case
      }
    }

    // Handle log_batch messages (batched logs for efficiency)
    if (messageType === 'log_batch' && message.logs && Array.isArray(message.logs)) {
      const batchSize = message.logs.length
      
      // Declare newLogs outside transaction so it's accessible for SSE broadcast after transaction completes
      const newLogs: Array<{message: string, logType: string, timestamp: string, sequence?: number}> = []
      
      // Use transaction to prevent race conditions when multiple batches arrive concurrently
      try {
        await prisma.$transaction(async (tx) => {
          // Re-read GUI state within transaction to get latest data, or create if it doesn't exist
          // Use upsert to handle race conditions (multiple batches arriving simultaneously)
          let currentGuiState = await tx.guiState.upsert({
            where: { workerId: worker.id },
            update: {}, // Don't update anything if it exists, we'll update later
            create: {
              workerId: worker.id,
              stage: '',
              progress: 0,
              logMessages: [],
              status: workerStatus,
              warningCount: 0,
              errorCount: 0
            }
          })
          
          const logMessages = Array.isArray(currentGuiState.logMessages) ? [...currentGuiState.logMessages] : []
          const beforeCount = logMessages.length
          
          // Start with existing counts (don't recalculate from scratch - O(n) is slow!)
          let warningCount = currentGuiState.warningCount || 0
          let errorCount = currentGuiState.errorCount || 0
          
          // Process each log in the batch
          const batchSequence = message.sequence !== undefined ? message.sequence : -1
          
          // Clear newLogs array for this batch (reuse the outer scope variable)
          newLogs.length = 0
          
          // Build duplicate detection set
          // For parallel batches (with sequence numbers), check all messages to handle out-of-order arrivals
          // For sequential batches, only check recent 100 (performance optimization)
          const existingMessageKeys = new Set<string>()
          const messagesToCheck = batchSequence >= 0 
            ? logMessages  // Parallel batches: check all (out-of-order arrivals possible)
            : logMessages.slice(-100)  // Sequential batches: only check recent 100
          
          messagesToCheck.forEach((log: any) => {
            const seq = log.sequence !== undefined ? log.sequence : 'none'
            const key = `${log.message}|${log.timestamp}|${seq}`
            existingMessageKeys.add(key)
          })
          
          for (const logMsg of message.logs) {
            const logType = logMsg.log_type || 'default'
            
            // Convert UNIX timestamp (seconds) to ISO string if needed
            let logTimestamp: string
            const logTs = logMsg.timestamp || timestamp
            if (typeof logTs === 'number') {
              // Python sends time.time() which is seconds since epoch
              logTimestamp = new Date(logTs * 1000).toISOString()
            } else if (logTs) {
              logTimestamp = logTs
            } else {
              logTimestamp = new Date().toISOString()
            }
            
            // Duplicate detection: message + timestamp + sequence (handles parallel batches)
            const key = `${logMsg.message}|${logTimestamp}|${batchSequence >= 0 ? batchSequence : 'none'}`
            if (!existingMessageKeys.has(key)) {
              existingMessageKeys.add(key)
              newLogs.push({
                message: logMsg.message,
                logType: logType,
                timestamp: logTimestamp,
                sequence: batchSequence >= 0 ? batchSequence : undefined  // Store sequence for sorting
              })
              
              // Update counts incrementally
              if (logType === 'warning' || logType === 'highlight') warningCount++
              if (logType === 'error' || logType === 'fatal') errorCount++
            }
          }
          
          // Append new logs
          logMessages.push(...newLogs)
          
          // Sort by sequence number if batches arrived out of order (parallel sending)
          // Then by timestamp within same sequence
          if (batchSequence >= 0) {
            // Only sort if we have sequence numbers (parallel batches)
            logMessages.sort((a: any, b: any) => {
              // First by sequence (batch order)
              const seqA = a.sequence !== undefined ? a.sequence : -1
              const seqB = b.sequence !== undefined ? b.sequence : -1
              if (seqA !== seqB) {
                return seqA - seqB
              }
              // Then by timestamp within same sequence
              const timeA = new Date(a.timestamp).getTime()
              const timeB = new Date(b.timestamp).getTime()
              return timeA - timeB
            })
          }
          
          const afterCount = logMessages.length
          const actuallyAdded = afterCount - beforeCount
          
          // Update GUI state within transaction
          await tx.guiState.update({
            where: { workerId: worker.id },
            data: {
              logMessages: logMessages as any, // Cast to any to satisfy Prisma Json[] type requirement
              warningCount: warningCount,
              errorCount: errorCount,
              updatedAt: new Date()
            }
          })
          
          // Also update updateData for later use
          updateData.logMessages = logMessages
          updateData.warningCount = warningCount
          updateData.errorCount = errorCount
        })
        
        // Broadcast new logs to SSE clients (non-blocking, fire-and-forget)
        if (newLogs.length > 0) {
          try {
            broadcastLogs(worker.id, newLogs)
          } catch (error) {
            // Don't fail the request if SSE broadcast fails
            console.error(`[DEBUG] SSE broadcast failed for worker ${worker.id}:`, error)
          }
        }
      } catch (txError) {
        console.error(`[DEBUG] Batch transaction failed:`, txError)
        // Re-throw to be caught by outer error handler
        throw txError
      }
    }
    
    // Handle status/log messages (single log for backwards compatibility)
    else if (messageType === 'status' && message.message) {
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
      // Convert UNIX timestamp (seconds) to ISO string if needed
      let logTimestamp: string
      if (typeof timestamp === 'number') {
        // Python sends time.time() which is seconds since epoch
        // JavaScript Date expects milliseconds, so multiply by 1000
        logTimestamp = new Date(timestamp * 1000).toISOString()
      } else if (timestamp) {
        logTimestamp = timestamp
      } else {
        logTimestamp = new Date().toISOString()
      }
      
      logMessages.push({
        message: message.message,
        logType: logType,
        timestamp: logTimestamp
      })
      
      // Update counts for new message
      if (logType === 'warning' || logType === 'highlight') warningCount++
      if (logType === 'error' || logType === 'fatal') errorCount++
      
      // Store all log messages (no limit)
      updateData.logMessages = logMessages
      updateData.warningCount = warningCount
      updateData.errorCount = errorCount
      
      // Broadcast single log message to SSE clients
      try {
        broadcastLogs(worker.id, [{
          message: message.message,
          logType: logType,
          timestamp: logTimestamp
        }])
      } catch (error) {
        console.error(`[DEBUG] SSE broadcast failed for single log:`, error)
      }
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
            // Calculate progress based on sum of all assignment progress values
            const totalProgress = superStudy.assignments.reduce((sum, a) => sum + a.progress, 0)
            const masterProgress = totalAssignments > 0 ? (totalProgress / totalAssignments) : 0

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
    
    // Broadcast progress updates to SSE clients (non-blocking)
    if (messageType === 'overall_progress' || messageType === 'stage_progress' || messageType === 'profiler_update') {
      try {
        broadcastProgress(worker.id, {
          progress: updateData.progress,
          stage: updateData.stage,
          stageProgress: updateData.stageProgress,
          eta: updateData.eta,
          simulationCount: updateData.simulationCount,
          totalSimulations: updateData.totalSimulations,
          currentCase: updateData.currentCase
        })
      } catch (error) {
        console.error(`[DEBUG] SSE progress broadcast failed:`, error)
      }
    }

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
          // Calculate progress based on sum of all assignment progress values
          const totalProgress = superStudy.assignments.reduce((sum, a) => sum + a.progress, 0)
          const masterProgress = totalAssignments > 0 ? (totalProgress / totalAssignments) : 0

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
