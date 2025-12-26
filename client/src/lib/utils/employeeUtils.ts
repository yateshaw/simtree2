/**
 * Utility functions for employee-related operations
 * Comprehensive system for detecting eSIM cancellation status across all scenarios
 */

/**
 * SYSTEM-WIDE eSIM cancellation detection
 * This comprehensive function ensures the frontend ALWAYS recognizes the real cancellation status
 * by checking multiple layers of data sources and cancellation indicators
 */
export const isEsimCancelledOrRefunded = (esim: any): boolean => {
  if (!esim) return false;
  
  // console.log(`[DEBUG] Checking cancellation for eSIM ${esim.id}:`, {
  //   status: esim.status,
  //   isCancelled: esim.isCancelled,
  //   metadataStatus: esim.metadata?.status,
  //   metadataCancelled: esim.metadata?.isCancelled,
  //   metadataRefunded: esim.metadata?.refunded
  // });
  
  // LAYER 1: Database status - primary source of truth
  if (esim.status === 'cancelled') {
    // console.log(`[DEBUG] eSIM ${esim.id} cancelled by status`);
    return true;
  }
  
  // LAYER 2: Frontend cancellation flags
  if (esim.isCancelled === true) {
    return true;
  }
  
  // LAYER 3: Comprehensive metadata analysis
  if (esim.metadata) {
    // Direct cancellation indicators
    if (esim.metadata.isCancelled === true || 
        esim.metadata.refunded === true ||
        esim.metadata.status === 'cancelled') {
      return true;
    }
    
    // Cancellation timestamp presence indicates cancellation
    if (esim.metadata.cancelledAt || 
        esim.metadata.cancelRequestTime ||
        esim.metadata.refundDate ||
        esim.metadata.cancelledInProvider === true) {
      return true;
    }
    
    // Refund completion indicators
    if (esim.metadata.pendingRefund === false && esim.metadata.refunded === true) {
      return true;
    }
    
    // Previous status checks
    if (esim.metadata.previousStatus === 'cancelled') {
      return true;
    }
    
    // LAYER 4: Provider API status analysis
    if (esim.metadata.rawData) {
      const providerStatus = extractProviderStatus(esim.metadata.rawData);
      
      // Only consider truly cancelled provider statuses
      const cancelledStatuses = [
        'CANCEL', 'CANCELLED', 'REVOKED', 'TERMINATED', 
        'SUSPENDED', 'INACTIVE', 'DISABLED', 'EXPIRED_CANCELLED'
        // Removed 'USED_EXPIRED' - this can be a valid activated state
        // Note: 'RELEASED' is NOT cancelled - it means ready for activation
      ];
      
      // IMPORTANT: Don't mark as cancelled if the main status is waiting_for_activation or activated
      if (esim.status === 'waiting_for_activation' || esim.status === 'activated') {
        // console.log(`[DEBUG] eSIM ${esim.id} has valid status ${esim.status}, ignoring provider status ${providerStatus}`);
        // Don't check provider status for valid eSIMs - they are valid regardless of provider status
        return false;
      } else if (providerStatus && cancelledStatuses.includes(providerStatus)) {
        // console.log(`[DEBUG] eSIM ${esim.id} cancelled by provider status: ${providerStatus}`);
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
};

/**
 * Robust provider status extraction supporting multiple API response formats
 */
const extractProviderStatus = (rawData: any): string | null => {
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
};

/**
 * Gets the most recent eSIM for an employee
 */
export const getMostRecentEsim = (employeeId: number, purchasedEsims: any[] = []) => {
  const execEsims = purchasedEsims.filter(esim => esim.employeeId === employeeId);
  
  if (execEsims.length === 0) return null;
  
  // Sort by purchase date descending to get the most recent
  const sortedEsims = execEsims.sort((a, b) => 
    new Date(b.purchaseDate || b.createdAt || 0).getTime() - 
    new Date(a.purchaseDate || a.createdAt || 0).getTime()
  );
  
  return sortedEsims[0];
};

/**
 * Gets all ACTIVE eSIMs for an employee using comprehensive cancellation detection
 */
export const getActiveEsims = (employeeId: number, purchasedEsims: any[] = []) => {
  // Handle case where no eSIMs are provided
  if (!purchasedEsims || purchasedEsims.length === 0) {
    return [];
  }
  
  // Filter to only eSIMs for this employee first
  const execEsims = purchasedEsims.filter(esim => esim.employeeId === employeeId);
  
  // Apply comprehensive cancellation filtering
  const nonCancelledEsims = execEsims.filter(esim => !isEsimCancelledOrRefunded(esim));
  
  // Early return if no active eSIMs
  if (nonCancelledEsims.length === 0) {
    return [];
  }
  
  // Filter out eSIMs that are expired based on provider status
  const activeEsims = nonCancelledEsims.filter(esim => {
    if (!esim.metadata?.rawData) return true;
    
    const providerStatus = extractProviderStatus(esim.metadata.rawData);
    
    // Exclude eSIMs with expired provider statuses
    if (providerStatus === 'USED_EXPIRED' || providerStatus === 'EXPIRED') {
      return false;
    }
    
    return true;
  });
  
  return activeEsims;
};

/**
 * Calculates remaining time for an eSIM plan based on status
 * - Waiting for activation: Shows plan duration (e.g., "7 days")
 * - Activated: Shows countdown from activation date
 * - Less than 1 day: Shows hours/minutes countdown
 */
export const getTimeLeft = (endDate: string | null, planValidity: number | null, esim: any) => {
  // Safety checks - ensure we have valid inputs
  if (!esim || typeof esim !== 'object') return null;
  
  // Enhanced plan validity extraction with fallbacks
  let effectivePlanValidity = planValidity;
  
  // Try to get plan validity from eSIM metadata first
  if (!effectivePlanValidity && esim.metadata?.rawData?.obj?.esimList?.[0]?.totalDuration) {
    effectivePlanValidity = esim.metadata.rawData.obj.esimList[0].totalDuration;
  }
  
  // If still no plan validity, return null
  if (!effectivePlanValidity || effectivePlanValidity <= 0) return null;
  
  // For waiting_for_activation status, show the plan duration
  if (esim.status === 'waiting_for_activation') {
    return `${effectivePlanValidity} day${effectivePlanValidity !== 1 ? 's' : ''}`;
  }
  
  // For activated status, calculate countdown from activation date
  if (esim.status === 'activated' || esim.status === 'active') {
    let expiryDate: Date;
    
    try {
      // PRIORITY 1: Calculate from activation date + plan validity (most reliable)
      if (esim.activationDate && typeof esim.activationDate === 'string') {
        const activationDate = new Date(esim.activationDate);
        if (isNaN(activationDate.getTime())) {
          throw new Error('Invalid activation date');
        }
        expiryDate = new Date(activationDate);
        expiryDate.setDate(expiryDate.getDate() + effectivePlanValidity);
        
        // Validate: if provider's endDate differs significantly from calculated date,
        // trust our calculation over the provider's date
        if (endDate && typeof endDate === 'string') {
          const providerExpiryDate = new Date(endDate);
          if (!isNaN(providerExpiryDate.getTime())) {
            const calculatedTime = expiryDate.getTime();
            const providerTime = providerExpiryDate.getTime();
            const timeDifference = Math.abs(calculatedTime - providerTime);
            const daysDifference = timeDifference / (1000 * 60 * 60 * 24);
            
            // If provider date differs by more than 7 days from our calculation,
            // trust our calculation (provider date is likely wrong)
            if (daysDifference <= 7) {
              // Provider date is reasonable, use it for accuracy
              expiryDate = providerExpiryDate;
            }
            // Otherwise, stick with our calculated date
          }
        }
      } 
      // PRIORITY 2: For "activated" status but no activation date, check if provider date is reasonable
      else if (endDate && typeof endDate === 'string') {
        expiryDate = new Date(endDate);
        // Check if date is valid
        if (isNaN(expiryDate.getTime())) {
          throw new Error('Invalid end date');
        }
        
        // Sanity check: if provider date is more than 2x the plan validity from now,
        // it's likely incorrect - calculate from purchase date instead
        const now = new Date();
        const timeFromNow = expiryDate.getTime() - now.getTime();
        const daysFromNow = timeFromNow / (1000 * 60 * 60 * 24);
        
        if (daysFromNow > (effectivePlanValidity * 2)) {
          // Provider date seems wrong, try to calculate from purchase date
          if (esim.purchaseDate && typeof esim.purchaseDate === 'string') {
            const purchaseDate = new Date(esim.purchaseDate);
            if (!isNaN(purchaseDate.getTime())) {
              expiryDate = new Date(purchaseDate);
              expiryDate.setDate(expiryDate.getDate() + effectivePlanValidity);
            }
          }
        }
      } else {
        // PRIORITY 3: Calculate from purchase date as fallback
        if (esim.purchaseDate && typeof esim.purchaseDate === 'string') {
          const purchaseDate = new Date(esim.purchaseDate);
          if (isNaN(purchaseDate.getTime())) {
            throw new Error('Invalid purchase date');
          }
          expiryDate = new Date(purchaseDate);
          expiryDate.setDate(expiryDate.getDate() + effectivePlanValidity);
        } else {
          // No valid date available, can't calculate countdown
          return null;
        }
      }
    } catch (error) {
      // If date parsing fails, return null
      return null;
    }
    
    const now = new Date();
    const timeLeft = expiryDate.getTime() - now.getTime();
    
    // If expired, return null
    if (timeLeft <= 0) return null;
    
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    // More than 1 day left
    if (days > 1) {
      return `${days} days`;
    } else if (days === 1) {
      return `1 day`;
    } else if (hours > 0) {
      // Less than 1 day, show hours
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      // Less than 1 hour, show minutes
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      // Less than 1 minute
      return 'Less than 1 minute';
    }
  }
  
  // For other statuses (error, pending, etc.), don't show time
  return null;
};

/**
 * Checks if an employee can have auto-renewal enabled
 * Auto-renewal requires at least one active plan
 */
export const canEnableAutoRenewal = (employeeId: number, purchasedEsims: any[] = [], employees: any[] = []) => {
  const activeEsims = getActiveEsims(employeeId, purchasedEsims);
  
  // Must have at least one active eSIM
  if (activeEsims.length === 0) return false;
  
  // Check if any active eSIM is in a renewable state
  const renewableStatuses = ['waiting_for_activation', 'activated'];
  const hasRenewableEsim = activeEsims.some(esim => 
    renewableStatuses.includes(esim.status)
  );
  
  return hasRenewableEsim;
};