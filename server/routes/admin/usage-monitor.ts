import express from "express";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../../auth";
import cron from "node-cron";
import { EsimAccessService } from "../../services/esim-access";

const router = express.Router();

/**
 * Robust provider status extraction supporting multiple API response formats
 * Mirrors the frontend logic in employeeUtils.ts
 */
function extractProviderStatus(rawData: any): string | null {
  if (!rawData) return null;
  
  let parsedData = rawData;
  
  // Handle string rawData by parsing JSON
  if (typeof rawData === 'string') {
    try {
      parsedData = JSON.parse(rawData);
    } catch {
      return null;
    }
  }
  
  // Handle object rawData with comprehensive pattern matching
  if (typeof parsedData === 'object') {
    // Pattern 1: obj.esimList[0].esimStatus (primary provider format)
    if (parsedData.obj?.esimList?.[0]?.esimStatus) {
      return parsedData.obj.esimList[0].esimStatus;
    }
    
    // Pattern 2: Direct esimStatus field
    if (parsedData.esimStatus) {
      return parsedData.esimStatus;
    }
    
    // Pattern 3: esimList array directly
    if (Array.isArray(parsedData.esimList) && parsedData.esimList[0]?.esimStatus) {
      return parsedData.esimList[0].esimStatus;
    }
    
    // Pattern 4: Nested data structures
    if (parsedData.data?.esimStatus) {
      return parsedData.data.esimStatus;
    }
    
    // Pattern 5: Response wrapper
    if (parsedData.response?.esimStatus) {
      return parsedData.response.esimStatus;
    }
    
    // Pattern 6: Alternative nested paths
    if (parsedData.result?.esimStatus) {
      return parsedData.result.esimStatus;
    }
  }
  
  return null;
}

/**
 * SYSTEM-WIDE eSIM cancellation detection (backend version)
 * Mirrors the frontend logic in employeeUtils.ts EXACTLY
 */
function isEsimCancelledOrRefunded(esim: any): boolean {
  if (!esim) return false;
  
  // LAYER 1: Database status - primary source of truth
  if (esim.status === 'cancelled') {
    return true;
  }
  
  // LAYER 2: Frontend cancellation flags
  if (esim.isCancelled === true) {
    return true;
  }
  
  // LAYER 3: Comprehensive metadata analysis
  const metadata = esim.metadata as any;
  if (metadata) {
    // Direct cancellation indicators
    if (metadata.isCancelled === true || 
        metadata.refunded === true ||
        metadata.status === 'cancelled') {
      return true;
    }
    
    // Cancellation timestamp presence indicates cancellation
    if (metadata.cancelledAt || 
        metadata.cancelRequestTime ||
        metadata.refundDate ||
        metadata.cancelledInProvider === true) {
      return true;
    }
    
    // Refund completion indicators
    if (metadata.pendingRefund === false && metadata.refunded === true) {
      return true;
    }
    
    // Previous status checks
    if (metadata.previousStatus === 'cancelled') {
      return true;
    }
    
    // LAYER 4: Provider API status analysis
    if (metadata.rawData) {
      const providerStatus = extractProviderStatus(metadata.rawData);
      
      // Only consider truly cancelled provider statuses
      const cancelledStatuses = [
        'CANCEL', 'CANCELLED', 'REVOKED', 'TERMINATED', 
        'SUSPENDED', 'INACTIVE', 'DISABLED', 'EXPIRED_CANCELLED'
        // Removed 'USED_EXPIRED' - this can be a valid activated state
        // Note: 'RELEASED' is NOT cancelled - it means ready for activation
      ];
      
      // IMPORTANT: Don't mark as cancelled if the main status is waiting_for_activation or activated
      if (esim.status === 'waiting_for_activation' || esim.status === 'activated') {
        // Don't check provider status for valid eSIMs - they are valid regardless of provider status
        return false;
      } else if (providerStatus && cancelledStatuses.includes(providerStatus)) {
        return true;
      }
    }
  }
  
  // LAYER 5: Time-based expiration check for activated eSIMs
  if (esim.status === 'activated' && esim.planValidity && esim.activationDate) {
    const activationDate = new Date(esim.activationDate);
    const expiryDate = new Date(activationDate);
    expiryDate.setDate(expiryDate.getDate() + esim.planValidity);
    
    const now = new Date();
    if (now > expiryDate) {
      return true;
    }
  }
  
  // LAYER 6: Status exclusions (don't treat certain statuses as cancelled)
  if (esim.status === 'error') {
    return false; // Error status doesn't mean cancelled, just needs attention
  }
  
  return false;
}

/**
 * Check if eSIM is expired based on provider status
 */
function isProviderStatusExpired(metadata: any): boolean {
  if (!metadata?.rawData) return false;
  
  const providerStatus = extractProviderStatus(metadata.rawData);
  
  // Exclude eSIMs with expired provider statuses
  return providerStatus === 'USED_EXPIRED' || providerStatus === 'EXPIRED';
}

/**
 * Check if eSIM should be considered "active" using comprehensive detection
 */
function isEsimActive(esim: any): boolean {
  // Must have active status
  if (esim.status !== 'activated' && esim.status !== 'active') {
    return false;
  }
  
  // Must not be cancelled or refunded
  if (isEsimCancelledOrRefunded(esim)) {
    return false;
  }
  
  // Must not be expired according to provider
  if (isProviderStatusExpired(esim.metadata)) {
    return false;
  }
  
  return true;
}

// Interface for usage monitoring data
interface EmployeeUsageData {
  employeeId: number;
  employeeName: string;
  companyName: string;
  companyId: number;
  esims: Array<{
    id: number;
    orderId: string;
    iccid: string;
    planName: string;
    dataLimit: string;
    dataUsed: string;
    usagePercentage: number;
    status: string;
    purchaseDate: string;
    activationDate: string | null;
    expiryDate: string | null;
    lastUpdated: string | null;
  }>;
  totalDataLimit: number;
  totalDataUsed: number;
  totalUsagePercentage: number;
  activeEsimsCount: number;
  expiredEsimsCount: number;
}

/**
 * Get comprehensive usage data for all employees and their eSIMs
 */
router.get("/usage-overview", requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log("[Usage Monitor] Fetching comprehensive usage overview...");

    // Get all purchased eSIMs with employee and company data
    const esimData = await db
      .select({
        esimId: schema.purchasedEsims.id,
        employeeId: schema.purchasedEsims.employeeId,
        employeeName: schema.employees.name,
        companyId: schema.employees.companyId,
        companyName: schema.companies.name,
        orderId: schema.purchasedEsims.orderId,
        iccid: schema.purchasedEsims.iccid,
        planName: schema.esimPlans.name,
        planData: schema.esimPlans.data,
        dataUsed: schema.purchasedEsims.dataUsed,
        status: schema.purchasedEsims.status,
        purchaseDate: schema.purchasedEsims.purchaseDate,
        activationDate: schema.purchasedEsims.activationDate,
        expiryDate: schema.purchasedEsims.expiryDate,
        metadata: schema.purchasedEsims.metadata,
      })
      .from(schema.purchasedEsims)
      .innerJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
      .innerJoin(schema.companies, eq(schema.employees.companyId!, schema.companies.id))
      .innerJoin(schema.esimPlans, eq(schema.purchasedEsims.planId!, schema.esimPlans.id))
      .orderBy(desc(schema.purchasedEsims.purchaseDate));

    // Group data by employee
    const employeeMap = new Map<number, EmployeeUsageData>();

    for (const esim of esimData) {
      const employeeId = esim.employeeId || 0;
      
      if (!employeeMap.has(employeeId)) {
        employeeMap.set(employeeId, {
          employeeId,
          employeeName: esim.employeeName || 'Unknown',
          companyName: esim.companyName || 'Unknown',
          companyId: esim.companyId || 0,
          esims: [],
          totalDataLimit: 0,
          totalDataUsed: 0,
          totalUsagePercentage: 0,
          activeEsimsCount: 0,
          expiredEsimsCount: 0,
        });
      }

      const employee = employeeMap.get(employeeId)!;
      
      // Calculate usage data - try to get real-time usage for active eSIMs
      let dataLimit = parseFloat(esim.planData.toString());
      let dataUsed = parseFloat(esim.dataUsed?.toString() || "0");
      let lastUpdated = null;
      
      // For activated eSIMs, fetch real-time usage from provider API
      if (esim.status === 'activated' || esim.status === 'active') {
        try {
          console.log(`[Usage Monitor] Fetching real-time usage for eSIM ${esim.orderId}`);
          const esimService = new EsimAccessService(db);
          const statusResult = await esimService.checkEsimStatus(esim.orderId);
          
          if (statusResult && statusResult.rawData && statusResult.rawData.obj && statusResult.rawData.obj.esimList) {
            const esimInfo = statusResult.rawData.obj.esimList[0];
            if (esimInfo && esimInfo.orderUsage !== undefined) {
              // Convert bytes to GB for consistency
              const realTimeUsedBytes = parseInt(esimInfo.orderUsage.toString());
              const realTimeUsedGB = realTimeUsedBytes / (1024 * 1024 * 1024);
              
              // Use real-time data if it shows more usage than stored data
              if (realTimeUsedGB > dataUsed) {
                dataUsed = realTimeUsedGB;
                lastUpdated = new Date().toISOString();
                console.log(`[Usage Monitor] Updated real-time usage for ${esim.orderId}: ${realTimeUsedGB.toFixed(3)}GB (${realTimeUsedBytes} bytes)`);
              } else {
                console.log(`[Usage Monitor] Real-time usage for ${esim.orderId}: ${realTimeUsedGB.toFixed(3)}GB (no update needed)`);
              }
            }
          }
        } catch (error) {
          console.log(`[Usage Monitor] Failed to fetch real-time usage for ${esim.orderId}:`, error);
        }
      }

      // Get stored last updated timestamp if we didn't update from API
      if (!lastUpdated && esim.metadata && typeof esim.metadata === 'object') {
        const metadata = esim.metadata as any;
        lastUpdated = metadata.syncedAt || metadata.dataUpdatedAt || null;
      }
      
      const usagePercentage = dataLimit > 0 ? Math.min((dataUsed / dataLimit) * 100, 100) : 0;

      // Check if expired
      const isExpired = esim.expiryDate && new Date(esim.expiryDate) < new Date();
      // Use comprehensive active detection (checks cancellation + provider status)
      const isActive = isEsimActive(esim);

      // Check if plan is depleted (100% usage) for more than 24 hours
      const isDepleted = usagePercentage >= 100;
      let shouldHideDepleted = false;

      if (isDepleted) {
        // Check when the plan was last updated to determine if it's been depleted for more than 24 hours
        let depletionCheckTime = null;
        
        if (lastUpdated) {
          depletionCheckTime = new Date(lastUpdated);
        } else if (esim.metadata && typeof esim.metadata === 'object') {
          const metadata = esim.metadata as any;
          depletionCheckTime = new Date(metadata.syncedAt || metadata.dataUpdatedAt || esim.purchaseDate);
        } else {
          // Fall back to purchase date if no other timestamp available
          depletionCheckTime = new Date(esim.purchaseDate);
        }

        // If the plan has been depleted for more than 24 hours, hide it
        const timeSinceDepletion = new Date().getTime() - depletionCheckTime.getTime();
        const hoursInMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        shouldHideDepleted = timeSinceDepletion > hoursInMs;
        
        if (shouldHideDepleted) {
          console.log(`[Usage Monitor] Hiding depleted plan ${esim.orderId} (${esim.planName}) - depleted for ${Math.round(timeSinceDepletion / hoursInMs * 24)} hours`);
        }
      }

      // Only add to display if not a depleted plan that should be hidden
      if (!shouldHideDepleted) {
        employee.esims.push({
          id: esim.esimId,
          orderId: esim.orderId,
          iccid: esim.iccid,
          planName: esim.planName,
          dataLimit: dataLimit.toFixed(2),
          dataUsed: dataUsed.toFixed(2),
          usagePercentage: Math.round(usagePercentage),
          status: esim.status,
          purchaseDate: esim.purchaseDate.toISOString(),
          activationDate: esim.activationDate?.toISOString() || null,
          expiryDate: esim.expiryDate?.toISOString() || null,
          lastUpdated,
        });

        // Update totals only for non-hidden plans
        employee.totalDataLimit += dataLimit;
        employee.totalDataUsed += dataUsed;
        
        if (isActive) {
          employee.activeEsimsCount++;
        }
        if (isExpired) {
          employee.expiredEsimsCount++;
        }
      }
    }

    // Calculate total usage percentages
    const employees = Array.from(employeeMap.values());
    for (const employee of employees) {
      if (employee.totalDataLimit > 0) {
        employee.totalUsagePercentage = Math.min(
          Math.round((employee.totalDataUsed / employee.totalDataLimit) * 100),
          100
        );
      }
    }

    const employeeData = employees.sort((a, b) => 
      b.totalUsagePercentage - a.totalUsagePercentage
    );

    // Calculate summary statistics
    const totalActiveEsims = employeeData.reduce((sum, exec) => sum + exec.activeEsimsCount, 0);
    const totalExpiredEsims = employeeData.reduce((sum, exec) => sum + exec.expiredEsimsCount, 0);
    const totalDataLimit = employeeData.reduce((sum, exec) => sum + exec.totalDataLimit, 0);
    const totalDataUsed = employeeData.reduce((sum, exec) => sum + exec.totalDataUsed, 0);
    const averageUsagePercentage = totalDataLimit > 0 ? Math.round((totalDataUsed / totalDataLimit) * 100) : 0;

    console.log(`[Usage Monitor] Retrieved data for ${employeeData.length} employees`);

    res.json({
      success: true,
      data: {
        employees: employeeData,
        summary: {
          totalEmployees: employeeData.length,
          totalActiveEsims,
          totalExpiredEsims,
          totalDataLimit: totalDataLimit.toFixed(2),
          totalDataUsed: totalDataUsed.toFixed(2),
          averageUsagePercentage,
          lastUpdated: new Date().toISOString(),
        }
      }
    });

  } catch (error) {
    console.error("[Usage Monitor] Error fetching usage overview:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch usage overview"
    });
  }
});

/**
 * Trigger manual usage sync for specific eSIM
 */
router.post("/sync-usage/:orderId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId parameter" });
    }

    console.log(`[Usage Monitor] Manual sync requested for eSIM: ${orderId}`);

    // Find the eSIM
    const [esim] = await db
      .select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.orderId, orderId));

    if (!esim) {
      return res.status(404).json({ error: "eSIM not found" });
    }

    // Initialize eSIM Access service
    const esimAccessService = new EsimAccessService(null);

    // Query usage data
    const usageResult = await esimAccessService.queryUsage([orderId]);

    if (!usageResult.success) {
      return res.status(500).json({
        error: "Failed to fetch usage data from provider",
        details: usageResult.rawData
      });
    }

    // Update eSIM with new usage data
    const updateData = {
      dataUsed: usageResult.dataUsed,
      metadata: {
        ...(esim.metadata || {}),
        syncedAt: new Date().toISOString(),
        dataUsed: usageResult.dataUsed,
        totalVolume: usageResult.totalVolume,
        usagePercentage: usageResult.usagePercentage,
        viaManualSync: true,
      },
    };

    await db
      .update(schema.purchasedEsims)
      .set(updateData)
      .where(eq(schema.purchasedEsims.id, esim.id));

    console.log(`[Usage Monitor] Successfully synced usage for eSIM ${orderId}`);

    res.json({
      success: true,
      message: "Usage data synced successfully",
      data: {
        orderId,
        dataUsed: usageResult.dataUsed,
        totalVolume: usageResult.totalVolume,
        usagePercentage: usageResult.usagePercentage,
      }
    });

  } catch (error) {
    console.error("[Usage Monitor] Error syncing usage:", error);
    res.status(500).json({
      success: false,
      error: "Failed to sync usage data"
    });
  }
});

// Schedule usage sync every 2 hours
let usageSyncJob: any = null;

/**
 * Batch sync usage data for all active eSIMs
 */
async function batchSyncUsageData() {
  try {
    console.log("[Usage Monitor] Starting batch usage sync...");

    // Get all active eSIMs that need usage updates
    const activeEsims = await db
      .select({
        id: schema.purchasedEsims.id,
        orderId: schema.purchasedEsims.orderId,
        status: schema.purchasedEsims.status,
        metadata: schema.purchasedEsims.metadata,
      })
      .from(schema.purchasedEsims)
      .where(
        and(
          sql`${schema.purchasedEsims.status} IN ('activated', 'active')`,
          sql`${schema.purchasedEsims.expiryDate} IS NULL OR ${schema.purchasedEsims.expiryDate} > NOW()`
        )
      );

    if (activeEsims.length === 0) {
      console.log("[Usage Monitor] No active eSIMs found for usage sync");
      return;
    }

    // Initialize eSIM Access service
    const esimAccessService = new EsimAccessService(null);

    // Process in batches of 10 (API limit)
    const batchSize = 10;
    let syncedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < activeEsims.length; i += batchSize) {
      const batch = activeEsims.slice(i, i + batchSize);
      const orderIds = batch.map(esim => esim.orderId);

      try {
        console.log(`[Usage Monitor] Syncing batch ${Math.floor(i/batchSize) + 1}: ${orderIds.join(', ')}`);

        // Process each eSIM individually to ensure data integrity
        for (const esim of batch) {
          try {
            const usageResult = await esimAccessService.queryUsage([esim.orderId]);

            if (usageResult.success) {
              // Update eSIM with new usage data
              await db
                .update(schema.purchasedEsims)
                .set({
                  dataUsed: usageResult.dataUsed,
                  metadata: {
                    ...(esim.metadata || {}),
                    syncedAt: new Date().toISOString(),
                    dataUsed: usageResult.dataUsed,
                    totalVolume: usageResult.totalVolume,
                    usagePercentage: usageResult.usagePercentage,
                    viaBatchSync: true,
                  },
                })
                .where(eq(schema.purchasedEsims.id, esim.id));

              syncedCount++;
              console.log(`[Usage Monitor] Synced ${esim.orderId}: ${usageResult.dataUsed}GB used`);
            } else {
              errorCount++;
              console.error(`[Usage Monitor] Failed to sync ${esim.orderId}:`, usageResult.rawData);
            }

            // Small delay between individual requests
            await new Promise(resolve => setTimeout(resolve, 200));

          } catch (error) {
            console.error(`[Usage Monitor] Error syncing ${esim.orderId}:`, error);
            errorCount++;
          }
        }

        // Rate limiting - wait 1 second between batches
        if (i + batchSize < activeEsims.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`[Usage Monitor] Error processing batch:`, error);
        errorCount += batch.length;
      }
    }

    console.log(`[Usage Monitor] Batch sync completed: ${syncedCount} synced, ${errorCount} errors`);

  } catch (error) {
    console.error("[Usage Monitor] Error in batch usage sync:", error);
  }
}

/**
 * Initialize usage monitoring with 2-hour interval
 */
export function initializeUsageMonitoring() {
  console.log("[Usage Monitor] Initializing usage monitoring with 2-hour intervals...");
  
  // Stop existing job if running
  if (usageSyncJob) {
    usageSyncJob.destroy();
  }

  // Schedule to run every 2 hours at minute 0
  usageSyncJob = cron.schedule('0 */2 * * *', async () => {
    console.log("[Usage Monitor] Running scheduled usage sync...");
    await batchSyncUsageData();
  });

  console.log("[Usage Monitor] Usage monitoring initialized - will run every 2 hours");
}

/**
 * Get usage sync status and schedule information
 */
router.get("/sync-status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const nextRun = usageSyncJob ? "Every 2 hours at minute 0" : "Not scheduled";
    const isRunning = usageSyncJob ? usageSyncJob.getStatus() : "destroyed";

    res.json({
      success: true,
      data: {
        scheduledSync: {
          interval: "Every 2 hours",
          pattern: "0 */2 * * *",
          status: isRunning,
          nextRun,
          timezone: "UTC"
        },
        lastCheck: new Date().toISOString(),
        note: "Data usage is updated every 2-3 hours by the provider and is not real-time"
      }
    });

  } catch (error) {
    console.error("[Usage Monitor] Error getting sync status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get sync status"
    });
  }
});

/**
 * Get usage data for a specific company's employees
 */
router.get("/company-usage/:companyId", requireAuth, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid company ID"
      });
    }

    console.log(`[Usage Monitor] Fetching usage data for company ${companyId}...`);

    // Get all purchased eSIMs for this company's employees
    const esimData = await db
      .select({
        esimId: schema.purchasedEsims.id,
        employeeId: schema.purchasedEsims.employeeId,
        employeeName: schema.employees.name,
        companyId: schema.employees.companyId,
        companyName: schema.companies.name,
        orderId: schema.purchasedEsims.orderId,
        iccid: schema.purchasedEsims.iccid,
        planName: schema.esimPlans.name,
        planData: schema.esimPlans.data,
        dataUsed: schema.purchasedEsims.dataUsed,
        status: schema.purchasedEsims.status,
        purchaseDate: schema.purchasedEsims.purchaseDate,
        activationDate: schema.purchasedEsims.activationDate,
        expiryDate: schema.purchasedEsims.expiryDate,
        metadata: schema.purchasedEsims.metadata,
      })
      .from(schema.purchasedEsims)
      .innerJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
      .innerJoin(schema.companies, eq(schema.employees.companyId!, schema.companies.id))
      .innerJoin(schema.esimPlans, eq(schema.purchasedEsims.planId!, schema.esimPlans.id))
      .where(eq(schema.employees.companyId!, companyId))
      .orderBy(desc(schema.purchasedEsims.purchaseDate));

    // Group data by employee
    const employeeMap = new Map<number, EmployeeUsageData>();

    for (const esim of esimData) {
      const employeeId = esim.employeeId || 0;
      
      if (!employeeMap.has(employeeId)) {
        employeeMap.set(employeeId, {
          employeeId,
          employeeName: esim.employeeName || 'Unknown',
          companyName: esim.companyName || 'Unknown',
          companyId: esim.companyId || 0,
          esims: [],
          totalDataLimit: 0,
          totalDataUsed: 0,
          totalUsagePercentage: 0,
          activeEsimsCount: 0,
          expiredEsimsCount: 0,
        });
      }

      const employee = employeeMap.get(employeeId)!;
      
      // Calculate usage data - try to get real-time usage for active eSIMs
      let dataLimit = parseFloat(esim.planData.toString());
      let dataUsed = parseFloat(esim.dataUsed?.toString() || "0");
      let lastUpdated = null;
      
      // For activated eSIMs, try to get real-time usage from metadata
      if (esim.status === 'activated' || esim.status === 'active') {
        try {
          const metadata = esim.metadata as any;
          if (metadata?.realTimeUsageBytes) {
            // Convert bytes to GB for consistency
            const realTimeUsedGB = parseInt(metadata.realTimeUsageBytes.toString()) / (1024 * 1024 * 1024);
            
            // Use real-time data if it shows more usage than stored data
            if (realTimeUsedGB > dataUsed) {
              dataUsed = realTimeUsedGB;
              lastUpdated = new Date().toISOString();
            }
          }
        } catch (error) {
          console.error(`[Usage Monitor] Error parsing metadata for eSIM ${esim.esimId}:`, error);
        }
      }

      // Calculate usage percentage
      const usagePercentage = dataLimit > 0 ? Math.min(Math.round((dataUsed / dataLimit) * 100), 100) : 0;

      // Check if plan is depleted (100% usage) for more than 24 hours
      const isDepleted = usagePercentage >= 100;
      let shouldHideDepleted = false;

      if (isDepleted) {
        // Check when the plan was last updated to determine if it's been depleted for more than 24 hours
        let depletionCheckTime = null;
        
        if (lastUpdated) {
          depletionCheckTime = new Date(lastUpdated);
        } else if (esim.metadata && typeof esim.metadata === 'object') {
          const metadata = esim.metadata as any;
          depletionCheckTime = new Date(metadata.syncedAt || metadata.dataUpdatedAt || esim.purchaseDate);
        } else {
          // Fall back to purchase date if no other timestamp available
          depletionCheckTime = new Date(esim.purchaseDate);
        }

        // If the plan has been depleted for more than 24 hours, hide it
        const timeSinceDepletion = new Date().getTime() - depletionCheckTime.getTime();
        const hoursInMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        shouldHideDepleted = timeSinceDepletion > hoursInMs;
        
        if (shouldHideDepleted) {
          console.log(`[Usage Monitor] Hiding depleted plan ${esim.orderId} (${esim.planName}) - depleted for ${Math.round(timeSinceDepletion / hoursInMs * 24)} hours`);
        }
      }

      // Only add to display if not a depleted plan that should be hidden
      if (!shouldHideDepleted) {
        // Add eSIM to employee
        employee.esims.push({
          id: esim.esimId || 0,
          orderId: esim.orderId || '',
          iccid: esim.iccid || '',
          planName: esim.planName || '',
          dataLimit: dataLimit.toFixed(2),
          dataUsed: dataUsed.toFixed(2),
          usagePercentage,
          status: esim.status || 'unknown',
          purchaseDate: esim.purchaseDate?.toISOString() || '',
          activationDate: esim.activationDate?.toISOString() || null,
          expiryDate: esim.expiryDate?.toISOString() || null,
          lastUpdated,
        });

        // Update employee totals only for non-hidden plans
        employee.totalDataLimit += dataLimit;
        employee.totalDataUsed += dataUsed;
        
        // Count active and expired eSIMs using comprehensive detection
        if (isEsimActive(esim)) {
          employee.activeEsimsCount++;
        } else if (esim.status === 'expired' || esim.status === 'cancelled' || isEsimCancelledOrRefunded(esim)) {
          employee.expiredEsimsCount++;
        }
      }
    }

    // Calculate total usage percentages
    const employees = Array.from(employeeMap.values());
    for (const employee of employees) {
      if (employee.totalDataLimit > 0) {
        employee.totalUsagePercentage = Math.min(
          Math.round((employee.totalDataUsed / employee.totalDataLimit) * 100),
          100
        );
      }
    }

    const employeeData = employees.sort((a, b) => 
      b.totalUsagePercentage - a.totalUsagePercentage
    );

    // Calculate summary statistics
    const totalActiveEsims = employeeData.reduce((sum, exec) => sum + exec.activeEsimsCount, 0);
    const totalExpiredEsims = employeeData.reduce((sum, exec) => sum + exec.expiredEsimsCount, 0);
    const totalDataLimit = employeeData.reduce((sum, exec) => sum + exec.totalDataLimit, 0);
    const totalDataUsed = employeeData.reduce((sum, exec) => sum + exec.totalDataUsed, 0);
    const averageUsagePercentage = totalDataLimit > 0 ? Math.round((totalDataUsed / totalDataLimit) * 100) : 0;

    console.log(`[Usage Monitor] Retrieved company ${companyId} data for ${employeeData.length} employees`);

    res.json({
      success: true,
      data: {
        employees: employeeData,
        summary: {
          totalEmployees: employeeData.length,
          totalActiveEsims,
          totalExpiredEsims,
          totalDataLimit: totalDataLimit.toFixed(2),
          totalDataUsed: totalDataUsed.toFixed(2),
          averageUsagePercentage,
          lastUpdated: new Date().toISOString(),
        }
      }
    });

  } catch (error) {
    console.error(`[Usage Monitor] Error fetching company usage data:`, error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch company usage data"
    });
  }
});

export { router as usageMonitorRouter };