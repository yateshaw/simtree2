import { Router } from "express";
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";
import { emitEvent, EventTypes } from "../sse";
import { EsimAccessService } from "../services/esim-access";
import { storage } from "../storage";

const router = Router();

/**
 * Check live provider status for an eSIM and update if needed
 * This queries the actual provider API to get the current status
 */
router.get("/esim/check/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId parameter" });
    }
    
    console.log(`[Sync] Checking live provider status for order: ${orderId}`);
    
    // Find the corresponding eSIM - select only required columns to avoid schema mismatch
    const [esim] = await db
      .select({
        id: schema.purchasedEsims.id,
        orderId: schema.purchasedEsims.orderId,
        status: schema.purchasedEsims.status,
        employeeId: schema.purchasedEsims.employeeId,
        metadata: schema.purchasedEsims.metadata,
        activationDate: schema.purchasedEsims.activationDate,
      })
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.orderId, orderId));
    
    if (!esim) {
      return res.status(404).json({ error: `No eSIM found with orderId: ${orderId}` });
    }
    
    // Query live status from provider
    const esimAccessService = new EsimAccessService(storage);
    const statusResult = await esimAccessService.checkEsimStatus(orderId);
    
    const providerStatus = statusResult.rawData?.obj?.esimList?.[0]?.esimStatus?.toUpperCase();
    const smdpStatus = statusResult.rawData?.obj?.esimList?.[0]?.smdpStatus?.toUpperCase();
    const activateTime = statusResult.rawData?.obj?.esimList?.[0]?.activateTime;
    const installationTime = statusResult.rawData?.obj?.esimList?.[0]?.installationTime;
    
    console.log(`[Sync] Live provider status: esimStatus=${providerStatus}, smdpStatus=${smdpStatus}, activateTime=${activateTime}`);
    
    // Define activation statuses
    const ACTIVATED_STATUSES = ['ONBOARD', 'ENABLED', 'ACTIVATED', 'IN_USE'];
    const hasActivateTime = activateTime && activateTime !== 'null' && activateTime !== null;
    const hasInstallTime = installationTime && installationTime !== 'null' && installationTime !== null;
    
    // Determine if eSIM should be activated
    const shouldBeActivated = ACTIVATED_STATUSES.includes(providerStatus || '') || 
                              hasActivateTime || hasInstallTime;
    
    let newStatus = esim.status;
    let statusChanged = false;
    
    if (shouldBeActivated && esim.status === 'waiting_for_activation') {
      newStatus = 'activated';
      statusChanged = true;
      
      // Determine activation date
      const providerTime = activateTime || installationTime;
      const isValidTimestamp = providerTime && providerTime !== 'null' && providerTime !== null;
      const activationDate = isValidTimestamp ? new Date(providerTime) : new Date();
      
      await db
        .update(schema.purchasedEsims)
        .set({
          status: "activated",
          activationDate: activationDate,
          metadata: {
            ...(esim.metadata || {}),
            syncedAt: new Date().toISOString(),
            status: "activated",
            providerStatus: providerStatus,
            smdpStatus: smdpStatus,
            previousStatus: esim.status,
            viaManualSync: true,
            rawData: statusResult.rawData,
          },
        })
        .where(eq(schema.purchasedEsims.id, esim.id));
      
      emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
        esimId: esim.id,
        employeeId: esim.employeeId,
        oldStatus: esim.status,
        newStatus: "activated",
        orderId: esim.orderId,
        providerStatus: providerStatus,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[Sync] Updated eSIM ${esim.id} from '${esim.status}' to 'activated' based on live provider status`);
    } else {
      // Just update metadata with latest provider data
      await db
        .update(schema.purchasedEsims)
        .set({
          metadata: {
            ...(esim.metadata || {}),
            syncedAt: new Date().toISOString(),
            providerStatus: providerStatus,
            smdpStatus: smdpStatus,
            rawData: statusResult.rawData,
          },
        })
        .where(eq(schema.purchasedEsims.id, esim.id));
    }
    
    return res.status(200).json({
      success: true,
      message: statusChanged 
        ? `eSIM ${orderId} status changed from '${esim.status}' to '${newStatus}'`
        : `eSIM ${orderId} status remains '${esim.status}' (provider: ${providerStatus})`,
      esim: {
        id: esim.id,
        orderId: esim.orderId,
        previousStatus: esim.status,
        currentStatus: newStatus,
        statusChanged,
        providerStatus,
        smdpStatus,
        activateTime,
        installationTime,
        shouldBeActivated
      }
    });
    
  } catch (error) {
    console.error("[Sync] Error checking live eSIM status:", error);
    return res.status(500).json({ error: "Internal error checking eSIM status" });
  }
});

/**
 * Force update status to activated (legacy route)
 */
router.get("/esim/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId parameter" });
    }
    
    console.log(`[Sync] Force syncing eSIM status for order: ${orderId}`);
    
    // Find the corresponding eSIM
    const [esim] = await db
      .select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.orderId, orderId));
    
    if (!esim) {
      return res.status(404).json({ error: `No eSIM found with orderId: ${orderId}` });
    }
    
    // Force update status to 'activated'
    await db
      .update(schema.purchasedEsims)
      .set({
        status: "activated",
        activationDate: new Date(),
        metadata: {
          ...(esim.metadata || {}),
          syncedAt: new Date().toISOString(),
          status: "activated",
          providerStatus: "ACTIVATED",
          previousStatus: esim.status,
          viaSync: true,
        },
      })
      .where(eq(schema.purchasedEsims.id, esim.id));
    
    // Emit SSE event for real-time updates
    emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
      esimId: esim.id,
      employeeId: esim.employeeId,
      oldStatus: esim.status,
      newStatus: "activated",
      orderId: esim.orderId,
      providerStatus: "ACTIVATED",
      timestamp: new Date().toISOString()
    });
    
    console.log(`[Sync] Successfully forced eSIM ${esim.id} status to 'activated'`);
    
    // Respond with the updated status
    return res.status(200).json({
      success: true, 
      message: `eSIM ${orderId} status changed to 'activated'`,
      esim: {
        id: esim.id,
        orderId: esim.orderId,
        status: "activated"
      }
    });
    
  } catch (error) {
    console.error("[Sync] Error forcing eSIM status:", error);
    return res.status(500).json({ error: "Internal error forcing eSIM status" });
  }
});

/**
 * This route syncs the data usage information for an eSIM
 * It queries the provider API to get the latest usage data
 */
router.get("/esim/usage/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId parameter" });
    }
    
    console.log(`[Sync] Syncing data usage for eSIM order: ${orderId}`);
    
    // Find the corresponding eSIM
    const [esim] = await db
      .select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.orderId, orderId));
    
    if (!esim) {
      return res.status(404).json({ error: `No eSIM found with orderId: ${orderId}` });
    }
    
    // Initialize eSIM Access service
    const esimAccessService = new EsimAccessService();
    
    // Query for updated eSIM status including data usage
    console.log(`[Sync] Checking eSIM status for order: ${orderId}`);
    const statusResult = await esimAccessService.checkStatus(orderId);
    
    if (!statusResult || !statusResult.success) {
      console.error(`[Sync] Failed to get eSIM status from provider: ${JSON.stringify(statusResult)}`);
      return res.status(500).json({ 
        error: "Failed to get eSIM status from provider",
        providerResponse: statusResult || null
      });
    }
    
    // Extract data usage information
    let dataUsed = "0";
    let orderUsage = 0;
    let totalVolume = 0;
    let expiryDate = null;
    let esimStatus = null;
    
    if (statusResult.obj?.esimList && statusResult.obj.esimList.length > 0) {
      const esimInfo = statusResult.obj.esimList[0];
      
      // Update orderUsage if available
      if (typeof esimInfo.orderUsage === 'number') {
        orderUsage = esimInfo.orderUsage;
        dataUsed = String(orderUsage); // Store as string for consistency
      }
      
      // Update totalVolume if available
      if (typeof esimInfo.totalVolume === 'number') {
        totalVolume = esimInfo.totalVolume;
      }
      
      // Update expiryDate if available
      if (esimInfo.expiredTime) {
        expiryDate = new Date(esimInfo.expiredTime);
      }
      
      // Get provider status
      if (esimInfo.esimStatus) {
        esimStatus = esimInfo.esimStatus;
      }
    }
    
    // Update the eSIM data in our database
    await db
      .update(schema.purchasedEsims)
      .set({
        dataUsed: dataUsed,
        expiryDate: expiryDate,
        metadata: {
          ...(esim.metadata || {}),
          syncedAt: new Date().toISOString(),
          rawData: statusResult,
          dataUsed: dataUsed,
          viaDataSync: true,
        },
      })
      .where(eq(schema.purchasedEsims.id, esim.id));
    
    console.log(`[Sync] Successfully updated eSIM ${esim.id} data usage to ${dataUsed} bytes`);
    
    // Calculate data usage percentage for the response
    const usagePercent = totalVolume > 0 ? Math.min(Math.round((orderUsage / totalVolume) * 100), 100) : 0;
    
    // Emit SSE event for real-time updates
    emitEvent(EventTypes.ESIM_DATA_USAGE_CHANGE, {
      esimId: esim.id,
      employeeId: esim.employeeId,
      dataUsed: dataUsed,
      orderUsage: orderUsage,
      totalVolume: totalVolume,
      percentage: usagePercent,
      orderId: esim.orderId,
      timestamp: new Date().toISOString()
    });
    
    // Respond with the updated usage data
    return res.status(200).json({
      success: true, 
      message: `Updated data usage for eSIM ${orderId}`,
      esim: {
        id: esim.id,
        orderId: esim.orderId,
        dataUsed: dataUsed,
        usageBytes: orderUsage,
        totalBytes: totalVolume,
        usagePercent: usagePercent,
        status: esimStatus
      }
    });
    
  } catch (error) {
    console.error("[Sync] Error syncing eSIM data usage:", error);
    return res.status(500).json({ error: "Internal error syncing eSIM data usage" });
  }
});

export default router;