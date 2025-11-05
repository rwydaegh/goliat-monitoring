'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Layers, Clock, CheckCircle, XCircle, AlertCircle, User, ArrowLeft } from 'lucide-react'

interface Assignment {
  id: string
  status: string
  progress: number
  currentStage?: string
  startedAt?: string
  completedAt?: string
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

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
        <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(study.status)}`}>
          {study.status}
        </span>
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
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {study.assignments.map((assignment, index) => (
                <tr key={assignment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {index}
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

