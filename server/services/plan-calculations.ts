/**
 * Server-side plan calculation utilities for employees with multiple plans support
 * These functions replace the legacy currentPlan field approach
 */

import { PurchasedEsim, EsimPlan, Employee } from '@shared/schema';

export interface EmployeePlanInfo {
  totalDataUsage: number;
  totalDataLimit: number;
  activePlans: Array<{
    planName: string;
    planId: number;
    providerId: string;
    dataUsage: number;
    dataLimit: number;
    startDate: string | null;
    endDate: string | null;
    validity: number;
    status: string;
    esimId: number;
  }>;
  hasActivePlans: boolean;
  earliestStartDate: string | null;
  latestEndDate: string | null;
}

/**
 * Check if an eSIM is cancelled or refunded (server-side version)
 */
function isEsimCancelledOrRefunded(esim: any): boolean {
  if (!esim) return false;
  
  // Database status check
  if (esim.status === 'cancelled') return true;
  
  // Frontend cancellation flags
  if (esim.isCancelled === true) return true;
  
  // Parse metadata if it's a string
  let metadata = esim.metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }
  
  // Metadata analysis
  if (metadata) {
    if (metadata.isCancelled === true || 
        metadata.refunded === true ||
        metadata.status === 'cancelled' ||
        metadata.cancelledAt ||
        metadata.cancelRequestTime ||
        metadata.refundDate) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get comprehensive plan information for an employee from their purchased eSIMs
 */
export function getEmployeePlanInfo(
  employeeId: number,
  purchasedEsims: PurchasedEsim[] = [],
  allPlans: EsimPlan[] = []
): EmployeePlanInfo {
  // Filter to only this employee's eSIMs
  const employeeEsims = purchasedEsims.filter(esim => esim.employeeId === employeeId);
  
  // Filter to only active (non-cancelled) eSIMs
  const activeEsims = employeeEsims.filter(esim => 
    !isEsimCancelledOrRefunded(esim) && 
    (esim.status === 'activated' || esim.status === 'active' || esim.status === 'waiting_for_activation')
  );

  if (activeEsims.length === 0) {
    return {
      totalDataUsage: 0,
      totalDataLimit: 0,
      activePlans: [],
      hasActivePlans: false,
      earliestStartDate: null,
      latestEndDate: null
    };
  }

  // Calculate aggregated data and build plan info
  let totalDataUsage = 0;
  let totalDataLimit = 0;
  const activePlans: EmployeePlanInfo['activePlans'] = [];
  const startDates: string[] = [];
  const endDates: string[] = [];

  activeEsims.forEach(esim => {
    const plan = allPlans.find(p => p.id === esim.planId);
    if (!plan) return;

    const dataUsage = parseFloat(esim.dataUsed || '0');
    const dataLimit = parseFloat(plan.data);

    totalDataUsage += dataUsage;
    totalDataLimit += dataLimit;

    // Collect dates for aggregation
    if (esim.activationDate) startDates.push(esim.activationDate);
    if (esim.expiryDate) endDates.push(esim.expiryDate);

    activePlans.push({
      planName: plan.name,
      planId: plan.id,
      providerId: plan.providerId,
      dataUsage,
      dataLimit,
      startDate: esim.activationDate,
      endDate: esim.expiryDate,
      validity: plan.validity,
      status: esim.status,
      esimId: esim.id
    });
  });

  // Calculate earliest start and latest end dates
  const earliestStartDate = startDates.length > 0 
    ? startDates.reduce((earliest, current) => earliest < current ? earliest : current)
    : null;
  
  const latestEndDate = endDates.length > 0
    ? endDates.reduce((latest, current) => latest > current ? latest : current)
    : null;

  return {
    totalDataUsage,
    totalDataLimit,
    activePlans,
    hasActivePlans: activePlans.length > 0,
    earliestStartDate,
    latestEndDate
  };
}

/**
 * Get the primary plan for an employee (most recent active plan)
 */
export function getPrimaryPlan(planInfo: EmployeePlanInfo): EmployeePlanInfo['activePlans'][0] | null {
  if (planInfo.activePlans.length === 0) return null;
  
  // Sort by start date (most recent first) or by status priority
  const sortedPlans = [...planInfo.activePlans].sort((a, b) => {
    // Prioritize activated plans over waiting
    if (a.status === 'activated' && b.status !== 'activated') return -1;
    if (b.status === 'activated' && a.status !== 'activated') return 1;
    
    // Then by start date (most recent first)
    if (a.startDate && b.startDate) {
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    }
    
    // If no start dates, prioritize by esim ID (most recent purchase)
    return b.esimId - a.esimId;
  });

  return sortedPlans[0];
}

/**
 * Update employee record with calculated plan information
 * This maintains backward compatibility while transitioning away from currentPlan
 */
export function getEmployeeUpdateFromPlanInfo(
  planInfo: EmployeePlanInfo,
  autoRenewEnabled: boolean = false
): Partial<Employee> {
  const primaryPlan = getPrimaryPlan(planInfo);
  
  return {
    // Legacy fields - will be removed in final phase
    currentPlan: primaryPlan?.providerId || null,
    dataUsage: planInfo.totalDataUsage.toFixed(2),
    dataLimit: planInfo.totalDataLimit.toFixed(2),
    planStartDate: planInfo.earliestStartDate,
    planEndDate: planInfo.latestEndDate,
    planValidity: primaryPlan?.validity || null,
    autoRenewEnabled
  };
}

/**
 * Check if an employee has any active plans
 */
export function hasActivePlans(
  employeeId: number,
  purchasedEsims: PurchasedEsim[] = []
): boolean {
  const planInfo = getEmployeePlanInfo(employeeId, purchasedEsims);
  return planInfo.hasActivePlans;
}

/**
 * Get plan status for an employee
 */
export function getEmployeePlanStatus(
  employeeId: number,
  purchasedEsims: PurchasedEsim[] = []
): 'active' | 'waiting' | 'mixed' | 'none' {
  const planInfo = getEmployeePlanInfo(employeeId, purchasedEsims);
  
  if (!planInfo.hasActivePlans) return 'none';
  
  const activatedCount = planInfo.activePlans.filter(p => p.status === 'activated' || p.status === 'active').length;
  const waitingCount = planInfo.activePlans.filter(p => p.status === 'waiting_for_activation').length;
  
  if (activatedCount > 0 && waitingCount > 0) return 'mixed';
  if (activatedCount > 0) return 'active';
  if (waitingCount > 0) return 'waiting';
  
  return 'none';
}