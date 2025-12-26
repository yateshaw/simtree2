import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Employee, PurchasedEsim, EsimPlan } from "@shared/schema";
import { getEmployeePlanInfo } from "@/lib/utils/planCalculations";
import { useAdminCurrency } from "@/hooks/use-admin-currency";
import { convertCurrency, formatCurrency } from "@shared/utils/currency";

interface PlanType {
  id: number;
  providerId: string;
  name: string;
  description?: string | null;
  data: string;
  validity: number;
  retailPrice: string;
  countries?: string[] | null;
  speed?: string | null;
}

interface BulkPlanAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlan: PlanType | null;
}

export default function BulkPlanAssignmentDialog({
  isOpen,
  onClose,
  selectedPlan,
}: BulkPlanAssignmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const { adminCurrency } = useAdminCurrency();

  // Format price with company currency
  const formatPrice = (price: string | number) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(numPrice, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };

  // Fetch employees
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    enabled: isOpen,
  });

  // Fetch purchased eSIMs and plans to use new plan calculation system
  const { data: purchasedEsims = [] } = useQuery<PurchasedEsim[]>({
    queryKey: ['/api/esim/purchased'],
    enabled: isOpen,
  });

  const { data: allPlans = [] } = useQuery<EsimPlan[]>({
    queryKey: ['/api/esim/plans'],
    enabled: isOpen,
  });

  // Filter employees without plans using new plan calculation system
  const employeesWithoutPlan = employees.filter(exec => {
    // Ensure purchasedEsims and allPlans are arrays before passing to getEmployeePlanInfo
    const safeEsims = Array.isArray(purchasedEsims) ? purchasedEsims : [];
    const safePlans = Array.isArray(allPlans) ? allPlans : [];
    
    const planInfo = getEmployeePlanInfo(exec.id, safeEsims, safePlans);
    return !planInfo.hasActivePlans;
  });

  // Add debugging to check what employees are coming through
  useEffect(() => {
    if (isOpen) {
      if (import.meta.env.DEV) { 
        console.log("BulkPlanAssignmentDialog - Data status:", {
          employees: employees.length,
          purchasedEsims: Array.isArray(purchasedEsims) ? purchasedEsims.length : 'NOT_ARRAY',
          allPlans: Array.isArray(allPlans) ? allPlans.length : 'NOT_ARRAY',
          employeesWithoutPlan: employeesWithoutPlan.length
        });
        console.log("Employees filtered as not having plans:", employeesWithoutPlan); 
      }
    }
  }, [isOpen, employees, purchasedEsims, allPlans, employeesWithoutPlan]);

  // Reset selected employees when dialog closes or opens
  useEffect(() => {
    if (!isOpen) {
      setSelectedEmployees([]);
    }
  }, [isOpen]);

  // Handle checkbox toggle
  const toggleEmployee = (employeeId: number) => {
    setSelectedEmployees(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  // Toggle all employees
  const toggleAllEmployees = () => {
    if (selectedEmployees.length === employeesWithoutPlan.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(employeesWithoutPlan.map(exec => exec.id));
    }
  };

  // Assign plan mutation
  const assignPlanMutation = useMutation({
    mutationFn: async ({ employeeId, planId }: { employeeId: number, planId: string }) => {
      const response = await apiRequest('/api/esim/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employeeId, planId }),
      });
      return { response, employeeId };
    },
    onSuccess: async (data) => {
      const employeeId = data.employeeId;
      
      // Invalidate queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/employees'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/esim/purchased'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/wallet'] })
      ]);

      // Force immediate refetch to get the latest data
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['/api/employees'] }),
        queryClient.refetchQueries({ queryKey: ['/api/esim/purchased'] })
      ]);
      
      // After successful completion and data refresh, dispatch event to unmark this employee
      window.dispatchEvent(
        new CustomEvent('planAssignmentComplete', { 
          detail: { employeeId }
        })
      );
    },
    onError: (error, { employeeId }) => {
      console.error('Plan assignment error:', error);
      
      // Dispatch event to unmark this employee on error
      window.dispatchEvent(
        new CustomEvent('planAssignmentComplete', { 
          detail: { employeeId }
        })
      );
    }
  });

  // Assign plans to selected employees
  const handleAssignPlans = async () => {
    if (selectedEmployees.length === 0 || !selectedPlan) {
      toast({
        title: "No employees selected",
        description: "Please select at least one employee to assign the plan to.",
        variant: "destructive",
      });
      return;
    }

    setIsAssigning(true);
    
    try {
      // Process assignments in sequence to avoid overwhelming the backend
      let successCount = 0;
      let errorCount = 0;
      
      // First mark all selected employees as having plans being assigned
      for (const execId of selectedEmployees) {
        // Dispatch event to mark this employee as having a plan being assigned
        window.dispatchEvent(
          new CustomEvent('planAssignmentStart', { 
            detail: { employeeId: execId } 
          })
        );
      }
      
      // Then process each assignment
      for (const execId of selectedEmployees) {
        try {
          await assignPlanMutation.mutateAsync({
            employeeId: execId,
            planId: selectedPlan.providerId
          });
          successCount++;
        } catch (error) {
          console.error(`Error assigning plan to employee ${execId}:`, error);
          errorCount++;
          
          // Mark this employee as completed (with error) and provide more detailed error information
          window.dispatchEvent(
            new CustomEvent('planAssignmentComplete', { 
              detail: { 
                employeeId: execId,
                error: true,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
              } 
            })
          );
        }
      }

      // Show appropriate toast based on results
      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "Plans assigned successfully",
          description: `The plan has been assigned to ${successCount} employee${successCount !== 1 ? 's' : ''}.`,
          variant: "default",
        });
        onClose(); // Close the dialog on complete success
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: "Partial success",
          description: `${successCount} plan(s) assigned successfully, but ${errorCount} failed. Please check and try again for the failed ones.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Failed to assign plans",
          description: "An error occurred while assigning plans. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error in bulk plan assignment:", error);
      toast({
        title: "Error",
        description: "Failed to assign plans. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  // Ensure we clean up any pending assignments if the dialog is closed
  const handleDialogClose = () => {
    // If we're in the middle of assigning, make sure we clear any pending assignments
    if (isAssigning) {
      for (const execId of selectedEmployees) {
        window.dispatchEvent(
          new CustomEvent('planAssignmentComplete', { 
            detail: { 
              employeeId: execId,
              cancelled: true,
              timestamp: Date.now()
            } 
          })
        );
      }
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Assign {selectedPlan?.name} to Multiple Employees
          </DialogTitle>
        </DialogHeader>

        {employeesWithoutPlan.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              All employees already have plans assigned. Please cancel existing plans before assigning new ones.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="mb-4">
              <Alert variant="default" className="bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-500" />
                <AlertDescription className="text-blue-700">
                  Select employees to assign <strong>{selectedPlan?.name}</strong> plan ({selectedPlan?.data}GB for {selectedPlan?.validity} days) at {formatPrice(selectedPlan?.retailPrice || 0)} each.
                </AlertDescription>
              </Alert>
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="p-3 bg-muted/50 border-b flex items-center">
                <Checkbox 
                  id="select-all" 
                  checked={selectedEmployees.length === employeesWithoutPlan.length && employeesWithoutPlan.length > 0} 
                  onCheckedChange={toggleAllEmployees}
                  className="mr-2"
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer select-none">
                  Select All Employees
                </label>
                <span className="ml-auto text-sm text-muted-foreground">
                  {selectedEmployees.length} of {employeesWithoutPlan.length} selected
                </span>
              </div>
              
              <div className="max-h-[40vh] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="w-16 px-4 py-2 text-left font-medium text-sm"></th>
                      <th className="px-4 py-2 text-left font-medium text-sm">Name</th>
                      <th className="px-4 py-2 text-left font-medium text-sm">Position</th>
                      <th className="px-4 py-2 text-left font-medium text-sm">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeesWithoutPlan.map((employee) => (
                      <tr key={employee.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Checkbox 
                            id={`exec-${employee.id}`} 
                            checked={selectedEmployees.includes(employee.id)} 
                            onCheckedChange={() => toggleEmployee(employee.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <label htmlFor={`exec-${employee.id}`} className="cursor-pointer">
                            {employee.name}
                          </label>
                        </td>
                        <td className="px-4 py-3 text-sm">{employee.position}</td>
                        <td className="px-4 py-3 text-sm">{employee.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isAssigning}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleAssignPlans}
                disabled={selectedEmployees.length === 0 || isAssigning}
                className={isAssigning ? "opacity-70 cursor-not-allowed" : ""}
              >
                {isAssigning ? "Assigning..." : `Assign Plan (${selectedEmployees.length})`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}