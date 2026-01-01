import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DialogHeader,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { Check, Clock, Mail, Phone, User, X, Trash2, Send, Pencil, Search, RefreshCw, ChevronDown, ChevronRight, Eye } from "lucide-react";
import EmployeeAddButton from "./EmployeeAddButton";
import { EsimDetails } from "./EsimDetails";
import Loader2 from "@/components/Loader2";
import PlanAssignmentDialog from "./PlanAssignmentDialog";
import type { Employee as BaseEmployee } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useEventSource } from "@/hooks/useEventSource";
import { EventTypes } from "@/lib/events";
// Import utility functions from the separate file
import { 
  isEsimCancelledOrRefunded,
  getMostRecentEsim,
  getActiveEsims,
  getTimeLeft,
  canEnableAutoRenewal
} from "@/lib/utils/employeeUtils";
// Import the data formatter utility
import { formatDataUsage, BYTES_PER_MB, BYTES_PER_GB } from "@/lib/formatters";
// Import the new plan calculation utilities
import { 
  getEmployeePlanInfo, 
  getPrimaryPlan, 
  hasActivePlans,
  getEmployeePlanStatus
} from "@/lib/utils/planCalculations";

// Extend the base Employee type to include companyName
type Employee = BaseEmployee & { 
  companyName?: string 
};

// Type for table rows - each row represents either an employee with a specific plan or an employee with no plan
type EmployeeRow = Employee & {
  rowId: string; // Unique row identifier (employee.id or employee.id-esim.id)
  currentPlan?: {
    esim: any;
    plan: any;
    planName: string;
    status: string;
    dataUsage: string;
    timeLeft: string;
    expiryDate: string | null;
  } | null;
};

interface EmployeeTableProps {
  employees?: Employee[];
  showCompanyName?: boolean;
  purchasedEsimsData?: any[];
  dialogState?: {
    showDetailsDialog: boolean;
    setShowDetailsDialog: (show: boolean) => void;
    selectedEmployee: Employee | null;
    setSelectedEmployee: (exec: Employee | null) => void;
    selectedEsim: any;
    setSelectedEsim: (esim: any) => void;
  };
}

export default function EmployeeTable({ 
  employees: propEmployees, 
  showCompanyName = false,
  purchasedEsimsData,
  dialogState
}: EmployeeTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // Add selected employees state
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  
  // Use hoisted dialog state if provided, otherwise use local state
  const [localSelectedEmployee, setLocalSelectedEmployee] = useState<Employee | null>(null);
  const [localSelectedEsim, setLocalSelectedEsim] = useState<any>(null);
  const [localShowDetailsDialog, setLocalShowDetailsDialog] = useState(false);
  
  const selectedEmployee = dialogState?.selectedEmployee ?? localSelectedEmployee;
  const setSelectedEmployee = dialogState?.setSelectedEmployee ?? setLocalSelectedEmployee;
  const selectedEsim = dialogState?.selectedEsim ?? localSelectedEsim;
  const setSelectedEsim = dialogState?.setSelectedEsim ?? setLocalSelectedEsim;
  const showDetailsDialog = dialogState?.showDetailsDialog ?? localShowDetailsDialog;
  const setShowDetailsDialog = dialogState?.setShowDetailsDialog ?? setLocalShowDetailsDialog;
  
  // Note: Removed forced refresh on mount - SSE handles all real-time updates
  // The initial fetch happens automatically via refetchOnMount: true
  
  // Track employees that currently have a plan being assigned to them
  const [employeesWithPendingPlans, setEmployeesWithPendingPlans] = useState<Set<number>>(new Set());
  // Track employees with recently cancelled plans for immediate UI updates
  const [cancelledEmployeeIds, setCancelledEmployeeIds] = useState<number[]>([]);
  
  // Make cancelledEmployeeIds available on the window object for other components
  useEffect(() => {
    // Create a global tracking array if it doesn't exist
    if (!window.cancelledEmployeeIds) {
      window.cancelledEmployeeIds = [];
    }
    
    // Update the global tracking array
    window.cancelledEmployeeIds = [...cancelledEmployeeIds];
    
    // Clean up function
    return () => {
      window.cancelledEmployeeIds = [];
    };
  }, [cancelledEmployeeIds]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "waiting">("all");
  const [showAssignPlanDialog, setShowAssignPlanDialog] = useState(false);
  const [selectedEmployeeForPlan, setSelectedEmployeeForPlan] = useState<Employee | null>(null);
  const [isRefreshingDataUsage, setIsRefreshingDataUsage] = useState(false);
  
  // Use refs to persist dialog state across re-renders caused by SSE/query invalidations
  const dialogOpenRef = useRef(false);
  const selectedEmployeeRef = useRef<Employee | null>(null);

  // SSE integration for real-time employee updates
  const { events, clearEvents } = useEventSource({
    url: '/api/events',
    withCredentials: true,
    enabled: true // Always use SSE for real-time updates
  });

  // Queries
  // Always fetch employees - SSE will keep this data fresh
  const { data: fetchedEmployees = [], isLoading: isFetchingEmployees, refetch: refetchEmployees } = useQuery<(Employee & { companyName?: string })[]>({
    queryKey: ['/api/employees'],
    staleTime: 1000 * 60 * 5, // 5 minutes - SSE keeps data fresh
    refetchOnWindowFocus: false, // Disabled - SSE handles updates
    refetchOnMount: true, // Initial fetch on mount
    enabled: true // Always enabled - SSE updates the cache
  });
  
  // Fetch wallet data to check available balance
  const { data: walletData } = useQuery<{ wallets: Array<{ balance: string }> }>({
    queryKey: ['/api/wallet'],
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: true,
  });
  
  // Always use fetched employees with SSE updates
  const employees = fetchedEmployees;
  const isLoading = isFetchingEmployees;
  
  // Extract wallet balance for checking auto-renewal eligibility
  const companyWallets = walletData?.wallets || [];
  const availableBalance = companyWallets.reduce((total: number, wallet: { balance: string }) => {
    return total + parseFloat(wallet.balance || '0');
  }, 0);
  
  // Handle SSE events for real-time employee updates
  const handleEmployeeSSEUpdate = useCallback((eventData?: any) => {
    if (import.meta.env.DEV) { 
      console.log('Employee data updated via SSE - invalidating cache', eventData?.data?.action || 'unknown action'); 
    }
    
    // Invalidate queries to trigger background refetch
    queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
    if (eventData?.data?.action === 'plan_assigned' || eventData?.data?.action === 'plan_cancelled') {
      queryClient.invalidateQueries({ queryKey: ['/api/esim/purchased'] });
    }
  }, [queryClient]);

  // Process SSE events for employee updates
  useEffect(() => {
    const employeeEvents = events.filter(event => 
      event.type === EventTypes.EXECUTIVE_UPDATE ||
      event.type === EventTypes.ESIM_STATUS_CHANGE ||
      event.type === EventTypes.AUTO_RENEWAL_EVENT
    );
    
    if (employeeEvents.length > 0) {
      // Pass the most recent event data to the handler for context
      const latestEvent = employeeEvents[employeeEvents.length - 1];
      
      // Mark recent activity for the specific employee if provided
      if (latestEvent.data?.employeeId) {
        const currentTime = Date.now();
        localStorage.setItem(`esim_refresh_${latestEvent.data.employeeId}`, (currentTime - 4000).toString()); // Mark as needing refresh
        if (import.meta.env.DEV) { 
          console.log(`[SSE] Marked employee ${latestEvent.data.employeeId} for refresh due to ${latestEvent.type} event`); 
        }
      }
      
      handleEmployeeSSEUpdate(latestEvent);
      
      // If it's a plan assignment event, also invalidate purchased eSIMs
      if (latestEvent.data?.action === 'plan_assigned') {
        queryClient.invalidateQueries({ queryKey: ['/api/esim/purchased'] });
        if (import.meta.env.DEV) { 
          console.log(`Plan assigned to employee ${latestEvent.data.employeeId} - invalidating eSIM queries`); 
        }
      }
      
      // Clear processed events to prevent re-processing and constant re-renders
      clearEvents();
    }
  }, [events, handleEmployeeSSEUpdate, queryClient, clearEvents]);

  // Set up periodic refresh of data (useful after operations like eSIM cancellation)
  useEffect(() => {
    // Create event listener for custom 'refreshEmployees' event
    const handleRefreshRequest = () => {
      if (import.meta.env.DEV) { console.log('Employee table received refresh request - fetching latest data'); }
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
    };
    
    // Listen for custom refresh events
    window.addEventListener('refreshEmployees', handleRefreshRequest);
    
    // Listen for plan assignment events
    const handlePlanAssignmentStart = (e: CustomEvent) => {
      const employeeId = e.detail?.employeeId;
      if (employeeId) {
        if (import.meta.env.DEV) { console.log(`Plan assignment started for employee ${employeeId}`); }
        setEmployeesWithPendingPlans(prev => {
          const updated = new Set(prev);
          updated.add(employeeId);
          return updated;
        });
      }
    };
    
    const handlePlanAssignmentComplete = (e: CustomEvent) => {
      const employeeId = e.detail?.employeeId;
      const hasError = e.detail?.error === true;
      const errorMessage = e.detail?.errorMessage;
      const assignedEmployeeIds = e.detail?.assignedEmployeeIds || [];
      const timestamp = e.detail?.timestamp;
      
      if (employeeId) {
        console.error(`Plan assignment completed for employee ${employeeId}${hasError ? ' with error: ' + errorMessage : ''}`);
        
        // Update pending plans indicator
        setEmployeesWithPendingPlans(prev => {
          const updated = new Set(prev);
          updated.delete(employeeId);
          return updated;
        });
        
        // Only clear from the cancelledEmployeeIds list if this is a successful assignment
        // or if this employee is explicitly included in assignedEmployeeIds
        if (!hasError || assignedEmployeeIds.includes(employeeId)) {
          // If this employee was in the cancelledEmployeeIds list, remove them
          // This is critical to show newly assigned plans after a plan was cancelled
          setCancelledEmployeeIds(prev => {
            if (prev.includes(employeeId)) {
              if (import.meta.env.DEV) { console.log(`Removing employee ${employeeId} from cancelled list after new plan assignment`); }
              return prev.filter(id => id !== employeeId);
            }
            return prev;
          });
        } else if (hasError) {
          if (import.meta.env.DEV) { console.log(`Plan assignment failed for employee ${employeeId}, keeping in cancelled list if present`); }
        }
        
        // SSE will handle the update - no need for manual refetch
      }
    };
    
    // Listen for plan cancellation events
    const handlePlanCancelled = (e: CustomEvent) => {
      const employeeId = e.detail?.employeeId;
      if (employeeId) {
        if (import.meta.env.DEV) { console.log(`Plan cancelled for employee ${employeeId}`); }
        
        // Add to list of cancelled employees for immediate UI update
        setCancelledEmployeeIds(prev => [...prev, employeeId]);
        
        // Invalidate queries to trigger background refetch - SSE will handle the update
        queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      }
    };
    
    // Add custom event listeners
    window.addEventListener('planAssignmentStart', handlePlanAssignmentStart as EventListener);
    window.addEventListener('planAssignmentComplete', handlePlanAssignmentComplete as EventListener);
    window.addEventListener('planCancelled', handlePlanCancelled as EventListener);
    
    return () => {
      window.removeEventListener('refreshEmployees', handleRefreshRequest);
      window.removeEventListener('planAssignmentStart', handlePlanAssignmentStart as EventListener);
      window.removeEventListener('planAssignmentComplete', handlePlanAssignmentComplete as EventListener);
      window.removeEventListener('planCancelled', handlePlanCancelled as EventListener);
    };
  }, [queryClient]);
  
  // Track the source of employees data
  useEffect(() => {
    // No logging needed - using propEmployees if available, otherwise fetchedEmployees
  }, [propEmployees, fetchedEmployees]);

  // Add mutation for sending activation emails
  const sendActivationEmailMutation = useMutation({
    mutationFn: async (employeeId: number) => {
      // Make sure we're sending employeeId as a number
      const requestBody = { employeeId: Number(employeeId) };
      
      const data = await apiRequest('/api/email/send-individual-activation', {
        method: 'POST',
        body: requestBody as any
      });

      if (!data.success) {
        throw new Error(data.message || 'Failed to send activation email');
      }
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Activation email sent successfully",
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || error?.toString?.() || 'Unknown error';
      console.error('Email sending error:', errorMessage, error);
      toast({
        title: "Error",
        description: error?.message || "Failed to send activation email",
        variant: "destructive",
      });
    }
  });

  // Handle send activation email for single employee
  const handleSendActivationEmail = async (employee: Employee) => {
    try {
      // Before sending the email, verify that the employee has at least one non-cancelled eSIM
      // with waiting_for_activation status that can receive the activation email
      const hasEligibleEsim = purchasedEsims.some(esim => 
        esim.employeeId === employee.id && 
        esim.status === 'waiting_for_activation' && 
        !isEsimCancelledOrRefunded(esim)
      );
      
      if (!hasEligibleEsim) {
        toast({
          title: "No eligible eSIM",
          description: "This employee doesn't have any eSIMs that can be activated",
          variant: "destructive",
        });
        return;
      }
      
      await sendActivationEmailMutation.mutateAsync(employee.id);
    } catch (error: unknown) {
      const errorMessage = (error as any)?.message || (error as any)?.toString?.() || 'Unknown error';
      console.error('Handle send activation email error:', errorMessage, error);
      // Error is handled by mutation
    }
  };

  // Handle bulk send activation emails
  const handleBulkSendActivationEmails = async () => {
    if (selectedEmployees.length === 0) {
      toast({
        title: "No employees selected",
        description: "Please select employees to send activation emails",
        variant: "destructive",
      });
      return;
    }

    try {
      // Filter out employees that don't have any eligible eSIMs for activation
      const eligibleEmployees = selectedEmployees.filter(execId => {
        const exec = employees.find(e => e.id === execId);
        if (!exec) return false;
        
        // Check if employee has at least one eSIM with waiting_for_activation status that is not cancelled
        const hasEligibleEsim = purchasedEsims.some(esim => 
          esim.employeeId === execId && 
          esim.status === 'waiting_for_activation' && 
          !isEsimCancelledOrRefunded(esim)
        );
        
        return hasEligibleEsim;
      });
      
      if (eligibleEmployees.length === 0) {
        toast({
          title: "No eligible employees",
          description: "None of the selected employees have valid plans",
          variant: "destructive",
        });
        return;
      }
      
      let successCount = 0;
      // Process each selected employee individually
      for (const execId of eligibleEmployees) {
        try {
          await sendActivationEmailMutation.mutateAsync(execId);
          successCount++;
        } catch (error) {
          console.error(`Failed to send activation email to employee ID ${execId}:`, error);
          // Continue with the next employee even if one fails
        }
      }
      
      // If some employees were skipped, inform the user
      const skippedCount = selectedEmployees.length - eligibleEmployees.length;
      
      toast({
        title: "Activation Emails Sent",
        description: `Successfully sent ${successCount} activation emails. ${skippedCount > 0 ? `${skippedCount} employees skipped (no eligible waiting-for-activation eSIMs).` : ''}`,
      });
    } catch (error) {
      console.error('Bulk send activation error:', error);
      toast({
        title: "Error",
        description: "Failed to send some activation emails",
        variant: "destructive",
      });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (employeeId: number) => {
      return apiRequest(`/api/employees/${employeeId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
    },
  });

  // Mutation for toggling auto-renewal per eSIM/plan
  const toggleAutoRenewMutation = useMutation({
    mutationFn: async ({ esimId, enabled, planCost = 0 }: { esimId: number, enabled: boolean, planCost?: number }) => {
      // If trying to enable auto-renewal, check for sufficient balance first
      if (enabled) {
        // If we have plan cost and the balance is insufficient, show an error
        if (planCost > 0 && availableBalance < planCost) {
          throw new Error(`Insufficient balance. Required: ${planCost.toFixed(2)}, Available: ${availableBalance.toFixed(2)}`);
        }
      }
      
      if (import.meta.env.DEV) { console.log(`Attempting to set auto-renewal for eSIM ${esimId} to ${enabled ? 'enabled' : 'disabled'}`); }
      
      // Use apiRequest to handle CSRF tokens properly - now targets specific eSIM
      const parsedResponse = await apiRequest(`/api/esim/${esimId}/auto-renew`, {
        method: 'PATCH',
        body: JSON.stringify({ autoRenewEnabled: enabled })
      });
      
      if (import.meta.env.DEV) { console.log('Auto-renewal API response:', parsedResponse); }
      
      return { response: parsedResponse, esimId, enabled };
    },
    onSuccess: async (data) => {
      const { esimId, enabled } = data;
      
      toast({
        title: "Auto-renewal updated",
        description: `Auto-renewal for this plan ${enabled ? 'enabled' : 'disabled'} successfully`,
      });
      
      // Use refetch instead of invalidate to ensure immediate data consistency
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['/api/employees'] }),
        queryClient.refetchQueries({ queryKey: ['/api/esim/purchased'] })
      ]);
    },
    onError: (error) => {
      console.error('Toggle auto-renewal error:', error);
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to update auto-renewal setting",
        variant: "destructive",
      });
    }
  });

  const cancelPlanMutation = useMutation({
    mutationFn: async ({ esimId, employeeId }: { esimId: number, employeeId: number }) => {
      const response = await apiRequest('/api/esim/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ esimId })
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to cancel plan');
      }

      return { response, employeeId };
    },
    onSuccess: (data) => {
      const { employeeId } = data;
      
      toast({
        title: "Plan cancelled",
        description: "The eSIM plan has been cancelled and refunded",
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/esim/purchased'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      
      // Force immediate refetch of employees data to update UI
      queryClient.refetchQueries({ queryKey: ['/api/employees'] });
      
      // Dispatch event to indicate plan was cancelled for this employee
      if (import.meta.env.DEV) { console.log(`Dispatching planCancelled event for employeeId=${employeeId}`); }
      window.dispatchEvent(
        new CustomEvent('planCancelled', { 
          detail: { employeeId }
        })
      );
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel the plan",
        variant: "destructive",
      });
    }
  });

  const { data: plans = [], isLoading: isFetchingPlans } = useQuery<any[]>({
    queryKey: ['/api/esim/plans'],
    staleTime: 60000 // Increase staleTime to 1 minute
  });

  // Use externally provided eSIM data if available, otherwise fetch it
  const { data: purchasedEsimsResponse = { data: [] }, isLoading: isFetchingPurchasedEsims } = useQuery<{ success: boolean, data: Array<any> }>({
    queryKey: ['/api/esim/purchased'],
    staleTime: 5 * 60 * 1000, // 5 minutes - use SSE for real-time updates
    enabled: !purchasedEsimsData // Only fetch if purchasedEsimsData is not provided
  });

  // Use the provided eSIM data or the fetched data
  const purchasedEsims: any[] = purchasedEsimsData || purchasedEsimsResponse?.data || [];
  
  // Track eSIM data for status management
  useEffect(() => {
    // No logging needed - just tracking purchasedEsims data
  }, [purchasedEsims]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(exec => {
      const matchesSearch =
        exec.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exec.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (exec.email && exec.email.toLowerCase().includes(searchTerm.toLowerCase()));

      const execPurchasedEsims = purchasedEsims.filter(
        (esim: any) => esim.employeeId === exec.id
      );

      // Use new plan calculation system for status filtering
      const planStatus = getEmployeePlanStatus(exec.id, purchasedEsims);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && (planStatus === 'active' || planStatus === 'mixed')) ||
        (statusFilter === "waiting" && (planStatus === 'waiting' || planStatus === 'mixed')) ||
        (statusFilter === "inactive" && planStatus === 'none');

      return matchesSearch && matchesStatus;
    });
  }, [employees, searchTerm, statusFilter, purchasedEsims]);

  // Helper function to get all plans for an employee using the new plan calculation system
  // Must be defined before tableRows useMemo which depends on it
  const getEmployeePlans = (employeeId: number) => {
    const planInfo = getEmployeePlanInfo(employeeId, purchasedEsims, plans);
    
    // Double-check filtering for cancelled eSIMs in sub-rows as an extra safety measure
    const filteredPlans = planInfo.activePlans.filter(plan => {
      const esim = purchasedEsims.find(esim => esim.id === plan.esimId);
      if (!esim) return false;
      
      // Apply the same cancellation filter again to ensure no cancelled eSIMs show up
      const isCancelled = isEsimCancelledOrRefunded(esim);
      
      return !isCancelled;
    });
    
    return filteredPlans.map(plan => ({
      esim: purchasedEsims.find(esim => esim.id === plan.esimId),
      plan: plans.find(p => p.id === plan.planId),
      planName: plan.planName,
      status: plan.status,
      dataUsage: plan.dataUsage.toFixed(2),
      timeLeft: getTimeLeft(plan.endDate, plan.validity, purchasedEsims.find(esim => esim.id === plan.esimId)),
      purchaseDate: null, // Will be populated from esim data
      activationDate: plan.startDate,
      expiryDate: plan.endDate
    })).sort((a, b) => (b.esim?.id || 0) - (a.esim?.id || 0)); // Sort by esim ID (most recent first)
  };

  // Transform filtered employees into table rows - one row per active plan
  // Employees with multiple active plans appear as multiple rows
  // Employees with no active plans appear as a single row with "No active plan"
  const tableRows = useMemo((): EmployeeRow[] => {
    const rows: EmployeeRow[] = [];
    
    for (const exec of filteredEmployees) {
      // Check if employee's plan was just cancelled (local state for immediate UI update)
      if (cancelledEmployeeIds.includes(exec.id)) {
        rows.push({
          ...exec,
          rowId: `${exec.id}`,
          currentPlan: null
        });
        continue;
      }
      
      // Get all active plans for this employee
      const employeePlans = getEmployeePlans(exec.id);
      
      if (employeePlans.length === 0) {
        // No active plans - single row with no plan info
        rows.push({
          ...exec,
          rowId: `${exec.id}`,
          currentPlan: null
        });
      } else {
        // Create one row per active plan
        for (const plan of employeePlans) {
          rows.push({
            ...exec,
            rowId: `${exec.id}-${plan.esim?.id || 'unknown'}`,
            currentPlan: plan
          });
        }
      }
    }
    
    return rows;
  }, [filteredEmployees, cancelledEmployeeIds, purchasedEsims, plans]);

  const handleDelete = async (employee: Employee) => {
    // Use the same active eSIM detection logic as the Status column for consistency
    const activeEsims = getActiveEsims(employee.id, purchasedEsims);
    const hasActivePlan = activeEsims.length > 0;

    console.log(`Delete check for ${employee.name}: hasActivePlan=${hasActivePlan}, activeEsims=${activeEsims.length}`);
    
    // Debug log to help troubleshoot deletion issues
    if (hasActivePlan) {
      console.log('Active eSIMs preventing deletion:', activeEsims.map(e => ({ 
        id: e.id, 
        status: e.status, 
        metadata: e.metadata 
      })));
    }

    // Only allow deletion if no active plans
    if (!hasActivePlan) {
      if (window.confirm(`Are you sure you want to delete ${employee.name}?`)) {
        try {
          await deleteMutation.mutateAsync(employee.id);
          toast({
            title: "Employee deleted",
            description: `${employee.name} has been removed successfully.`,
          });
        } catch (error: any) {
          // If deletion fails due to active plan detection on backend, refresh data
          if (error.message?.includes("active plan")) {
            console.log("Deletion failed due to active plan detection, refreshing data...");
            await Promise.all([
              queryClient.refetchQueries({ queryKey: ['/api/employees'] }),
              queryClient.refetchQueries({ queryKey: ['/api/esim/purchased'] })
            ]);
            
            toast({
              title: "Data Updated",
              description: "Plan information refreshed. Please try deleting again if all plans are cancelled.",
              variant: "default",
            });
          } else {
            toast({
              title: "Error",
              description: error.message || "Failed to delete employee. Please try again.",
              variant: "destructive",
            });
          }
        }
      }
    } else {
      toast({
        title: "Cannot Delete",
        description: "This employee has active plans and cannot be deleted. Cancel all plans first.",
        variant: "destructive",
      });
    }
  };

  const handleCancelPlan = async (employee: Employee) => {
    if (!confirm(`Are you sure you want to cancel the pending plan for ${employee.name}?`)) {
      return;
    }

    const pendingEsim = purchasedEsims.find(
      (esim: any) => esim.employeeId === employee.id && esim.status === 'pending'
    );

    if (!pendingEsim) {
      toast({
        title: "Error",
        description: "Could not find pending eSIM to cancel",
        variant: "destructive",
      });
      return;
    }

    await cancelPlanMutation.mutateAsync({
      esimId: pendingEsim.id,
      employeeId: employee.id
    });
  };

  // Helper function to check if an eSIM is cancelled or refunded is now imported from employeeUtils.ts

  // Helper function to get active eSIMs for an employee is now imported from employeeUtils.ts

  // Helper function to determine if ALL of an employee's eSIMs are cancelled
  // This should only return true if EVERY eSIM is cancelled, not if ANY eSIM is cancelled
  const hasCancelledEsims = (employeeId: number) => {
    const execEsims = purchasedEsims.filter(esim => esim.employeeId === employeeId);
    // console.log(`[DEBUG] hasCancelledEsims for employee ${employeeId}:`, execEsims.length, 'eSIMs');
    
    // If there are no eSIMs, return false - we don't disable the button
    if (execEsims.length === 0) return false;
    
    // Check if there are any non-cancelled eSIMs with waiting_for_activation status
    const hasNonCancelledWaitingEsims = execEsims.some(esim => {
      const isCancelled = isEsimCancelledOrRefunded(esim);
      const isWaiting = esim.status === 'waiting_for_activation';
      // console.log(`[DEBUG] eSIM ${esim.id}: status=${esim.status}, isCancelled=${isCancelled}, isWaiting=${isWaiting}`);
      return isWaiting && !isCancelled;
    });
    
    // console.log(`[DEBUG] hasNonCancelledWaitingEsims: ${hasNonCancelledWaitingEsims}, returning: ${!hasNonCancelledWaitingEsims}`);
    
    // If there's at least one waiting_for_activation eSIM that's not cancelled, return false
    // This allows sending emails to employees with waiting_for_activation eSIMs
    return !hasNonCancelledWaitingEsims;
  };

  // Helper function to force refresh when cancelled eSIMs are detected
  const forceDataRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
    queryClient.invalidateQueries({ queryKey: ['/api/purchased-esims'] });
    queryClient.invalidateQueries({ queryKey: ['/api/plans'] });
  }, [queryClient]);

  // Helper to get the most recent eSIM for an employee is now imported from employeeUtils.ts
  
  // Helper function to get time left is now imported from employeeUtils.ts

  const handleViewDetails = (employee: Employee) => {
    const activeEsims = getActiveEsims(employee.id, purchasedEsims);
    
    if (activeEsims.length === 0) {
      toast({
        title: "No active plan",
        description: "This employee doesn't have an active plan or eSIM",
        variant: "destructive",
      });
      return;
    }

    const activeEsim = activeEsims[0];
    let activePlan = null;
    
    if (activeEsim.planId) {
      activePlan = plans.find(p => p.id === activeEsim.planId);
    }

    if (!activePlan) {
      toast({
        title: "Plan info missing",
        description: "Could not find plan details for this employee",
        variant: "destructive",
      });
      return;
    }

    const esimWithPlan = {
      ...activeEsim,
      plan: {
        name: activePlan.name,
        data: activePlan.data,
        validity: activePlan.validity,
        countries: activePlan.countries,
        speed: activePlan.speed
      }
    };

    setSelectedEsim(esimWithPlan);
    setSelectedEmployee(employee);
    setShowDetailsDialog(true);
  };

  if (isFetchingEmployees || isFetchingPurchasedEsims || isFetchingPlans) {
    return <Loader2 />;
  }

  return (
    <div className="space-y-3 p-2 w-full" style={{ overflowX: 'visible', maxWidth: '100%' }}>
      <div className="flex flex-col sm:flex-row items-center gap-2 mb-2 justify-between">
        <div className="w-full sm:w-auto sm:flex-1">
          <div className="relative">
            <input
              type="text"
              placeholder="Search employees..."
              className="w-full pl-10 py-2 pr-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(168,75%,38%)]/20 border-[hsl(168,75%,90%)] transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="h-4 w-4 absolute left-3.5 top-2.5 text-gray-400" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="pl-3 pr-8 py-2 text-sm border rounded-md bg-white border-[hsl(168,75%,90%)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(168,75%,38%)]/20 transition-colors"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="waiting">Waiting</option>
            <option value="inactive">No Plan</option>
          </select>
          <Button
            variant="default"
            size="sm"
            onClick={handleBulkSendActivationEmails}
            disabled={selectedEmployees.length === 0}
            className="whitespace-nowrap text-xs sm:text-sm bg-[hsl(220,85%,55%)] hover:bg-[hsl(220,85%,45%)] text-white px-4"
          >
            <Mail className="h-4 w-4 mr-2" />
            Send Emails
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg overflow-hidden border border-[hsl(190,90%,85%)]">
        <div className="w-full">
          <DataTable
            data={tableRows}
            selectableRows
            selectedRows={selectedEmployees}
            onSelectedRowsChange={setSelectedEmployees}
            getRowClassName={(row: EmployeeRow) => {
              // Use rowId for unique row identification 
              return '';
            }}
        columns={[
          {
            key: "select",
            label: (
              <Checkbox
                checked={
                  selectedEmployees.length > 0 &&
                  selectedEmployees.length === filteredEmployees.length
                }
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedEmployees(filteredEmployees.map((exec) => exec.id));
                  } else {
                    setSelectedEmployees([]);
                  }
                }}
              />
            ),
            width: "40px",
            render: (row: EmployeeRow) => (
              <Checkbox
                checked={selectedEmployees.includes(row.id)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedEmployees([...selectedEmployees, row.id]);
                  } else {
                    setSelectedEmployees(
                      selectedEmployees.filter((id) => id !== row.id)
                    );
                  }
                }}
              />
            ),
          },
          {
            key: "name",
            label: "EXECUTIVE",
            width: "160px",
            render: (row: EmployeeRow) => (
              <div className="flex items-center">
                <div className="flex-shrink-0 mr-3 h-10 w-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <div 
                    className="font-medium text-gray-800 hover:text-blue-600 cursor-pointer hover:underline"
                    onClick={() => navigate(`/employee-history/${row.id}`)}
                  >
                    {row.name}
                  </div>
                  <div className="text-sm text-gray-500">{row.position}</div>
                  {showCompanyName && row.companyName && (
                    <div className="text-xs text-gray-400">{row.companyName}</div>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: "contact",
            label: "CONTACT",
            width: "150px",
            render: (row: EmployeeRow) => (
              <div className="space-y-1">
                <div className="flex items-center">
                  <Mail className="h-4 w-4 mr-2 text-gray-400" />
                  <span className="text-sm text-gray-700">{row.email}</span>
                </div>
                <div className="flex items-center">
                  <Phone className="h-4 w-4 mr-2 text-gray-400" />
                  <span className="text-sm text-gray-700">{row.phoneNumber}</span>
                </div>
              </div>
            ),
          },
          {
            key: "status",
            label: "STATUS",
            width: "130px",
            render: (row: EmployeeRow) => {
              // Use the currentPlan from the row directly
              const plan = row.currentPlan;
              
              // If no active plan for this row, show "No active plan"
              if (!plan) {
                return (
                  <div>
                    <Badge variant="outline" className="rounded-full py-1 px-2.5 bg-gray-100 text-gray-700 border-gray-100 font-medium text-xs">
                      No active plan
                    </Badge>
                  </div>
                );
              }
              
              // Show the status of the specific plan for this row
              if (plan.status === 'waiting_for_activation') {
                return (
                  <div>
                    <Badge variant="outline" className="rounded-full py-1 px-2.5 bg-yellow-50 text-amber-700 border-yellow-100 font-medium text-xs">
                      Waiting for activation
                    </Badge>
                  </div>
                );
              } else if (plan.status === 'error') {
                return (
                  <div>
                    <Badge variant="outline" className="rounded-full py-1 px-2.5 bg-yellow-50 text-amber-700 border-yellow-100 font-medium text-xs">
                      Pending activation
                    </Badge>
                  </div>
                );
              } else if (plan.status === 'depleted') {
                if (!row.autoRenewEnabled) {
                  return (
                    <div>
                      <Badge variant="outline" className="rounded-full py-1 px-2.5 bg-gray-100 text-gray-700 border-gray-100 font-medium text-xs">
                        Depleted
                      </Badge>
                    </div>
                  );
                } else {
                  return (
                    <div>
                      <Badge variant="outline" className="rounded-full py-1 px-2.5 bg-blue-50 text-blue-700 border-blue-100 font-medium text-xs">
                        Renewing plan
                      </Badge>
                    </div>
                  );
                }
              } else if (plan.status === 'expired') {
                if (!row.autoRenewEnabled) {
                  return (
                    <div>
                      <Badge variant="outline" className="rounded-full py-1 px-2.5 bg-gray-100 text-gray-700 border-gray-100 font-medium text-xs">
                        Expired
                      </Badge>
                    </div>
                  );
                } else {
                  return (
                    <div>
                      <Badge variant="outline" className="rounded-full py-1 px-2.5 bg-blue-50 text-blue-700 border-blue-100 font-medium text-xs">
                        Renewing plan
                      </Badge>
                    </div>
                  );
                }
              } else if (plan.status === 'active' || plan.status === 'activated') {
                return (
                  <div>
                    <Badge variant="outline" className="rounded-full py-1 px-2.5 bg-green-50 text-green-700 border-green-100 font-medium text-xs">
                      Active
                    </Badge>
                  </div>
                );
              }
              
              return (
                <div>
                  <Badge variant="outline" className="rounded-full py-1 px-2.5 bg-gray-100 text-gray-700 border-gray-100 font-medium text-xs">
                    Unknown
                  </Badge>
                </div>
              );
            },
          },
          {
            key: "plan",
            label: "PLAN",
            width: "160px",
            render: (row: EmployeeRow) => {
              // Check if this employee has a pending plan assignment
              if (employeesWithPendingPlans.has(row.id)) {
                return (
                  <div className="flex items-center">
                    <div className="h-4 w-4 mr-2 rounded-full bg-blue-200 animate-pulse"></div>
                    <span className="text-sm text-blue-600 font-medium">Plan assigning...</span>
                  </div>
                );
              }
              
              // Use currentPlan from row directly
              const plan = row.currentPlan;
              
              if (!plan) {
                return <span className="text-sm text-gray-500">No active plan</span>;
              }
              
              return (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-800">{plan.planName}</span>
                </div>
              );
            },
          },

          {
            key: "timeLeft",
            label: "TIME LEFT",
            width: "100px",
            render: (row: EmployeeRow) => {
              const plan = row.currentPlan;
              
              if (!plan) {
                return <span className="text-sm text-gray-500">N/A</span>;
              }
              
              const timeLeft = plan.timeLeft || 'N/A';
              
              return (
                <span className={`text-sm font-medium ${timeLeft === 'Expired' ? 'text-red-500' : 'text-gray-700'}`}>
                  {timeLeft}
                </span>
              );
            },
          },

          {
            key: "details",
            label: "DETAILS",
            width: "100px",
            render: (row: EmployeeRow) => {
              const plan = row.currentPlan;
              
              if (!plan) {
                return (
                  <div>
                    <span className="text-sm text-gray-500">No details</span>
                  </div>
                );
              }
              
              return (
                <button
                  type="button"
                  className="h-8 text-[#0d7a72] hover:text-[#0d7a72] border border-gray-200 hover:border-[#0d7a72]/20 hover:bg-[#0d7a72]/5 px-2 py-1 rounded text-sm font-medium cursor-pointer whitespace-nowrap"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewDetails(row as Employee);
                  }}
                  data-testid={`button-view-details-${row.rowId}`}
                >
                  View Details
                </button>
              );
            }
          },
          {
            key: "autoRenew",
            label: "AUTO-RENEW",
            width: "130px",
            render: (row: EmployeeRow) => {
              const plan = row.currentPlan;
              
              // If no plan, show disabled auto-renew
              if (!plan) {
                return (
                  <div className="flex items-center space-x-2">
                    <Switch checked={false} disabled />
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-gray-500/5 text-gray-500 border-gray-300">
                      OFF
                    </Badge>
                  </div>
                );
              }
              
              // Get the eSIM's auto-renew status (per-plan, not per-employee)
              const esimId = plan.esim?.id;
              const isAutoRenewEnabled = plan.esim?.autoRenewEnabled || false;
              
              // Check if this plan can have auto-renewal enabled based on eSIM status
              const canEnable = esimId && (plan.status === 'active' || plan.status === 'activated' || plan.status === 'waiting_for_activation');
              
              // Get plan cost for wallet balance check
              let planCost = 0;
              if (plan.esim?.planId) {
                const planDetails = plans.find(p => p.id === plan.esim.planId);
                if (planDetails?.retailPrice) {
                  planCost = parseFloat(planDetails.retailPrice);
                }
              }
              
              const hasSufficientBalance = availableBalance >= planCost;
              const canEnableWithBalance = canEnable && (hasSufficientBalance || !isAutoRenewEnabled);
              
              return (
                <div className="flex items-center space-x-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Switch
                            checked={isAutoRenewEnabled}
                            disabled={!canEnableWithBalance}
                            onCheckedChange={(checked) => {
                              if (esimId) {
                                toggleAutoRenewMutation.mutate({
                                  esimId: esimId,
                                  enabled: checked,
                                  planCost: checked ? planCost : 0
                                });
                              }
                            }}
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {!canEnable 
                          ? "Auto-renewal requires an active or waiting for activation eSIM"
                          : planCost > 0 && !hasSufficientBalance
                          ? `Insufficient balance: ${availableBalance.toFixed(2)} (required: ${planCost.toFixed(2)})`
                          : "Toggle auto-renewal for this plan"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Badge 
                    variant={isAutoRenewEnabled ? "default" : "outline"}
                    className={`text-[10px] px-1.5 py-0 h-5 ${
                      isAutoRenewEnabled 
                        ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' 
                        : 'bg-gray-500/5 text-gray-500 border-gray-300'
                    }`}
                  >
                    {isAutoRenewEnabled ? 'ON' : 'OFF'}
                  </Badge>
                  {toggleAutoRenewMutation.isPending && 
                    toggleAutoRenewMutation.variables?.esimId === esimId && (
                    <RefreshCw className="ml-1 h-3 w-3 animate-spin text-gray-400" />
                  )}
                </div>
              );
            },
          },
          {
            key: "actions",
            label: "ACTIONS",
            width: "190px",
            render: (row: EmployeeRow) => {
              const plan = row.currentPlan;
              const employee = row as Employee;
              
              return (
                <div className="flex gap-1" style={{ minWidth: '180px' }}>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dialogOpenRef.current = true;
                      selectedEmployeeRef.current = employee;
                      setSelectedEmployeeForPlan(employee);
                      setShowAssignPlanDialog(true);
                    }}
                    className="h-7 bg-[#0d7a72] hover:bg-[#086660] text-white border-0 px-2 py-0 text-xs font-medium"
                  >
                    <Pencil className="h-3 w-3 mr-1 text-white" />
                    Add Plan
                  </Button>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendActivationEmail(employee)}
                          disabled={!plan || sendActivationEmailMutation.isPending || hasCancelledEsims(row.id)}
                          className="h-7 border-gray-200 hover:border-[#0d7a72]/20 hover:bg-[#0d7a72]/5 px-2 py-0 text-xs disabled:opacity-50"
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Resend
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {!plan 
                          ? "Employee has no plan"
                          : hasCancelledEsims(row.id)
                          ? "No eligible waiting-for-activation eSIMs available"
                          : "Send activation email for waiting eSIMs"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {plan && purchasedEsims?.some(
                    (esim: any) => esim.employeeId === row.id && esim.status === 'pending'
                  ) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-red-600 hover:text-red-700 border-gray-200 hover:border-red-200 hover:bg-red-50/50 px-2 py-0 text-xs"
                      onClick={() => handleCancelPlan(employee)}
                      disabled={cancelPlanMutation.isPending}
                    >
                      {cancelPlanMutation.isPending ? (
                        <>
                          <span className="animate-spin mr-1">⏳</span>
                          Cancel...
                        </>
                      ) : (
                        <>
                          <X className="h-3 w-3 mr-1" />
                          Cancel
                        </>
                      )}
                    </Button>
                  )}
                  {/* Only show delete button on main employee row, not on duplicate plan rows */}
                  {!row.rowId.includes('-') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-red-600 hover:text-red-700 border-gray-200 hover:border-red-200 hover:bg-red-50/50 min-w-[32px] px-1"
                      onClick={() => handleDelete(employee)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            },
          },
        ]}
      />

      <div className="mt-6">
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-[#0d7a72] hover:bg-[#086660] text-white">Add Employee</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>
                Add a new employee to your company for eSIM assignment and management.
              </DialogDescription>
            </DialogHeader>
            <EmployeeAddButton />
          </DialogContent>
        </Dialog>
      </div>

      {showDetailsDialog && selectedEmployee && selectedEsim && (
        <EsimDetails
          key={`details-${selectedEmployee.id}-${selectedEsim.id}`}
          isOpen={showDetailsDialog}
          onClose={() => {
            setShowDetailsDialog(false);
            setSelectedEsim(null);
            setSelectedEmployee(null);
          }}
          esim={selectedEsim}
          planName={selectedEsim.planName}
          employeeName={selectedEmployee.name}
          employeeId={selectedEmployee.id}
        />
      )}

      <PlanAssignmentDialog
        isOpen={showAssignPlanDialog}
        onClose={() => {
          // Clear refs first
          dialogOpenRef.current = false;
          selectedEmployeeRef.current = null;
          // Then clear state
          setShowAssignPlanDialog(false);
          setSelectedEmployeeForPlan(null);
        }}
        employee={selectedEmployeeForPlan || selectedEmployeeRef.current || undefined}
      />
        </div>
      </div>
    </div>
  );
}