import { Router } from 'express';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import { emitEvent, EventTypes } from '../sse';

const router = Router();

/**
 * Recovery endpoint for handling externally revoked eSIMs
 * This is used when an eSIM has been manually revoked directly from the platform
 */
router.post('/handle-revoked-esim', async (req, res) => {
  try {
    const { iccid, orderId } = req.body;
    
    if (!iccid && !orderId) {
      return res.status(400).json({
        success: false,
        error: "Either ICCID or orderId is required"
      });
    }
    
    // Find the matching eSIM in our database
    let query = db.select().from(schema.purchasedEsims);
    
    if (iccid) {
      query = query.where(eq(schema.purchasedEsims.iccid, iccid));
    } else if (orderId) {
      query = query.where(eq(schema.purchasedEsims.orderId, orderId));
    }
    
    const [esim] = await query;
    
    if (!esim) {
      return res.status(404).json({
        success: false,
        error: `No eSIM found with ${iccid ? 'ICCID: ' + iccid : 'orderId: ' + orderId}`
      });
    }
    
    console.log(`[Recovery] Processing externally revoked eSIM recovery for ${esim.id}`);
    
    // Update the eSIM to ensure it's properly marked as cancelled
    const updateData = {
      status: "cancelled",
      metadata: {
        ...(esim.metadata || {}),
        syncedAt: new Date().toISOString(),
        previousStatus: esim.status,
        externallyRevoked: true,
        cancelledAt: new Date().toISOString(),
        recoveryProcessed: true
      }
    };
    
    // Update in database
    await db
      .update(schema.purchasedEsims)
      .set(updateData)
      .where(eq(schema.purchasedEsims.id, esim.id));
    
    // Reset the employee's plan information if an employee is associated
    if (esim.employeeId) {
      console.log(`[Recovery] Resetting plan information for employee ${esim.employeeId}`);
      
      await db
        .update(schema.employees)
        .set({
          currentPlan: null,
          planStartDate: null,
          planEndDate: null,
          planValidity: null,
          dataUsage: "0",
          dataLimit: "0"
        })
        .where(eq(schema.employees.id, esim.employeeId));
    }
    
    // Emit event for real-time updates
    emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
      esimId: esim.id,
      employeeId: esim.employeeId,
      oldStatus: esim.status,
      newStatus: "cancelled",
      orderId: esim.orderId,
      iccid: esim.iccid,
      externallyRevoked: true,
      timestamp: new Date().toISOString()
    });
    
    return res.status(200).json({
      success: true,
      message: `Successfully recovered externally revoked eSIM ${esim.id}`,
      esimId: esim.id,
      employeeId: esim.employeeId,
      iccid: esim.iccid,
      orderId: esim.orderId
    });
  } catch (error) {
    console.error("[Recovery] Error handling externally revoked eSIM:", error);
    return res.status(500).json({
      success: false,
      error: "Internal error processing recovery",
      details: error.message
    });
  }
});

export default router;