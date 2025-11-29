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
    // IMPORTANT: Always merge with existing guiState to preserve fields not being updated
    // This prevents progress bars from resetting when only one field is updated
    const updateData: any = {
      updatedAt: new Date(),
      status: workerStatus,
      // Preserve existing values by default
      progress: guiState.progress ?? 0,
      stage: guiState.stage ?? '',
      stageProgress: guiState.stageProgress ?? undefined,
      eta: guiState.eta ?? null,
      simulationCount: guiState.simulationCount ?? null,
      totalSimulations: guiState.totalSimulations ?? null,
      currentCase: guiState.currentCase ?? null
    }

    // Handle overall_progress
    // Overall progress should always be monotonic (cumulative across all stages)
    if (messageType === 'overall_progress' && message.current !== undefined && message.total !== undefined) {
      const newProgress = (message.current / message.total) * 100
      // Only update if new progress is higher (prevent progress from going backwards)
      // This handles cases where sync_progress() reads a reset progress bar or
      // messages arrive out of order
      const currentProgress = guiState.progress ?? 0
      if (newProgress >= currentProgress) {
        updateData.progress = newProgress
      } else {
        // Keep existing progress if new value is lower (don't go backwards)
        updateData.progress = currentProgress
      }
    }

    // Handle stage_progress
    if (messageType === 'stage_progress') {
      const stageNameChanged = message.name && message.name !== guiState.stage
      
      if (message.name) {
        updateData.stage = message.name
      }
      
      if (message.current !== undefined && message.total !== undefined) {
        // Store stage progress separately from overall progress
        const newStageProgress = (message.current / message.total) * 100
        
        // Allow progress to reset when stage name changes (new stage starts)
        // But within the same stage, enforce monotonic increases
        // This prevents sync_progress() from causing backwards movement within a stage
        if (stageNameChanged) {
          // New stage - allow reset to any value (including 0)
          updateData.stageProgress = newStageProgress
        } else {
          // Same stage - only allow progress to increase
          const currentStageProgress = guiState.stageProgress ?? 0
          if (newStageProgress >= currentStageProgress) {
            updateData.stageProgress = newStageProgress
          } else {
            // Keep existing progress if new value is lower (don't go backwards within same stage)
            updateData.stageProgress = currentStageProgress
          }
        }
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

    // Handle simulation_details (Python sends 'sim_details' with 'count', 'total', 'details')
    if (messageType === 'sim_details' || messageType === 'simulation_details') {
      // Python sends: count, total, details
      // We store: simulationCount, totalSimulations, currentCase
      if (message.count !== undefined || message.simulation_count !== undefined) {
        updateData.simulationCount = message.count ?? message.simulation_count
      }
      if (message.total !== undefined || message.total_simulations !== undefined) {
        updateData.totalSimulations = message.total ?? message.total_simulations
      }
      if (message.details !== undefined || message.current_case !== undefined) {
        updateData.currentCase = message.details ?? message.current_case
      }
    }

    // Handle log_batch messages (batched logs for efficiency)
    if (messageType === 'log_batch' && message.logs && Array.isArray(message.logs)) {
      const batchSize = message.logs.length
      
      // SSE-FIRST APPROACH: Broadcast immediately, then write to DB asynchronously
      // This ensures near-instant updates for users while database catches up
      const newLogs: Array<{message: string, logType: string, timestamp: string, sequence?: number}> = []
      const batchSequence = message.sequence !== undefined ? message.sequence : -1
      
      // Process logs for SSE broadcast (fast, no DB)
      for (const logMsg of message.logs) {
        const logType = logMsg.log_type || 'default'
        
        // Convert UNIX timestamp (seconds) to ISO string if needed
        let logTimestamp: string
        const logTs = logMsg.timestamp || timestamp
        if (typeof logTs === 'number') {
          logTimestamp = new Date(logTs * 1000).toISOString()
        } else if (logTs) {
          logTimestamp = logTs
        } else {
          logTimestamp = new Date().toISOString()
        }
        
        newLogs.push({
          message: logMsg.message,
          logType: logType,
          timestamp: logTimestamp,
          sequence: batchSequence >= 0 ? batchSequence : undefined
        })
      }
      
      // BROADCAST IMMEDIATELY via SSE (instant, non-blocking)
      if (newLogs.length > 0) {
        try {
          broadcastLogs(worker.id, newLogs)
        } catch (error) {
          console.error(`[DEBUG] SSE broadcast failed for worker ${worker.id}:`, error)
        }
      }
      
      // Write to database ASYNCHRONOUSLY (don't block response)
      // Fire and forget - database is just for persistence, SSE is for real-time
      prisma.$transaction(async (tx) => {
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
          
          // Simplified duplicate detection (only check recent 100 for performance)
          const existingMessageKeys = new Set<string>()
          const messagesToCheck = logMessages.slice(-100)  // Only check recent 100
          
          messagesToCheck.forEach((log: any) => {
            const seq = log.sequence !== undefined ? log.sequence : 'none'
            const key = `${log.message}|${log.timestamp}|${seq}`
            existingMessageKeys.add(key)
          })
          
          // Filter out duplicates from newLogs (already broadcast via SSE)
          const logsToAdd = newLogs.filter((log) => {
            const key = `${log.message}|${log.timestamp}|${batchSequence >= 0 ? batchSequence : 'none'}`
            if (!existingMessageKeys.has(key)) {
              existingMessageKeys.add(key)
              // Update counts incrementally
              if (log.logType === 'warning' || log.logType === 'highlight') warningCount++
              if (log.logType === 'error' || log.logType === 'fatal') errorCount++
              return true
            }
            return false
          })
          
          // Append new logs
          logMessages.push(...logsToAdd)
          
          // Sort by sequence number if batches arrived out of order (parallel sending)
          // Then by timestamp within same sequence
          // Only sort if we have sequence numbers (parallel batches)
          if (batchSequence >= 0) {
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
        }).catch((txError) => {
          // Log but don't fail - database is just for persistence
          console.error(`[DEBUG] Async batch transaction failed (non-critical):`, txError)
        })
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

    // SSE-FIRST: Broadcast progress updates IMMEDIATELY (before database write)
    if (messageType === 'overall_progress' || messageType === 'stage_progress' || messageType === 'profiler_update' || messageType === 'sim_details' || messageType === 'simulation_details') {
      try {
        // Convert Date objects to ISO strings for JSON serialization
        const etaValue = updateData.eta !== undefined ? updateData.eta : (guiState.eta ?? null)
        const etaString = etaValue instanceof Date ? etaValue.toISOString() : (etaValue ? new Date(etaValue).toISOString() : null)
        
        // Merge updateData with existing guiState values (updateData only has changed fields)
        broadcastProgress(worker.id, {
          progress: updateData.progress !== undefined ? updateData.progress : (guiState.progress ?? 0),
          stage: updateData.stage !== undefined ? updateData.stage : (guiState.stage ?? ''),
          stageProgress: updateData.stageProgress !== undefined ? updateData.stageProgress : (guiState.stageProgress ?? undefined),
          eta: etaString,
          simulationCount: updateData.simulationCount !== undefined ? updateData.simulationCount : (guiState.simulationCount ?? null),
          totalSimulations: updateData.totalSimulations !== undefined ? updateData.totalSimulations : (guiState.totalSimulations ?? null),
          currentCase: updateData.currentCase !== undefined ? updateData.currentCase : (guiState.currentCase ?? null)
        })
        
        // Debug logging for profiler_update
        if (messageType === 'profiler_update') {
          console.log(`[DEBUG] profiler_update received: eta_seconds=${message.eta_seconds}, eta=${etaString}`)
        }
      } catch (error) {
        console.error(`[DEBUG] SSE progress broadcast failed:`, error)
      }
    }
    
    // Write to database ASYNCHRONOUSLY (don't block response)
    prisma.guiState.update({
      where: { workerId: worker.id },
      data: updateData
    }).catch((error) => {
      console.error(`[DEBUG] Async GUI state update failed (non-critical):`, error)
    })

    // Also update assignment progress ASYNCHRONOUSLY (don't block response)
    prisma.assignment.findFirst({
      where: {
        workerId: worker.id,
        status: 'RUNNING'
      }
    }).then((activeAssignment) => {
      if (activeAssignment) {
        // Update assignment progress based on GUI state
        const newProgress = updateData.progress !== undefined ? updateData.progress : guiState.progress
        const newStage = updateData.stage !== undefined ? updateData.stage : guiState.stage

        prisma.assignment.update({
          where: { id: activeAssignment.id },
          data: {
            progress: newProgress,
            currentStage: newStage || activeAssignment.currentStage,
            eta: updateData.eta || activeAssignment.eta
          }
        }).then(() => {
          // Update super study progress
          return prisma.superStudy.findUnique({
            where: { id: activeAssignment.superStudyId },
            include: {
              assignments: true
            }
          })
        }).then((superStudy) => {
          if (superStudy) {
            const completedCount = superStudy.assignments.filter(a => a.status === 'COMPLETED').length
            const totalAssignments = superStudy.totalAssignments
            const totalProgress = superStudy.assignments.reduce((sum, a) => sum + a.progress, 0)
            const masterProgress = totalAssignments > 0 ? (totalProgress / totalAssignments) : 0

            return prisma.superStudy.update({
              where: { id: superStudy.id },
              data: {
                completedAssignments: completedCount,
                masterProgress: masterProgress,
                status: completedCount === totalAssignments ? 'COMPLETED' : 'RUNNING'
              }
            })
          }
        }).catch((error) => {
          console.warn('Failed to update assignment/superStudy progress (async):', error)
        })
      }
    }).catch((error) => {
      console.warn('Failed to find active assignment (async):', error)
    })

    // Also create a progress event ASYNCHRONOUSLY (don't block response)
    prisma.progressEvent.create({
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
      }).catch((eventError) => {
        // Log but don't fail the request if progress event creation fails
        console.warn('Failed to create progress event (async):', eventError)
      })

    // Return response IMMEDIATELY (don't wait for database writes)
    // SSE broadcasts have already happened, users see updates instantly
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
