/**
 * Inactivity Checker Job
 * 
 * This job periodically checks for companies that have been inactive for more than 2 months
 * and marks them as inactive in the database.
 */

import { db } from "../db";
import { companies, type Company } from "../../shared/schema";
import { eq, lt, and, isNull } from "drizzle-orm";

const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000; // 60 days in milliseconds

/**
 * Checks for companies that haven't had any activity in the last 2 months
 * and marks them as inactive.
 * 
 * @returns {Promise<number>} The number of companies deactivated
 */
export async function checkInactiveCompanies(): Promise<number> {
  console.log("[InactivityChecker] Starting inactive company check");
  
  // Calculate the date 2 months ago
  const twoMonthsAgo = new Date(Date.now() - TWO_MONTHS_MS);
  
  try {
    // Find companies that were active and either:
    // 1. Have a lastActivityDate older than 2 months ago, or
    // 2. Have never had any activity recorded (lastActivityDate is null)
    const inactiveCompanies = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.active, true),
          lt(companies.lastActivityDate, twoMonthsAgo)
        )
      );
    
    if (inactiveCompanies.length === 0) {
      console.log("[InactivityChecker] No inactive companies found");
      return 0;
    }
    
    console.log(`[InactivityChecker] Found ${inactiveCompanies.length} inactive companies to deactivate`);
    
    // Mark each company as inactive
    for (const company of inactiveCompanies) {
      await db
        .update(companies)
        .set({ active: false })
        .where(eq(companies.id, company.id));
      
      console.log(`[InactivityChecker] Deactivated company: ${company.name} (ID: ${company.id})`);
    }
    
    console.log(`[InactivityChecker] Successfully deactivated ${inactiveCompanies.length} companies`);
    return inactiveCompanies.length;
  } catch (error) {
    console.error("[InactivityChecker] Error checking for inactive companies:", error);
    return 0;
  }
}

/**
 * Start the inactivity checker job to run periodically
 * @param intervalHours How often to run the check (in hours)
 */
export function startInactivityChecker(intervalHours = 24) {
  // First check immediately
  checkInactiveCompanies()
    .then(count => {
      console.log(`[InactivityChecker] Initial check complete - deactivated ${count} companies`);
    })
    .catch(error => {
      console.error("[InactivityChecker] Error during initial inactive companies check:", error);
    });
  
  // Schedule regular checks
  const intervalMs = intervalHours * 60 * 60 * 1000;
  setInterval(() => {
    checkInactiveCompanies()
      .then(count => {
        console.log(`[InactivityChecker] Scheduled check complete - deactivated ${count} companies`);
      })
      .catch(error => {
        console.error("[InactivityChecker] Error during scheduled inactive companies check:", error);
      });
  }, intervalMs);
  
  console.log(`[InactivityChecker] Job scheduled to run every ${intervalHours} hours`);
}