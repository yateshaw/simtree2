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

/**
 * RECONCILIATION ENDPOINT: Import orphan eSIM from provider
 * Use this when an eSIM exists at the provider but not in our database
 * (e.g., purchase succeeded at provider but local DB insert failed)
 */
router.post("/esim/reconcile", async (req, res) => {
  try {
    const { orderId, employeeId, companyId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: "Missing required field: orderId" });
    }
    
    if (!employeeId || !companyId) {
      return res.status(400).json({ 
        error: "Missing required fields: employeeId and companyId are required to associate the eSIM" 
      });
    }
    
    console.log(`[Reconcile] Attempting to import orphan eSIM: ${orderId}`);
    
    // Check if eSIM already exists locally
    const [existingEsim] = await db
      .select({ id: schema.purchasedEsims.id })
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.orderId, orderId.toUpperCase()));
    
    if (existingEsim) {
      return res.status(409).json({ 
        error: `eSIM with orderId ${orderId} already exists in database`,
        esimId: existingEsim.id
      });
    }
    
    // Query provider for eSIM details
    const esimAccessService = new EsimAccessService(storage);
    const providerData = await esimAccessService.checkEsimStatus(orderId);
    
    if (!providerData || !providerData.rawData?.obj?.esimList?.length) {
      return res.status(404).json({ 
        error: `No eSIM found at provider with orderId: ${orderId}` 
      });
    }
    
    const esimInfo = providerData.rawData.obj.esimList[0];
    const packageInfo = esimInfo.packageList?.[0];
    
    console.log(`[Reconcile] Found eSIM at provider:`, {
      orderId,
      iccid: esimInfo.iccid,
      status: esimInfo.esimStatus,
      packageName: packageInfo?.packageName
    });
    
    // Find matching plan in our database
    let planId = null;
    if (packageInfo?.packageCode) {
      const [plan] = await db
        .select({ id: schema.esimPlans.id })
        .from(schema.esimPlans)
        .where(eq(schema.esimPlans.providerId, packageInfo.packageCode));
      if (plan) {
        planId = plan.id;
      }
    }
    
    // Determine status based on provider status
    const ACTIVATED_STATUSES = ['ONBOARD', 'ENABLED', 'ACTIVATED', 'IN_USE'];
    const providerStatus = esimInfo.esimStatus?.toUpperCase();
    const hasActivateTime = esimInfo.activateTime && esimInfo.activateTime !== 'null';
    const isActivated = ACTIVATED_STATUSES.includes(providerStatus) || hasActivateTime;
    const localStatus = isActivated ? 'activated' : 'waiting_for_activation';
    
    // Get activation date
    const activationDate = hasActivateTime 
      ? new Date(esimInfo.activateTime) 
      : (isActivated ? new Date() : null);
    
    // Get expiry date
    const expiryDate = esimInfo.expiredTime ? new Date(esimInfo.expiredTime) : null;
    
    // Calculate data used (convert from bytes to GB)
    const dataUsedBytes = esimInfo.orderUsage || 0;
    const dataUsedGB = (dataUsedBytes / 1073741824).toFixed(4);
    
    // Create the purchased_esims record
    const [newEsim] = await db
      .insert(schema.purchasedEsims)
      .values({
        employeeId: parseInt(employeeId),
        planId: planId,
        orderId: orderId.toUpperCase(),
        iccid: esimInfo.iccid || '',
        activationCode: esimInfo.ac || null,
        qrCode: esimInfo.qrCode || null,
        status: localStatus,
        purchaseDate: new Date(),
        activationDate: activationDate,
        expiryDate: expiryDate,
        dataUsed: dataUsedGB,
        metadata: {
          importedViaReconcile: true,
          reconcileDate: new Date().toISOString(),
          providerStatus: providerStatus,
          smdpStatus: esimInfo.smdpStatus,
          packageName: packageInfo?.packageName,
          rawData: providerData.rawData,
        },
      })
      .returning();
    
    console.log(`[Reconcile] Successfully imported orphan eSIM:`, {
      id: newEsim.id,
      orderId: newEsim.orderId,
      status: newEsim.status,
      employeeId: newEsim.employeeId
    });
    
    // Emit event for UI updates
    emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
      esimId: newEsim.id,
      employeeId: newEsim.employeeId,
      oldStatus: null,
      newStatus: newEsim.status,
      orderId: newEsim.orderId,
      providerStatus: providerStatus,
      timestamp: new Date().toISOString(),
      action: 'reconcile_import'
    });
    
    return res.status(201).json({
      success: true,
      message: `Successfully imported orphan eSIM ${orderId}`,
      esim: {
        id: newEsim.id,
        orderId: newEsim.orderId,
        status: newEsim.status,
        iccid: newEsim.iccid,
        employeeId: newEsim.employeeId,
        planId: newEsim.planId,
        providerStatus: providerStatus,
        packageName: packageInfo?.packageName
      }
    });
    
  } catch (error) {
    console.error("[Reconcile] Error importing orphan eSIM:", error);
    return res.status(500).json({ 
      error: "Internal error importing orphan eSIM",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * LOOKUP ENDPOINT: Search for eSIM at provider without importing
 * Useful to verify an order exists before reconciling
 */
router.get("/esim/lookup/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId parameter" });
    }
    
    console.log(`[Lookup] Searching for eSIM at provider: ${orderId}`);
    
    // Check if exists locally
    const [localEsim] = await db
      .select({
        id: schema.purchasedEsims.id,
        orderId: schema.purchasedEsims.orderId,
        status: schema.purchasedEsims.status,
        employeeId: schema.purchasedEsims.employeeId
      })
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.orderId, orderId.toUpperCase()));
    
    // Query provider
    const esimAccessService = new EsimAccessService(storage);
    const providerData = await esimAccessService.checkEsimStatus(orderId);
    
    const esimInfo = providerData?.rawData?.obj?.esimList?.[0];
    const packageInfo = esimInfo?.packageList?.[0];
    
    return res.status(200).json({
      orderId,
      existsLocally: !!localEsim,
      existsAtProvider: !!esimInfo,
      localRecord: localEsim || null,
      providerRecord: esimInfo ? {
        iccid: esimInfo.iccid,
        esimStatus: esimInfo.esimStatus,
        smdpStatus: esimInfo.smdpStatus,
        packageName: packageInfo?.packageName,
        packageCode: packageInfo?.packageCode,
        activateTime: esimInfo.activateTime,
        expiredTime: esimInfo.expiredTime,
        orderUsage: esimInfo.orderUsage,
        totalVolume: esimInfo.totalVolume
      } : null,
      isOrphan: !localEsim && !!esimInfo,
      recommendation: !localEsim && !!esimInfo 
        ? "This eSIM exists at provider but not locally. Use /api/sync/esim/reconcile to import it."
        : localEsim && !esimInfo 
          ? "This eSIM exists locally but not at provider. Provider may have deleted it."
          : !localEsim && !esimInfo
            ? "This eSIM does not exist at provider or locally."
            : "This eSIM is properly synced."
    });
    
  } catch (error) {
    console.error("[Lookup] Error searching for eSIM:", error);
    return res.status(500).json({ error: "Internal error searching for eSIM" });
  }
});

export default router;