import { Request, Response } from 'express';
import { EventEmitter } from 'events';

// Event type definitions
export enum EventTypes {
  ESIM_STATUS_CHANGE = 'esim_status_change',
  WALLET_BALANCE_UPDATE = 'wallet_balance_update',
  SPENDING_UPDATE = 'spending_update',
  SYSTEM_NOTIFICATION = 'system_notification',
  CONNECTION_STATUS = 'connection_status',
  AUTO_RENEWAL_EVENT = 'auto_renewal_event',
  EXECUTIVE_UPDATE = 'employee_update',
}

// Create a global event emitter for SSE events
const eventEmitter = new EventEmitter();

// Increase the maximum number of listeners to avoid memory leak warnings
eventEmitter.setMaxListeners(100);

// Track connected clients with their response objects
const clients: Map<string, Response> = new Map();

/**
 * SSE connection handler
 * Establishes and maintains an SSE connection with a client
 */
export const connectClient = (req: Request, res: Response) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

  // Generate a unique client ID
  const clientId = Date.now().toString();
  
  // Store the client connection
  clients.set(clientId, res);
  
  // Log the connection
  console.log(`[SSE] Client connected: ${clientId}`);
  
  // Send initial connection confirmation without logging
  res.write(': connected\n\n');
  
  // Set up a heartbeat to keep the connection alive
  const heartbeatInterval = setInterval(() => {
    if (res.writableEnded || !clients.has(clientId)) {
      clearInterval(heartbeatInterval);
      clients.delete(clientId);
      return;
    }
    
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      console.error(`[SSE] Heartbeat failed for client ${clientId}:`, error);
      clearInterval(heartbeatInterval);
      clients.delete(clientId);
    }
  }, 30000); // Reduced to 30 seconds for better responsiveness
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`[SSE] Client disconnected: ${clientId}`);
    clearInterval(heartbeatInterval);
    clients.delete(clientId);
    res.end();
  });
};

/**
 * Send an event to a specific client
 */
export const sendEventToClient = (clientId: string, eventData: any) => {
  const client = clients.get(clientId);
  if (client && !client.writableEnded) {
    client.write(`data: ${JSON.stringify(eventData)}\n\n`);
  }
};

/**
 * Broadcast an event to all connected clients
 */
export const broadcastEvent = (eventData: any) => {
  // Only log important events, not heartbeats
  if (eventData.type !== 'connection_status') {
    console.log(`[SSE] Broadcasting event: ${eventData.type}`);
  }
  
  clients.forEach((client, clientId) => {
    try {
      if (!client.writableEnded) {
        client.write(`data: ${JSON.stringify(eventData)}\n\n`);
      } else {
        // Clean up if the client connection is no longer active
        clients.delete(clientId);
      }
    } catch (error) {
      console.error(`[SSE] Error sending event to client ${clientId}:`, error);
      clients.delete(clientId);
    }
  });
  
  // Also emit the event for any listeners
  eventEmitter.emit('sse-event', eventData);
};

/**
 * Register a listener for SSE events
 */
export const onEvent = (callback: (eventData: any) => void) => {
  eventEmitter.on('sse-event', callback);
  
  // Return a function to remove the listener
  return () => {
    eventEmitter.off('sse-event', callback);
  };
};

/**
 * Get the count of connected clients
 */
export const getClientCount = (): number => {
  return clients.size;
};

/**
 * Helper function to emit a specific event type
 */
export const emitEvent = (eventType: EventTypes, data: any) => {
  const eventData = {
    type: eventType,
    data,
    timestamp: new Date().toISOString()
  };
  
  broadcastEvent(eventData);
  
  return eventData;
};