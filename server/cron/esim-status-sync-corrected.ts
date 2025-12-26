import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
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

export async function syncEsimStatuses(storage: any, esimAccessService?: EsimAccessService) {
  try {
    console.log('[Sync] Starting eSIM status synchronization');

    if (!esimAccessService) {
      esimAccessService = new EsimAccessService(storage);
    }

    const activeEsims = await db.select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.status, 'waiting_for_activation'));

    console.log(`[Sync] Found ${activeEsims.length} eSIMs to check for status updates`);

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
        const providerStatus = statusData.rawData?.obj?.esimList?.[0]?.esimStatus;

        const ACTIVATED_STATUSES = ['ONBOARD', 'IN_USE', 'ENABLED', 'ACTIVATED'];
        const EXPIRED_STATUSES = ['EXPIRED', 'DEPLETED', 'DISABLED'];

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
                providerStatus
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
        } else if (EXPIRED_STATUSES.includes(providerStatus || '') && esim.status !== 'expired') {
          console.log(`[Sync] Updating eSIM ${esim.id} status from '${esim.status}' to 'expired' based on provider status: ${providerStatus}`);

          // Update the eSIM status to expired
          await db.update(schema.purchasedEsims)
            .set({
              status: 'expired',
              metadata: {
                ...(esim.metadata || {}),
                syncedAt: new Date().toISOString(),
                previousStatus: esim.status,
                providerStatus,
                expiredAt: new Date().toISOString(),
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
          
          // Check if auto-renewal is enabled BEFORE resetting plan information
          if (esim.employeeId) {
            console.log(`[Sync] Processing plan expiration for employee ${esim.employeeId}`);
            
            // Get employee details including auto-renewal setting
            const employee = await db.query.employees.findFirst({
              where: eq(schema.employees.id, esim.employeeId),
            });
            
            if (employee && employee.autoRenewEnabled) {
              console.log(`[AutoRenew] Employee ${employee.id} has auto-renewal enabled. Will trigger top-up process instead of resetting plan.`);
              
              // DON'T reset plan information if auto-renewal is enabled
              // The auto-renewal job will handle topping up the same eSIM
              // and keep the plan active
              checkAndTriggerAutoRenewal(esim.id, employee.id, storage, esimAccessService);
              
            } else {
              // ONLY reset the employee's plan information if auto-renewal is NOT enabled
              console.log(`[Sync] Resetting plan information for employee ${esim.employeeId} due to eSIM expiration (auto-renewal disabled)`);
              
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
        } else if (ACTIVATED_STATUSES.includes(providerStatus || '') && esim.status === 'waiting_for_activation') {
          console.log(`[Sync] Updating eSIM ${esim.id} status from 'waiting_for_activation' to 'activated' based on provider status`);

          await db.update(schema.purchasedEsims)
            .set({
              status: 'activated',
              activationDate: new Date(),
              metadata: {
                ...(esim.metadata || {}),
                syncedAt: new Date().toISOString(),
                previousStatus: esim.status,
                providerStatus
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));

          // Assign plan to employee
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

            console.log(`[Sync] Assigned plan ${plan.name} to employee ${esim.employeeId}`);
          } else {
            console.warn(`[Sync] Plan not found for eSIM ${esim.id}`);
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
        const providerStatus = statusData.rawData?.obj?.esimList?.[0]?.esimStatus;
        
        const EXPIRED_STATUSES = ['EXPIRED', 'DEPLETED', 'DISABLED'];
        
        if (EXPIRED_STATUSES.includes(providerStatus || '') && esim.status !== 'expired') {
          console.log(`[Sync] Activated eSIM ${esim.id} has changed to ${providerStatus}, updating to expired`);
          
          // Update the eSIM status to expired
          await db.update(schema.purchasedEsims)
            .set({
              status: 'expired',
              metadata: {
                ...(esim.metadata || {}),
                syncedAt: new Date().toISOString(),
                previousStatus: esim.status,
                providerStatus,
                expiredAt: new Date().toISOString(),
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
          
          // Check if auto-renewal is enabled BEFORE resetting plan information
          if (esim.employeeId) {
            console.log(`[Sync] Processing plan expiration for employee ${esim.employeeId}`);
            
            // Get employee details including auto-renewal setting
            const employee = await db.query.employees.findFirst({
              where: eq(schema.employees.id, esim.employeeId),
            });
            
            if (employee && employee.autoRenewEnabled) {
              console.log(`[AutoRenew] Employee ${employee.id} has auto-renewal enabled. Will trigger top-up process instead of resetting plan.`);
              
              // DON'T reset plan information if auto-renewal is enabled
              // The auto-renewal job will handle topping up the same eSIM
              checkAndTriggerAutoRenewal(esim.id, employee.id, storage, esimAccessService);
              
            } else {
              // ONLY reset the employee's plan information if auto-renewal is NOT enabled
              console.log(`[Sync] Resetting plan information for employee ${esim.employeeId} due to eSIM expiration (auto-renewal disabled)`);
              
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
        }
      } catch (error) {
        console.error(`[Sync] Error checking activated eSIM ${esim.id}:`, error);
      }
    }

    console.log(`[Sync] eSIM status synchronization complete. Updated ${updatedCount} eSIMs.`);
    return updatedCount;
  } catch (error) {
    console.error('[Sync] Error in eSIM status synchronization:', error);
    throw error;
  }
}