import { NextRequest } from 'next/server'
import { registerConnection } from '@/lib/sse-connections'

/**
 * SSE endpoint for real-time log streaming
 * 
 * Clients connect to this endpoint to receive real-time log updates
 * for a specific worker. Messages are broadcast when the worker sends
 * updates via /api/gui-update.
 * 
 * Format: /api/logs/[workerId]/stream
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  const { workerId } = await params
  
  // Create SSE stream
  const stream = new ReadableStream<string>({
    start(controller) {
      // Send initial connection message
      controller.enqueue(`data: ${JSON.stringify({ type: 'connected', workerId })}\n\n`)
      
      // Register this connection
      const cleanup = registerConnection(workerId, controller)
      
      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        cleanup()
        try {
          controller.close()
        } catch (error) {
          // Connection already closed, ignore
        }
      })
    },
    
    cancel() {
      // Client disconnected, cleanup handled by abort listener
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering in nginx
    }
  })
}

