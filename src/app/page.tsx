'use client'

import { useState, useEffect } from 'react'
import { Computer, Activity, Clock, CheckCircle } from 'lucide-react'

interface DashboardStats {
  totalWorkers: number
  onlineWorkers: number
  runningStudies: number
  completedToday: number
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
    completedToday: 0
  })
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Replace with actual API calls
    setTimeout(() => {
      setStats({
        totalWorkers: 4,
        onlineWorkers: 3,
        runningStudies: 2,
        completedToday: 5
      })
      setWorkers([
        {
          id: '1',
          ipAddress: '192.168.1.10',
          hostname: 'worker-01',
          status: 'online',
          lastSeen: new Date().toISOString(),
          machineLabel: 'TensorDock-VM-01'
        },
        {
          id: '2',
          ipAddress: '192.168.1.11',
          hostname: 'worker-02',
          status: 'running',
          lastSeen: new Date().toISOString(),
          machineLabel: 'TensorDock-VM-02'
        },
        {
          id: '3',
          ipAddress: '192.168.1.12',
          hostname: 'worker-03',
          status: 'online',
          lastSeen: new Date().toISOString(),
          machineLabel: 'TensorDock-VM-03'
        },
        {
          id: '4',
          ipAddress: '192.168.1.13',
          hostname: 'worker-04',
          status: 'offline',
          lastSeen: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          machineLabel: 'TensorDock-VM-04'
        }
      ])
      setLoading(false)
    }, 1000)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'status-online'
      case 'running': return 'bg-blue-100 text-blue-800'
      case 'offline': return 'status-offline'
      default: return 'status-idle'
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
                {workers.map((worker) => (
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
                        {worker.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatLastSeen(worker.lastSeen)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <a href={`/workers/${worker.id}`} className="text-blue-600 hover:text-blue-900">
                        View Details
                      </a>
                    </td>
                  </tr>
                ))}
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