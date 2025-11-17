import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string; tabName: string }> }
) {
  try {
    const { workerId, tabName } = await params

    if (!workerId || !tabName) {
      return NextResponse.json(
        { error: 'workerId and tabName are required' },
        { status: 400 }
      )
    }

    // Sanitize tab name for filename (replace spaces and special chars with underscores)
    const sanitizedTabName = tabName.replace(/[^a-zA-Z0-9]/g, '_')
    const filepath = join(
      process.cwd(),
      'public',
      'gui-screenshots',
      workerId,
      `${sanitizedTabName}.jpg`
    )

    // Check if file exists
    if (!existsSync(filepath)) {
      return NextResponse.json(
        { error: 'Screenshot not found' },
        { status: 404 }
      )
    }

    // Read file
    const fileBuffer = await readFile(filepath)

    // Return image with proper headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('Error serving GUI screenshot:', error)
    return NextResponse.json(
      { 
        error: 'Failed to serve screenshot',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

