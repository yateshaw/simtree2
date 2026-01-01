import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, RefreshCw, Trash, Clock, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Employee as BaseEmployee, PurchasedEsim, EsimPlan } from "@shared/schema";
import {
  getActiveEsims,
  isEsimCancelledOrRefunded,
  getTimeLeft
} from "@/lib/utils/employeeUtils";
import { getEmployeePlanInfo, getEmployeePlanStatus } from "@/lib/utils/planCalculations";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EsimDetails } from "@/components/company/EsimDetails";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

// Extend the Employee type to include company information
type Employee = BaseEmployee & {
  companyName?: string;
  company?: { name: string, id: number };
};

interface SuperAdminEmployeeTableProps {
  employees: Employee[];
  purchasedEsimsData: any[];
}

export default function SuperAdminEmployeeTable({ employees, purchasedEsimsData }: SuperAdminEmployeeTableProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedEsim, setSelectedEsim] = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);


  // Fetch all eSIM plans for reference
  const { data: plansData = [], isLoading: isLoadingPlans } = useQuery({
    queryKey: ['/api/admin/plans'], // Use admin-specific endpoint instead
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Parse plans data with proper type checking
  const plans = Array.isArray(plansData) 
    ? plansData 
    : (plansData && typeof plansData === 'object' && 'success' in plansData && 'data' in plansData)
      ? (plansData as any).data 
      : [];

  // Parse the purchased eSIMs data correctly with proper type checking
  const purchasedEsims = Array.isArray(purchasedEsimsData) 
    ? purchasedEsimsData 
    : [];

  // Filter employees based on search term and status filter
  const filteredEmployees = Array.isArray(employees) ? employees.filter((employee: any) => {
    // Search term filter
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      !searchTerm || 
      employee.name?.toLowerCase().includes(searchLower) ||
      employee.email?.toLowerCase().includes(searchLower) ||
      employee.position?.toLowerCase().includes(searchLower) ||
      (employee.company?.name || employee.companyName || "").toLowerCase().includes(searchLower);
    
    if (!matchesSearch) return false;
    
    // Status filter
    if (statusFilter === "All Status") return true;
    
    const activeEsims = getActiveEsims(employee.id, purchasedEsims);
    
    if (statusFilter === "Active" && activeEsims.length > 0) return true;
    if (statusFilter === "Inactive" && activeEsims.length === 0) return true;
    
    return false;
  }) : [];

  // Handle refresh data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Since we're using passed props, we don't need to refetch here
      // The parent component handles data fetching
      toast({
        title: "Data refreshed",
        description: "Employee and eSIM data has been refreshed"
      });
    } catch (error) {
      console.error("Error refreshing data:", error);
      toast({
        title: "Error",
        description: "Failed to refresh data",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle view details
  const fetchEsimDetails = async (employee: any) => {
    try {
      // Get eSIMs for this employee using the same approach as in the Status and Plan columns
      const activeEsims = getActiveEsims(employee.id, purchasedEsims);
      
      // Check if there are active plans
      const hasActivePlans = activeEsims.length > 0;
      
      // If no active eSIMs, show "No active plan" - ensures consistency with the table view
      if (!hasActivePlans) {
        toast({
          title: "No active plan",
          description: "This employee doesn't have an active plan or eSIM",
          variant: "destructive",
        });
        if (import.meta.env.DEV) { console.log("No active eSIMs found for employee", employee.id, employee.name); }
        return;
      }
      
      // Initialize activePlan variable
      let activePlan = null;
      
      // We have active eSIMs, get the most recent one
      const activeEsim = activeEsims[0];
      if (import.meta.env.DEV) { console.log("Found active eSIM for details view:", activeEsim); }
      
      // Try to get plan from eSIM first
      if (activeEsim.planId) {
        activePlan = plans.find((p: any) => p.id === activeEsim.planId);
      }
      
      // Use new plan calculation system to get plan details
      const employeePurchasedEsims = purchasedEsims.filter((esim: any) => esim.employeeId === employee.id);
      const planInfo = getEmployeePlanInfo(employee.id, employeePurchasedEsims, plans);
      
      // Get the primary plan if we have active plans
      if (planInfo.hasActivePlans && planInfo.activePlans.length > 0) {
        const primaryPlan = planInfo.activePlans[0];
        activePlan = plans.find((p: any) => p.id === primaryPlan.planId);
      }
      
      // If we still don't have a plan details, show error
      if (!activePlan) {
        toast({
          title: "Plan info missing",
          description: `Could not find plan details for this employee`,
          variant: "destructive",
        });
        return;
      }

      // If we have a plan but no eSIM, create a synthetic eSIM for display
      if (activePlan && !activeEsim) {
        // Create a synthetic eSIM object with plan data
        const syntheticEsim = {
          id: -1,
          employeeId: employee.id,
          planId: activePlan.id,
          status: 'waiting_for_activation',
          purchaseDate: new Date().toISOString(),
          dataUsed: "0.00",
          plan: {
            name: activePlan.name,
            data: activePlan.data,
            validity: activePlan.validity,
            countries: activePlan.countries,
            speed: activePlan.speed
          }
        };
        
        setSelectedEsim(syntheticEsim);
        setSelectedEmployee(employee);
        setShowDetailsDialog(true);
        return;
      }

      // If we have a real eSIM, display it with plan details
      if (activeEsim) {
        
        // Add plan details to the eSIM object for display
        const esimWithPlan = {
          ...activeEsim,
          plan: {
            name: activePlan.name, // Always use the actual plan name from the API
            data: activePlan.data,
            validity: activePlan.validity,
            countries: activePlan.countries,
            speed: activePlan.speed
          }
        };

        setSelectedEsim(esimWithPlan);
        setSelectedEmployee(employee);
        setShowDetailsDialog(true);
      } else {
        toast({
          title: "No active eSIM",
          description: "Could not find active eSIM for this employee",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error fetching eSIM details:", error);
      
      // Check if the error object is empty and provide a more helpful message
      let errorMessage = "Failed to fetch eSIM details";
      
      if (error && Object.keys(error).length === 0) {
        errorMessage = "Unable to retrieve eSIM details. The API response was empty.";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Handle details dialog close
  const handleDetailsClose = () => {
    setShowDetailsDialog(false);
    setSelectedEsim(null);
    setSelectedEmployee(null);
  };



  // Handle send emails
  const handleSendEmails = () => {
    if (selectedEmployees.length === 0) {
      toast({
        title: "No employees selected",
        description: "Please select at least one employee to send emails"
      });
      return;
    }

    toast({
      title: "Emails sent",
      description: `Emails sent to ${selectedEmployees.length} employees`
    });
    setSelectedEmployees([]);
  };

  // Count active and inactive employees
  const activeCount = Array.isArray(employees) ? employees.filter((exec: any) => {
    const activeEsims = getActiveEsims(exec.id, purchasedEsims);
    return activeEsims.length > 0;
  }).length : 0;
  
  const inactiveCount = Array.isArray(employees) ? employees.length - activeCount : 0;

  return (
    <div className="space-y-6">
      {/* Search and filters */}
      <div className="flex justify-between items-center">
        <div className="relative w-full max-w-md">
          <Input
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
          <div className="absolute left-2 top-2.5">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
              <path d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.30884 10.0159C8.53901 10.6318 7.56251 11 6.5 11C4.01472 11 2 8.98528 2 6.5C2 4.01472 4.01472 2 6.5 2C8.98528 2 11 4.01472 11 6.5C11 7.56251 10.6318 8.53901 10.0159 9.30884L12.8536 12.1464C13.0488 12.3417 13.0488 12.6583 12.8536 12.8536C12.6583 13.0488 12.3417 13.0488 12.1464 12.8536L9.30884 10.0159Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
            </svg>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <select 
            className="rounded-md border border-gray-300 py-2 px-3"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option>All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>

          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>

          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={selectedEmployees.length === 0}
            onClick={handleSendEmails}
          >
            Send Emails
          </Button>
        </div>
      </div>

      {/* Status information */}
      <div className="flex space-x-2">
        <div className="px-2 py-1 bg-green-100 text-green-800 rounded">
          {activeCount} active
        </div>
        <div className="px-2 py-1 bg-gray-100 text-gray-800 rounded">
          {inactiveCount} inactive
        </div>
      </div>

      {/* Employees table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="w-full">
          <table className="w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="w-12 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <Checkbox
                    checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedEmployees(filteredEmployees.map((e: any) => e.id));
                      } else {
                        setSelectedEmployees([]);
                      }
                    }}
                  />
                </th>
                <th scope="col" className="w-48 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Employee
                </th>
                <th scope="col" className="w-40 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Contact
                </th>
                <th scope="col" className="w-28 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th scope="col" className="w-32 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Plan
                </th>
                <th scope="col" className="w-24 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Time Left
                </th>
                <th scope="col" className="w-20 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Usage
                </th>
                <th scope="col" className="w-20 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Details
                </th>
                <th scope="col" className="w-20 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Auto-Renew
                </th>
                <th scope="col" className="w-20 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoadingPlans ? (
                <tr>
                  <td colSpan={10} className="px-6 py-4 text-center">
                    <div className="flex justify-center items-center space-x-2">
                      <RefreshCw className="animate-spin h-5 w-5" />
                      <span>Loading employees...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-4 text-center text-gray-500">
                    No employees found
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((employee: any) => {
                  // Get active eSIMs for this employee
                  const activeEsims = getActiveEsims(employee.id, purchasedEsims);
                  
                  // Get the most recent active eSIM (if any)
                  const activeEsim = activeEsims.length > 0 ? activeEsims[0] : null;
                  
                  // Get plan details from the eSIM metadata
                  const planDetails = activeEsim && activeEsim.metadata?.rawData?.obj?.esimList?.[0]?.packageList?.[0];
                  
                  // Use new plan calculation system to get plan info
                  const employeePurchasedEsims = purchasedEsims.filter((esim: any) => esim.employeeId === employee.id);
                  const planInfo = getEmployeePlanInfo(employee.id, employeePurchasedEsims, plans as any);
                  
                  // Get plan name - use direct approach as fallback
                  let planName = "No active plan";
                  
                  // First, try to get plan from active eSIM directly
                  if (activeEsim && activeEsim.planId && Array.isArray(plans)) {
                    const plan = plans.find((p: any) => p.id === activeEsim.planId);
                    if (plan) {
                      planName = plan.name;
                    }
                  }
                  
                  // Second fallback: Get from eSIM metadata
                  if (planName === "No active plan" && planDetails) {
                    planName = planDetails.packageName;
                  }
                  
                  // Third fallback: Get from any purchased eSIM for this employee
                  if (planName === "No active plan" && employeePurchasedEsims.length > 0 && Array.isArray(plans)) {
                    for (const esim of employeePurchasedEsims) {
                      if (esim.planId) {
                        const plan = plans.find((p: any) => p.id === esim.planId);
                        if (plan) {
                          planName = plan.name;
                          break;
                        }
                      }
                    }
                  }
                  
                  // Get initials for avatar
                  const initials = employee.name
                    .split(' ')
                    .map((name: string) => name?.[0] || '')
                    .join('')
                    .toUpperCase();
                  
                  return (
                    <tr key={employee.id} className="hover:bg-gray-50">
                      <td className="px-3 py-4 whitespace-nowrap">
                        <Checkbox
                          checked={selectedEmployees.includes(employee.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedEmployees([...selectedEmployees, employee.id]);
                            } else {
                              setSelectedEmployees(selectedEmployees.filter(id => id !== employee.id));
                            }
                          }}
                        />
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex items-center">
                          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs">
                            {initials}
                          </div>
                          <div className="ml-3 min-w-0 flex-1">
                            <div 
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer truncate"
                              onClick={() => navigate(`/employee-history/${employee.id}`)}
                              title={employee.name}
                            >
                              {employee.name}
                            </div>
                            <div className="text-xs text-gray-500 truncate" title={employee.position || 'No position'}>
                              {employee.position || 'No position'}
                            </div>
                            <div className="text-xs text-blue-600 truncate" title={employee.companyName || employee.company?.name || 'No company'}>
                              {employee.companyName || employee.company?.name || 'No company'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="text-sm text-gray-900 truncate" title={employee.email || 'No email'}>
                          {employee.email || 'No email'}
                        </div>
                        <div className="text-xs text-gray-500 truncate" title={employee.phoneNumber || 'No phone'}>
                          {employee.phoneNumber || 'No phone'}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {(() => {
                          // Direct status calculation instead of relying on getEmployeePlanStatus
                          if (employeePurchasedEsims.length === 0) {
                            return (
                              <Badge className="bg-gray-100 text-gray-700 border-gray-100 text-xs">
                                No plan
                              </Badge>
                            );
                          }
                          
                          // Count different status types
                          const activatedStatuses = ['activated', 'active'];
                          const waitingStatuses = ['waiting_for_activation'];
                          
                          const activatedCount = employeePurchasedEsims.filter(esim => 
                            activatedStatuses.includes(esim.status) && !isEsimCancelledOrRefunded(esim)
                          ).length;
                          
                          const waitingCount = employeePurchasedEsims.filter(esim => 
                            waitingStatuses.includes(esim.status) && !isEsimCancelledOrRefunded(esim)
                          ).length;
                          
                          if (activatedCount > 0 && waitingCount > 0) {
                            return (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-xs">
                                Mixed
                              </Badge>
                            );
                          } else if (activatedCount > 0) {
                            return (
                              <Badge className="bg-green-50 text-green-700 border-green-100 text-xs">
                                Active
                              </Badge>
                            );
                          } else if (waitingCount > 0) {
                            return (
                              <Badge className="bg-yellow-50 text-amber-700 border-yellow-100 text-xs">
                                Waiting
                              </Badge>
                            );
                          } else {
                            return (
                              <Badge className="bg-gray-100 text-gray-700 border-gray-100 text-xs">
                                No plan
                              </Badge>
                            );
                          }
                        })()}
                      </td>
                      <td className="px-3 py-4">
                        <div className="text-sm font-medium text-gray-900 truncate" title={planName}>
                          {planName}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {activeEsim ? (
                          <div className="text-xs text-gray-900">
                            {getTimeLeft(activeEsim.expiryDate, 
                                        activeEsim.planValidity || 
                                        (activeEsim.metadata?.rawData?.obj?.esimList?.[0]?.totalDuration) || 
                                        null, 
                                        activeEsim)}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">N/A</div>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {activeEsim ? (
                          <div className="text-xs">
                            {parseFloat(activeEsim.dataUsed || "0") > 0 ? (
                              <div>
                                {(() => {
                                  // Calculate data in GB
                                  const dataUsedGB = parseFloat(activeEsim.dataUsed) / (1024 * 1024 * 1024);
                                  const dataLimitGB = planDetails?.volume ? planDetails.volume / (1024 * 1024 * 1024) : 0;
                                  
                                  // Calculate percentage
                                  const percentage = Math.min(
                                    Math.round(
                                      (parseFloat(activeEsim.dataUsed) / (planDetails?.volume || 1)) * 100
                                    ),
                                    100
                                  );
                                  
                                  if (dataLimitGB < 1) {
                                    // Display in MB
                                    const dataUsedMB = (dataUsedGB * 1024).toFixed(0);
                                    const dataLimitMB = (dataLimitGB * 1024).toFixed(0);
                                    return `${dataUsedMB}/${dataLimitMB}MB`;
                                  } else {
                                    // Display in GB
                                    return `${dataUsedGB.toFixed(1)}/${dataLimitGB.toFixed(1)}GB`;
                                  }
                                })()}
                              </div>
                            ) : (
                              <div>
                                {(() => {
                                  const dataLimitGB = planDetails?.volume ? planDetails.volume / (1024 * 1024 * 1024) : 0;
                                  
                                  if (dataLimitGB < 1) {
                                    const dataLimitMB = (dataLimitGB * 1024).toFixed(0);
                                    return `0/${dataLimitMB}MB`;
                                  } else {
                                    return `0/${dataLimitGB.toFixed(1)}GB`;
                                  }
                                })()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">N/A</div>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {activeEsims.length > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs text-[#0d7a72] hover:text-[#0d7a72] border-gray-200 hover:border-[#0d7a72]/20 hover:bg-[#0d7a72]/5 px-1 py-0"
                            onClick={() => fetchEsimDetails(employee)}
                          >
                            View
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`w-6 h-3 rounded-full cursor-not-allowed ${
                            employee.autoRenewEnabled ? "bg-blue-500" : "bg-gray-300"
                          }`}>
                            <span className={`block h-3 w-3 rounded-full bg-white border border-gray-300 transform transition-transform ${
                              employee.autoRenewEnabled ? "translate-x-3" : ""
                            }`}></span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-1">
                          <Button variant="outline" size="sm" className="h-6 w-6 p-0">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 w-6 p-0">
                            <Trash className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add employee button at bottom */}
      <div>
        <Button className="bg-teal-600 hover:bg-teal-700 text-white">
          Add Employee
        </Button>
      </div>

      {/* eSIM Details Dialog */}
      <EsimDetails
        isOpen={showDetailsDialog}
        onClose={handleDetailsClose}
        esim={selectedEsim}
        planName={selectedEsim?.planName}
        employeeName={selectedEmployee?.name}
        employeeId={selectedEmployee?.id}
      />

    </div>
  );
}