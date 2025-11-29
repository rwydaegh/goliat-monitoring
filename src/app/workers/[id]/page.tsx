'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Computer, Activity, Clock, ArrowLeft, Trash2 } from 'lucide-react'

// GUI Screenshots Component
function GuiScreenshots({ workerId, workerStatus }: { workerId: string; workerStatus: string }) {
  const [activeTab, setActiveTab] = useState('System Utilization')
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [imageTimestamps, setImageTimestamps] = useState<Record<string, number>>({})
  const [lastSuccessfulImageUrls, setLastSuccessfulImageUrls] = useState<Record<string, string>>({})

  // Exclude 'Progress' tab - its data is already displayed via other widgets
  const tabNames = [
    'Timings',
    'Timings Piecharts',
    'Time Remaining',
    'Overall Progress',
    'System Utilization'
  ]

  // Check if worker is inactive (idle or stale)
  const isWorkerInactive = workerStatus?.toUpperCase() === 'IDLE' || workerStatus?.toUpperCase() === 'STALE'

  // Auto-refresh images every 5 seconds, but only if worker is active
  useEffect(() => {
    // Don't auto-refresh if worker is inactive
    if (isWorkerInactive) {
      return
    }

    const interval = setInterval(() => {
      // Update timestamp to bust browser cache
      const now = Date.now()
      const newTimestamps: Record<string, number> = {}
      tabNames.forEach(tabName => {
        newTimestamps[tabName] = now
      })
      setImageTimestamps(newTimestamps)
      // Clear errors when timestamp updates to retry loading (only for active workers)
      setImageErrors(new Set())
    }, 5000) // Changed from 1000ms (1s) to 5000ms (5s) to match screenshot capture frequency

    return () => clearInterval(interval)
  }, [isWorkerInactive])

  // Clear error state when switching tabs to allow retry
  const handleTabChange = (tabName: string) => {
    setActiveTab(tabName)
    // Clear error for the newly active tab to allow retry
    setImageErrors(prev => {
      const newSet = new Set(prev)
      newSet.delete(tabName)
      return newSet
    })
  }

  const handleImageError = (tabName: string) => {
    // If we have a last successful image URL, don't set error - use that instead
    if (lastSuccessfulImageUrls[tabName]) {
      // Clear error and use the last successful image
      setImageErrors(prev => {
        const newSet = new Set(prev)
        newSet.delete(tabName)
        return newSet
      })
      return
    }
    // Only set error if we don't have a fallback image
    setImageErrors(prev => new Set(prev).add(tabName))
  }

  const handleImageLoad = (tabName: string) => {
    // Clear error state when image successfully loads
    setImageErrors(prev => {
      const newSet = new Set(prev)
      newSet.delete(tabName)
      return newSet
    })
    // Store the successfully loaded image URL
    const currentUrl = getImageUrl(tabName)
    setLastSuccessfulImageUrls(prev => ({
      ...prev,
      [tabName]: currentUrl
    }))
  }

  const getImageUrl = (tabName: string) => {
    const timestamp = imageTimestamps[tabName] || Date.now()
    const sanitizedTabName = encodeURIComponent(tabName)
    return `/api/gui-screenshots/${workerId}/${sanitizedTabName}?t=${timestamp}`
  }

  const getDisplayImageUrl = (tabName: string) => {
    // If worker is inactive and we have a last successful image, use that
    // Also use it if we have an error but have a fallback (prevents blinking)
    if (lastSuccessfulImageUrls[tabName] && (isWorkerInactive || imageErrors.has(tabName))) {
      return lastSuccessfulImageUrls[tabName]
    }
    return getImageUrl(tabName)
  }

  return (
    <div className="w-full">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {tabNames.map((tabName) => (
            <button
              key={tabName}
              onClick={() => handleTabChange(tabName)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tabName
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tabName === 'Timings Piecharts' ? 'Piecharts' : tabName}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="relative">
        {tabNames.map((tabName) => (
          <div
            key={tabName}
            className={activeTab === tabName ? 'block' : 'hidden'}
          >
            {imageErrors.has(tabName) && !lastSuccessfulImageUrls[tabName] ? (
              <div className="flex items-center justify-center h-64 bg-gray-100 rounded border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <p className="text-gray-500 text-sm">No screenshot available</p>
                  <p className="text-gray-400 text-xs mt-1">Screenshots will appear when the worker is running</p>
                </div>
              </div>
            ) : (
              <div className="relative w-full bg-gray-100 rounded border border-gray-200 overflow-hidden">
                <img
                  src={getDisplayImageUrl(tabName)}
                  alt={`${tabName} Screenshot`}
                  onError={() => handleImageError(tabName)}
                  onLoad={() => handleImageLoad(tabName)}
                  className="w-full h-auto"
                  style={{ maxHeight: '600px', objectFit: 'contain' }}
                />
                <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                  {tabName}
                </div>
                {isWorkerInactive && lastSuccessfulImageUrls[tabName] && (
                  <div className="absolute top-2 left-2 bg-yellow-500 bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                    Last available
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface Worker {
  id: string
  ipAddress: string
  hostname?: string
  status: string
  lastSeen: string
  machineLabel?: string
  gpuName?: string
  cpuCores?: number
  totalRamGB?: number
  createdAt?: string
}

interface GuiState {
  id: string
  workerId: string
  stage: string
  progress: number
  stageProgress?: number
  logMessages: any[]
  eta: string | null
  status: string
  warningCount?: number
  errorCount?: number
  simulationCount?: number | null
  totalSimulations?: number | null
  currentCase?: string | null
  updatedAt: string
}

export default function WorkerDetail() {
  const params = useParams()
  const router = useRouter()
  const workerId = params.id as string
  
  const [worker, setWorker] = useState<Worker | null>(null)
  const [guiState, setGuiState] = useState<GuiState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Track scroll position and log count for smart auto-scrolling
  const logContainerRef = useRef<HTMLDivElement | null>(null)
  const previousLogCountRef = useRef<number>(0)
  const isUserAtBottomRef = useRef<boolean>(true)
  const shouldAutoScrollRef = useRef<boolean>(true) // Track if we should auto-scroll on next update
  const scrollHandlerAttachedRef = useRef<boolean>(false) // Track if scroll handler is attached

  useEffect(() => {
    const fetchWorkerDetails = async () => {
      try {
        const response = await fetch(`/api/workers/${workerId}`)
        if (!response.ok) {
          if (response.status === 404) {
            setError('Worker not found')
          } else {
            setError('Failed to fetch worker details')
          }
          setLoading(false)
          return
        }
        
        const data = await response.json()
        
        // If we were redirected from a stale worker, update the URL
        if (data.redirectedFromStale && data.worker.id !== workerId) {
          router.replace(`/workers/${data.worker.id}`, { scroll: false })
          return // Don't set state yet, let the new URL trigger a new fetch
        }
        
        setWorker(data.worker)
        
        // Safety: Sort log messages by sequence number (then timestamp) as backup
        // Only sort if sequence numbers are present (parallel batches)
        // Server should already sort, but this ensures frontend always displays correctly
        if (data.guiState?.logMessages && data.guiState.logMessages.length > 0) {
          // Check if any messages have sequence numbers (indicates parallel batches)
          const hasSequenceNumbers = data.guiState.logMessages.some((log: any) => log.sequence !== undefined)
          
          if (hasSequenceNumbers) {
            // Only sort if sequence numbers are present (parallel batches need sorting)
            const sortedLogs = [...data.guiState.logMessages].sort((a: any, b: any) => {
              // First by sequence (batch order)
              const seqA = a.sequence !== undefined ? a.sequence : -1
              const seqB = b.sequence !== undefined ? b.sequence : -1
              if (seqA !== seqB) {
                return seqA - seqB
              }
              // Then by timestamp within same sequence
              const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
              const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
              return timeA - timeB
            })
            setGuiState({ ...data.guiState, logMessages: sortedLogs })
          } else {
            // No sequence numbers = sequential batches, server already sorted correctly
            setGuiState(data.guiState)
          }
        } else {
          setGuiState(data.guiState)
        }
        
        setLoading(false)
      } catch (error) {
        console.error('Error fetching worker details:', error)
        setError('Failed to fetch worker details')
        setLoading(false)
      }
    }

    if (workerId) {
      // Reset log count tracking when worker changes
      previousLogCountRef.current = 0
      isUserAtBottomRef.current = true
      shouldAutoScrollRef.current = true // Default to auto-scroll on new worker
      scrollHandlerAttachedRef.current = false // Reset handler attachment tracking
      
      // Initial fetch to get current state (only once)
      fetchWorkerDetails()
      
      // Try SSE first for real-time updates, fallback to polling if unavailable
      let eventSource: EventSource | null = null
      let pollInterval: NodeJS.Timeout | null = null
      let sseFailed = false
      let sseConnected = false
      
      // Helper function to start polling fallback
      const startPolling = () => {
        if (pollInterval || sseConnected) {
          console.log(`[SSE] Skipping polling - already polling or SSE connected`)
          return // Already polling or SSE is working
        }
        console.warn(`[SSE] Starting polling fallback for worker ${workerId}`)
        pollInterval = setInterval(() => {
          console.log(`[POLL] Fetching worker details (polling fallback)`)
          fetchWorkerDetails()
        }, 1000)
      }
      
      // Try SSE connection
      try {
        console.log(`[SSE] Attempting to connect to /api/logs/${workerId}/stream`)
        eventSource = new EventSource(`/api/logs/${workerId}/stream`)
        
        eventSource.onopen = () => {
          console.log(`[SSE] ✅ Connected to log stream for worker ${workerId}`)
          sseFailed = false
          sseConnected = true
          // Clear polling timeout since SSE connected successfully
          if (pollTimeout) {
            clearTimeout(pollTimeout)
            pollTimeout = null
          }
          // Stop polling if it was started
          if (pollInterval) {
            console.log(`[SSE] Stopping polling - SSE connected`)
            clearInterval(pollInterval)
            pollInterval = null
          }
        }
        
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            
            if (data.type === 'connected') {
              console.log(`[SSE] Connection confirmed for worker ${data.workerId}`)
              return
            }
            
            if (data.type === 'logs' && Array.isArray(data.logs)) {
              console.log(`[SSE] Received ${data.logs.length} log(s) via SSE`)
              // Append new logs to state with deduplication
              setGuiState(prev => {
                if (!prev) return prev
                
                const existingLogs = prev.logMessages || []
                const existingKeys = new Set<string>()
                
                // Build set of existing log keys for deduplication
                existingLogs.forEach((log: any) => {
                  const seq = log.sequence !== undefined ? log.sequence : 'none'
                  const key = `${log.message}|${log.timestamp}|${seq}`
                  existingKeys.add(key)
                })
                
                // Filter out duplicates from new logs
                const newLogs = data.logs
                  .map((log: any) => ({
                    ...log,
                    sequence: log.sequence !== undefined ? log.sequence : -1
                  }))
                  .filter((log: any) => {
                    const seq = log.sequence !== undefined ? log.sequence : 'none'
                    const key = `${log.message}|${log.timestamp}|${seq}`
                    if (existingKeys.has(key)) {
                      return false // Duplicate, skip
                    }
                    existingKeys.add(key) // Mark as seen
                    return true
                  })
                
                if (newLogs.length === 0) {
                  return prev // No new logs to add
                }
                
                // Merge and sort by sequence then timestamp
                const merged = [...existingLogs, ...newLogs].sort((a: any, b: any) => {
                  const seqA = a.sequence !== undefined ? a.sequence : -1
                  const seqB = b.sequence !== undefined ? b.sequence : -1
                  if (seqA !== seqB) {
                    return seqA - seqB
                  }
                  const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
                  const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
                  return timeA - timeB
                })
                
                return { ...prev, logMessages: merged }
              })
            }
            
            if (data.type === 'progress') {
              console.log(`[SSE] Received progress update via SSE`)
              // Update progress without full refetch
              setGuiState(prev => {
                if (!prev) return prev
                return {
                  ...prev,
                  progress: data.progress.progress,
                  stage: data.progress.stage,
                  stageProgress: data.progress.stageProgress,
                  eta: data.progress.eta,
                  simulationCount: data.progress.simulationCount,
                  totalSimulations: data.progress.totalSimulations,
                  currentCase: data.progress.currentCase
                }
              })
            }
          } catch (error) {
            console.error('[SSE] Error parsing event data:', error)
          }
        }
        
        eventSource.onerror = (error) => {
          if (!sseConnected) {
            console.warn(`[SSE] Connection error for worker ${workerId}, will fallback to polling:`, error)
            sseFailed = true
            // Don't close immediately - EventSource will try to reconnect
            // Only start polling if SSE hasn't connected after timeout
          } else {
            console.warn(`[SSE] Connection error after successful connection, EventSource will reconnect`)
          }
        }
      } catch (error) {
        // SSE not supported or failed to create, use polling
        console.warn('[SSE] Not available, using polling fallback:', error)
        sseFailed = true
        startPolling()
      }
      
      // If SSE didn't connect within 3 seconds, start polling as backup
      // Note: This timeout will be cleared if SSE connects successfully
      let pollTimeout: NodeJS.Timeout | null = setTimeout(() => {
        if (!sseConnected && eventSource?.readyState !== EventSource.OPEN) {
          console.warn(`[SSE] Connection timeout after 3s for worker ${workerId}, starting polling fallback`)
          console.warn(`[SSE] EventSource readyState: ${eventSource?.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`)
          sseFailed = true
          startPolling()
        }
      }, 3000)
      
      return () => {
        if (pollTimeout) {
          clearTimeout(pollTimeout)
        }
        if (eventSource) {
          eventSource.close()
        }
        if (pollInterval) {
          clearInterval(pollInterval)
        }
      }
    }
  }, [workerId])

  // Track scroll position to determine if user is at bottom
  // Attach scroll handler when container becomes available (only once, stays attached)
  useEffect(() => {
    const logContainer = logContainerRef.current
    if (!logContainer || scrollHandlerAttachedRef.current) return

    const handleScroll = () => {
      // Check if scroll is at the very bottom (within 2 pixels for rounding errors)
      const threshold = 2
      const scrollBottom = logContainer.scrollHeight - logContainer.scrollTop - logContainer.clientHeight
      const isAtBottom = scrollBottom <= threshold
      
      isUserAtBottomRef.current = isAtBottom
      // If user manually scrolls to bottom, enable auto-scroll
      // If user scrolls away from bottom, disable auto-scroll
      shouldAutoScrollRef.current = isAtBottom
    }

    logContainer.addEventListener('scroll', handleScroll)
    scrollHandlerAttachedRef.current = true
    // Check initial position
    handleScroll()

    return () => {
      if (logContainer) {
        logContainer.removeEventListener('scroll', handleScroll)
      }
      scrollHandlerAttachedRef.current = false
    }
  }, [!!guiState?.logMessages?.length]) // Only re-run when container appears/disappears (not on every log update)

  // Smart auto-scroll: only scroll to bottom if user is already at bottom AND new logs arrived
  useEffect(() => {
    if (!guiState?.logMessages) return

    const currentLogCount = guiState.logMessages.length
    const previousLogCount = previousLogCountRef.current
    const hasNewLogs = currentLogCount > previousLogCount
    const isInitialLoad = previousLogCount === 0 && currentLogCount > 0

    const logContainer = logContainerRef.current
    if (!logContainer) return

    // On initial load, always scroll to bottom
    if (isInitialLoad) {
      // Use double requestAnimationFrame to ensure DOM has fully updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          logContainer.scrollTop = logContainer.scrollHeight
          isUserAtBottomRef.current = true
          shouldAutoScrollRef.current = true
        })
      })
      previousLogCountRef.current = currentLogCount
      return
    }

    // After initial load, only auto-scroll if:
    // 1. User was at the bottom (shouldAutoScrollRef is true)
    // 2. New logs actually arrived
    if (hasNewLogs && shouldAutoScrollRef.current) {
      // Use double requestAnimationFrame to ensure DOM has fully updated with new logs
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          logContainer.scrollTop = logContainer.scrollHeight
          // After scrolling, verify we're still at bottom
          const scrollBottom = logContainer.scrollHeight - logContainer.scrollTop - logContainer.clientHeight
          isUserAtBottomRef.current = scrollBottom <= 2
          shouldAutoScrollRef.current = scrollBottom <= 2
        })
      })
    }

    // Update the previous count AFTER handling scroll
    previousLogCountRef.current = currentLogCount
  }, [guiState?.logMessages])

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase()
    switch (statusLower) {
      case 'idle':
      case 'online': 
        return 'status-online'
      case 'running': 
        return 'bg-blue-100 text-blue-800'
      case 'offline': 
        return 'status-offline'
      case 'error':
        return 'bg-red-100 text-red-800'
      default: 
        return 'status-idle'
    }
  }

  const formatLastSeen = (lastSeen: string) => {
    const now = new Date()
    const lastSeenTime = new Date(lastSeen)
    const diffMs = now.getTime() - lastSeenTime.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    
    if (diffSecs < 30) return 'Just now'
    if (diffSecs < 60) return `${diffSecs}s ago`
    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    return `${diffHours}h ago`
  }

  const deleteWorker = async () => {
    if (!confirm(`Are you sure you want to delete this worker? This will also delete all its associated data (GUI state, progress events, assignments). This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/workers/${workerId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('Failed to delete worker')
      }
      router.push('/workers')
    } catch (error) {
      console.error('Error deleting worker:', error)
      alert('Failed to delete worker')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !worker) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Worker not found'}</p>
        <button
          onClick={() => router.push('/')}
          className="text-blue-600 hover:text-blue-900"
        >
          ← Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push('/')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {worker.machineLabel || worker.hostname || worker.ipAddress}
          </h1>
          <p className="text-sm text-gray-600 mt-1">IP: {worker.ipAddress}</p>
        </div>
        <div className="text-right">
          <div className="flex items-center space-x-3">
            <button
              onClick={deleteWorker}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 flex items-center"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </button>
            <div>
              <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(worker.status)}`}>
                {worker.status.toLowerCase()}
              </div>
              <p className="text-sm text-gray-500 mt-2">Last seen: {formatLastSeen(worker.lastSeen)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Section */}
      {guiState && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Progress</h2>
          
          {/* Simulation Info */}
          {(guiState.simulationCount !== null || guiState.currentCase) && (
            <div className="mb-6 pb-6 border-b border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {guiState.simulationCount !== null && guiState.totalSimulations !== null && (
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Simulation</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {guiState.simulationCount} / {guiState.totalSimulations}
                    </div>
                  </div>
                )}
                {guiState.currentCase && (
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Current Case</div>
                    <div className="text-lg font-semibold text-gray-900 truncate" title={guiState.currentCase}>
                      {guiState.currentCase}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Overall Progress */}
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Overall Progress</span>
              <span className="text-sm text-gray-600">{(guiState.progress ?? 0).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                style={{ width: `${guiState.progress ?? 0}%` }}
              ></div>
            </div>
          </div>

          {/* Stage Progress */}
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Current Stage</span>
              <span className="text-sm text-gray-600">{guiState.stage || 'N/A'}</span>
            </div>
            {guiState.stage && (
              <>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-green-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${guiState.stageProgress || 0}%` }}
                  ></div>
                </div>
                <div className="text-right mt-1">
                  <span className="text-xs text-gray-500">{(guiState.stageProgress || 0).toFixed(1)}%</span>
                </div>
              </>
            )}
          </div>

          {/* Time Information */}
          <div className="space-y-2 mb-4">
            {guiState.eta && (
              <>
                <div className="flex items-center text-gray-600">
                  <Clock className="h-4 w-4 mr-2" />
                  <span className="text-sm">
                    Estimated completion: {new Date(guiState.eta).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center text-gray-600">
                  <Clock className="h-4 w-4 mr-2" />
                  <span className="text-sm">
                    Time remaining: {(() => {
                      const now = new Date().getTime()
                      const etaTime = new Date(guiState.eta).getTime()
                      const remainingMs = Math.max(0, etaTime - now)
                      const hours = Math.floor(remainingMs / 3600000)
                      const minutes = Math.floor((remainingMs % 3600000) / 60000)
                      const seconds = Math.floor((remainingMs % 60000) / 1000)
                      if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
                      if (minutes > 0) return `${minutes}m ${seconds}s`
                      return `${seconds}s`
                    })()}
                  </span>
                </div>
              </>
            )}
            <div className="flex items-center text-gray-600">
              <Clock className="h-4 w-4 mr-2" />
              <span className="text-sm">
                Time elapsed: {(() => {
                  const now = new Date().getTime()
                  const createdTime = new Date(worker.createdAt || worker.lastSeen).getTime()
                  const elapsedMs = now - createdTime
                  const hours = Math.floor(elapsedMs / 3600000)
                  const minutes = Math.floor((elapsedMs % 3600000) / 60000)
                  const seconds = Math.floor((elapsedMs % 60000) / 1000)
                  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
                  if (minutes > 0) return `${minutes}m ${seconds}s`
                  return `${seconds}s`
                })()}
              </span>
            </div>
          </div>

          {/* Warnings and Errors */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Warnings</div>
                <div className="text-2xl font-semibold text-yellow-600">{guiState.warningCount || 0}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Errors</div>
                <div className="text-2xl font-semibold text-red-600">{guiState.errorCount || 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Messages */}
      {guiState && guiState.logMessages && guiState.logMessages.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Logs</h2>
          <div 
            ref={logContainerRef}
            id="log-container"
            className="space-y-1 max-h-96 overflow-y-auto bg-gray-900 rounded p-4"
          >
            {guiState.logMessages.map((log: any, idx: number) => {
              const logType = log.logType || 'default'
              // Map GOLIAT log types to colors matching status_manager.py
              const colorClass = 
                logType === 'success' ? 'text-green-500' :
                logType === 'progress' ? 'text-gray-100' :
                logType === 'warning' ? 'text-yellow-500' :
                logType === 'highlight' ? 'text-yellow-300' :
                logType === 'error' ? 'text-red-500' :
                logType === 'fatal' ? 'text-pink-500' :
                logType === 'info' ? 'text-cyan-500' :
                logType === 'header' ? 'text-pink-400' :
                logType === 'verbose' ? 'text-blue-600' :
                logType === 'caller' ? 'text-gray-500' :
                'text-gray-300'
              
              // Use sequence + timestamp + message as unique key
              // Sequence ensures uniqueness even if timestamps are identical
              const seq = log.sequence !== undefined ? log.sequence : idx
              const uniqueKey = log.timestamp && log.message 
                ? `${seq}-${log.timestamp}-${log.message.substring(0, 50)}` 
                : `log-${seq}-${idx}`
              
              return (
                <div key={uniqueKey} className={`text-sm ${colorClass} font-mono whitespace-pre`}>
                  <span className="text-gray-600 text-xs">
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                  </span>
                  {' '}
                  {log.message}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* GUI Screenshots Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">GUI Screenshots</h2>
        <GuiScreenshots workerId={worker.id} workerStatus={worker.status} />
      </div>

      {/* Worker Info */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Worker Information</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">IP Address</dt>
            <dd className="mt-1 text-sm text-gray-900">{worker.ipAddress}</dd>
          </div>
          {worker.hostname && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Hostname</dt>
              <dd className="mt-1 text-sm text-gray-900">{worker.hostname}</dd>
            </div>
          )}
          {worker.machineLabel && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Machine Label</dt>
              <dd className="mt-1 text-sm text-gray-900">{worker.machineLabel}</dd>
            </div>
          )}
          {worker.gpuName && worker.gpuName !== 'N/A' && (
            <div>
              <dt className="text-sm font-medium text-gray-500">GPU</dt>
              <dd className="mt-1 text-sm text-gray-900">{worker.gpuName}</dd>
            </div>
          )}
          {worker.cpuCores && (
            <div>
              <dt className="text-sm font-medium text-gray-500">CPU Cores</dt>
              <dd className="mt-1 text-sm text-gray-900">{worker.cpuCores}</dd>
            </div>
          )}
          {worker.totalRamGB && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Total RAM</dt>
              <dd className="mt-1 text-sm text-gray-900">{worker.totalRamGB.toFixed(1)} GB</dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1">
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(worker.status)}`}>
                {worker.status.toLowerCase()}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Last Seen</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatLastSeen(worker.lastSeen)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

