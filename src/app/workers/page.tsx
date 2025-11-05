'use client'

import { useState, useEffect } from 'react'
import { Computer, Activity, Clock, CheckCircle } from 'lucide-react'
import Link from 'next/link'

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
  guiState?: {
    progress: number
    stageProgress?: number
    stage: string
    warningCount?: number
    errorCount?: number
    eta?: string
  }
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const response = await fetch('/api/workers')
        if (!response.ok) {
          throw new Error('Failed to fetch workers')
        }
        const workersData = await response.json()
        
        const transformedWorkers = workersData.map((w: any) => ({
          id: w.id,
          ipAddress: w.ipAddress,
          hostname: w.hostname || undefined,
          status: w.status,
          lastSeen: w.lastSeen,
          machineLabel: w.machineLabel || undefined,
          gpuName: w.gpuName || undefined,
          cpuCores: w.cpuCores || undefined,
          totalRamGB: w.totalRamGB || undefined,
          guiState: w.guiState || undefined
        }))
        
        setWorkers(transformedWorkers)
        setLoading(false)
      } catch (error) {
        console.error('Error fetching workers:', error)
        setLoading(false)
      }
    }

    fetchWorkers()
    
    // Poll for updates every 3 seconds
    const interval = setInterval(fetchWorkers, 3000)
    return () => clearInterval(interval)
  }, [])

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
  
  const getStatusDisplay = (status: string) => {
    const statusLower = status.toLowerCase()
    switch (statusLower) {
      case 'idle': return 'idle'
      case 'running': return 'running'
      case 'offline': return 'offline'
      case 'error': return 'error'
      default: return statusLower
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Workers</h1>
        <p className="mt-1 text-sm text-gray-600">
          Monitor all registered GOLIAT simulation workers
        </p>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Worker
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time Remaining
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Warnings
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Errors
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Seen
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {workers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-500">
                      No workers registered yet. Start a GOLIAT study with web monitoring enabled to see workers here.
                    </td>
                  </tr>
                ) : (
                  workers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <Computer className="h-6 w-6 text-gray-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {worker.gpuName && worker.gpuName !== 'N/A' 
                              ? worker.gpuName 
                              : (worker.machineLabel || worker.hostname || 'Unknown')}
                          </div>
                          <div className="text-sm text-gray-500">
                            {worker.gpuName && worker.gpuName !== 'N/A' && worker.hostname 
                              ? `Hostname: ${worker.hostname}` 
                              : (worker.hostname || 'No hostname')}
                            {worker.cpuCores && ` • ${worker.cpuCores} cores`}
                            {worker.totalRamGB && ` • ${worker.totalRamGB.toFixed(1)} GB RAM`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{worker.ipAddress}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`status-indicator ${getStatusColor(worker.status)}`}>
                        {getStatusDisplay(worker.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {worker.guiState?.progress !== undefined ? `${worker.guiState.progress.toFixed(1)}%` : 'N/A'}
                      </div>
                      {worker.guiState && worker.guiState.progress !== undefined && worker.guiState.progress > 0 && (
                        <div className="mt-1 w-20 bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full"
                            style={{ width: `${worker.guiState.progress}%` }}
                          ></div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {worker.guiState?.eta ? (() => {
                        const now = new Date().getTime()
                        const etaTime = new Date(worker.guiState.eta).getTime()
                        const remainingMs = Math.max(0, etaTime - now)
                        const hours = Math.floor(remainingMs / 3600000)
                        const minutes = Math.floor((remainingMs % 3600000) / 60000)
                        const seconds = Math.floor((remainingMs % 60000) / 1000)
                        if (hours > 0) return `${hours}h ${minutes}m`
                        if (minutes > 0) return `${minutes}m ${seconds}s`
                        return `${seconds}s`
                      })() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-yellow-600 font-medium">
                        {worker.guiState ? worker.guiState.warningCount || 0 : 0}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-red-600 font-medium">
                        {worker.guiState ? worker.guiState.errorCount || 0 : 0}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatLastSeen(worker.lastSeen)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link href={`/workers/${worker.id}`} className="text-blue-600 hover:text-blue-900">
                        View Details
                      </Link>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

