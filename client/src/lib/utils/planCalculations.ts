/**
 * Plan calculation utilities for employees with multiple plans support
 * These functions replace the legacy currentPlan field approach
 */

import { PurchasedEsim, EsimPlan } from '@shared/schema';
import { isEsimCancelledOrRefunded } from './employeeUtils';

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
 * Get comprehensive plan information for an employee from their purchased eSIMs
 * This replaces the legacy currentPlan field approach
 */
export function getEmployeePlanInfo(
  employeeId: number,
  purchasedEsims: PurchasedEsim[] = [],
  allPlans: EsimPlan[] = []
): EmployeePlanInfo {
  // Filter to only this employee's eSIMs
  const employeeEsims = purchasedEsims.filter(esim => esim.employeeId === employeeId);
  
  // Filter to only active (non-cancelled and non-expired) eSIMs
  const activeEsims = employeeEsims.filter(esim => {
    // Check if cancelled or refunded
    if (isEsimCancelledOrRefunded(esim)) return false;
    
    // Check valid status
    const hasValidStatus = esim.status === 'activated' || esim.status === 'active' || esim.status === 'waiting_for_activation';
    if (!hasValidStatus) return false;
    
    // Check if expired (for activated eSIMs only)
    if (esim.status === 'activated' || esim.status === 'active') {
      if (esim.expiryDate) {
        const expiryDate = new Date(esim.expiryDate);
        const now = new Date();
        // If expired, don't consider it active
        if (now > expiryDate) return false;
      }
    }
    
    return true;
  });

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
    if (esim.activationDate) startDates.push(typeof esim.activationDate === 'string' ? esim.activationDate : esim.activationDate.toISOString());
    if (esim.expiryDate) endDates.push(typeof esim.expiryDate === 'string' ? esim.expiryDate : esim.expiryDate.toISOString());

    activePlans.push({
      planName: plan.name,
      planId: plan.id,
      providerId: plan.providerId,
      dataUsage,
      dataLimit,
      startDate: esim.activationDate ? (typeof esim.activationDate === 'string' ? esim.activationDate : esim.activationDate.toISOString()) : null,
      endDate: esim.expiryDate ? (typeof esim.expiryDate === 'string' ? esim.expiryDate : esim.expiryDate.toISOString()) : null,
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
 * This is used for display purposes where we need to show "a" plan
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
 * Check if an employee has any active plans
 * This replaces the legacy currentPlan !== null check
 */
export function hasActivePlans(
  employeeId: number,
  purchasedEsims: PurchasedEsim[] = [],
  allPlans: EsimPlan[] = []
): boolean {
  const planInfo = getEmployeePlanInfo(employeeId, purchasedEsims, allPlans);
  return planInfo.hasActivePlans;
}

/**
 * Get active eSIMs from a list of purchased eSIMs
 * This replaces the complex cancellation filtering logic
 */
export function getActiveEsims(purchasedEsims: PurchasedEsim[] = []): PurchasedEsim[] {
  return purchasedEsims.filter(esim => 
    !isEsimCancelledOrRefunded(esim) && 
    (esim.status === 'activated' || esim.status === 'active' || esim.status === 'waiting_for_activation')
  );
}

/**
 * Get total spending for an employee across all their plans
 */
export function getEmployeeTotalSpending(
  employeeId: number,
  purchasedEsims: PurchasedEsim[] = [],
  allPlans: EsimPlan[] = []
): number {
  const planInfo = getEmployeePlanInfo(employeeId, purchasedEsims, allPlans);
  
  return planInfo.activePlans.reduce((total, plan) => {
    const planDetails = allPlans.find(p => p.id === plan.planId);
    if (!planDetails) return total;
    
    return total + parseFloat(planDetails.sellingPrice || '0');
  }, 0);
}

/**
 * Get plan status for display purposes
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

