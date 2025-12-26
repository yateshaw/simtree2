/**
 * Plan Depletion Detection Service
 * Handles automatic detection of 95% usage and plan depletion logic
 */

import { eq, and, or } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../../shared/schema";
import { EsimAccessService } from "./esim-access";
import { processAutoRenewals } from "../cron/auto-renewal-job";

export class PlanDepletionService {
  constructor(private storage: any) {}

  /**
   * Check if an eSIM has reached 95% usage and mark as depleted
   */
  async checkAndMarkDepleted(esimId: number): Promise<boolean> {
    try {
      // Get the eSIM details
      const esim = await db.query.purchasedEsims.findFirst({
        where: eq(schema.purchasedEsims.id, esimId),
        with: {
          plan: true,
          employee: true
        }
      });

      if (!esim || !esim.plan) {
        console.log(`[Depletion] eSIM ${esimId} not found or missing plan`);
        return false;
      }

      // Skip if already depleted, expired, or cancelled
      if (esim.status === 'depleted' || esim.status === 'expired' || esim.status === 'cancelled') {
        return false;
      }

      // Only check active eSIMs
      if (esim.status !== 'activated' && esim.status !== 'active') {
        return false;
      }

      let usagePercentage = 0;
      let isDepleted = false;

      // Method 1: Check stored dataUsed vs plan data limit
      // Note: dataUsed is stored in GB after conversion from provider bytes/MB
      if (esim.dataUsed) {
        const dataUsedGB = parseFloat(esim.dataUsed);
        const dataLimitGB = parseFloat(esim.plan.data);
        
        if (dataLimitGB > 0) {
          usagePercentage = (dataUsedGB / dataLimitGB) * 100;
          isDepleted = usagePercentage >= 95;
          
          console.log(`[Depletion] eSIM ${esimId} - Method 1: Used: ${dataUsedGB}GB of ${dataLimitGB}GB (${usagePercentage.toFixed(2)}%)`);
        }
      }

      // Method 2: Check metadata usage data (if available and method 1 didn't find depletion)
      if (!isDepleted && esim.metadata && typeof esim.metadata === 'object' && 
          // @ts-ignore - rawData may exist in metadata
          esim.metadata.rawData) {
        
        let orderUsage = null;
        let totalVolume = null;

        // Handle rawData as object
        if (typeof esim.metadata.rawData === 'object' &&
            esim.metadata.rawData.obj &&
            typeof esim.metadata.rawData.obj === 'object' &&
            Array.isArray(esim.metadata.rawData.obj.esimList) && 
            esim.metadata.rawData.obj.esimList[0]) {
          
          const esimData = esim.metadata.rawData.obj.esimList[0];
          
          if (typeof esimData.orderUsage === 'number' && 
              typeof esimData.totalVolume === 'number') {
            orderUsage = esimData.orderUsage;
            totalVolume = esimData.totalVolume;
          }
        }

        // Handle rawData as string
        if (orderUsage === null && typeof esim.metadata.rawData === 'string') {
          try {
            const parsedData = JSON.parse(esim.metadata.rawData);
            if (parsedData.obj?.esimList?.[0]) {
              const esimData = parsedData.obj.esimList[0];
              
              if (typeof esimData.orderUsage === 'number' && 
                  typeof esimData.totalVolume === 'number') {
                orderUsage = esimData.orderUsage;
                totalVolume = esimData.totalVolume;
              }
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }

        // Check depletion from metadata (provider raw data in bytes)
        if (orderUsage !== null && totalVolume !== null && totalVolume > 0) {
          usagePercentage = (orderUsage / totalVolume) * 100;
          isDepleted = usagePercentage >= 95;
          
          console.log(`[Depletion] eSIM ${esimId} - Method 2: Used: ${orderUsage} bytes of ${totalVolume} bytes (${usagePercentage.toFixed(2)}%)`);
        }
      }

      // If depleted, mark the eSIM as depleted and handle auto-renewal
      if (isDepleted) {
        console.log(`[Depletion] eSIM ${esimId} reached 95% usage (${usagePercentage.toFixed(2)}%) - marking as depleted`);

        // Update eSIM status to depleted
        await db.update(schema.purchasedEsims)
          .set({ 
            status: 'depleted',
            metadata: {
              ...esim.metadata,
              depletedAt: new Date().toISOString(),
              depletionPercentage: usagePercentage.toFixed(2),
              depletionDetectionMethod: esim.dataUsed ? 'stored_data' : 'metadata'
            }
          })
          .where(eq(schema.purchasedEsims.id, esimId));

        // Check if auto-renewal is enabled for this employee
        if (esim.employee && esim.employee.autoRenewEnabled) {
          console.log(`[Depletion] Auto-renewal enabled for employee ${esim.employee.id} - triggering renewal`);
          
          // Set processing flag to prevent double-triggering
          await db.update(schema.purchasedEsims)
            .set({ 
              metadata: {
                ...esim.metadata,
                autoRenewalProcessing: true,
                autoRenewalTriggeredAt: new Date().toISOString()
              }
            })
            .where(eq(schema.purchasedEsims.id, esimId));
          
          // Trigger auto-renewal for this specific eSIM
          await processAutoRenewals(this.storage, undefined, esimId);
        } else {
          console.log(`[Depletion] Auto-renewal disabled for employee ${esim.employee?.id} - eSIM will show as 'no plan'`);
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error(`[Depletion] Error checking depletion for eSIM ${esimId}:`, error);
      return false;
    }
  }

  /**
   * Batch check multiple eSIMs for depletion
   */
  async checkMultipleEsims(esimIds: number[]): Promise<void> {
    console.log(`[Depletion] Checking ${esimIds.length} eSIMs for depletion`);
    
    for (const esimId of esimIds) {
      try {
        await this.checkAndMarkDepleted(esimId);
      } catch (error) {
        console.error(`[Depletion] Error checking eSIM ${esimId}:`, error);
      }
    }
  }

  /**
   * Check all active eSIMs for depletion (periodic maintenance)
   */
  async checkAllActiveEsims(): Promise<void> {
    try {
      console.log('[Depletion] Checking all active eSIMs for depletion');

      // Get all active eSIMs that are not already depleted/expired/cancelled
      const activeEsims = await db.select({ id: schema.purchasedEsims.id })
        .from(schema.purchasedEsims)
        .where(or(
          eq(schema.purchasedEsims.status, 'activated'),
          eq(schema.purchasedEsims.status, 'active')
        ));

      console.log(`[Depletion] Found ${activeEsims.length} active eSIMs to check`);

      // Check each eSIM
      for (const esim of activeEsims) {
        await this.checkAndMarkDepleted(esim.id);
      }

      console.log('[Depletion] Completed checking all active eSIMs');
    } catch (error) {
      console.error('[Depletion] Error during batch depletion check:', error);
    }
  }
}