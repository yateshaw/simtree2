import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import { EsimAccessService } from '../services/esim-access';
import { EventTypes, emitEvent } from '../sse';

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

export async function syncEsimStatusesOld(storage: any, esimAccessService?: EsimAccessService) {
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
          
          // Check if auto-renewal is enabled for this employee
          if (esim.employeeId) {
            console.log(`[Sync] Processing plan expiration for employee ${esim.employeeId}`);
            
            // Get employee details including auto-renewal setting
            const employee = await db.query.employees.findFirst({
              where: eq(schema.employees.id, esim.employeeId),
            });
            
            if (employee && employee.autoRenewEnabled) {
              console.log(`[AutoRenew] Employee ${employee.id} has auto-renewal enabled. Attempting to purchase new plan.`);
              
              try {
                // Get the plan details for the expired eSIM
                const oldPlan = await db.query.esimPlans.findFirst({
                  where: eq(schema.esimPlans.id, esim.planId),
                });
                
                if (!oldPlan) {
                  console.error(`[AutoRenew] Cannot find original plan details for eSIM ${esim.id} with planId ${esim.planId}`);
                  throw new Error(`Original plan not found`);
                }
                
                // Get company wallet to check balance
                const company = await db.query.companies.findFirst({
                  where: eq(schema.companies.id, employee.companyId),
                });
                
                if (!company) {
                  console.error(`[AutoRenew] Cannot find company for employee ${employee.id} with companyId ${employee.companyId}`);
                  throw new Error(`Company not found`);
                }
                
                // Get wallet balance
                const wallet = await db.query.wallets.findFirst({
                  where: eq(schema.wallets.companyId, company.id),
                });
                
                if (!wallet) {
                  console.error(`[AutoRenew] Cannot find wallet for company ${company.id}`);
                  throw new Error(`Wallet not found`);
                }
                
                const balance = parseFloat(wallet.balance);
                const planCost = parseFloat(oldPlan.retailPrice);
                
                // Check if sufficient balance exists
                if (balance < planCost) {
                  console.error(`[AutoRenew] Insufficient balance for auto-renewal. Required: ${planCost}, Available: ${balance}`);
                  throw new Error(`Insufficient balance for auto-renewal. Required: ${planCost}, Available: ${balance}`);
                }
                
                // Purchase the same plan again
                console.log(`[AutoRenew] Purchasing new plan ${oldPlan.name} (${oldPlan.providerId}) for employee ${employee.id}`);
                
                // Call the esimAccessService to purchase the eSIM
                const result = await esimAccessService.purchaseEsim(oldPlan.providerId, employee.email);
                
                if (!result || !result.orderId) {
                  console.error(`[AutoRenew] Failed to purchase new eSIM plan: no order ID returned`);
                  throw new Error(`Failed to purchase new eSIM plan`);
                }
                
                // Get activation data (QR code, activation code)
                const activationData = await esimAccessService.waitForEsimActivationData(result.orderId);
                
                // Create a new purchased eSIM record
                const insertResult = await db.insert(schema.purchasedEsims).values({
                  employeeId: employee.id,
                  planId: oldPlan.id,
                  orderId: result.orderId,
                  iccid: activationData.iccid || "",
                  activationCode: activationData.activationCode || "",
                  qrCode: activationData.qrCode || "",
                  status: "waiting_for_activation",
                  purchaseDate: new Date(),
                  metadata: {
                    autoRenewed: true,
                    previousEsimId: esim.id
                  }
                }).returning();
                
                if (!insertResult || insertResult.length === 0) {
                  console.error(`[AutoRenew] Failed to create new purchased eSIM record`);
                  throw new Error(`Failed to create new purchased eSIM record`);
                }
                
                const newEsim = insertResult[0];
                
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
                  description: `Auto-renewal of ${oldPlan.name} plan for ${employee.name}`,
                  transactionDate: new Date(),
                  transactionType: "debit",
                  metadata: {
                    autoRenewal: true,
                    employeeId: employee.id,
                    planId: oldPlan.id,
                    esimId: newEsim.id,
                    previousEsimId: esim.id
                  }
                });
                
                // Send activation email to employee
                try {
                  const emailService = require('../services/email.service');
                  const activationLinkParams = new URLSearchParams();
                  activationLinkParams.set('esimId', newEsim.id.toString());
                  
                  await emailService.sendEsimActivationEmail({
                    to: employee.email,
                    employeeName: employee.name,
                    qrCodeData: activationData.qrCode,
                    activationCode: activationData.activationCode,
                    iccid: activationData.iccid,
                    planName: oldPlan.name,
                    activationLink: `activate-esim?${activationLinkParams.toString()}`
                  });
                  
                  console.log(`[AutoRenew] Activation email sent to ${employee.email} for auto-renewed plan`);
                } catch (emailError) {
                  console.error(`[AutoRenew] Failed to send activation email: ${emailError.message}`);
                  // Continue even if email fails, as the purchase was successful
                }
                
                console.log(`[AutoRenew] Successfully auto-renewed plan for employee ${employee.id}`);
                
                // Don't reset employee's plan information since we just purchased a new plan
                // The new plan will be assigned when the new eSIM is activated
                
              } catch (renewError) {
                console.error(`[AutoRenew] Error during auto-renewal process: ${renewError.message}`);
                // If auto-renewal fails, proceed with the normal plan reset
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
            } else {
              // If employee doesn't have auto-renewal enabled,
              // reset the employee's plan information
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
        const providerStatus = statusData.rawData?.obj?.esimList?.[0]?.esimStatus;
        
        const EXPIRED_STATUSES = ['EXPIRED', 'DEPLETED', 'DISABLED'];
        
        if (EXPIRED_STATUSES.includes(providerStatus || '')) {
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
          
          // Check if auto-renewal is enabled for this employee
          if (esim.employeeId) {
            console.log(`[Sync] Processing plan expiration for employee ${esim.employeeId}`);
            
            // Get employee details including auto-renewal setting
            const employee = await db.query.employees.findFirst({
              where: eq(schema.employees.id, esim.employeeId),
            });
            
            if (employee && employee.autoRenewEnabled) {
              console.log(`[AutoRenew] Employee ${employee.id} has auto-renewal enabled. Attempting to purchase new plan.`);
              
              try {
                // Get the plan details for the expired eSIM
                const oldPlan = await db.query.esimPlans.findFirst({
                  where: eq(schema.esimPlans.id, esim.planId),
                });
                
                if (!oldPlan) {
                  console.error(`[AutoRenew] Cannot find original plan details for eSIM ${esim.id} with planId ${esim.planId}`);
                  throw new Error(`Original plan not found`);
                }
                
                // Get company wallet to check balance
                const company = await db.query.companies.findFirst({
                  where: eq(schema.companies.id, employee.companyId),
                });
                
                if (!company) {
                  console.error(`[AutoRenew] Cannot find company for employee ${employee.id} with companyId ${employee.companyId}`);
                  throw new Error(`Company not found`);
                }
                
                // Get wallet balance
                const wallet = await db.query.wallets.findFirst({
                  where: eq(schema.wallets.companyId, company.id),
                });
                
                if (!wallet) {
                  console.error(`[AutoRenew] Cannot find wallet for company ${company.id}`);
                  throw new Error(`Wallet not found`);
                }
                
                const balance = parseFloat(wallet.balance);
                const planCost = parseFloat(oldPlan.retailPrice);
                
                // Check if sufficient balance exists
                if (balance < planCost) {
                  console.error(`[AutoRenew] Insufficient balance for auto-renewal. Required: ${planCost}, Available: ${balance}`);
                  throw new Error(`Insufficient balance for auto-renewal. Required: ${planCost}, Available: ${balance}`);
                }
                
                // Purchase the same plan again
                console.log(`[AutoRenew] Purchasing new plan ${oldPlan.name} (${oldPlan.providerId}) for employee ${employee.id}`);
                
                // Call the esimAccessService to purchase the eSIM
                const result = await esimAccessService.purchaseEsim(oldPlan.providerId, employee.email);
                
                if (!result || !result.orderId) {
                  console.error(`[AutoRenew] Failed to purchase new eSIM plan: no order ID returned`);
                  throw new Error(`Failed to purchase new eSIM plan`);
                }
                
                // Get activation data (QR code, activation code)
                const activationData = await esimAccessService.waitForEsimActivationData(result.orderId);
                
                // Create a new purchased eSIM record
                const insertResult = await db.insert(schema.purchasedEsims).values({
                  employeeId: employee.id,
                  planId: oldPlan.id,
                  orderId: result.orderId,
                  iccid: activationData.iccid || "",
                  activationCode: activationData.activationCode || "",
                  qrCode: activationData.qrCode || "",
                  status: "waiting_for_activation",
                  purchaseDate: new Date(),
                  metadata: {
                    autoRenewed: true,
                    previousEsimId: esim.id
                  }
                }).returning();
                
                if (!insertResult || insertResult.length === 0) {
                  console.error(`[AutoRenew] Failed to create new purchased eSIM record`);
                  throw new Error(`Failed to create new purchased eSIM record`);
                }
                
                const newEsim = insertResult[0];
                
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
                  description: `Auto-renewal of ${oldPlan.name} plan for ${employee.name}`,
                  transactionDate: new Date(),
                  transactionType: "debit",
                  metadata: {
                    autoRenewal: true,
                    employeeId: employee.id,
                    planId: oldPlan.id,
                    esimId: newEsim.id,
                    previousEsimId: esim.id
                  }
                });
                
                // Send activation email to employee
                try {
                  const emailService = require('../services/email.service');
                  const activationLinkParams = new URLSearchParams();
                  activationLinkParams.set('esimId', newEsim.id.toString());
                  
                  await emailService.sendEsimActivationEmail({
                    to: employee.email,
                    employeeName: employee.name,
                    qrCodeData: activationData.qrCode,
                    activationCode: activationData.activationCode,
                    iccid: activationData.iccid,
                    planName: oldPlan.name,
                    activationLink: `activate-esim?${activationLinkParams.toString()}`
                  });
                  
                  console.log(`[AutoRenew] Activation email sent to ${employee.email} for auto-renewed plan`);
                } catch (emailError) {
                  console.error(`[AutoRenew] Failed to send activation email: ${emailError.message}`);
                  // Continue even if email fails, as the purchase was successful
                }
                
                console.log(`[AutoRenew] Successfully auto-renewed plan for employee ${employee.id}`);
                
                // Don't reset employee's plan information since we just purchased a new plan
                // The new plan will be assigned when the new eSIM is activated
                
              } catch (renewError) {
                console.error(`[AutoRenew] Error during auto-renewal process: ${renewError.message}`);
                // If auto-renewal fails, proceed with the normal plan reset
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
            } else {
              // If employee doesn't have auto-renewal enabled,
              // reset the employee's plan information
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

    console.log(`[Sync] eSIM synchronization complete, updated ${updatedCount} eSIMs`);
    return updatedCount;
  } catch (error) {
    console.error('[Sync] Error in eSIM status synchronization:', error);
    throw error;
  }
}