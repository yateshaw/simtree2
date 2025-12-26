import { Router } from 'express';
import { storage } from './storage';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const router = Router();

// Debug route for fixing inconsistent eSIM statuses
router.post('/debug/fix-esim-statuses', async (req, res) => {
  try {
    let dryRun = req.query.dryRun === 'true';
    console.log(`Running fix-esim-statuses ${dryRun ? '(DRY RUN)' : '(LIVE RUN)'}`);
    
    // Get all employees
    const employees = await storage.getAllEmployeesWithCompanies();
    console.log(`Found ${employees.length} employees`);
    
    // Get all employees' eSIMs
    let allPurchasedEsims: any[] = [];
    
    // Collect all eSIMs for all employees
    for (const employee of employees) {
      const employeeEsims = await storage.getPurchasedEsims(employee.id);
      if (employeeEsims && employeeEsims.length > 0) {
        allPurchasedEsims = [...allPurchasedEsims, ...employeeEsims];
      }
    }
    
    console.log(`Found ${allPurchasedEsims.length} total eSIMs`);
    
    // Track statistics
    const stats = {
      total: allPurchasedEsims.length,
      needsUpdate: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      updatedEsimIds: [] as number[]
    };
    
    // Track detailed fix information for the UI
    const fixedEsims: {id: number, oldStatus: string, newStatus: string, reason: string}[] = [];
    
    // Process each eSIM
    for (const esim of allPurchasedEsims) {
      try {
        // Create a variable to track if we should update this eSIM
        let shouldUpdate = false;
        let newStatus = '';
        let reason = '';
        let apiStatus = '';
        
        // Extract the API status from metadata if available
        if (esim.metadata?.rawData) {
          // Try to extract API status from different possible paths in the metadata
          if (typeof esim.metadata.rawData === 'object') {
            if (esim.metadata.rawData.esimStatus) {
              apiStatus = esim.metadata.rawData.esimStatus;
            } else if (esim.metadata.rawData.obj?.esimList?.[0]?.esimStatus) {
              apiStatus = esim.metadata.rawData.obj.esimList[0].esimStatus;
            }
          } else if (typeof esim.metadata.rawData === 'string') {
            try {
              const parsedData = JSON.parse(esim.metadata.rawData);
              if (parsedData.obj?.esimList?.[0]?.esimStatus) {
                apiStatus = parsedData.obj.esimList[0].esimStatus;
              } else if (parsedData.esimStatus) {
                apiStatus = parsedData.esimStatus;
              }
            } catch (err) {
              // Ignore JSON parsing errors
            }
          }
        }
        
        // CASE 1: Check if this eSIM should be marked as cancelled but isn't
        if (esim.status !== 'cancelled' && isEsimCancelledOrRefunded(esim)) {
          shouldUpdate = true;
          newStatus = 'cancelled';
          reason = 'Cancellation markers found in metadata';
          
          console.log(`eSIM ${esim.id} (${esim.orderId}) needs status update: current=${esim.status}, should be cancelled (metadata)`);
          
          // Log why this eSIM is considered cancelled
          if (esim.metadata?.isCancelled === true) console.log(`  - metadata.isCancelled flag is true`);
          if (esim.metadata?.refunded === true) console.log(`  - metadata.refunded flag is true`);
          if (esim.metadata?.status === 'cancelled') console.log(`  - metadata.status is 'cancelled'`);
          if (esim.metadata?.cancelRequestTime) console.log(`  - metadata has cancelRequestTime: ${esim.metadata.cancelRequestTime}`);
          if (esim.metadata?.cancelledAt) console.log(`  - metadata has cancelledAt: ${esim.metadata.cancelledAt}`);
          if (esim.metadata?.cancelledInProvider === true) console.log(`  - metadata.cancelledInProvider flag is true`);
        }
        
        // CASE 2: Check "waiting_for_activation" eSIMs in our database that are actually cancelled in the provider API
        else if (esim.status === 'waiting_for_activation' && apiStatus === 'CANCEL') {
          shouldUpdate = true;
          newStatus = 'cancelled';
          reason = 'Provider API shows CANCEL for waiting_for_activation eSIM';
          
          console.log(`eSIM ${esim.id} (${esim.orderId}) needs status update: current=${esim.status}, 
                    API status=${apiStatus}, should be cancelled`);
        }
        
        // CASE 3: Check if a "waiting_for_activation" eSIM is actually in ONBOARD status and should be activated
        else if (esim.status === 'waiting_for_activation' && apiStatus === 'ONBOARD') {
          shouldUpdate = true;
          newStatus = 'activated';
          reason = 'Provider API shows ONBOARD, updating from waiting_for_activation to activated';
          
          console.log(`eSIM ${esim.id} (${esim.orderId}) needs status update: current=${esim.status}, 
                    API status=${apiStatus}, should be activated`);
        } 
        
        // CASE 4: Check if a Hong Kong plan is activated but should be cancelled
        else if (esim.status === 'activated' && apiStatus === 'CANCEL' && 
                 ((esim.planId === 44978) || // Hong Kong plan ID
                  (esim.metadata?.planName?.includes('Hong Kong')))) {
          shouldUpdate = true;
          newStatus = 'cancelled';
          reason = 'Hong Kong plan showing activated but API status is CANCEL';
          
          console.log(`Hong Kong eSIM ${esim.id} (${esim.orderId}) needs status update: current=${esim.status}, 
                    API status=${apiStatus}, should be cancelled`);
        }
        
        // If we should update this eSIM, do so
        if (shouldUpdate) {
          stats.needsUpdate++;
          
          if (!dryRun) {
            // Update the eSIM status
            await storage.updatePurchasedEsim(esim.id, {
              status: newStatus,
              // Save old status and reason in metadata
              metadata: {
                ...esim.metadata,
                previousStatus: esim.status,
                statusChangedAt: new Date().toISOString(),
                statusChangeReason: reason,
                apiStatusAtChange: apiStatus
              }
            });
            
            stats.updated++;
            stats.updatedEsimIds.push(esim.id);
            fixedEsims.push({
              id: esim.id,
              oldStatus: esim.status,
              newStatus,
              reason
            });
            
            console.log(`  ✓ Updated eSIM ${esim.id} status from ${esim.status} to ${newStatus}`);
          } else {
            stats.skipped++;
            fixedEsims.push({
              id: esim.id,
              oldStatus: esim.status,
              newStatus,
              reason: `${reason} (dry run)`
            });
            console.log(`  ⚠ Skipped update (dry run mode)`);
          }
        }
      } catch (error) {
        console.error(`Error processing eSIM ${esim.id}:`, error);
        stats.errors++;
      }
    }
    
    // Optionally, update employee records if all their eSIMs are cancelled
    if (!dryRun) {
      for (const employee of employees) {
        try {
          // Get all eSIMs for this employee again (to ensure we have the updated states)
          const employeeEsims = await storage.getPurchasedEsims(employee.id);
          
          // If employee has a currentPlan but all their eSIMs are cancelled, clear currentPlan
          if (employee.currentPlan && employeeEsims.every(esim => esim.status === 'cancelled')) {
            console.log(`Employee ${employee.id} (${employee.name}) has all cancelled eSIMs. Clearing currentPlan.`);
            
            await storage.updateEmployee(employee.id, {
              currentPlan: null,
              dataUsage: "0.00",
              dataLimit: "0.00",
              planStartDate: null,
              planEndDate: null,
              planValidity: null
            });
          }
        } catch (error) {
          console.error(`Error updating employee ${employee.id}:`, error);
        }
      }
    }
    
    // Send the response
    res.json({
      success: true,
      dryRun,
      message: `eSIM status synchronization complete. ${stats.needsUpdate} needed updates, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors.`,
      stats,
      fixedEsims
    });
  } catch (error) {
    console.error('Error fixing eSIM statuses:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fix eSIM statuses',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Function to check if an eSIM is cancelled or refunded
// This is based on client/src/lib/utils/employeeUtils.ts 
const isEsimCancelledOrRefunded = (esim: any) => {
  if (!esim) return false;
  
  // Primary check - if the status is explicitly set to 'cancelled' in our database
  if (esim.status === 'cancelled') {
    return true;
  }
  
  // Check the isCancelled flag that might be set by the frontend
  if (esim.isCancelled === true) {
    return true;
  }
  
  // Check metadata for cancellation markers (check all places we might store cancellation info)
  if (esim.metadata) {
    // Direct flags in metadata
    if (
      esim.metadata.isCancelled === true || 
      esim.metadata.refunded === true || 
      esim.metadata.status === 'cancelled' ||
      esim.metadata.cancelRequestTime ||
      esim.metadata.cancelledAt ||
      esim.metadata.cancelledInProvider === true
    ) {
      return true;
    }
    
    // Check the provider's cancellation status in the raw data (multiple possible paths)
    if (
      esim.metadata.rawData?.obj?.esimList?.[0]?.esimStatus === 'CANCEL' ||
      esim.metadata.providerData?.esimStatus === 'CANCEL' ||
      esim.metadata.providerCancelled === true
    ) {
      return true;
    }
    
    // Parse rawData if it's a string
    if (typeof esim.metadata.rawData === 'string') {
      try {
        const parsedData = JSON.parse(esim.metadata.rawData);
        if (parsedData.obj?.esimList?.[0]?.esimStatus === 'CANCEL') {
          return true;
        }
      } catch {
        // Ignore parsing errors
      }
    }
  }
  
  // If there's anything in the plan name or employee name indicating a refund or cancellation
  if (esim.plan?.name?.toLowerCase().includes('refund') || 
      esim.description?.toLowerCase().includes('refund') ||
      esim.description?.toLowerCase().includes('cancelled')) {
    return true;
  }
  
  // If we reached here, the eSIM is not cancelled
  return false;
};

// Get all active eSIMs in the system
router.get('/debug/active-esims', async (req, res) => {
  try {
    // Get all employees
    const employees = await storage.getAllEmployeesWithCompanies();
    
    // Get all employees' eSIMs
    let allPurchasedEsims: any[] = [];
    
    // Collect all eSIMs for all employees
    for (const employee of employees) {
      const employeeEsims = await storage.getPurchasedEsims(employee.id);
      if (employeeEsims && employeeEsims.length > 0) {
        allPurchasedEsims = [...allPurchasedEsims, ...employeeEsims];
      }
    }
    
    // Result structure
    const result: any = {
      employeeCount: employees.length,
      esimCount: allPurchasedEsims.length,
      activeEsimCount: 0,
      employeesWithEsims: []
    };
    
    // Group eSIMs by employee
    for (const employee of employees) {
      // Get all eSIMs for this employee
      const employeeEsims = allPurchasedEsims.filter(esim => esim.employeeId === employee.id);
      
      if (employeeEsims.length === 0) {
        continue; // Skip employees with no eSIMs
      }
      
      // Get active eSIMs (not cancelled or refunded)
      const activeEsims = employeeEsims.filter(esim => !isEsimCancelledOrRefunded(esim));
      
      // Skip employees with no active eSIMs
      if (activeEsims.length === 0) {
        continue;
      }
      
      // Count the active eSIMs
      result.activeEsimCount += activeEsims.length;
      
      // Prepare the employee data
      const employeeData = {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        currentPlan: employee.currentPlan,
        company: employee.companyName || 'Unknown',
        activeEsims: activeEsims.map(esim => ({
          id: esim.id,
          orderId: esim.orderId,
          iccid: esim.iccid || 'N/A',
          status: esim.status,
          planId: esim.planId,
          planName: esim.planName || 'Unknown',
          purchaseDate: esim.purchaseDate,
          activationDate: esim.activationDate,
          expiryDate: esim.expiryDate,
          metadataStatus: esim.metadata?.rawData?.obj?.esimList?.[0]?.esimStatus || 'N/A'
        }))
      };
      
      // Add employee data to the result
      result.employeesWithEsims.push(employeeData);
    }
    
    // Send the response
    res.json(result);
  } catch (error) {
    console.error('Error getting active eSIMs:', error);
    res.status(500).json({ error: 'Failed to get active eSIMs' });
  }
});

// Fix eSIMs that may have incorrect status by syncing with the eSIM Access API 
router.post('/debug/fix-employee-esims', async (req, res) => {
  try {
    const { employeeId, planId } = req.body;
    
    if (!employeeId) {
      return res.status(400).json({ error: "Missing required field: employeeId" });
    }
    
    // Get all eSIMs for this employee
    const esims = await storage.getPurchasedEsims(parseInt(employeeId));
    if (!esims || esims.length === 0) {
      return res.status(404).json({ error: `No eSIMs found for employee ${employeeId}` });
    }
    
    const fixedEsims = [];
    const intEmployeeId = parseInt(employeeId);
    
    // Get the employee record to check their current plan
    const employee = await storage.getEmployee(intEmployeeId);
    const currentPlanId = employee?.currentPlan ? employee.currentPlan : null;
    
    console.log(`Checking eSIMs for employee ${intEmployeeId}, current plan: ${currentPlanId}`);
    
    // Track whether we've processed any changes
    let changesApplied = false;
    
    // Track eSIMs by their plan IDs for updating the employee's currentPlan
    const esimsByPlanId: Record<string, any[]> = {};
    
    // Group eSIMs by plan ID
    for (const esim of esims) {
      if (esim.planId) {
        const planIdStr = String(esim.planId);
        if (!esimsByPlanId[planIdStr]) {
          esimsByPlanId[planIdStr] = [];
        }
        esimsByPlanId[planIdStr].push(esim);
      }
    }
    
    // Process all eSIMs that need to be fixed
    for (const esim of esims) {
      // If a planId was specified, only fix eSIMs with that planId
      if (planId && esim.planId !== parseInt(planId)) {
        continue;
      }
      
      // Skip processing if this eSIM already has 'cancelled' status
      if (esim.status === 'cancelled') {
        continue;
      }
      
      // Should this eSIM be fixed?
      let shouldFix = false;
      let newStatus = null;
      let reason = "";
      
      // Check the API status from the metadata
      let apiStatus = null;
      
      if (esim.metadata && esim.metadata.rawData) {
        // Try to extract the API status
        if (typeof esim.metadata.rawData === 'object') {
          // Path 1: Direct esimStatus field
          if (esim.metadata.rawData.esimStatus) {
            apiStatus = esim.metadata.rawData.esimStatus;
          }
          // Path 2: Nested in obj.esimList
          else if (esim.metadata.rawData.obj?.esimList?.[0]?.esimStatus) {
            apiStatus = esim.metadata.rawData.obj.esimList[0].esimStatus;
          }
        } 
        // If rawData is a string, try to parse it
        else if (typeof esim.metadata.rawData === 'string') {
          try {
            const parsedData = JSON.parse(esim.metadata.rawData);
            if (parsedData.obj?.esimList?.[0]?.esimStatus) {
              apiStatus = parsedData.obj.esimList[0].esimStatus;
            } else if (parsedData.esimStatus) {
              apiStatus = parsedData.esimStatus;
            }
          } catch (e) {
            // Ignore parsing errors
            console.log(`Error parsing rawData for eSIM ${esim.id}: ${e}`);
          }
        }
        
        console.log(`eSIM ${esim.id} (${esim.orderId}) - Current status: ${esim.status}, API status: ${apiStatus || 'unknown'}`);
        
        // Case 1: If the API says CANCEL but our DB doesn't reflect that
        if (apiStatus === 'CANCEL' && esim.status !== 'cancelled') {
          shouldFix = true;
          newStatus = 'cancelled';
          reason = `API status is CANCEL but local status is ${esim.status}`;
        }
        
        // Case 2: Check for plans that have expired based on their validity period
        if (esim.status === 'activated' && esim.activationDate && esim.planValidity) {
          const activationDate = new Date(esim.activationDate);
          const expiryDate = new Date(activationDate);
          expiryDate.setDate(expiryDate.getDate() + esim.planValidity);
          
          const now = new Date();
          if (now > expiryDate) {
            shouldFix = true;
            newStatus = 'expired';  // Use 'expired' instead of 'cancelled' to distinguish between user-cancelled and expired
            reason = `Plan has expired (activated on ${activationDate.toISOString()}, validity ${esim.planValidity} days)`;
          }
        }
        
        // Case 3: If data usage exceeds the plan limit
        if (esim.status === 'activated' && esim.dataUsed && esim.dataLimit) {
          const usedGB = parseFloat(esim.dataUsed);
          const limitGB = parseFloat(esim.dataLimit);
          
          if (usedGB >= limitGB) {
            shouldFix = true;
            newStatus = 'expired';
            reason = `Data limit reached (used ${usedGB}GB of ${limitGB}GB)`;
          }
        }
        
        // Apply the fix if needed
        if (shouldFix && newStatus) {
          console.log(`Fixing eSIM ${esim.id} (planId: ${esim.planId}) - Reason: ${reason}`);
          
          await storage.updatePurchasedEsim(esim.id, {
            status: newStatus,
            metadata: {
              ...esim.metadata,
              previousStatus: esim.status,
              fixAppliedAt: new Date().toISOString(),
              fixReason: reason
            }
          });
          
          fixedEsims.push({
            id: esim.id, 
            oldStatus: esim.status,
            newStatus,
            planId: esim.planId,
            reason
          });
        }
      }
    }
    
    // For all active or cancelled eSIMs, check their API status from metadata
    // Force reconciliation when needed
    for (const esim of esims) {
      if (esim.status === 'cancelled' && esim.metadata?.status === 'waiting_for_activation') {
        console.log(`eSIM ${esim.id} has local status 'cancelled' but API metadata status 'waiting_for_activation'. Marking as cancelled in metadata.`);
        await storage.updatePurchasedEsim(esim.id, {
          metadata: {
            ...esim.metadata,
            status: 'cancelled',
            isCancelled: true,
            fixAppliedAt: new Date().toISOString(),
            fixReason: "Fixed metadata status to match database status"
          }
        });
        fixedEsims.push({
          id: esim.id,
          oldStatus: esim.status,
          newStatus: esim.status, // Status doesn't change, just the metadata
          planId: esim.planId,
          reason: "Fixed metadata to match database status"
        });
      }
    }
    
    // Legacy currentPlan field removed - now using plan calculation system
    // Check employee's active plans using purchased_esims table
    const employeeEsims = await storage.getPurchasedEsims(employee.id);
    const activeEsimsList = employeeEsims.filter(esim => 
      (esim.status === 'active' || esim.status === 'waiting_for_activation') &&
      !esim.isCancelled && 
      !(esim.metadata && typeof esim.metadata === 'object' && (
        esim.metadata.isCancelled === true || 
        esim.metadata.refunded === true
      ))
    );
    
    if (employee && activeEsimsList.length > 0) {
      // Process each active eSIM instead of using single currentPlan field
      for (const activeEsim of activeEsimsList) {
        const planDetails = await storage.getEsimPlanById(activeEsim.planId);
        if (!planDetails) continue;
        
        const currentPlanId = planDetails.providerId;
      
      // Convert any eSIM plan IDs to provider IDs (if we have a mapping)
      // This ensures we're comparing the right values
      const planProviderMap: Record<number, string> = {
        44978: 'P6SW3B9NG', // Hong Kong
        44981: 'P0V82VEKV', // Aaland Islands
        44213: 'P5EFMK4Y7', // Australia
      };
      
      console.log(`Checking if all eSIMs for current plan (${currentPlanId}) are cancelled`);
      
      // Find all eSIMs with matching plan ID
      const allEsimsForPlan = esims.filter(esim => {
        const providerId = esim.planId ? planProviderMap[esim.planId] : null;
        return providerId === currentPlanId || String(esim.planId) === currentPlanId;
      });
      
      // Consider eSIM cancelled if:
      // 1. It has status 'cancelled' OR
      // 2. Its metadata.isCancelled is true OR
      // 3. API status is CANCEL
      const allCancelled = allEsimsForPlan.length > 0 && 
                          allEsimsForPlan.every(esim => 
                            esim.status === 'cancelled' || 
                            esim.metadata?.isCancelled === true ||
                            (esim.metadata?.rawData && 
                             typeof esim.metadata.rawData === 'object' &&
                             esim.metadata.rawData.obj?.esimList?.[0]?.esimStatus === 'CANCEL')
                          );
      
      console.log(`Current plan: ${currentPlanId}, eSIMs found: ${allEsimsForPlan.length}, All cancelled: ${allCancelled}`);
      
      // Legacy currentPlan field removed - no longer need to update currentPlan
      // The plan calculation system automatically handles multiple plans
      console.log(`Multiple plan support active - using plan calculation system instead of currentPlan field`);
      }
    }
    
    res.json({ 
      success: true, 
      message: `Fixed ${fixedEsims.length} eSIMs for employee ${employeeId}`, 
      fixedEsims,
      employeeId: intEmployeeId,
      employeeUpdated: changesApplied
    });
  } catch (error) {
    console.error("Error fixing employee eSIMs:", error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fix employee eSIMs',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Attempt to fix an eSIM by setting the status
router.post('/debug/fix-esim-status', async (req, res) => {
  try {
    const { esimId, newStatus, reason } = req.body;
    
    if (!esimId || !newStatus) {
      return res.status(400).json({ error: "Missing required fields: esimId and newStatus" });
    }
    
    // Get the eSIM
    const esim = await storage.getPurchasedEsimById(parseInt(esimId));
    if (!esim) {
      return res.status(404).json({ error: `eSIM with ID ${esimId} not found` });
    }
    
    console.log(`Fixing eSIM ${esimId} status from ${esim.status} to ${newStatus}`);
    
    // Update the eSIM
    await storage.updatePurchasedEsim(parseInt(esimId), {
      status: newStatus,
      metadata: {
        ...esim.metadata,
        previousStatus: esim.status,
        fixAppliedAt: new Date().toISOString(),
        fixReason: reason || "Manual fix applied by admin"
      }
    });
    
    res.json({ success: true, message: `eSIM ${esimId} status updated to ${newStatus}` });
  } catch (error) {
    console.error("Error fixing eSIM status:", error);
    res.status(500).json({ error: 'Failed to fix eSIM status' });
  }
});

export default router;