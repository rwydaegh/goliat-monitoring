import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assignmentId } = await params
    
    // Parse multipart form data
    const formData = await request.formData()
    const relativePath = formData.get('relativePath') as string || ''
    
    // Get all uploaded files
    const files = formData.getAll('files') as File[]
    
    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }
    
    // Verify assignment exists
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId }
    })
    
    if (!assignment) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      )
    }
    
    // Delete existing result files for this assignment (overwrite)
    await prisma.resultFile.deleteMany({
      where: { assignmentId }
    })
    
    // Store each file
    const savedFiles = []
    for (const file of files) {
      const filename = file.name
      const buffer = Buffer.from(await file.arrayBuffer())
      
      const resultFile = await prisma.resultFile.create({
        data: {
          assignmentId,
          filename,
          relativePath,
          fileData: buffer,
          fileSize: buffer.length
        }
      })
      
      savedFiles.push({
        id: resultFile.id,
        filename: resultFile.filename,
        size: resultFile.fileSize
      })
    }
    
    return NextResponse.json({
      success: true,
      filesUploaded: savedFiles.length,
      files: savedFiles
    })
    
  } catch (error) {
    console.error('Error uploading results:', error)
    return NextResponse.json(
      {
        error: 'Failed to upload results',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

