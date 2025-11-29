/**
 * SSE Connection Registry
 * 
 * Manages active Server-Sent Events connections for real-time log streaming.
 * Uses in-memory Map for single-instance deployments (Railway single instance).
 * 
 * For multi-instance scaling, consider migrating to Redis Pub/Sub.
 */

type SSEController = ReadableStreamDefaultController<string>

// Map of workerId -> Set of SSE controllers (multiple tabs can connect)
const connections = new Map<string, Set<SSEController>>()

/**
 * Register a new SSE connection for a worker
 */
export function registerConnection(workerId: string, controller: SSEController): () => void {
  if (!connections.has(workerId)) {
    connections.set(workerId, new Set())
  }
  
  const workerConnections = connections.get(workerId)!
  workerConnections.add(controller)
  
  // Return cleanup function
  return () => {
    workerConnections.delete(controller)
    if (workerConnections.size === 0) {
      connections.delete(workerId)
    }
  }
}

/**
 * Broadcast log messages to all connected clients for a worker
 */
export function broadcastLogs(workerId: string, logs: any[]): void {
  const workerConnections = connections.get(workerId)
  if (!workerConnections || workerConnections.size === 0) {
    return // No clients connected, nothing to broadcast
  }
  
  const message = JSON.stringify({
    type: 'logs',
    logs: logs,
    timestamp: new Date().toISOString()
  })
  
  const eventData = `data: ${message}\n\n`
  
  // Broadcast to all connections for this worker
  const deadConnections: SSEController[] = []
  
  for (const controller of workerConnections) {
    try {
      controller.enqueue(eventData)
    } catch (error) {
      // Connection closed, mark for cleanup
      deadConnections.push(controller)
    }
  }
  
  // Clean up dead connections
  for (const controller of deadConnections) {
    workerConnections.delete(controller)
  }
  
  if (workerConnections.size === 0) {
    connections.delete(workerId)
  }
}

/**
 * Broadcast progress updates to all connected clients for a worker
 */
export function broadcastProgress(workerId: string, progress: any): void {
  const workerConnections = connections.get(workerId)
  if (!workerConnections || workerConnections.size === 0) {
    return
  }
  
  const message = JSON.stringify({
    type: 'progress',
    progress: progress,
    timestamp: new Date().toISOString()
  })
  
  const eventData = `data: ${message}\n\n`
  
  const deadConnections: SSEController[] = []
  
  for (const controller of workerConnections) {
    try {
      controller.enqueue(eventData)
    } catch (error) {
      deadConnections.push(controller)
    }
  }
  
  for (const controller of deadConnections) {
    workerConnections.delete(controller)
  }
  
  if (workerConnections.size === 0) {
    connections.delete(workerId)
  }
}

/**
 * Get number of active connections for a worker
 */
export function getConnectionCount(workerId: string): number {
  return connections.get(workerId)?.size || 0
}

/**
 * Get total number of active connections across all workers
 */
export function getTotalConnectionCount(): number {
  let total = 0
  for (const workerConnections of connections.values()) {
    total += workerConnections.size
  }
  return total
}

