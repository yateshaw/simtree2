import express from 'express';
import { EventEmitter } from 'events';
import { requireSuperAdmin } from '../middleware/auth';
import { broadcastEvent } from '../sse';

const router = express.Router();

/**
 * SSE Test Routes for sending test events
 * These routes are only accessible to super admins
 */

// Endpoint to send a test event
router.post('/test-event', requireSuperAdmin, async (req, res) => {
  try {
    const { eventType, data } = req.body;
    
    if (!eventType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Event type is required' 
      });
    }
    
    // Add a timestamp to the event
    const eventData = {
      type: eventType,
      data: data || {},
      timestamp: new Date().toISOString()
    };
    
    // Broadcast the event to all connected clients
    broadcastEvent(eventData);
    
    return res.json({ success: true, message: 'Test event sent' });
  } catch (error) {
    console.error('Error sending test event:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to send test event' 
    });
  }
});

export default router;