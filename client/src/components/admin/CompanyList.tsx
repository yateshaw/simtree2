import { useState } from "react";
import { User, Employee, EsimPlan, PurchasedEsim } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import PlanAssignmentDialog from "../company/PlanAssignmentDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getEmployeePlanInfo, getEmployeePlanStatus } from "@/lib/utils/planCalculations";

interface CompanyListProps {
  companies: User[];
}

export default function CompanyList({ companies }: CompanyListProps) {
  const [selectedCompany, setSelectedCompany] = useState<User | null>(null);
  const [showAssignPlanDialog, setShowAssignPlanDialog] = useState(false);
  const [selectedEmployeeForPlan, setSelectedEmployeeForPlan] = useState<Employee | null>(null);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState<"all" | "with_plan" | "without_plan">("all");
  const [companyToDelete, setCompanyToDelete] = useState<User | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [forceDelete, setForceDelete] = useState(true); // Default to true for superadmins
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/admin/employees'],
  });

  const { data: allPlans = [] } = useQuery<EsimPlan[]>({
    queryKey: ['/api/esim/plans'],
  });

  const { data: purchasedEsims = [] } = useQuery<PurchasedEsim[]>({
    queryKey: ['/api/esim/purchased'],
  });
  
  // Add deletion mutation
  const deleteMutation = useMutation<any, Error, { companyId: number; password: string; forceDelete: boolean }>({
    mutationFn: async ({ companyId, password, forceDelete }: { companyId: number, password: string, forceDelete: boolean }) => {
      if (import.meta.env.DEV) { console.log(`Attempting to delete company ID: ${companyId}`); }
      if (import.meta.env.DEV) { console.log(`Request details: CompanyID=${companyId}, Password Length=${password?.length || 0}, ForceDelete=${forceDelete}`); }
      
      try {
        // Use fetch directly instead of apiRequest for better error handling
        const response = await fetch(`/api/admin/companies/${companyId}`, { 
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          credentials: 'include',
          body: JSON.stringify({ 
            password,
            forceDelete: forceDelete // Send force delete flag to the server
          })
        });
        
        // Parse the response to check for errors
        const data = await response.json();
        if (import.meta.env.DEV) { console.log('Response from delete API:', data); }
        if (import.meta.env.DEV) { console.log('Response status:', response.status); }
        
        if (!response.ok) {
          // If the server returned an error message, throw it
          const errorMessage = data.message || data.error || "Failed to delete company";
          console.error(`Delete company error (${response.status}):`, errorMessage);
          throw new Error(errorMessage);
        }
        
        return data;
      } catch (error) {
        console.error('Error in delete company request:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      if (import.meta.env.DEV) { console.log("Delete mutation successful, refreshing data", data); }
      
      // First, show success toast
      toast({
        title: "Company deleted",
        description: `${companyToDelete?.name || companyToDelete?.companyName || companyToDelete?.username} has been deleted successfully.`,
      });
      
      // Reset state
      setCompanyToDelete(null);
      setShowDeleteDialog(false);
      setConfirmPassword('');
      setDeleteError('');
      
      // Invalidate all related query caches to update UI across the app
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/esim/purchased"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
    },
    onError: (error: any) => {
      console.error("Company deletion error:", error);
      
      // Extract the error message - try to get details from the response if available
      let errorMessage = error.message || "Invalid password or insufficient permissions";
      
      // Add specific error handling based on common error patterns
      if (errorMessage.includes("foreign key constraint")) {
        errorMessage = "Cannot delete company because there are still active references to it in the database. Please contact support.";
      } else if (errorMessage.includes("active employee plans")) {
        errorMessage = "Cannot delete company with active employee plans. Please cancel all active plans first or use the force deletion option.";
      } else if (errorMessage.includes("not found")) {
        errorMessage = "Company not found. It may have been already deleted.";
      } else if (errorMessage.includes("Invalid password")) {
        errorMessage = "Invalid password. Please enter your correct password to confirm this action.";
      }
      
      // Set the error message for display in the dialog
      setDeleteError(errorMessage);
      
      // Show toast with error details but with a more user-friendly message
      toast({
        title: "Error deleting company",
        description: errorMessage,
        variant: "destructive",
      });
      
      // If it's a network error, add additional feedback
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        toast({
          title: "Network error",
          description: "Could not connect to the server. Please check your internet connection and try again.",
          variant: "destructive",
        });
      }
    }
  });

  const totalSpending = employees.reduce((acc, exec) => {
    // Use the new plan calculation system
    const employeePurchasedEsims = purchasedEsims.filter(esim => esim.employeeId === exec.id);
    const planInfo = getEmployeePlanInfo(exec.id, employeePurchasedEsims, allPlans);
    
    return acc + planInfo.activePlans.reduce((planTotal, plan) => {
      const planDetails = allPlans.find(p => p.id === plan.planId);
      return planTotal + parseFloat(planDetails?.sellingPrice || '0');
    }, 0);
  }, 0);

  const filteredEmployees = selectedCompany
    ? employees.filter((exec) => exec.companyId === selectedCompany.id)
    : employees;

  // Function to get plan status badge using new plan calculation system
  const getPlanStatusBadge = (employee: Employee) => {
    const employeePurchasedEsims = purchasedEsims.filter(esim => esim.employeeId === employee.id);
    const planInfo = getEmployeePlanInfo(employee.id, employeePurchasedEsims, allPlans);
    
    if (!planInfo.hasActivePlans) {
      return <span className="text-gray-500">No plan</span>;
    }

    // Check status using the new system
    const planStatus = getEmployeePlanStatus(employee.id, employeePurchasedEsims);
    
    if (planStatus === 'waiting') {
      return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">Waiting for Activation</Badge>;
    }

    if (planStatus === 'active') {
      return <Badge className="bg-green-500 text-white hover:bg-green-600">Active</Badge>;
    }

    if (planStatus === 'mixed') {
      return <Badge className="bg-blue-500 text-white hover:bg-blue-600">Mixed Status</Badge>;
    }

    return <Badge className="bg-gray-500 text-white hover:bg-gray-600">Pending</Badge>;
  };

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Companies</h3>
          <div className="text-sm text-muted-foreground">
            Total Monthly Spending: ${totalSpending.toFixed(2)}
          </div>
        </div>
        <DataTable
          data={companies.map((company, index) => ({ ...company, orderNumber: index + 1 }))}
          columns={[
            {
              key: "order",
              label: "#",
              render: (company) => company.orderNumber,
            },
            {
              key: "name",
              label: "Company",
              render: (company) => company.name || company.companyName || company.username,
            },
            {
              key: "employees",
              label: "Employees",
              render: (company) => {
                const count = employees.filter(
                  (exec) => exec.companyId === company.id
                ).length;
                return count;
              },
            },
            {
              key: "active",
              label: "Active Plans",
              render: (company) => {
                const count = employees.filter((exec) => {
                  if (exec.companyId !== company.id) return false;
                  const employeePurchasedEsims = purchasedEsims.filter(esim => esim.employeeId === exec.id);
                  const planInfo = getEmployeePlanInfo(exec.id, employeePurchasedEsims, allPlans);
                  return planInfo.hasActivePlans;
                }).length;
                return (
                  <Badge variant={count > 0 ? "default" : "outline"}>
                    {count}
                  </Badge>
                );
              },
            },
            {
              key: "actions",
              label: "Actions",
              render: (company) => {
                // Check if there are any employees with active plans
                const hasActivePlans = employees.some(exec => {
                  if (exec.companyId !== company.id) return false;
                  const employeePurchasedEsims = purchasedEsims.filter(esim => esim.employeeId === exec.id);
                  const planInfo = getEmployeePlanInfo(exec.id, employeePurchasedEsims, allPlans);
                  return planInfo.hasActivePlans;
                });
                
                // Check if this is the Semtree company (sadmin) - should be undeletable
                const isSemtreeCompany = 
                  company.name === "Semtree" || 
                  company.username === "sadmin";
                
                return (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent row click event
                        setSelectedCompany(company);
                      }}
                    >
                      View
                    </Button>
                    {!isSemtreeCompany && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent row click event
                          setCompanyToDelete(company);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              },
            },
          ]}
          onRowClick={(company) => setSelectedCompany(company)}
        />

        {selectedCompany && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">
                {selectedCompany.name || selectedCompany.companyName || selectedCompany.username} Employees
              </h3>
              <button
                onClick={() => setSelectedCompany(null)}
                className="text-sm text-blue-500 hover:underline"
              >
                Back to All Companies
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Input
                  placeholder="Search employees..."
                  value={employeeSearchTerm}
                  onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                  className="pl-8"
                />
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>

              <select
                className="p-2 border rounded-md bg-white"
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value as "all" | "with_plan" | "without_plan")}
              >
                <option value="all">All Employees</option>
                <option value="with_plan">With Plan</option>
                <option value="without_plan">Without Plan</option>
              </select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Current Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data Usage</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees
                  .filter(exec => {
                    const matchesSearch = 
                      exec.name.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
                      exec.position.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
                      (exec.email && exec.email.toLowerCase().includes(employeeSearchTerm.toLowerCase()));

                    const employeePurchasedEsims = purchasedEsims.filter(esim => esim.employeeId === exec.id);
                    const planInfo = getEmployeePlanInfo(exec.id, employeePurchasedEsims, allPlans);
                    const matchesFilter = 
                      employeeFilter === "all" ||
                      (employeeFilter === "with_plan" && planInfo.hasActivePlans) ||
                      (employeeFilter === "without_plan" && !planInfo.hasActivePlans);

                    return matchesSearch && matchesFilter;
                  })
                  .map((employee) => {
                    const employeePurchasedEsims = purchasedEsims.filter(esim => esim.employeeId === employee.id);
                    const planInfo = getEmployeePlanInfo(employee.id, employeePurchasedEsims, allPlans);
                    const primaryPlan = planInfo.activePlans.length > 0 ? planInfo.activePlans[0] : null;

                    return (
                      <TableRow key={employee.id}>
                        <TableCell>{employee.name}</TableCell>
                        <TableCell>{employee.position}</TableCell>
                        <TableCell>
                          {primaryPlan ? (
                            <span className="font-medium">{primaryPlan.planName}</span>
                          ) : (
                            <span className="text-gray-500">No plan</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getPlanStatusBadge(employee)}
                        </TableCell>
                        <TableCell>
                          {employee.dataUsage && employee.dataLimit ? (
                            <div className="flex flex-col">
                              <div className="flex justify-between">
                                <span>
                                  {Number(employee.dataUsage).toFixed(2)}GB /{" "}
                                  {Number(employee.dataLimit).toFixed(2)}GB
                                </span>
                                <span className="ml-2 font-medium">
                                  {Math.min(
                                    Math.round((Number(employee.dataUsage) / Number(employee.dataLimit)) * 100),
                                    100
                                  )}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                                <div
                                  className={`h-2 rounded-full ${
                                    (Number(employee.dataUsage) / Number(employee.dataLimit)) > 0.9 
                                      ? "bg-red-500" 
                                      : (Number(employee.dataUsage) / Number(employee.dataLimit)) > 0.7 
                                        ? "bg-yellow-500" 
                                        : "bg-primary"
                                  }`}
                                  style={{
                                    width: `${Math.min(
                                      (Number(employee.dataUsage) / Number(employee.dataLimit)) * 100,
                                      100
                                    )}%`,
                                  }}
                                ></div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {employee.planEndDate ? (
                            <span>
                              {new Date(employee.planEndDate).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedEmployeeForPlan(employee);
                              setShowAssignPlanDialog(true);
                            }}
                          >
                            Assign Plan
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        )}

        {showAssignPlanDialog && selectedEmployeeForPlan && (
          <PlanAssignmentDialog
            isOpen={showAssignPlanDialog}
            onClose={() => {
              setShowAssignPlanDialog(false);
              setSelectedEmployeeForPlan(null);
            }}
            employee={selectedEmployeeForPlan}
          />
        )}
        
        {/* Delete Company Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                <div>
                  This action will permanently delete the company{" "}
                  <span className="font-bold">
                    {companyToDelete?.name || companyToDelete?.companyName || companyToDelete?.username}
                  </span>{" "}
                  and all associated data, including employees, wallet data, transaction history, and active plans.
                
                  <span className="block mt-2">
                    If this company has active eSIM plans, all plans will be cancelled and deleted without issuing any refunds.
                  </span>
                
                  <span className="block mt-2 text-destructive font-semibold">
                    This action cannot be undone.
                  </span>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            {/* Password confirmation section */}
            <div className="mb-4 mt-2">
              <label className="block text-sm font-medium mb-1" htmlFor="confirm-password">
                Enter your password to confirm:
              </label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={deleteError ? "border-red-500" : ""}
              />
              {deleteError && (
                <p className="text-sm text-red-500 mt-1">{deleteError}</p>
              )}
              
              {/* Force Delete Option for Superadmins */}
              <div className="mt-4 flex items-center">
                <input 
                  type="checkbox" 
                  id="force-delete"
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  checked={forceDelete}
                  onChange={(e) => setForceDelete(e.target.checked)}
                />
                <label htmlFor="force-delete" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Force deletion (ignore active plans)
                </label>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Warning: This will delete the company and all its employees regardless of active plans.
              </p>
            </div>
            
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setCompanyToDelete(null);
                  setShowDeleteDialog(false);
                  setConfirmPassword('');
                  setDeleteError('');
                  setForceDelete(true); // Reset to default value
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground"
                onClick={(e) => {
                  e.preventDefault(); // Prevent form submission
                  
                  if (companyToDelete && confirmPassword) {
                    if (import.meta.env.DEV) { console.log(`Attempting to delete company: ${companyToDelete.id} (${companyToDelete.username})`); }
                    
                    deleteMutation.mutate({ 
                      companyId: companyToDelete.id,
                      password: confirmPassword,
                      forceDelete: forceDelete
                    });
                  } else {
                    setDeleteError("Password is required");
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Company"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}