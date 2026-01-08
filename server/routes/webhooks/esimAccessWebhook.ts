import { Router } from "express";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";
import { emitEvent, EventTypes } from "../../sse";
import { EsimAccessService } from "../../services/esim-access";
import { webhookMonitor } from "../../services/webhookMonitor";
import { PlanDepletionService } from "../../services/plan-depletion";
import { storage } from "../../storage";
import { verifyEsimWebhookSignature } from "../../middleware/webhook-verification";

const router = Router();

/**
 * Webhook endpoint for eSIM Access to notify about status changes
 * This endpoint should be registered with eSIM Access as:
 * https://simtreeapp.replit.app/api/esim/webhook
 */
router.post("/webhook", verifyEsimWebhookSignature, async (req, res) => {
  const startTime = Date.now();
  let success = false;
  let statusCode = 500;
  let eventType = 'unknown';
  let orderId = 'unknown';
  
  try {
    console.log("[eSIM Access Webhook] Received verified webhook payload");
    
    const webhookId = req.webhookId;
    if (webhookId) {
      const existing = await db
        .select()
        .from(schema.processedWebhooks)
        .where(eq(schema.processedWebhooks.webhookId, webhookId))
        .limit(1);
      
      if (existing.length > 0) {
        console.log(`[eSIM Access Webhook] Duplicate webhook ignored: ${webhookId}`);
        return res.status(200).json({ received: true, duplicate: true });
      }
    }
    
    // Extract data from the webhook payload based on eSIM Access documentation
    const { notifyType, content } = req.body;
    const { orderNo, esimStatus, eventType: webhookEventType, orderUsage, totalVolume } = content || {};
    
    // Update tracking variables
    orderId = orderNo || 'unknown';
    eventType = webhookEventType || notifyType || 'status_update';
    
    if (!orderNo) {
      console.warn("[eSIM Access Webhook] Invalid webhook: missing orderNo");
      statusCode = 400;
      webhookMonitor.recordWebhookEvent({
        endpoint: '/api/webhooks/esim/webhook',
        success: false,
        responseTimeMs: Date.now() - startTime,
        statusCode: 400,
        eventType,
        orderId,
        error: 'Missing orderNo',
        payload: req.body
      });
      return res.status(400).json({ error: "Invalid webhook: missing orderNo" });
    }
    
    console.log(`[eSIM Access Webhook] Received status: ${esimStatus} for order ${orderNo}, event: ${eventType}`);
    if (orderUsage !== undefined) {
      console.log(`[eSIM Access Webhook] Received data usage: ${orderUsage} bytes out of ${totalVolume || 'unknown'} bytes`);
    }
    
    // Find the matching eSIM in our database
    const [esim] = await db
      .select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.orderId, orderNo));
    
    if (!esim) {
      console.warn(`[eSIM Access Webhook] No eSIM found with orderId: ${orderNo}`);
      return res.status(404).json({ error: "eSIM not found" });
    }
    
    // Status values that represent an activated eSIM
    // ONBOARD and ENABLED are the most reliable activation indicators from eSIM Access
    const ACTIVATION_STATUSES = ["ONBOARD", "ENABLED", "ACTIVATED", "IN_USE"];
    
    // Status values that represent an expired, depleted, or disabled eSIM
    const EXPIRED_STATUSES = ["EXPIRED", "DEPLETED", "DISABLED"];
    
    // Status values that represent a cancelled eSIM - expanded list
    const CANCELLATION_STATUSES = ["CANCEL", "CANCELLED", "REVOKED", "DEACTIVATED"];
    
    // Enhanced activation detection function
    const isEsimActivated = (status: string, webhookData: any) => {
      const providerStatus = status?.toUpperCase();
      
      // Direct activation statuses - ONBOARD and ENABLED are primary indicators
      if (ACTIVATION_STATUSES.includes(providerStatus)) {
        console.log(`[eSIM Access Webhook] Activation detected via status: ${providerStatus}`);
        return true;
      }
      
      // Check for installation time - indicates actual activation
      if (webhookData?.installationTime && webhookData.installationTime !== 'null' && 
          (providerStatus === 'GOT_RESOURCE' || providerStatus === 'CREATED')) {
        console.log(`[eSIM Access Webhook] Detecting activation via installation time despite status ${providerStatus}`);
        return true;
      }
      
      // Check for activation time
      if (webhookData?.activateTime && webhookData.activateTime !== 'null') {
        return true;
      }
      
      // Check for usage greater than 0 with enabled statuses
      if ((providerStatus === 'ENABLED' || providerStatus === 'ACTIVATED') && 
          webhookData?.orderUsage && parseFloat(webhookData.orderUsage) > 0) {
        return true;
      }
      
      return false;
    };
    
    // Get latest data from webhook
    let dataUsageFromWebhook = null;
    
    // Check if webhook provides usage data
    if (typeof orderUsage === 'number') {
      dataUsageFromWebhook = String(orderUsage);
      console.log(`[eSIM Access Webhook] Data usage from webhook: ${dataUsageFromWebhook} bytes`);
    }
    
    // Skipping data usage fetching for now - will be handled by sync processes
    
    // Determine if this is a data usage update webhook
    const isDataUsageUpdate = 
      eventType === 'DATA_USAGE_UPDATE' || 
      (dataUsageFromWebhook !== null && parseFloat(dataUsageFromWebhook) > 0);
    
    // Handle status changes using enhanced detection
    if (isEsimActivated(esimStatus, content) && esim.status !== "activated") {
      console.log(`[eSIM Access Webhook] Updating eSIM ${esim.id} status to 'activated'`);
      
      // Robust timestamp fallback - use provider time if valid, otherwise current time
      const providerTime = content?.activateTime || content?.installationTime;
      const isValidTimestamp = providerTime && providerTime !== 'null' && providerTime !== null;
      const activationDate = isValidTimestamp ? new Date(providerTime) : new Date();
      console.log(`[eSIM Access Webhook] Using ${isValidTimestamp ? 'provider' : 'current'} time for activation: ${activationDate.toISOString()}`);
      
      // Update the eSIM status and data usage if available
      const updateData: any = {
        status: "activated",
        activationDate: activationDate,
        metadata: {
          ...(esim.metadata || {}),
          status: "activated", // Keep metadata.status in sync with database status
          syncedAt: new Date().toISOString(),
          providerStatus: esimStatus,
          previousStatus: esim.status,
          viaWebhook: true,
          activationSource: isValidTimestamp ? 'provider' : 'fallback',
        },
      };
      
      // Add data usage info if available - convert bytes to GB for consistency
      // Using 1024^3 (1073741824) for precise byte to GB conversion
      if (dataUsageFromWebhook !== null) {
        const usageBytes = parseFloat(dataUsageFromWebhook);
        const usageGB = usageBytes / 1073741824;
        updateData.dataUsed = usageGB.toFixed(4);
        console.log(`[eSIM Access Webhook] Including data usage in activation update: ${usageBytes} bytes (${usageGB.toFixed(4)} GB)`);
      }
      
      // Update in database
      await db
        .update(schema.purchasedEsims)
        .set(updateData)
        .where(eq(schema.purchasedEsims.id, esim.id));

      // Update the employee's plan information when an eSIM is activated
      if (esim.employeeId && esim.planId) {
        console.log(`[eSIM Access Webhook] Updating plan information for employee ${esim.employeeId} due to eSIM activation`);
        
        try {
          // Get the plan details
          const [plan] = await db
            .select()
            .from(schema.esimPlans)
            .where(eq(schema.esimPlans.id, esim.planId));
          
          if (plan) {
            // Use the same activationDate calculated above for consistency
            const endDate = new Date(activationDate);
            endDate.setDate(endDate.getDate() + (plan.validity || 30));
            
            await db
              .update(schema.employees)
              .set({
                dataUsage: "0",
                dataLimit: String(plan.data),
                planStartDate: activationDate.toISOString(),
                planEndDate: endDate.toISOString(),
                planValidity: plan.validity,
              })
              .where(eq(schema.employees.id, esim.employeeId));
            
            console.log(`[eSIM Access Webhook] Successfully updated employee ${esim.employeeId} with plan: ${plan.name}, validity: ${plan.validity} days, data limit: ${plan.data} GB`);
          } else {
            console.warn(`[eSIM Access Webhook] Plan not found for planId: ${esim.planId}`);
          }
        } catch (employeeUpdateError) {
          console.error(`[eSIM Access Webhook] Error updating employee plan info:`, employeeUpdateError);
        }
      }

      // Check for plan depletion after activation with usage data
      if (dataUsageFromWebhook !== null) {
        try {
          const depletionService = new PlanDepletionService(storage);
          await depletionService.checkAndMarkDepleted(esim.id);
        } catch (error) {
          console.error(`[eSIM Access Webhook] Error checking plan depletion for eSIM ${esim.id}:`, error);
        }
      }
      
      // Emit SSE event for real-time updates
      emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
        esimId: esim.id,
        employeeId: esim.employeeId,
        oldStatus: esim.status,
        newStatus: "activated",
        orderId: esim.orderId,
        providerStatus: esimStatus,
        dataUsed: dataUsageFromWebhook,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[eSIM Access Webhook] Successfully updated eSIM ${esim.id} to 'activated'`);
    } else if (CANCELLATION_STATUSES.includes(esimStatus) && esim.status !== "cancelled") {
      console.log(`[eSIM Access Webhook] Updating eSIM ${esim.id} status to 'cancelled' (provider status: ${esimStatus})`);
      
      // Update the eSIM status and data usage if available
      const updateData: any = {
        status: "cancelled",
        metadata: {
          ...(esim.metadata || {}),
          status: "cancelled", // Keep metadata.status in sync with database status
          syncedAt: new Date().toISOString(),
          providerStatus: esimStatus,
          previousStatus: esim.status,
          viaWebhook: true,
          externallyRevoked: esimStatus !== "CANCEL", // Flag if externally revoked 
          cancelledAt: new Date().toISOString(),
        },
      };
      
      // Add data usage info if available
      if (dataUsageFromWebhook !== null) {
        updateData.dataUsed = dataUsageFromWebhook;
        console.log(`[eSIM Access Webhook] Including data usage in cancellation update: ${dataUsageFromWebhook} bytes`);
      }
      
      // Update in database
      await db
        .update(schema.purchasedEsims)
        .set(updateData)
        .where(eq(schema.purchasedEsims.id, esim.id));
      
      // Reset the employee's plan information when an eSIM is cancelled
      if (esim.employeeId) {
        console.log(`[eSIM Access Webhook] Resetting plan information for employee ${esim.employeeId} due to eSIM cancellation`);
        
        await db
          .update(schema.employees)
          .set({
            planStartDate: null,
            planEndDate: null,
            planValidity: null,
            dataUsage: "0",
            dataLimit: "0"
          })
          .where(eq(schema.employees.id, esim.employeeId));
      }
      
      // Emit SSE event for real-time updates
      emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
        esimId: esim.id,
        employeeId: esim.employeeId,
        oldStatus: esim.status,
        newStatus: "cancelled",
        orderId: esim.orderId,
        providerStatus: esimStatus,
        dataUsed: dataUsageFromWebhook,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[eSIM Access Webhook] Successfully updated eSIM ${esim.id} to 'cancelled'`);
    } else if (EXPIRED_STATUSES.includes(esimStatus?.toUpperCase())) {
      console.log(`[eSIM Access Webhook] Updating eSIM ${esim.id} status to 'expired' (provider status: ${esimStatus})`);
      
      // Update the eSIM status and data usage if available
      const updateData: any = {
        status: "expired",
        metadata: {
          ...(esim.metadata || {}),
          status: "expired", // Keep metadata.status in sync with database status
          syncedAt: new Date().toISOString(),
          providerStatus: esimStatus,
          previousStatus: esim.status,
          viaWebhook: true,
          expiredAt: new Date().toISOString(),
        },
      };
      
      // Add data usage info if available
      if (dataUsageFromWebhook !== null) {
        updateData.dataUsed = dataUsageFromWebhook;
        console.log(`[eSIM Access Webhook] Including data usage in expiration update: ${dataUsageFromWebhook} bytes`);
      }
      
      // Update in database
      await db
        .update(schema.purchasedEsims)
        .set(updateData)
        .where(eq(schema.purchasedEsims.id, esim.id));
      
      // Check if auto-renewal is enabled BEFORE resetting plan information
      if (esim.employeeId) {
        console.log(`[eSIM Access Webhook] Processing plan expiration for employee ${esim.employeeId}`);
        
        // Get employee details including auto-renewal setting
        const employee = await db.query.employees.findFirst({
          where: eq(schema.employees.id, esim.employeeId),
        });
        
        if (employee && employee.autoRenewEnabled) {
          console.log(`[eSIM Access Webhook] Employee ${employee.id} has auto-renewal enabled. Will trigger top-up process instead of resetting plan.`);
          
          // DON'T reset plan information if auto-renewal is enabled
          // Import and trigger auto-renewal immediately
          const { checkAndTriggerAutoRenewal } = require('../../utils/auto-renewal-trigger');
          checkAndTriggerAutoRenewal(esim.id, employee.id, global.appStorage);
          
        } else {
          // ONLY reset the employee's plan information if auto-renewal is NOT enabled
          console.log(`[eSIM Access Webhook] Resetting plan information for employee ${esim.employeeId} due to eSIM expiration (auto-renewal disabled)`);
          
          await db
            .update(schema.employees)
            .set({
              planStartDate: null,
              planEndDate: null,
              planValidity: null,
              dataUsage: "0",
              dataLimit: "0"
            })
            .where(eq(schema.employees.id, esim.employeeId));
          
          // Update all plan history entries to "expired" when auto-renewal is disabled
          try {
            const { storage } = require('../../storage');
            await storage.updateAllPlanHistoryToExpired(esim.employeeId);
            console.log(`[eSIM Access Webhook] Updated all plan history entries to expired for employee ${esim.employeeId}`);
          } catch (historyError) {
            console.error(`[eSIM Access Webhook] Error updating plan history to expired: ${(historyError as Error).message}`);
          }
        }
      }
      
      // Emit SSE event for real-time updates
      emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
        esimId: esim.id,
        employeeId: esim.employeeId,
        oldStatus: esim.status,
        newStatus: "expired",
        orderId: esim.orderId,
        providerStatus: esimStatus,
        dataUsed: dataUsageFromWebhook,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[eSIM Access Webhook] Successfully updated eSIM ${esim.id} to 'expired' and reset employee plan information`);
    } else if (isDataUsageUpdate) {
      // This is a data usage update without status change
      console.log(`[eSIM Access Webhook] Processing data usage update for eSIM ${esim.id}`);
      
      if (dataUsageFromWebhook !== null) {
        // Convert bytes to GB for consistency with schema expectations
        // Using 1024^3 (1073741824) for precise byte to GB conversion
        const usageBytes = parseFloat(dataUsageFromWebhook);
        const usageGB = usageBytes / 1073741824;
        
        // Update just the data usage
        await db
          .update(schema.purchasedEsims)
          .set({
            dataUsed: usageGB.toFixed(4),
            metadata: {
              ...(esim.metadata || {}),
              syncedAt: new Date().toISOString(),
              dataUsed: dataUsageFromWebhook,
              dataUpdatedAt: new Date().toISOString(),
              viaWebhook: true,
            },
          })
          .where(eq(schema.purchasedEsims.id, esim.id));
        
        // Calculate usage percentage for event (usageBytes already defined above)
        let totalBytes = 0;
        
        if (totalVolume) {
          totalBytes = totalVolume;
        } else if (esim.metadata && typeof esim.metadata === 'object') {
          const metadata = esim.metadata as any;
          if (metadata.rawData?.obj?.esimList?.[0]?.totalVolume) {
            totalBytes = metadata.rawData.obj.esimList[0].totalVolume;
          }
        }
        
        const usagePercent = totalBytes > 0 ? Math.min(Math.round((usageBytes / totalBytes) * 100), 100) : 0;
        
        // Emit data usage update event - using the STATUS_CHANGE event type to ensure compatibility
        emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
          esimId: esim.id,
          employeeId: esim.employeeId,
          oldStatus: esim.status, 
          newStatus: esim.status, // Same status as this is just a data update
          dataUsed: dataUsageFromWebhook,
          orderUsage: usageBytes,
          totalVolume: totalBytes,
          percentage: usagePercent,
          orderId: esim.orderId,
          timestamp: new Date().toISOString()
        });
        
        // Check for plan depletion after data usage update
        try {
          const depletionService = new PlanDepletionService(storage);
          await depletionService.checkAndMarkDepleted(esim.id);
        } catch (error) {
          console.error(`[eSIM Access Webhook] Error checking plan depletion for eSIM ${esim.id}:`, error);
        }

        console.log(`[eSIM Access Webhook] Successfully updated data usage for eSIM ${esim.id} to ${dataUsageFromWebhook} bytes`);
      } else {
        console.log(`[eSIM Access Webhook] No data usage value available for update, skipping`);
      }
    } else if (esim.status === "expired") {
      // Always update providerStatus in metadata even if status is already expired
      const currentMetadata = (esim.metadata || {}) as any;
      const normalizedProviderStatus = esimStatus?.toUpperCase();
      
      if (normalizedProviderStatus && currentMetadata.providerStatus !== normalizedProviderStatus) {
        console.log(`[eSIM Access Webhook] Updating providerStatus for already-expired eSIM ${esim.id}: ${currentMetadata.providerStatus} -> ${normalizedProviderStatus}`);
        
        await db
          .update(schema.purchasedEsims)
          .set({
            metadata: {
              ...currentMetadata,
              syncedAt: new Date().toISOString(),
              providerStatus: normalizedProviderStatus,
              viaWebhook: true,
            },
          })
          .where(eq(schema.purchasedEsims.id, esim.id));
        
        // Emit SSE event for real-time updates
        emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
          esimId: esim.id,
          employeeId: esim.employeeId,
          oldStatus: esim.status,
          newStatus: esim.status,
          orderId: esim.orderId,
          providerStatus: normalizedProviderStatus,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log(`[eSIM Access Webhook] eSIM ${esim.id} is already in expired state with same providerStatus, no update needed`);
      }
    } else {
      console.log(`[eSIM Access Webhook] Unknown status transition for eSIM ${esim.id} (current: ${esim.status}, provider: ${esimStatus})`);
    }
    
    // Always acknowledge receipt of the webhook
    success = true;
    statusCode = 200;
    
    // Mark webhook as processed AFTER successful handling (prevents blocking retries on failure)
    if (webhookId) {
      try {
        await db.insert(schema.processedWebhooks).values({
          webhookId,
          provider: 'esim-access',
          processedAt: new Date()
        });
      } catch (insertError) {
        // Log but don't fail - duplicate key error is expected on concurrent requests
        console.log(`[eSIM Access Webhook] Could not mark webhook as processed: ${insertError}`);
      }
    }
    
    // Record successful webhook processing
    webhookMonitor.recordWebhookEvent({
      endpoint: '/api/webhooks/esim/webhook',
      success: true,
      responseTimeMs: Date.now() - startTime,
      statusCode: 200,
      eventType,
      orderId,
      payload: req.body
    });
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[eSIM Access Webhook] Error processing webhook:", error);
    statusCode = 500;
    
    // Record failed webhook processing
    webhookMonitor.recordWebhookEvent({
      endpoint: '/api/webhooks/esim/webhook',
      success: false,
      responseTimeMs: Date.now() - startTime,
      statusCode: 500,
      eventType,
      orderId,
      error: error instanceof Error ? error.message : 'Unknown error',
      payload: req.body
    });
    
    return res.status(500).json({ error: "Internal error processing webhook" });
  }
});

export default router;