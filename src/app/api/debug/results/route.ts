import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const superStudyName = searchParams.get('superStudy')
    
    if (!superStudyName) {
      return NextResponse.json({ error: 'Missing superStudy parameter' }, { status: 400 })
    }
    
    // Get super study
    const superStudy = await prisma.superStudy.findFirst({
      where: { name: superStudyName },
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
      return NextResponse.json({ error: 'Super study not found' }, { status: 404 })
    }
    
    // Count files per assignment
    const assignmentStats = superStudy.assignments.map(a => ({
      index: a.index,
      status: a.status,
      progress: a.progress,
      resultFileCount: a.resultFiles.length,
      files: a.resultFiles.map(f => ({
        filename: f.filename,
        size: f.fileSize,
        relativePath: f.relativePath
      }))
    }))
    
    const totalFiles = superStudy.assignments.reduce((sum, a) => sum + a.resultFiles.length, 0)
    
    return NextResponse.json({
      superStudy: {
        name: superStudy.name,
        id: superStudy.id,
        totalAssignments: superStudy.totalAssignments,
        completedAssignments: superStudy.completedAssignments
      },
      totalResultFiles: totalFiles,
      assignments: assignmentStats
    })
    
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch results', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

