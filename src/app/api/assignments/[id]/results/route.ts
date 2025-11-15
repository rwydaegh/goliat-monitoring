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
    
    // Prepare file data first (read into memory)
    const fileData = []
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      fileData.push({
        filename: file.name,
        buffer,
        size: buffer.length
      })
    }
    
    // Atomically delete old files and create new ones in a transaction
    const savedFiles = await prisma.$transaction(async (tx) => {
      // Delete existing result files for this assignment and relativePath (only this simulation's files)
      await tx.resultFile.deleteMany({
        where: {
          assignmentId,
          relativePath: relativePath || ''
        }
      })
      
      // Store each file
      const created = []
      for (const { filename, buffer, size } of fileData) {
        const resultFile = await tx.resultFile.create({
          data: {
            assignmentId,
            filename,
            relativePath,
            fileData: buffer,
            fileSize: size
          }
        })
        
        created.push({
          id: resultFile.id,
          filename: resultFile.filename,
          size: resultFile.fileSize
        })
      }
      
      return created
    })
    
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

