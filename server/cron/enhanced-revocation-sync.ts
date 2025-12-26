/**
 * Enhanced synchronization function specifically to detect eSIMs that have been
 * revoked on the provider's platform but not updated in our system
 */
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, not, inArray } from "drizzle-orm";
import { esimAccessService } from "../services/esim-access";
import { emitEvent, EventTypes } from "../sse";

// Final statuses that don't need checks anymore
const FINAL_STATUSES = ['cancelled', 'expired'];

// Status values from provider that should be mapped to "cancelled" in our system
const CANCELLATION_STATUSES = ["CANCEL", "CANCELLED", "REVOKED", "DEACTIVATED", "DELETED"];

export async function syncRevokedEsims() {
  console.log('[RevocationSync] Starting enhanced revocation status check');
  
  try {
    // Get all eSIMs that are not in a final state
    const activeEsims = await db
      .select()
      .from(schema.purchasedEsims)
      .where(not(inArray(schema.purchasedEsims.status, FINAL_STATUSES)));
    
    console.log(`[RevocationSync] Found ${activeEsims.length} non-final eSIMs to check for revocation`);
    
    let updatedCount = 0;
    
    // Process each eSIM to check if it has been revoked
    for (const esim of activeEsims) {
      try {
        console.log(`[RevocationSync] Checking eSIM ${esim.id} (order ${esim.orderId})`);
        
        // Get current status from provider
        const statusData = await esimAccessService.checkEsimStatus(esim.orderId);
        const providerStatus = statusData.rawData?.esimList?.[0]?.esimStatus?.toUpperCase() || '';
        
        console.log(`[RevocationSync] Provider status for eSIM ${esim.id}: ${providerStatus}`);
        
        // Check if this eSIM has been revoked/cancelled on the provider side
        if (CANCELLATION_STATUSES.includes(providerStatus)) {
          console.log(`[RevocationSync] eSIM ${esim.id} has been revoked/cancelled on provider side (status: ${providerStatus})`);
          
          // Update the eSIM status to cancelled
          await db
            .update(schema.purchasedEsims)
            .set({
              status: "cancelled",
              metadata: {
                ...(esim.metadata || {}),
                syncedAt: new Date().toISOString(),
                providerStatus: providerStatus,
                previousStatus: esim.status,
                externallyRevoked: true,
                cancelledAt: new Date().toISOString(),
                enhancedSyncDetection: true
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
          
          // Reset the employee's plan information if this employee exists
          if (esim.employeeId) {
            console.log(`[RevocationSync] Resetting plan information for employee ${esim.employeeId} due to eSIM revocation`);
            
            // First check if employee has any other active eSIMs
            const otherActiveEsims = await db
              .select()
              .from(schema.purchasedEsims)
              .where(
                eq(schema.purchasedEsims.employeeId, esim.employeeId)
              )
              .where(not(eq(schema.purchasedEsims.id, esim.id)))
              .where(not(inArray(schema.purchasedEsims.status, FINAL_STATUSES)));
            
            // Only reset the employee's plan if this was their only active eSIM
            if (otherActiveEsims.length === 0) {
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
          }
          
          // Emit SSE event for real-time updates
          emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
            esimId: esim.id,
            employeeId: esim.employeeId,
            oldStatus: esim.status,
            newStatus: "cancelled",
            orderId: esim.orderId,
            providerStatus: providerStatus,
            timestamp: new Date().toISOString()
          });
          
          updatedCount++;
        } else {
          console.log(`[RevocationSync] eSIM ${esim.id} is still valid on provider side (status: ${providerStatus})`);
        }
      } catch (error) {
        console.error(`[RevocationSync] Error checking eSIM ${esim.id}:`, error);
      }
    }
    
    console.log(`[RevocationSync] Enhanced revocation sync complete - updated ${updatedCount} eSIMs`);
    return updatedCount;
  } catch (error) {
    console.error('[RevocationSync] Error during revocation sync:', error);
    return 0;
  }
}