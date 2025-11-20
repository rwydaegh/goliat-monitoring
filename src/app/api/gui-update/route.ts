import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

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
      const batchSequence = message.sequence !== undefined ? message.sequence : -1
      const batchSize = message.logs.length
      const msgPreviews = message.logs.slice(0, 3).map((m: any) => (m.message || '').substring(0, 30))
      console.log(`[DEBUG] Received log_batch seq=${batchSequence} with ${batchSize} messages:`, msgPreviews)
      
      // Use transaction to prevent race conditions when multiple batches arrive concurrently
      await prisma.$transaction(async (tx) => {
        // Re-read GUI state within transaction to get latest data, or create if it doesn't exist
        let currentGuiState = await tx.guiState.findUnique({
          where: { workerId: worker.id }
        })
        
        if (!currentGuiState) {
          // Create GUI state if it doesn't exist (can happen in race conditions)
          console.log(`[DEBUG] Creating GUI state for worker ${worker.id} within transaction`)
          currentGuiState = await tx.guiState.create({
            data: {
              workerId: worker.id,
              stage: '',
              progress: 0,
              logMessages: [],
              status: workerStatus,
              warningCount: 0,
              errorCount: 0
            }
          })
        }
        
        const logMessages = Array.isArray(currentGuiState.logMessages) ? [...currentGuiState.logMessages] : []
        const beforeCount = logMessages.length
        
        // Track warnings and errors from existing logs
        let warningCount = 0
        let errorCount = 0
        logMessages.forEach((log: any) => {
          const lt = log.logType || 'default'
          if (lt === 'warning' || lt === 'highlight') warningCount++
          if (lt === 'error' || lt === 'fatal') errorCount++
        })
        
        // Process each log in the batch
        const newLogs: Array<{message: string, logType: string, timestamp: string, sequence?: number, batchIndex?: number}> = []
        
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
          
          newLogs.push({
            message: logMsg.message,
            logType: logType,
            timestamp: logTimestamp,
            sequence: batchSequence >= 0 ? batchSequence : undefined,
            batchIndex: logMsg.batch_index !== undefined ? logMsg.batch_index : undefined  // Preserve order within batch
          })
          
          // Update counts
          if (logType === 'warning' || logType === 'highlight') warningCount++
          if (logType === 'error' || logType === 'fatal') errorCount++
        }
        
        // Prevent duplicates: check if messages already exist (same message + timestamp + sequence + batchIndex)
        // Use sequence + batchIndex to distinguish between retries vs. actual duplicates
        // This allows same message text with different timestamps/sequences to coexist
        const existingMessageKeys = new Set<string>()
        logMessages.forEach((log: any) => {
          // Include sequence and batchIndex in key to uniquely identify messages
          const seq = log.sequence !== undefined ? log.sequence : 'none'
          const batchIdx = log.batchIndex !== undefined ? log.batchIndex : 'none'
          const key = `${log.message}|${log.timestamp}|${seq}|${batchIdx}`
          existingMessageKeys.add(key)
        })
        
        // Filter out duplicates from new logs before adding
        const uniqueNewLogs = newLogs.filter((log: any) => {
          const seq = log.sequence !== undefined ? log.sequence : 'none'
          const batchIdx = log.batchIndex !== undefined ? log.batchIndex : 'none'
          const key = `${log.message}|${log.timestamp}|${seq}|${batchIdx}`
          if (existingMessageKeys.has(key)) {
            console.log(`[DEBUG] Skipping duplicate message (seq=${seq}, batchIdx=${batchIdx}): ${log.message.substring(0, 50)}`)
            return false
          }
          existingMessageKeys.add(key)
          return true
        })
        
        // Log if any messages were filtered
        if (uniqueNewLogs.length < newLogs.length) {
          console.log(`[DEBUG] Batch seq=${batchSequence}: Filtered ${newLogs.length - uniqueNewLogs.length} duplicates, keeping ${uniqueNewLogs.length} unique messages`)
          // Log which messages were filtered for debugging
          newLogs.forEach((log: any, idx: number) => {
            if (!uniqueNewLogs.includes(log)) {
              const seq = log.sequence !== undefined ? log.sequence : 'none'
              const batchIdx = log.batchIndex !== undefined ? log.batchIndex : 'none'
              console.log(`[DEBUG] Filtered message ${idx}: "${log.message.substring(0, 50)}" (seq=${seq}, batchIdx=${batchIdx}, ts=${log.timestamp})`)
            }
          })
        }
        
        // Add new logs to existing logs
        logMessages.push(...uniqueNewLogs)
        
        // Sort logs by timestamp, then sequence, then batchIndex to handle out-of-order batches
        logMessages.sort((a: any, b: any) => {
          // First compare by timestamp
          const timeA = new Date(a.timestamp).getTime()
          const timeB = new Date(b.timestamp).getTime()
          if (timeA !== timeB) {
            return timeA - timeB
          }
          // If timestamps are equal, use sequence number if available (for ordering batches)
          if (a.sequence !== undefined && b.sequence !== undefined) {
            if (a.sequence !== b.sequence) {
              return a.sequence - b.sequence
            }
            // If same sequence (same batch), use batchIndex to preserve order within batch
            if (a.batchIndex !== undefined && b.batchIndex !== undefined) {
              return a.batchIndex - b.batchIndex
            }
          }
          // If only one has sequence, prefer the one with sequence (shouldn't happen)
          if (a.sequence !== undefined) return -1
          if (b.sequence !== undefined) return 1
          return 0
        })
        
        const afterCount = logMessages.length
        const actuallyAdded = afterCount - beforeCount
        const filteredCount = newLogs.length - uniqueNewLogs.length
        console.log(`[DEBUG] Batch seq=${batchSequence}: ${beforeCount} -> ${afterCount} logs (added ${actuallyAdded} unique, filtered ${filteredCount} duplicates)`)
        
        // Log message previews for debugging
        if (uniqueNewLogs.length > 0) {
          const previews = uniqueNewLogs.slice(0, 3).map((log: any) => log.message.substring(0, 40))
          console.log(`[DEBUG] Batch seq=${batchSequence} messages:`, previews)
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
