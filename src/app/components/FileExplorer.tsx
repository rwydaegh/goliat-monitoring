'use client'

import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, X, Download, Eye } from 'lucide-react'

interface FileNode {
  name: string
  type: 'file' | 'directory'
  path: string
  size?: number
  children?: FileNode[]
}

interface FileExplorerProps {
  superStudyId: string
  onClose: () => void
}

export default function FileExplorer({ superStudyId, onClose }: FileExplorerProps) {
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string; filename: string; type: string } | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)

  useEffect(() => {
    const fetchFileTree = async () => {
      try {
        const response = await fetch(`/api/super-studies/${superStudyId}/results/list`)
        if (!response.ok) {
          if (response.status === 404) {
            setError('No results available yet. Results will be available after assignments complete extraction.')
          } else {
            setError('Failed to load results')
          }
          setLoading(false)
          return
        }
        const data = await response.json()
        setFileTree(data.tree || [])
        setLoading(false)
      } catch (error) {
        console.error('Error fetching file tree:', error)
        setError('Failed to load results')
        setLoading(false)
      }
    }

    fetchFileTree()
  }, [superStudyId])

  const toggleExpand = (path: string) => {
    const newExpanded = new Set(expandedPaths)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedPaths(newExpanded)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const handleFileClick = async (file: FileNode) => {
    if (file.type === 'directory') {
      toggleExpand(file.path)
      return
    }

    setLoadingFile(true)
    try {
      const response = await fetch(`/api/super-studies/${superStudyId}/results/file?path=${encodeURIComponent(file.path)}`)
      if (!response.ok) {
        throw new Error('Failed to load file')
      }
      const data = await response.json()
      setSelectedFile({
        path: file.path,
        content: data.content,
        filename: data.filename,
        type: data.type
      })
    } catch (error) {
      console.error('Error loading file:', error)
      alert('Failed to load file')
    } finally {
      setLoadingFile(false)
    }
  }

  const downloadFile = async (file: FileNode) => {
    if (file.type === 'directory') return

    setLoadingFile(true)
    try {
      const response = await fetch(`/api/super-studies/${superStudyId}/results/file?path=${encodeURIComponent(file.path)}`)
      if (!response.ok) {
        throw new Error('Failed to download file')
      }
      const data = await response.json()
      
      let blob: Blob
      if (data.type === 'text') {
        blob = new Blob([data.content], { type: 'text/plain' })
      } else {
        // Decode base64
        const binaryString = atob(data.content)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        blob = new Blob([bytes], { type: data.contentType || 'application/octet-stream' })
      }
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading file:', error)
      alert('Failed to download file')
    } finally {
      setLoadingFile(false)
    }
  }

  const renderFileNode = (node: FileNode, level: number = 0): JSX.Element => {
    const isExpanded = expandedPaths.has(node.path)
    const isDirectory = node.type === 'directory'
    const hasChildren = node.children && node.children.length > 0

    return (
      <div key={node.path}>
        <div
          className={`flex items-center py-1 px-2 hover:bg-gray-100 cursor-pointer rounded ${
            selectedFile?.path === node.path ? 'bg-blue-50' : ''
          }`}
          style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
          onClick={() => handleFileClick(node)}
        >
          {isDirectory ? (
            <>
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="h-4 w-4 mr-1 text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-1 text-gray-500" />
                )
              ) : (
                <div className="w-5 mr-1" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 mr-2 text-blue-600" />
              ) : (
                <Folder className="h-4 w-4 mr-2 text-blue-600" />
              )}
            </>
          ) : (
            <>
              <div className="w-5 mr-1" />
              <File className="h-4 w-4 mr-2 text-gray-600" />
            </>
          )}
          <span className="flex-1 text-sm text-gray-900">{node.name}</span>
          {!isDirectory && node.size !== undefined && (
            <span className="text-xs text-gray-500 mr-2">{formatFileSize(node.size)}</span>
          )}
          {!isDirectory && (
            <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => handleFileClick(node)}
                className="p-1 hover:bg-gray-200 rounded"
                title="View file"
              >
                <Eye className="h-3 w-3 text-gray-600" />
              </button>
              <button
                onClick={() => downloadFile(node)}
                className="p-1 hover:bg-gray-200 rounded"
                title="Download file"
              >
                <Download className="h-3 w-3 text-gray-600" />
              </button>
            </div>
          )}
        </div>
        {isDirectory && isExpanded && hasChildren && (
          <div>
            {node.children!.map(child => renderFileNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  const getFileExtension = (filename: string): string => {
    const parts = filename.split('.')
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
  }

  const findFileNode = (nodes: FileNode[], path: string): FileNode | null => {
    for (const node of nodes) {
      if (node.path === path) {
        return node
      }
      if (node.children) {
        const found = findFileNode(node.children, path)
        if (found) return found
      }
    }
    return null
  }

  const renderFileContent = () => {
    if (!selectedFile) return null

    const ext = getFileExtension(selectedFile.filename)
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)
    const isJson = ext === 'json'

    return (
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">{selectedFile.filename}</h3>
          <button
            onClick={() => setSelectedFile(null)}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="bg-white rounded border border-gray-200 p-4 max-h-96 overflow-auto">
          {loadingFile ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : selectedFile.type === 'text' ? (
            <pre className="text-xs font-mono whitespace-pre-wrap break-words">
              {isJson ? JSON.stringify(JSON.parse(selectedFile.content), null, 2) : selectedFile.content}
            </pre>
          ) : isImage ? (
            <img
              src={`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${selectedFile.content}`}
              alt={selectedFile.filename}
              className="max-w-full"
            />
          ) : (
            <div className="text-sm text-gray-600">
              Binary file (size: {selectedFile.content.length} bytes)
              <br />
              <button
                onClick={() => {
                  const fileNode = findFileNode(fileTree, selectedFile.path)
                  if (fileNode) downloadFile(fileNode)
                }}
                className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
              >
                Download to view
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Results Explorer</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* File Tree */}
          <div className="w-1/2 border-r border-gray-200 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-600">{error}</div>
            ) : fileTree.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No files found</div>
            ) : (
              <div>
                {fileTree.map(node => renderFileNode(node))}
              </div>
            )}
          </div>

          {/* File Preview */}
          <div className="w-1/2 overflow-y-auto">
            {selectedFile ? (
              renderFileContent()
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a file to view its contents
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

