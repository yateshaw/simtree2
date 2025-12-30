import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, lt } from 'drizzle-orm';
import { EsimAccessService } from '../services/esim-access';
import { EventTypes, emitEvent } from '../sse';
import { checkAndTriggerAutoRenewal } from '../utils/auto-renewal-trigger';

interface EsimMetadata {
  isCancelled?: boolean;
  refunded?: boolean;
  status?: string;
  syncedAt?: string;
  previousStatus?: string;
  providerStatus?: string;
  rawData?: {
    obj?: {
      esimList?: Array<{
        esimStatus?: string;
        [key: string]: any;
      }>;
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export async function syncEsimStatuses(storage: any, esimAccessService?: EsimAccessService, orphanedOnly: boolean = false) {
  try {
    if (orphanedOnly) {
      console.log('[Sync] Starting orphaned eSIM cleanup (48+ hours stale)');
    } else {
      console.log('[Sync] Starting eSIM status synchronization');
    }

    if (!esimAccessService) {
      esimAccessService = new EsimAccessService(storage);
    }

    let activeEsims;
    
    if (orphanedOnly) {
      // Only check a small subset for true orphaned records
      // Limit to 10 oldest records to minimize API calls
      activeEsims = await db.select()
        .from(schema.purchasedEsims)
        .where(eq(schema.purchasedEsims.status, 'waiting_for_activation'))
        .limit(10);
      console.log(`[Sync] Checking ${activeEsims.length} oldest eSIMs for orphaned status (webhooks handle real-time)`);
    } else {
      activeEsims = await db.select()
        .from(schema.purchasedEsims)
        .where(eq(schema.purchasedEsims.status, 'waiting_for_activation'));
      console.log(`[Sync] Found ${activeEsims.length} eSIMs to check for status updates`);
    }

    let updatedCount = 0;

    for (const esim of activeEsims) {
      try {
        const metadata = esim.metadata as EsimMetadata | null || {};
        const isCancelledInMetadata = 
          metadata.isCancelled === true || 
          metadata.refunded === true || 
          metadata.rawData?.obj?.esimList?.[0]?.esimStatus === 'CANCEL';

        if (isCancelledInMetadata && esim.status !== 'cancelled') {
          console.log(`[Sync] eSIM ${esim.id} has cancellation flags in metadata but incorrect status '${esim.status}'`);

          await db.update(schema.purchasedEsims)
            .set({
              status: 'cancelled',
              metadata: {
                ...(esim.metadata || {}),
                isCancelled: true,
                status: 'cancelled',
                syncedAt: new Date().toISOString(),
                previousStatus: esim.status
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));

          emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
            esimId: esim.id,
            oldStatus: esim.status,
            newStatus: 'cancelled',
            employeeId: esim.employeeId,
            orderId: esim.orderId,
            timestamp: new Date().toISOString()
          });

          updatedCount++;
          continue;
        }

        console.log(`[Sync] Checking provider status for eSIM ${esim.id} (${esim.orderId})`);
        const statusData = await esimAccessService.checkEsimStatus(esim.orderId);
        const esimData = statusData.rawData?.obj?.esimList?.[0];
        // Normalize provider statuses to uppercase for consistent comparison
        const providerStatus = esimData?.esimStatus?.toUpperCase();
        const smdpStatus = esimData?.smdpStatus?.toUpperCase();
        const orderUsage = esimData?.orderUsage || 0;
        const totalVolume = esimData?.totalVolume || 0;
        
        console.log(`[Sync] Provider data for eSIM ${esim.id}: esimStatus=${providerStatus}, smdpStatus=${smdpStatus}, usage=${orderUsage}/${totalVolume}`);

        const ACTIVATED_STATUSES = ['ONBOARD', 'IN_USE', 'ENABLED', 'ACTIVATED'];
        const EXPIRED_STATUSES = ['EXPIRED', 'DEPLETED', 'DISABLED', 'USED_UP', 'USED_EXPIRED', 'REVOKED'];
        
        // Check activation from multiple indicators
        const isActivated = ACTIVATED_STATUSES.includes(providerStatus || '') || 
                           (smdpStatus === 'ENABLED' && orderUsage > 0) ||
                           esimData?.activateTime;
        
        // Check expiration from multiple indicators
        const isExpiredOrDepleted = EXPIRED_STATUSES.includes(providerStatus || '') ||
                                    smdpStatus === 'DISABLED' ||
                                    (totalVolume > 0 && orderUsage >= totalVolume);

        if (providerStatus === 'CANCEL' && esim.status !== 'cancelled') {
          console.log(`[Sync] Updating eSIM ${esim.id} status from '${esim.status}' to 'cancelled' based on provider status`);

          await db.update(schema.purchasedEsims)
            .set({
              status: 'cancelled',
              metadata: {
                ...(esim.metadata || {}),
                isCancelled: true,
                status: 'cancelled',
                syncedAt: new Date().toISOString(),
                previousStatus: esim.status,
                providerStatus,
                smdpStatus
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));

          emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
            esimId: esim.id,
            oldStatus: esim.status,
            newStatus: 'cancelled',
            employeeId: esim.employeeId,
            orderId: esim.orderId,
            providerStatus,
            timestamp: new Date().toISOString()
          });

          updatedCount++;
        } else if (isExpiredOrDepleted && esim.status !== 'expired') {
          console.log(`[Sync] Updating eSIM ${esim.id} status from '${esim.status}' to 'expired' based on provider status: ${providerStatus}`);

          // Update the eSIM status to expired - also update metadata.status for consistency
          await db.update(schema.purchasedEsims)
            .set({
              status: 'expired',
              metadata: {
                ...(esim.metadata || {}),
                status: 'expired', // Keep metadata.status in sync with database status
                syncedAt: new Date().toISOString(),
                previousStatus: esim.status,
                providerStatus,
                expiredAt: new Date().toISOString(),
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
          
          // Reset the employee's plan information
          if (esim.employeeId) {
            console.log(`[Sync] Resetting plan information for employee ${esim.employeeId} due to eSIM expiration/depletion`);
            
            await db.update(schema.employees)
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
          
          // Emit SSE event for real-time updates
          emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
            esimId: esim.id,
            oldStatus: esim.status,
            newStatus: 'expired',
            employeeId: esim.employeeId,
            orderId: esim.orderId,
            providerStatus,
            timestamp: new Date().toISOString()
          });
          
          updatedCount++;
        } else if (isActivated && !isExpiredOrDepleted && esim.status === 'waiting_for_activation') {
          console.log(`[Sync] Updating eSIM ${esim.id} status from 'waiting_for_activation' to 'activated' based on provider data (esimStatus=${providerStatus}, smdpStatus=${smdpStatus})`);

          await db.update(schema.purchasedEsims)
            .set({
              status: 'activated',
              activationDate: new Date(),
              metadata: {
                ...(esim.metadata || {}),
                status: 'activated', // Keep metadata.status in sync with database status
                syncedAt: new Date().toISOString(),
                previousStatus: esim.status,
                providerStatus,
                smdpStatus
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));

          // Obtener y asignar plan al ejecutivo
          const planId = esim.planId;
          const plan = await db.query.esimPlans.findFirst({
            where: eq(schema.esimPlans.id, planId),
          });

          if (plan) {
            await db.update(schema.employees)
              .set({
                currentPlan: plan.name,
                planStartDate: new Date(),
                planEndDate: new Date(Date.now() + plan.validity * 24 * 60 * 60 * 1000),
                dataLimit: plan.data,
                planValidity: plan.validity,
              })
              .where(eq(schema.employees.id, esim.employeeId));

            console.log(`[Sync] Asignado plan ${plan.name} al ejecutivo ${esim.employeeId}`);
          } else {
            console.warn(`[Sync] Plan no encontrado para eSIM ${esim.id}`);
          }

          emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
            esimId: esim.id,
            oldStatus: esim.status,
            newStatus: 'activated',
            employeeId: esim.employeeId,
            orderId: esim.orderId,
            providerStatus,
            timestamp: new Date().toISOString()
          });

          updatedCount++;
        }
      } catch (error) {
        console.error(`[Sync] Error processing eSIM ${esim.id}:`, error);
      }
    }

    // Check for active eSIMs that might be expired or depleted
    const alreadyActivatedEsims = await db.select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.status, 'activated'));
    
    console.log(`[Sync] Checking ${alreadyActivatedEsims.length} activated eSIMs for expiration/depletion`);
    
    for (const esim of alreadyActivatedEsims) {
      try {
        const statusData = await esimAccessService.checkEsimStatus(esim.orderId);
        const activatedEsimData = statusData.rawData?.obj?.esimList?.[0];
        const providerStatus = activatedEsimData?.esimStatus?.toUpperCase();
        const smdpStatus = activatedEsimData?.smdpStatus?.toUpperCase();
        const orderUsage = activatedEsimData?.orderUsage || 0;
        const totalVolume = activatedEsimData?.totalVolume || 0;
        
        const EXPIRED_STATUSES = ['EXPIRED', 'DEPLETED', 'DISABLED', 'USED_UP', 'USED_EXPIRED'];
        
        const isExpiredOrDepletedActivated = EXPIRED_STATUSES.includes(providerStatus || '') ||
                                              smdpStatus === 'DISABLED' ||
                                              (totalVolume > 0 && orderUsage >= totalVolume);
        
        if (isExpiredOrDepletedActivated) {
          console.log(`[Sync] Activated eSIM ${esim.id} has changed to expired/depleted (esimStatus=${providerStatus}, smdpStatus=${smdpStatus}, usage=${orderUsage}/${totalVolume})`);
          
          // Update the eSIM status to expired
          await db.update(schema.purchasedEsims)
            .set({
              status: 'expired',
              metadata: {
                ...(esim.metadata || {}),
                syncedAt: new Date().toISOString(),
                previousStatus: esim.status,
                providerStatus,
                smdpStatus,
                usageAtExpiry: `${orderUsage}/${totalVolume}`,
                expiredAt: new Date().toISOString(),
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
          
          // Reset the employee's plan information
          if (esim.employeeId) {
            console.log(`[Sync] Resetting plan information for employee ${esim.employeeId} due to eSIM expiration/depletion`);
            
            await db.update(schema.employees)
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
          
          // Emit SSE event for real-time updates
          emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
            esimId: esim.id,
            oldStatus: esim.status,
            newStatus: 'expired',
            employeeId: esim.employeeId,
            orderId: esim.orderId,
            providerStatus,
            timestamp: new Date().toISOString()
          });
          
          updatedCount++;
        } else {
          // Always update providerStatus in metadata even if status doesn't change
          const currentMetadata = esim.metadata as EsimMetadata || {};
          if (currentMetadata.providerStatus !== providerStatus && providerStatus) {
            console.log(`[Sync] Updating providerStatus for activated eSIM ${esim.id}: ${currentMetadata.providerStatus} -> ${providerStatus}`);
            await db.update(schema.purchasedEsims)
              .set({
                metadata: {
                  ...currentMetadata,
                  syncedAt: new Date().toISOString(),
                  providerStatus,
                  smdpStatus,
                }
              })
              .where(eq(schema.purchasedEsims.id, esim.id));
          }
        }
      } catch (error) {
        console.error(`[Sync] Error checking activated eSIM ${esim.id}:`, error);
      }
    }

    // Also sync expired eSIMs to update their providerStatus metadata
    const expiredEsims = await db.select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.status, 'expired'));
    
    console.log(`[Sync] Checking ${expiredEsims.length} expired eSIMs for providerStatus sync`);
    
    for (const esim of expiredEsims) {
      try {
        const currentMetadata = esim.metadata as EsimMetadata || {};
        
        // Skip if recently synced (within last hour)
        if (currentMetadata.syncedAt) {
          const lastSync = new Date(currentMetadata.syncedAt).getTime();
          if (Date.now() - lastSync < 3600000) {
            continue;
          }
        }
        
        const statusData = await esimAccessService.checkEsimStatus(esim.orderId);
        const esimData = statusData.rawData?.obj?.esimList?.[0];
        const providerStatus = esimData?.esimStatus?.toUpperCase();
        const smdpStatus = esimData?.smdpStatus?.toUpperCase();
        
        // Always update providerStatus for expired eSIMs
        if (providerStatus && currentMetadata.providerStatus !== providerStatus) {
          console.log(`[Sync] Updating providerStatus for expired eSIM ${esim.id}: ${currentMetadata.providerStatus} -> ${providerStatus}`);
          
          await db.update(schema.purchasedEsims)
            .set({
              metadata: {
                ...currentMetadata,
                syncedAt: new Date().toISOString(),
                providerStatus,
                smdpStatus,
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
          
          updatedCount++;
        }
      } catch (error) {
        console.error(`[Sync] Error syncing expired eSIM ${esim.id}:`, error);
      }
    }

    console.log(`[Sync] eSIM synchronization complete, updated ${updatedCount} eSIMs`);
    return updatedCount;
  } catch (error) {
    console.error('[Sync] Error in eSIM status synchronization:', error);
    throw error;
  }
}
