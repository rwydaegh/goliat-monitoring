import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface FileNode {
  name: string
  type: 'file' | 'directory'
  path: string
  size?: number
  children?: FileNode[]
}

function buildFileTree(files: Array<{ filename: string; relativePath: string; fileSize: number }>): FileNode[] {
  const root: FileNode = { name: '', type: 'directory', path: '', children: [] }
  
  for (const file of files) {
    // Clean up relativePath: remove leading ..\ or ../ and normalize separators
    let cleanPath = file.relativePath || ''
    cleanPath = cleanPath.replace(/^\.\.[/\\]/, '').replace(/\\/g, '/')
    
    // Construct full path: relativePath/filename
    const fullPath = cleanPath 
      ? `${cleanPath}/${file.filename}`
      : file.filename
    
    // Split path into parts
    const parts = fullPath.split('/').filter(p => p.length > 0)
    
    // Navigate/create directory structure
    let current = root
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!current.children) {
        current.children = []
      }
      
      let dir = current.children.find(c => c.name === part && c.type === 'directory')
      if (!dir) {
        const dirPath = parts.slice(0, i + 1).join('/')
        dir = {
          name: part,
          type: 'directory',
          path: dirPath,
          children: []
        }
        current.children.push(dir)
      }
      current = dir
    }
    
    // Add file
    if (!current.children) {
      current.children = []
    }
    
    const fileName = parts[parts.length - 1]
    const fileNode: FileNode = {
      name: fileName,
      type: 'file',
      path: fullPath,
      size: file.fileSize
    }
    
    current.children.push(fileNode)
  }
  
  // Sort: directories first, then files, both alphabetically
  function sortNodes(nodes: FileNode[]): void {
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    
    nodes.forEach(node => {
      if (node.children) {
        sortNodes(node.children)
      }
    })
  }
  
  if (root.children) {
    sortNodes(root.children)
  }
  
  return root.children || []
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: superStudyId } = await params
    
    // Get super study with assignments and their result files
    const superStudy = await prisma.superStudy.findUnique({
      where: { id: superStudyId },
      include: {
        assignments: {
          include: {
            resultFiles: {
              select: {
                filename: true,
                relativePath: true,
                fileSize: true
              }
            }
          },
          orderBy: {
            index: 'asc'
          }
        }
      }
    })
    
    if (!superStudy) {
      return NextResponse.json(
        { error: 'Super study not found' },
        { status: 404 }
      )
    }
    
    // Collect all result files
    const allFiles: Array<{ filename: string; relativePath: string; fileSize: number }> = []
    for (const assignment of superStudy.assignments) {
      for (const resultFile of assignment.resultFiles) {
        allFiles.push({
          filename: resultFile.filename,
          relativePath: resultFile.relativePath,
          fileSize: resultFile.fileSize
        })
      }
    }
    
    if (allFiles.length === 0) {
      return NextResponse.json(
        { error: 'No results available for this super study' },
        { status: 404 }
      )
    }
    
    // Build file tree
    const fileTree = buildFileTree(allFiles)
    
    return NextResponse.json({
      tree: fileTree,
      totalFiles: allFiles.length,
      totalSize: allFiles.reduce((sum, f) => sum + f.fileSize, 0)
    })
    
  } catch (error) {
    console.error('Error listing results:', error)
    return NextResponse.json(
      {
        error: 'Failed to list results',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

