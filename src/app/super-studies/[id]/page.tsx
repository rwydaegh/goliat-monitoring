'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Layers, Clock, CheckCircle, XCircle, AlertCircle, User, ArrowLeft, Trash2 } from 'lucide-react'

interface Assignment {
  id: string
  index: number
  status: string
  progress: number
  currentStage?: string
  startedAt?: string
  completedAt?: string
  splitConfig?: any
  worker?: {
    id: string
    ipAddress: string
    hostname?: string
    machineLabel?: string
  }
}

interface SuperStudy {
  id: string
  name: string
  description?: string
  status: string
  totalAssignments: number
  completedAssignments: number
  masterProgress: number
  createdAt: string
  updatedAt: string
  assignments: Assignment[]
  baseConfig?: any
  baseConfigPath?: string
}

export default function SuperStudyDetail() {
  const params = useParams()
  const router = useRouter()
  const studyId = params.id as string
  
  const [study, setStudy] = useState<SuperStudy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStudy = async () => {
      try {
        const response = await fetch(`/api/super-studies/${studyId}`)
        if (!response.ok) {
          if (response.status === 404) {
            setError('Super study not found')
          } else {
            setError('Failed to fetch super study')
          }
          setLoading(false)
          return
        }
        const data = await response.json()
        setStudy(data)
        setLoading(false)
      } catch (error) {
        console.error('Error fetching super study:', error)
        setError('Failed to fetch super study')
        setLoading(false)
      }
    }

    fetchStudy()
    // Poll every 3 seconds
    const interval = setInterval(fetchStudy, 3000)
    return () => clearInterval(interval)
  }, [studyId])

  const deleteSuperStudy = async () => {
    if (!confirm(`Are you sure you want to delete "${study.name}"? This will also delete all its assignments. This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/super-studies/${studyId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('Failed to delete super study')
      }
      router.push('/super-studies')
    } catch (error) {
      console.error('Error deleting super study:', error)
      alert('Failed to delete super study')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !study) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Super study not found'}</p>
        <button
          onClick={() => router.push('/super-studies')}
          className="text-blue-600 hover:text-blue-900"
        >
          ← Back to Super Studies
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
            onClick={() => router.push('/super-studies')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Super Studies
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{study.name}</h1>
          {study.description && (
            <p className="mt-1 text-sm text-gray-600">{study.description}</p>
          )}
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={deleteSuperStudy}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 flex items-center"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </button>
          <button
            onClick={() => {
              if (!study.baseConfig) {
                alert('Base config not available')
                return
              }
              const jsonStr = JSON.stringify(study.baseConfig, null, 2)
              const blob = new Blob([jsonStr], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${study.name}_master_config.json`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded hover:bg-gray-700"
            disabled={!study.baseConfig}
          >
            View Master Config JSON
          </button>
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(study.status)}`}>
            {study.status}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <Layers className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Total Assignments</p>
              <p className="text-2xl font-bold text-gray-900">{study.totalAssignments}</p>
            </div>
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Completed</p>
              <p className="text-2xl font-bold text-gray-900">{study.completedAssignments}</p>
            </div>
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-yellow-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Remaining</p>
              <p className="text-2xl font-bold text-gray-900">
                {study.totalAssignments - study.completedAssignments}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <AlertCircle className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Overall Progress</p>
              <p className="text-2xl font-bold text-gray-900">{study.masterProgress.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Assignments</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Worker
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Started At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {study.assignments.map((assignment) => (
                <tr key={assignment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {assignment.index}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(assignment.status)}`}>
                      {assignment.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {assignment.worker ? (
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-2 text-gray-400" />
                        <span>{assignment.worker.machineLabel || assignment.worker.hostname || assignment.worker.ipAddress}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${assignment.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-600">{assignment.progress.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {assignment.currentStage || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {assignment.startedAt ? new Date(assignment.startedAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      {assignment.worker && (
                        <Link
                          href={`/workers/${assignment.worker.id}`}
                          className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors shadow-sm"
                        >
                          View Worker
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          const jsonStr = JSON.stringify(assignment.splitConfig || {}, null, 2)
                          const blob = new Blob([jsonStr], { type: 'application/json' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `${study.name}_assignment_${assignment.index}.json`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                        className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 transition-colors"
                        disabled={!assignment.splitConfig}
                      >
                        View JSON
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Command Reference */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Worker Commands</h3>
        <p className="text-sm text-blue-700 mb-3">
          Workers can claim assignments using:
        </p>
        <code className="block bg-blue-100 text-blue-900 p-3 rounded font-mono text-sm">
          goliat worker &lt;N&gt; {study.name}
        </code>
        <p className="text-xs text-blue-600 mt-2">
          Where &lt;N&gt; is the assignment index (0-{study.totalAssignments - 1})
        </p>
      </div>
    </div>
  )
}

