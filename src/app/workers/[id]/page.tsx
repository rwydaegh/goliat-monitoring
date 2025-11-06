'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Computer, Activity, Clock, ArrowLeft, Trash2 } from 'lucide-react'

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
        setGuiState(data.guiState)
        setLoading(false)
        
        // Scroll log container to bottom (showing latest logs) after render
        setTimeout(() => {
          const logContainer = document.getElementById('log-container')
          if (logContainer) {
            logContainer.scrollTop = logContainer.scrollHeight
          }
        }, 100)
      } catch (error) {
        console.error('Error fetching worker details:', error)
        setError('Failed to fetch worker details')
        setLoading(false)
      }
    }

    if (workerId) {
      fetchWorkerDetails()
      
      // Poll for updates every 1 second for faster log updates
      const interval = setInterval(fetchWorkerDetails, 1000)
      return () => clearInterval(interval)
    }
  }, [workerId])

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
          
          {/* Overall Progress */}
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Overall Progress</span>
              <span className="text-sm text-gray-600">{guiState.progress.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                style={{ width: `${guiState.progress}%` }}
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
            id="log-container"
            className="space-y-1 max-h-96 overflow-y-auto bg-gray-900 rounded p-4"
          >
            {guiState.logMessages.slice(-50).map((log: any, idx: number) => {
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
              
              return (
                <div key={idx} className={`text-sm ${colorClass} font-mono whitespace-pre`}>
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

