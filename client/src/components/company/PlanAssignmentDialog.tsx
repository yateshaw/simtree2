import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Employee, EsimPlan, PurchasedEsim } from "@shared/schema";
import { Search, Check, Globe, AlertTriangle, CreditCard, Wallet } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { hasActivePlans, getActiveEsims } from "@/lib/utils/planCalculations";
import { useAdminCurrency } from "@/hooks/use-admin-currency";
import { convertCurrency, formatCurrency } from "@shared/utils/currency";

interface PlanAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  employee?: Employee;
  onSuccess?: () => void;
}

export default function PlanAssignmentDialog({
  isOpen,
  onClose,
  employee,
  onSuccess,
}: PlanAssignmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [assigningPlanId, setAssigningPlanId] = useState<string | null>(null);
  const [showInsufficientBalanceAlert, setShowInsufficientBalanceAlert] = useState(false);
  const [selectedValidity, setSelectedValidity] = useState<string>("all");
  const [selectedDataSize, setSelectedDataSize] = useState<string>("all");
  const { adminCurrency } = useAdminCurrency();

  // Format price with company currency
  const formatPrice = (price: string | number) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(numPrice, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };

  // Fetch available plans
  const { data: plans = [] } = useQuery<EsimPlan[]>({
    queryKey: ['/api/esim/plans'],
    retry: 1,
    gcTime: 1000,
    staleTime: 30000
  });

  // Use the PurchasedEsim type from shared schema
  // interface PurchasedEsim - removed, using shared type instead

  // Fetch existing eSIMs for the employee  
  const { data: existingEsims = [] } = useQuery<PurchasedEsim[]>({
    queryKey: [`/api/esim/purchased/${employee?.id}`],
    enabled: !!employee?.id,
  });

  // Check if employee already has an active plan
  // Make sure to exclude cancelled or refunded eSIMs
  const activeEsims = existingEsims.filter((esim: PurchasedEsim) => {
    // Type guard for metadata
    const metadata = esim.metadata as any;
    
    // Check for cancellation status either in the direct eSIM properties or in the metadata
    const isCancelled = (esim as any).isCancelled || 
                      esim.status === 'cancelled' || 
                      metadata?.isCancelled || 
                      metadata?.refunded;
    
    // Check for metadata CANCEL status
    let cancelledInMetadata = false;
    if (metadata && typeof metadata === 'object') {
      // First check direct path for CANCEL status
      if (metadata.rawData && 
          typeof metadata.rawData === 'object' && 
          metadata.rawData.obj &&
          typeof metadata.rawData.obj === 'object' &&
          Array.isArray(metadata.rawData.obj.esimList) && 
          metadata.rawData.obj.esimList[0] &&
          metadata.rawData.obj.esimList[0].esimStatus === 'CANCEL') {
        cancelledInMetadata = true;
        if (import.meta.env.DEV) { console.log(`eSIM ${esim.id} has CANCEL status in the provider API`); }
      }
      
      // Also check if rawData is a string that needs to be parsed
      if (!cancelledInMetadata && typeof metadata.rawData === 'string') {
        try {
          const parsedData = JSON.parse(metadata.rawData);
          if (parsedData.obj?.esimList?.[0]?.esimStatus === 'CANCEL') {
            cancelledInMetadata = true;
            if (import.meta.env.DEV) { console.log(`eSIM ${esim.id} has CANCEL status in the provider API (parsed from string)`); }
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }
    
    // Check if this eSIM is marked as cancelled in our recently cancelled list
    // This helps the UI stay in sync with most recent user actions
    const isRecentlyCancelled = employee && 
                              (window as any).cancelledEmployeeIds && 
                              Array.isArray((window as any).cancelledEmployeeIds) && 
                              (window as any).cancelledEmployeeIds.includes(employee.id);
    
    // Log cancellation status for debugging
    if (cancelledInMetadata || isRecentlyCancelled) {
      if (import.meta.env.DEV) { console.log(`eSIM ${esim.id} is excluded because it's cancelled/refunded`); }
    }
    
    // An eSIM is considered active only if:
    // 1. It has an active status AND
    // 2. It is not marked as cancelled in any way AND
    // 3. It is not marked as cancelled in metadata AND
    // 4. The employee is not in our recently cancelled list
    return (esim.status === 'active' || esim.status === 'waiting_for_activation') && 
           !isCancelled && 
           !cancelledInMetadata && 
           !isRecentlyCancelled;
  });
  
  // Only consider an employee to have an active plan if there are actually active eSIMs
  // This handles the case where legacy currentPlan field might be stale
  // Use ONLY the activeEsims array from the new plan calculation system
  const hasActivePlan = activeEsims.length > 0;

  const assignPlanMutation = useMutation({
    mutationFn: async (data: { employeeId: number; planId: string }) => {
      setAssigningPlanId(data.planId);
      const response = await apiRequest('/api/esim/purchase', {
        method: 'POST',
        body: JSON.stringify({
          planId: data.planId,
          employeeId: data.employeeId
        })
      });
      return { response, employeeId: data.employeeId };
    },
    onSuccess: async (data) => {
      const employeeId = data.employeeId;
      const response = data.response;
      
      // Check if we got immediate plan assignment confirmation
      const planAssigned = response?.planAssigned || response?.employee?.hasNewPlan;
      
      if (planAssigned) {
        // Immediate invalidation and refetch since we know the plan was assigned
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/employees'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/admin/employees'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/esim/purchased'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/wallet'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/wallet/transactions'] }),
          queryClient.invalidateQueries({ queryKey: [`/api/esim/purchased/${employee?.id}`] }),
          queryClient.invalidateQueries({ queryKey: ['/api/employeePlans'] })
        ]);

        // Immediate refetch of critical data
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['/api/employees'] }),
          queryClient.refetchQueries({ queryKey: [`/api/esim/purchased/${employee?.id}`] })
        ]);
      } else {
        // Fallback to invalidation only if we didn't get confirmation
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/employees'] }),
          queryClient.invalidateQueries({ queryKey: [`/api/esim/purchased/${employee?.id}`] })
        ]);
      }
      
      // Now that everything is refreshed, dispatch the completion event
      // IMPORTANT: We're passing the assigned employee ID to ensure it's removed
      // from the cancelledEmployeeIds list in the EmployeeTable component
      window.dispatchEvent(
        new CustomEvent('planAssignmentComplete', { 
          detail: { 
            employeeId, 
            assignedEmployeeIds: [employeeId],
            timestamp: Date.now() // Add timestamp to ensure the event is recognized as new
          } 
        })
      );

      toast({
        title: "Success",
        description: "Plan assigned successfully",
      });

      setAssigningPlanId(null);
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (error: Error) => {
      console.error('Plan assignment error:', error);
      setAssigningPlanId(null);
      
      // Check if this is an insufficient balance error
      if (error.message && error.message.includes("Insufficient wallet balance")) {
        setShowInsufficientBalanceAlert(true);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to assign plan",
          variant: "destructive",
        });
      }
    },
  });

  const handleAssignPlan = async (planId: string) => {
    if (!employee) return;

    // Removed restriction check - employees can now have multiple plans

    try {
      // Dispatch event to mark this employee as having a plan being assigned
      window.dispatchEvent(
        new CustomEvent('planAssignmentStart', { 
          detail: { employeeId: employee.id } 
        })
      );

      await assignPlanMutation.mutateAsync({
        employeeId: employee.id,
        planId: planId
      });

      // Note: We don't need to dispatch planAssignmentComplete here
      // because it will be handled in the mutation's onSuccess callback
    } catch (error) {
      console.error('Error in handleAssignPlan:', error);
      
      // Dispatch event to unmark this employee if an error occurred
      // Include additional information to ensure the employee is properly handled in the EmployeeTable
      window.dispatchEvent(
        new CustomEvent('planAssignmentComplete', { 
          detail: { 
            employeeId: employee.id,
            error: true,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now()
          } 
        })
      );
    }
  };

  // First apply text search filter
  const searchFilteredPlans = plans.filter((plan: EsimPlan) => 
    plan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Extract unique validity and data size options from search-filtered plans
  const validityOptions = Array.from(new Set(searchFilteredPlans.map(plan => plan.validity)))
    .sort((a, b) => a - b)
    .map(v => ({ value: v.toString(), label: v === 1 ? '1 Day' : `${v} Days` }));

  const dataSizeOptions = Array.from(new Set(searchFilteredPlans.map(plan => parseFloat(plan.data))))
    .sort((a, b) => a - b)
    .map(d => ({ value: d.toString(), label: `${d}GB` }));

  // Reset filters if selected value is no longer available
  useEffect(() => {
    const availableValidities = validityOptions.map(o => o.value);
    const availableDataSizes = dataSizeOptions.map(o => o.value);
    
    if (selectedValidity !== "all" && !availableValidities.includes(selectedValidity)) {
      setSelectedValidity("all");
    }
    
    if (selectedDataSize !== "all" && !availableDataSizes.includes(selectedDataSize)) {
      setSelectedDataSize("all");
    }
  }, [searchTerm, validityOptions.length, dataSizeOptions.length, selectedValidity, selectedDataSize]);

  // Then apply all filters including dropdown selections
  const filteredPlans = searchFilteredPlans.filter((plan: EsimPlan) => {
    // Validity filter
    const matchesValidity = selectedValidity === "all" || plan.validity.toString() === selectedValidity;
    
    // Data size filter
    const matchesDataSize = selectedDataSize === "all" || parseFloat(plan.data).toString() === selectedDataSize;
    
    return matchesValidity && matchesDataSize;
  }).sort((a: EsimPlan, b: EsimPlan) => a.name.localeCompare(b.name));

  const getCountryList = (countryCodes: string[]) => {
    return countryCodes
      ?.map(code => countryNames[code] || code)
      .sort()
      .join('\n');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent 
        className="max-w-4xl"
        onPointerDownOutside={(e) => {
          // Prevent closing if the click was on the trigger button area
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          // Prevent any outside interaction from closing the dialog
          e.preventDefault();
        }}
      >
        <DialogTitle>
          {employee ? `Assign Plan to ${employee.name}` : 'Assign Plan'}
        </DialogTitle>

        {/* Removed restriction alert - employees can now have multiple plans */}
        
        {showInsufficientBalanceAlert && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex justify-between items-center">
              <span>Insufficient wallet balance. Please add funds to your wallet before assigning a plan.</span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  navigate('/wallet');
                  onClose();
                }}
              >
                Go to Wallet
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="relative mb-4">
          <Input
            placeholder="Search plans..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
            data-testid="input-search-plans"
          />
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>

        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <Select value={selectedValidity} onValueChange={setSelectedValidity} data-testid="select-validity">
              <SelectTrigger>
                <SelectValue placeholder="Plan Duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Durations</SelectItem>
                {validityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Select value={selectedDataSize} onValueChange={setSelectedDataSize} data-testid="select-data-size">
              <SelectTrigger>
                <SelectValue placeholder="Data Size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sizes</SelectItem>
                {dataSizeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan Name</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Speed</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Countries</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlans.map((plan: EsimPlan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>{plan.data}GB</TableCell>
                  <TableCell>{plan.validity} Days</TableCell>
                  <TableCell>{plan.speed || "3G/4G/5G"}</TableCell>
                  <TableCell>{formatPrice(plan.retailPrice || 0)}</TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[300px] p-2">
                          <div className="text-sm whitespace-pre-line max-h-[400px] overflow-y-auto">
                            {getCountryList(plan.countries || [])}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(assignPlanMutation.isPending && assigningPlanId === plan.providerId)}
                      onClick={() => handleAssignPlan(plan.providerId)}
                    >
                      {(assignPlanMutation.isPending && assigningPlanId === plan.providerId) ? (
                        "Assigning..."
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Assign Plan
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Country code to name mapping
const countryNames: { [key: string]: string } = {
  ar: "Argentina", at: "Austria", au: "Australia", az: "Azerbaijan",
  ba: "Bosnia and Herzegovina", be: "Belgium", bg: "Bulgaria", bo: "Bolivia",
  br: "Brazil", bw: "Botswana", ca: "Canada", cd: "DR Congo",
  cf: "Central African Republic", cg: "Congo", ch: "Switzerland", ci: "Ivory Coast",
  cl: "Chile", cm: "Cameroon", cn: "China", co: "Colombia",
  cr: "Costa Rica", cy: "Cyprus", cz: "Czech Republic", de: "Germany",
  dk: "Denmark", ec: "Ecuador", ee: "Estonia", eg: "Egypt",
  es: "Spain", fi: "Finland", fr: "France", ga: "Gabon",
  gb: "United Kingdom", gh: "Ghana", gi: "Gibraltar", gr: "Greece",
  gt: "Guatemala", gu: "Guam", gy: "Guyana", hn: "Honduras",
  hr: "Croatia", hu: "Hungary", id: "Indonesia", ie: "Ireland",
  il: "Israel", in: "India", is: "Iceland", it: "Italy",
  jo: "Jordan", jp: "Japan", ke: "Kenya", kg: "Kyrgyzstan",
  kr: "South Korea", kw: "Kuwait", kz: "Kazakhstan", la: "Laos",
  li: "Liechtenstein", lk: "Sri Lanka", lt: "Lithuania", lu: "Luxembourg",
  lv: "Latvia", ma: "Morocco", mc: "Monaco", md: "Moldova",
  me: "Montenegro", mg: "Madagascar", mk: "North Macedonia", ml: "Mali",
  mt: "Malta", mu: "Mauritius", mv: "Maldives", mx: "Mexico",
  my: "Malaysia", ng: "Nigeria", ni: "Nicaragua", nl: "Netherlands",
  no: "Norway", nz: "New Zealand", om: "Oman", pa: "Panama",
  pe: "Peru", ph: "Philippines", pk: "Pakistan", pl: "Poland",
  pt: "Portugal", py: "Paraguay", qa: "Qatar", ro: "Romania",
  rs: "Serbia", sa: "Saudi Arabia", sc: "Seychelles", sd: "Sudan",
  se: "Sweden", sg: "Singapore", si: "Slovenia", sk: "Slovakia",
  sn: "Senegal", sv: "El Salvador", sz: "Eswatini", th: "Thailand",
  tn: "Tunisia", tr: "Turkey", tw: "Taiwan", tz: "Tanzania",
  ua: "Ukraine", ug: "Uganda", us: "United States", uy: "Uruguay",
  uz: "Uzbekistan", ve: "Venezuela", vn: "Vietnam", za: "South Africa"
};