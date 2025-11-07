import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: superStudyId } = await params
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')
    
    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      )
    }
    
    // Get super study with assignments and their result files
    const superStudy = await prisma.superStudy.findUnique({
      where: { id: superStudyId },
      include: {
        assignments: {
          include: {
            resultFiles: true
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
    
    // Find the file matching the path
    let foundFile = null
    for (const assignment of superStudy.assignments) {
      for (const resultFile of assignment.resultFiles) {
        // Clean up relativePath: remove leading ..\ or ../ and normalize separators
        let cleanPath = resultFile.relativePath || ''
        cleanPath = cleanPath.replace(/^\.\.[/\\]/, '').replace(/\\/g, '/')
        
        // Construct full path: relativePath/filename
        const fullPath = cleanPath 
          ? `${cleanPath}/${resultFile.filename}`
          : resultFile.filename
        
        if (fullPath === filePath) {
          foundFile = resultFile
          break
        }
      }
      if (foundFile) break
    }
    
    if (!foundFile) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }
    
    // Convert fileData to Buffer if it's not already
    const fileBuffer = Buffer.isBuffer(foundFile.fileData) 
      ? foundFile.fileData 
      : Buffer.from(foundFile.fileData)
    
    // Determine content type based on file extension
    const ext = foundFile.filename.split('.').pop()?.toLowerCase()
    let contentType = 'application/octet-stream'
    let isText = false
    
    const textExtensions = ['txt', 'json', 'csv', 'log', 'md', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'conf']
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
    const codeExtensions = ['js', 'ts', 'py', 'html', 'css', 'sh', 'bat', 'cpp', 'c', 'h']
    
    if (textExtensions.includes(ext || '')) {
      contentType = ext === 'json' ? 'application/json' : 'text/plain'
      isText = true
    } else if (imageExtensions.includes(ext || '')) {
      contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`
    } else if (codeExtensions.includes(ext || '')) {
      contentType = 'text/plain'
      isText = true
    }
    
    // For text files, try to decode as UTF-8
    if (isText) {
      try {
        const textContent = fileBuffer.toString('utf-8')
        return NextResponse.json({
          content: textContent,
          filename: foundFile.filename,
          size: foundFile.fileSize,
          type: 'text'
        })
      } catch (e) {
        // If UTF-8 decoding fails, return as base64
        return NextResponse.json({
          content: fileBuffer.toString('base64'),
          filename: foundFile.filename,
          size: foundFile.fileSize,
          type: 'binary',
          encoding: 'base64'
        })
      }
    }
    
    // For binary files (images, etc.), return as base64
    return NextResponse.json({
      content: fileBuffer.toString('base64'),
      filename: foundFile.filename,
      size: foundFile.fileSize,
      type: 'binary',
      encoding: 'base64',
      contentType
    })
    
  } catch (error) {
    console.error('Error fetching file:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch file',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

