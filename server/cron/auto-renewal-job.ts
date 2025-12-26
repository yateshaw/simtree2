import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import { EsimAccessService } from '../services/esim-access';
import { EventTypes, emitEvent } from '../sse';

/**
 * Auto-renewal job that checks expired eSIMs and adds more data to the same eSIM
 * if auto-renewal is enabled for the employee
 */
export async function processAutoRenewals(storage: any, esimAccessService?: EsimAccessService, specificEsimId?: number) {
  try {
    console.log('[AutoRenew] Starting auto-renewal job');

    if (!esimAccessService) {
      esimAccessService = new EsimAccessService(storage);
    }

    // Find expired or depleted eSIMs - either a specific one or all of them
    let eligibleEsims;
    if (specificEsimId) {
      console.log(`[AutoRenew] Checking specific eSIM ID ${specificEsimId} for auto-renewal`);
      eligibleEsims = await db.select()
        .from(schema.purchasedEsims)
        .where(and(
          eq(schema.purchasedEsims.id, specificEsimId),
          or(
            eq(schema.purchasedEsims.status, 'expired'),
            eq(schema.purchasedEsims.status, 'depleted')
          )
        ));
    } else {
      eligibleEsims = await db.select()
        .from(schema.purchasedEsims)
        .where(or(
          eq(schema.purchasedEsims.status, 'expired'),
          eq(schema.purchasedEsims.status, 'depleted')
        ));
    }

    console.log(`[AutoRenew] Found ${eligibleEsims.length} eligible eSIMs (expired/depleted) to check for auto-renewal`);

    let renewedCount = 0;

    for (const esim of eligibleEsims) {
      try {
        if (!esim.employeeId) {
          console.log(`[AutoRenew] Skipping eSIM ${esim.id} - no employee associated`);
          continue;
        }

        // Check if auto-renewal is enabled for this specific eSIM (per-plan setting)
        if (!esim.autoRenewEnabled) {
          console.log(`[AutoRenew] Skipping eSIM ${esim.id} - auto-renewal not enabled for this plan`);
          continue;
        }

        // Get employee details for company lookup
        const employee = await db.query.employees.findFirst({
          where: eq(schema.employees.id, esim.employeeId),
        });
        
        if (!employee) {
          console.log(`[AutoRenew] Skipping eSIM ${esim.id} - employee ${esim.employeeId} not found`);
          continue;
        }

        // Check if this eSIM has already been auto-renewed or is currently being processed
        const metadata = esim.metadata || {};
        if (metadata.autoRenewalProcessed || metadata.autoRenewalProcessing) {
          console.log(`[AutoRenew] Skipping eSIM ${esim.id} - already processed or currently processing auto-renewal`);
          continue;
        }

        console.log(`[AutoRenew] Processing auto-renewal for employee ${employee.id} (${employee.name})`);
        
        // Get the plan details for the expired eSIM
        const oldPlan = await db.query.esimPlans.findFirst({
          where: eq(schema.esimPlans.id, esim.planId),
        });
        
        if (!oldPlan) {
          console.error(`[AutoRenew] Cannot find original plan details for eSIM ${esim.id} with planId ${esim.planId}`);
          
          // Mark as processed to avoid repeated attempts
          await db.update(schema.purchasedEsims)
            .set({
              metadata: {
                ...metadata,
                autoRenewalProcessed: true,
                autoRenewalError: 'Original plan not found'
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
            
          continue;
        }
        
        // Get company wallet to check balance
        const company = await db.query.companies.findFirst({
          where: eq(schema.companies.id, employee.companyId),
        });
        
        if (!company) {
          console.error(`[AutoRenew] Cannot find company for employee ${employee.id} with companyId ${employee.companyId}`);
          
          // Mark as processed to avoid repeated attempts
          await db.update(schema.purchasedEsims)
            .set({
              metadata: {
                ...metadata,
                autoRenewalProcessed: true,
                autoRenewalError: 'Company not found'
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
            
          continue;
        }
        
        // Get wallet balance
        const wallet = await db.query.wallets.findFirst({
          where: eq(schema.wallets.companyId, company.id),
        });
        
        if (!wallet) {
          console.error(`[AutoRenew] Cannot find wallet for company ${company.id}`);
          
          // Mark as processed to avoid repeated attempts
          await db.update(schema.purchasedEsims)
            .set({
              metadata: {
                ...metadata,
                autoRenewalProcessed: true,
                autoRenewalError: 'Wallet not found'
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
            
          continue;
        }
        
        const balance = parseFloat(wallet.balance);
        const planCost = parseFloat(oldPlan.retailPrice);
        
        // Check if sufficient balance exists
        if (balance < planCost) {
          console.error(`[AutoRenew] Insufficient balance for auto-renewal. Required: ${planCost}, Available: ${balance}`);
          
          // Mark as processed and disable auto-renewal for this eSIM due to insufficient balance
          await db.update(schema.purchasedEsims)
            .set({
              autoRenewEnabled: false,
              metadata: {
                ...metadata,
                autoRenewalProcessed: true,
                autoRenewalError: `Insufficient balance. Required: ${planCost}, Available: ${balance}`
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
          
          console.log(`[AutoRenew] Auto-renewal disabled for eSIM ${esim.id} due to insufficient balance`);
          
          // Emit event for real-time UI update
          try {
            emitEvent(EventTypes.AUTO_RENEWAL_EVENT, {
              employeeId: employee.id,
              employeeName: employee.name,
              companyId: employee.companyId,
              companyName: company.name,
              planName: oldPlan.name,
              planCost: planCost,
              availableBalance: balance,
              status: 'disabled',
              message: `Auto-renewal has been disabled for ${employee.name} due to insufficient balance.`,
              reason: 'insufficient_balance'
            });
          } catch (eventError) {
            console.error(`[AutoRenew] Failed to emit event: ${eventError.message}`);
          }
          
          // No emails - just UI notifications via SSE events
          console.log(`[AutoRenew] Sent notification UI alert about disabled auto-renewal for employee ${employee.id}`);
            
          continue;
        }
        
        // Add more data to the existing eSIM
        console.log(`[AutoRenew] Adding more data to existing eSIM (ICCID: ${esim.iccid}) with plan ${oldPlan.name} (${oldPlan.providerId}) for employee ${employee.id}`);
        
        try {
          // Make sure we have an ICCID to work with
          if (!esim.iccid) {
            throw new Error('Missing ICCID for top-up operation');
          }
          
          // Call the esimAccessService to top up the eSIM
          const result = await esimAccessService.topUpEsim(esim.iccid, oldPlan.providerId);
          
          if (!result || !result.orderId) {
            throw new Error('No order ID returned from top-up operation');
          }
          
          // Calculate new expiry date
          const now = new Date();
          const newExpiryDate = new Date(now);
          newExpiryDate.setDate(now.getDate() + oldPlan.validity);
          
          // Update existing eSIM with new details
          await db.update(schema.purchasedEsims)
            .set({
              status: "activated", // Reset to activated from expired
              expiryDate: newExpiryDate,
              dataUsed: "0", // Reset data usage for the new cycle
              metadata: {
                ...metadata,
                autoRenewalProcessed: true,
                autoRenewalSuccess: true,
                topUpDate: now.toISOString(),
                topUpOrderId: result.orderId,
                previousExpiryDate: esim.expiryDate ? new Date(esim.expiryDate).toISOString() : null,
                renewalCount: (metadata.renewalCount || 0) + 1,
                renewalHistory: [
                  ...(metadata.renewalHistory || []),
                  {
                    date: now.toISOString(),
                    orderId: result.orderId,
                    planId: oldPlan.id,
                    planName: oldPlan.name,
                    cost: planCost
                  }
                ]
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
          
          // Deduct cost from wallet balance
          await db.update(schema.wallets)
            .set({
              balance: (balance - planCost).toString(),
              lastUpdated: new Date()
            })
            .where(eq(schema.wallets.id, wallet.id));
          
          // Create wallet transaction record
          await db.insert(schema.walletTransactions).values({
            walletId: wallet.id,
            amount: (-planCost).toString(),
            description: `Auto-renewal top-up of ${oldPlan.name} plan for ${employee.name}`,
            transactionDate: new Date(),
            transactionType: "debit",
            metadata: {
              autoRenewal: true,
              topUp: true,
              employeeId: employee.id,
              planId: oldPlan.id,
              esimId: esim.id
            }
          });
          
          // Schedule a verification check to confirm the top-up worked
          // Since eSIM Access doesn't send webhooks for top-ups, we need to poll
          setTimeout(async () => {
            try {
              console.log(`[AutoRenew] Verifying top-up success for eSIM ${esim.id} after 30 seconds`);
              const statusData = await esimAccessService.checkEsimStatus(esim.orderId);
              const currentStatus = statusData.rawData?.obj?.esimList?.[0]?.esimStatus;
              
              if (currentStatus === 'IN_USE' || currentStatus === 'ENABLED') {
                console.log(`[AutoRenew] Top-up verified successful for eSIM ${esim.id}`);
                
                // Update plan history for auto-renewal
                try {
                  // Step 1: Update the most recent "auto-renewed" period to "expired" if it exists
                  const existingHistory = await storage.getPlanHistory(employee.id);
                  const currentActivePlan = existingHistory.find(h => h.status === 'active');
                  const mostRecentRenewal = existingHistory.find(h => h.status === 'auto-renewed');
                  
                  if (mostRecentRenewal) {
                    await storage.updatePlanHistoryStatus(mostRecentRenewal.id, 'expired');
                    console.log(`[AutoRenew] Updated previous renewal period ${mostRecentRenewal.id} to expired`);
                  }
                  
                  // Step 2: Update current active plan to "auto-renewed" 
                  if (currentActivePlan) {
                    await storage.updatePlanHistoryStatus(currentActivePlan.id, 'auto-renewed');
                    console.log(`[AutoRenew] Updated current plan ${currentActivePlan.id} to auto-renewed`);
                  }
                  
                  // Step 3: Create new active plan history entry
                  await storage.addPlanHistory({
                    employeeId: employee.id,
                    planName: oldPlan.name,
                    planData: oldPlan.data,
                    startDate: now.toISOString(),
                    endDate: newExpiryDate.toISOString(),
                    dataUsed: "0",
                    status: 'active',
                    providerId: oldPlan.providerId
                  });
                  
                  console.log(`[AutoRenew] Created new active plan history entry for employee ${employee.id}`);
                } catch (historyError) {
                  console.error(`[AutoRenew] Error updating plan history: ${historyError.message}`);
                }
                
                // Send success notification email
                try {
                  const emailService = require('../services/email.service');
                  
                  await emailService.sendEmail({
                    to: employee.email,
                    subject: `Your ${oldPlan.name} eSIM Plan Has Been Renewed`,
                    template: 'esim-renewal',
                    context: {
                      employeeName: employee.name,
                      planName: oldPlan.name,
                      iccid: esim.iccid,
                      newExpiryDate: newExpiryDate.toLocaleDateString(),
                      companyName: company.name
                    }
                  });
                  
                  console.log(`[AutoRenew] Renewal notification email sent to ${employee.email}`);
                } catch (emailError) {
                  console.error(`[AutoRenew] Failed to send renewal notification email: ${emailError.message}`);
                }
              } else {
                console.error(`[AutoRenew] Top-up verification failed for eSIM ${esim.id}, status: ${currentStatus}`);
                // Mark as failed and reset employee plan
                await db.update(schema.purchasedEsims)
                  .set({
                    metadata: {
                      ...esim.metadata,
                      autoRenewalProcessed: true,
                      autoRenewalError: `Top-up verification failed, status: ${currentStatus}`
                    }
                  })
                  .where(eq(schema.purchasedEsims.id, esim.id));
                  
                await db.update(schema.employees)
                  .set({
                    currentPlan: null,
                    planStartDate: null,
                    planEndDate: null,
                    planValidity: null,
                    dataUsage: "0",
                    dataLimit: "0"
                  })
                  .where(eq(schema.employees.id, employee.id));
              }
            } catch (verifyError) {
              console.error(`[AutoRenew] Error verifying top-up for eSIM ${esim.id}:`, verifyError);
            }
          }, 30000); // Check after 30 seconds
          
          console.log(`[AutoRenew] Successfully auto-renewed plan for employee ${employee.id}`);
          renewedCount++;
          
        } catch (topUpError) {
          console.error(`[AutoRenew] Failed to top up eSIM: ${topUpError.message}`);
          
          // Mark as processed with error to avoid repeated attempts
          await db.update(schema.purchasedEsims)
            .set({
              metadata: {
                ...metadata,
                autoRenewalProcessed: true,
                autoRenewalError: topUpError.message
              }
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
        }
      } catch (employeeError) {
        console.error(`[AutoRenew] Error processing auto-renewal for eSIM ${esim.id}: ${employeeError.message}`);
      }
    }

    console.log(`[AutoRenew] Auto-renewal job complete. Successfully renewed ${renewedCount} plans.`);
    return renewedCount;
  } catch (error) {
    console.error('[AutoRenew] Error in auto-renewal job:', error);
    throw error;
  }
}