import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import { processAutoRenewals } from '../cron/auto-renewal-job';
import { EsimAccessService } from '../services/esim-access';

/**
 * Helper function to trigger auto-renewal for a specific eSIM that just expired
 * This is called immediately when an eSIM status changes to "expired"
 */
export async function checkAndTriggerAutoRenewal(esimId: number, employeeId: number, storage: any, esimAccessService?: EsimAccessService) {
  try {
    console.log(`[AutoRenewTrigger] Checking auto-renewal eligibility for employee ${employeeId} with eSIM ${esimId}`);
    
    // Check if the employee has auto-renewal enabled
    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.id, employeeId),
    });
    
    if (!employee) {
      console.log(`[AutoRenewTrigger] Employee ${employeeId} not found, skipping auto-renewal`);
      return;
    }
    
    if (!employee.autoRenewEnabled) {
      console.log(`[AutoRenewTrigger] Auto-renewal not enabled for employee ${employeeId}, skipping`);
      return;
    }
    
    console.log(`[AutoRenewTrigger] Auto-renewal is enabled for employee ${employeeId}, triggering immediate renewal`);
    
    // Process auto-renewal for this specific eSIM
    processAutoRenewals(storage, esimAccessService, esimId)
      .then((renewedCount) => {
        console.log(`[AutoRenewTrigger] Immediate auto-renewal completed - renewed ${renewedCount} eSIMs`);
      })
      .catch((error) => {
        console.error(`[AutoRenewTrigger] Error during immediate auto-renewal:`, error);
      });
      
  } catch (error) {
    console.error(`[AutoRenewTrigger] Error checking auto-renewal eligibility:`, error);
  }
}