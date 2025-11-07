import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import JSZip from 'jszip'

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
            resultFiles: true
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
    
    // Check if any assignments have results
    const hasResults = superStudy.assignments.some(a => a.resultFiles.length > 0)
    if (!hasResults) {
      return NextResponse.json(
        { error: 'No results available for this super study' },
        { status: 404 }
      )
    }
    
    // Create a ZIP file
    const zip = new JSZip()
    
    // Add files from each assignment
    for (const assignment of superStudy.assignments) {
      if (assignment.resultFiles.length === 0) continue
      
      for (const resultFile of assignment.resultFiles) {
        // Clean up relativePath: remove leading ..\ or ../
        let cleanPath = resultFile.relativePath || ''
        // Remove leading ..\ or ../ and normalize separators
        cleanPath = cleanPath.replace(/^\.\.[/\\]/, '').replace(/\\/g, '/')
        
        // Construct path: relativePath/filename
        // Example: near_field/thelonious/700MHz/by_belly_up_vertical/config.json
        const filePath = cleanPath 
          ? `${cleanPath}/${resultFile.filename}`
          : resultFile.filename
        
        // Convert fileData to Buffer if it's not already
        // PostgreSQL BYTEA returns as Buffer, but ensure it's the right type
        const fileBuffer = Buffer.isBuffer(resultFile.fileData) 
          ? resultFile.fileData 
          : Buffer.from(resultFile.fileData)
        
        // Add file to zip with its relative path
        zip.file(filePath, fileBuffer)
      }
    }
    
    // Generate ZIP file as ArrayBuffer (Node.js compatible)
    const zipArrayBuffer = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    
    // Convert to Buffer for NextResponse
    const zipBuffer = Buffer.from(zipArrayBuffer)
    
    // Return ZIP file as download
    return new NextResponse(zipBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${superStudy.name}_results.zip"`,
        'Content-Length': zipBuffer.length.toString()
      }
    })
    
  } catch (error) {
    console.error('Error downloading results:', error)
    return NextResponse.json(
      {
        error: 'Failed to download results',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

