'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Computer, Activity, Clock, CheckCircle, TrendingUp, AlertTriangle, XCircle } from 'lucide-react'

interface DashboardStats {
  totalWorkers: number
  onlineWorkers: number
  runningStudies: number
  completedToday: number
  overallProgress: number
  totalWarnings: number
  totalErrors: number
}

interface Worker {
  id: string
  ipAddress: string
  hostname?: string
  status: string
  lastSeen: string
  machineLabel?: string
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalWorkers: 0,
    onlineWorkers: 0,
    runningStudies: 0,
    completedToday: 0,
    overallProgress: 0,
    totalWarnings: 0,
    totalErrors: 0
  })
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
        
        // Calculate stats from actual workers
        const totalWorkers = workersData.length
        const onlineWorkers = workersData.filter((w: any) => 
          w.status === 'IDLE' || w.status === 'RUNNING'
        ).length
        const runningStudies = workersData.filter((w: any) => 
          w.status === 'RUNNING'
        ).length
        
        // Calculate overall progress (average of all running workers)
        const runningWorkersWithProgress = workersData.filter((w: any) => 
          w.status === 'RUNNING' && w.guiState && w.guiState.progress !== undefined
        )
        const overallProgress = runningWorkersWithProgress.length > 0
          ? runningWorkersWithProgress.reduce((sum: number, w: any) => sum + (w.guiState.progress || 0), 0) / runningWorkersWithProgress.length
          : 0
        
        // Calculate total warnings and errors
        const totalWarnings = workersData.reduce((sum: number, w: any) => 
          sum + (w.guiState?.warningCount || 0), 0
        )
        const totalErrors = workersData.reduce((sum: number, w: any) => 
          sum + (w.guiState?.errorCount || 0), 0
        )
        
        // Transform Prisma worker data to match our interface
        const transformedWorkers = workersData.map((w: any) => ({
          id: w.id,
          ipAddress: w.ipAddress,
          hostname: w.hostname || undefined,
          status: w.status,
          lastSeen: w.lastSeen,
          machineLabel: w.machineLabel || undefined,
          guiState: w.guiState || undefined
        }))
        
        setWorkers(transformedWorkers)
        setStats({
          totalWorkers,
          onlineWorkers,
          runningStudies,
          completedToday: 0, // TODO: Calculate from assignments
          overallProgress: Math.round(overallProgress * 10) / 10, // Round to 1 decimal
          totalWarnings,
          totalErrors
        })
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
    const diffMins = Math.floor(diffMs / (1000 * 60))
    
    if (diffMins < 1) return 'Just now'
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
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        <p className="mt-1 text-sm text-gray-600">
          Monitor GOLIAT simulation workers and super studies across TensorDock VMs
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Computer className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Workers</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalWorkers}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Activity className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Online Workers</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.onlineWorkers}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Running Studies</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.runningStudies}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Completed Today</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.completedToday}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress and Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Overall Progress</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.overallProgress.toFixed(1)}%</dd>
                </dl>
                {stats.runningStudies > 0 && (
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(stats.overallProgress, 100)}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-yellow-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Warnings</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalWarnings}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <XCircle className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Errors</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalErrors}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workers Section */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Worker Status
          </h3>
          
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
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
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
                            {worker.machineLabel || worker.hostname || 'Unknown'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {worker.hostname || 'No hostname'}
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

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Quick Actions
          </h3>
          <div className="space-y-3 sm:space-y-0 sm:flex sm:space-x-4">
            <button className="btn-primary w-full sm:w-auto">
              Create Super Study
            </button>
            <button className="btn-secondary w-full sm:w-auto">
              Refresh Worker Status
            </button>
            <button className="btn-secondary w-full sm:w-auto">
              View All Studies
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}