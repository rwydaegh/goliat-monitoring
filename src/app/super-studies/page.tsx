'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Layers, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

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
}

export default function SuperStudiesPage() {
  const [superStudies, setSuperStudies] = useState<SuperStudy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSuperStudies = async () => {
      try {
        const response = await fetch('/api/super-studies')
        if (!response.ok) {
          throw new Error('Failed to fetch super studies')
        }
        const data = await response.json()
        setSuperStudies(data)
        setLoading(false)
      } catch (error) {
        console.error('Error fetching super studies:', error)
        setError('Failed to fetch super studies')
        setLoading(false)
      }
    }

    fetchSuperStudies()
    // Poll every 5 seconds
    const interval = setInterval(fetchSuperStudies, 5000)
    return () => clearInterval(interval)
  }, [])

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

  const deleteSuperStudy = async (id: string) => {
    if (!confirm('Are you sure you want to delete this super study? This will also delete all its assignments.')) {
      return
    }

    try {
      const response = await fetch(`/api/super-studies/${id}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('Failed to delete super study')
      }
      // Remove from local state
      setSuperStudies(superStudies.filter(s => s.id !== id))
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

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Studies</h1>
          <p className="mt-1 text-sm text-gray-600">
            Distributed simulation studies across multiple workers
          </p>
        </div>
        <Link href="/" className="text-blue-600 hover:text-blue-900 text-sm">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Super Studies List */}
      {superStudies.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No super studies</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a super study using: <code className="bg-gray-100 px-2 py-1 rounded">goliat super_study &lt;config&gt; --name &lt;name&gt;</code>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {superStudies.map((study) => (
            <div key={study.id} className="bg-white shadow rounded-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <Layers className="h-6 w-6 text-blue-600" />
                      <h3 className="text-lg font-medium text-gray-900">{study.name}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(study.status)}`}>
                        {study.status}
                      </span>
                    </div>
                    {study.description && (
                      <p className="mt-2 text-sm text-gray-600">{study.description}</p>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <Link
                      href={`/super-studies/${study.id}`}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
                    >
                      View Details
                    </Link>
                    <button
                      onClick={() => deleteSuperStudy(study.id)}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Progress Stats */}
                <div className="mt-4 grid grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center">
                      <Layers className="h-5 w-5 text-gray-400 mr-2" />
                      <div>
                        <p className="text-xs text-gray-500">Total Assignments</p>
                        <p className="text-lg font-semibold text-gray-900">{study.totalAssignments}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                      <div>
                        <p className="text-xs text-gray-500">Completed</p>
                        <p className="text-lg font-semibold text-gray-900">{study.completedAssignments}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center">
                      <Clock className="h-5 w-5 text-blue-600 mr-2" />
                      <div>
                        <p className="text-xs text-gray-500">Overall Progress</p>
                        <p className="text-lg font-semibold text-gray-900">{study.masterProgress.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="flex items-center">
                      <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
                      <div>
                        <p className="text-xs text-gray-500">Remaining</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {study.totalAssignments - study.completedAssignments}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progress</span>
                    <span>{study.completedAssignments} / {study.totalAssignments} assignments</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(study.completedAssignments / study.totalAssignments) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="mt-4 flex items-center text-xs text-gray-500 space-x-4">
                  <span>Created: {new Date(study.createdAt).toLocaleString()}</span>
                  <span>•</span>
                  <span>Updated: {new Date(study.updatedAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

