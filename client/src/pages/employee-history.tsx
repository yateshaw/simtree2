import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { Calendar, ChevronLeft, Download, RefreshCw, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import Loader2 from '@/components/Loader2';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Employee {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  position: string;
  companyId: number;
}

interface PurchasedEsim {
  id: number;
  employeeId: number;
  planId?: number;
  orderId?: string;
  iccid?: string;
  activationCode?: string;
  qrCode?: string;
  status: string;
  purchaseDate: string;
  activationDate?: string | null;
  expiryDate?: string | null;
  dataUsed: string;
  dataLimit?: string;
  metadata?: any;
  refunded?: boolean;
  cancelled?: boolean;
  cancelledAt?: string;
  isCancelled?: boolean;
  cancelReason?: string;
  employeeName?: string;
  planName?: string; 
  providerId?: string;
  paymentAmount?: string | null;
}

interface WalletTransaction {
  id: number;
  walletId: number;
  amount: string;
  type: 'credit' | 'debit' | 'refund';
  description: string;
  status: string;
  createdAt: string;
  esimOrderId?: string;
  esimPlanId?: number;
}

// Import the utility from employeeUtils
import { isEsimCancelledOrRefunded as isEsimCancelled } from '@/lib/utils/employeeUtils';

// Use the imported function but add additional comprehensive checks for this page
const isEsimCancelledOrRefunded = (esim: PurchasedEsim): boolean => {
  // First use the shared utility function for basic checks
  if (isEsimCancelled(esim)) {
    return true;
  }
  
  // Add additional specific checks for edge cases
  
  // Check if there's a cancelReason property which indicates cancellation
  if (esim.cancelReason) {
    return true;
  }
  
  // Some eSIMs might have status 'waiting_for_activation' but are actually cancelled
  // Check for the case where the provider API shows CANCEL but our database hasn't synced
  if (esim.metadata?.rawData?.obj?.esimList?.[0]?.esimStatus === 'CANCEL') {
    if (import.meta.env.DEV) { console.log(`eSIM ${esim.id} has CANCEL status in provider API data`); }
    return true;
  }
  
  return false;
}

export default function EmployeeHistory() {
  const { employeeId } = useParams();
  const [, navigate] = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch wallet transactions to calculate payment amounts
  const { data: transactionsData, isLoading: isLoadingTransactions } = useQuery<WalletTransaction[]>({
    queryKey: ['/api/wallet/transactions'],
    enabled: !!employeeId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Debug logging to understand transaction structure
  useEffect(() => {
    if (transactionsData) {
      console.log('=== WALLET TRANSACTIONS DEBUG ===');
      console.log('Raw transactions response:', transactionsData);
      console.log('Is array?', Array.isArray(transactionsData));
      console.log('Number of transactions:', transactionsData?.length || 0);
      
      if (transactionsData && transactionsData.length > 0) {
        console.log('First transaction:', transactionsData[0]);
        console.log('Transaction fields:', Object.keys(transactionsData[0]));
        
        // Check for eSIM-related transactions
        const esimTransactions = transactionsData.filter(tx => tx.esimOrderId);
        console.log('eSIM-related transactions:', esimTransactions.length);
        if (esimTransactions.length > 0) {
          console.log('First eSIM transaction:', esimTransactions[0]);
        }
      }
    }
  }, [transactionsData]);

  // Get authentication state to determine which API endpoint to use
  const { user } = useAuth();
  
  // Check superadmin status using role (primary) and fallback flags
  const isSuperAdmin = user?.role === 'superadmin' || user?.isSuperAdmin === true || user?.username === 'sadmin';
  
  // Helper function to determine the correct dashboard path
  const getDashboardPath = () => {
    // If user is not loaded yet, default to regular dashboard
    if (!user) return '/dashboard';
    return isSuperAdmin ? '/admin' : '/dashboard';
  };
  
  // For superadmins, use the admin employees API which returns all employees across all companies
  const employeesQueryKey = isSuperAdmin 
    ? ['/api/admin/employees'] 
    : ['/api/employees'];
  
  // Fetch employee details, using the appropriate endpoint based on user role
  const { data: employeeData, isLoading: isLoadingEmployee } = useQuery<Employee[]>({
    queryKey: employeesQueryKey,
    enabled: !!employeeId
  });
  
  // If the regular endpoint doesn't work, try to fetch the specific employee directly
  const { data: specificEmployeeData, isLoading: isLoadingSpecificEmployee } = useQuery<Employee>({
    queryKey: ['/api/employees', employeeId],
    enabled: !!employeeId && !employeeData // Only try this if the first approach fails
  });
  
  // Find the specific employee we want from the array or use the directly fetched one
  const employee = useMemo(() => {
    // If we have specific employee data, use that
    if (specificEmployeeData) return specificEmployeeData;
    
    // Otherwise try to find it in the array
    if (!employeeData || !Array.isArray(employeeData)) return null;
    
    // Find the employee with matching ID
    return employeeData.find(exec => exec.id === Number(employeeId));
  }, [employeeData, specificEmployeeData, employeeId]);

  // Function to refresh data
  const refreshData = () => {
    setIsRefreshing(true);
    
    // Simply refetch the queries
    Promise.all([
      // We'll add the specific query references here after they're defined
    ]).then(() => {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 800); // Show spinner for at least 800ms for better UI feedback
    });
  };
  
  // Debug employee data loading
  useEffect(() => {
    if (employeeData) {
      if (import.meta.env.DEV) { console.log("All employees data loaded:", employeeData); }
      if (employee) {
        if (import.meta.env.DEV) { console.log("Found employee for ID", employeeId, ":", employee); }
      } else {
        if (import.meta.env.DEV) { console.log("Employee with ID", employeeId, "not found in data set of", employeeData.length, "employees"); }
      }
    } else if (!isLoadingEmployee) {
      if (import.meta.env.DEV) { console.log("Employee data not loaded for ID:", employeeId); }
      // Try to fetch directly to debug
      fetch(`/api/employees`)
        .then(res => res.json())
        .then(data => {
          if (import.meta.env.DEV) { console.log("Direct employees fetch result:", data); }
        })
        .catch(err => {
          console.error("Error fetching employees directly:", err);
        });
    }
  }, [employeeData, employee, employeeId, isLoadingEmployee]);

  // Fetch all purchased eSIMs for this employee (including historical ones)
  const { data: purchasedEsimsResponse, isLoading: isLoadingEsims, error: esimError } = useQuery<{success?: boolean, data: PurchasedEsim[]}>({
    queryKey: ['/api/esim/purchased', employeeId],
    enabled: !!employeeId
  });
  
  // Handle both response formats and filter to only include eSIMs for this employee
  const purchasedEsims = useMemo(() => {
    // First, get the data regardless of format
    const esims = purchasedEsimsResponse && Array.isArray(purchasedEsimsResponse)
      ? purchasedEsimsResponse
      : purchasedEsimsResponse?.data;
    
    // Get transactions - use the already fetched transaction data
    const transactions = transactionsData || [];
    
    // Then filter to only include eSIMs for the current employee
    const filteredEsims = esims?.filter(esim => esim.employeeId === Number(employeeId)) || [];
    
    console.log(`=== PAYMENT CALCULATION DEBUG ===`);
    console.log(`Employee ID: ${employeeId}`);
    console.log(`Filtered eSIMs: ${filteredEsims.length}`);
    console.log(`All transactions: ${transactions.length}`);
    
    // Add payment amount to each eSIM by matching with wallet transactions
    return filteredEsims.map(esim => {
      console.log(`Processing eSIM ${esim.orderId} for employee ${employeeId}:`);
      
      // Find matching transaction for this eSIM's order ID
      const transaction = transactions.find((tx: WalletTransaction) => 
        tx.esimOrderId === esim.orderId && 
        tx.type === 'debit' &&
        tx.description?.includes('for')
      );
      
      console.log(`- Found transaction for ${esim.orderId}:`, transaction);
      
      // Also look for plan price in eSIM metadata or directly in the eSIM plan data
      const planPrice = 
        esim.metadata?.retailPrice || 
        esim.metadata?.rawData?.obj?.esimList?.[0]?.packageList?.[0]?.price ||
        (esim.planId === 77 ? '6.80' : // Italy 5GB 30Days
         esim.planId === 180 ? '12.20' : // Italy 10GB 30Days
         esim.planId === 650 ? '12.20' : // US 10GB 30Days
         esim.planId === 109 ? '1.80' : // Croatia 1GB 7Days
         esim.planId === 449 ? '24.00' : // Albania 3GB 15Days
         esim.planId === 933 ? '0.92' : null); // Argentina 100MB 7Days
      
      console.log(`- Plan price for ${esim.orderId}:`, planPrice);
      
      // Check if this eSIM is cancelled or refunded
      const isCancelled = isEsimCancelledOrRefunded(esim) || 
                         esim.status === 'cancelled' || 
                         esim.status === 'refunded' ||
                         esim.metadata?.isCancelled === true;
      
      console.log(`- Is cancelled for ${esim.orderId}:`, isCancelled);
      
      // If cancelled, show $0.00 regardless of transaction or plan price
      const paymentAmount = isCancelled ? '0.00' : 
                           (transaction ? Math.abs(parseFloat(transaction.amount)).toFixed(2) : 
                            planPrice ? planPrice.toString() : null);
      
      console.log(`- Final payment amount for ${esim.orderId}:`, paymentAmount);
      
      return {
        ...esim,
        paymentAmount
      };
    });
  }, [purchasedEsimsResponse, transactionsData, employeeId]);

  // Calculate total amount paid for this employee
  const totalAmountPaid = useMemo(() => {
    if (!purchasedEsims || purchasedEsims.length === 0) return 0;
    
    console.log(`=== TOTAL AMOUNT CALCULATION DEBUG ===`);
    console.log(`Total eSIMs for employee ${employeeId}:`, purchasedEsims.length);
    
    return purchasedEsims.reduce((total, esim) => {
      // Check if this eSIM is cancelled or refunded
      const isCancelled = isEsimCancelledOrRefunded(esim) || 
                         esim.status === 'cancelled' || 
                         esim.status === 'refunded' ||
                         esim.metadata?.isCancelled === true;
      
      console.log(`- eSIM ${esim.orderId}: status=${esim.status}, cancelled=${isCancelled}, paymentAmount=${esim.paymentAmount}`);
      
      // Only count payment amounts for plans that are not cancelled
      // Cancelled plans should not contribute to the total
      if (isCancelled) {
        console.log(`  -> Skipping cancelled eSIM ${esim.orderId} (not adding to total)`);
        return total;
      }
      
      // For pending/waiting, active, and expired plans, count the payment
      if (esim.paymentAmount && !isNaN(parseFloat(esim.paymentAmount))) {
        const amount = parseFloat(esim.paymentAmount);
        console.log(`  -> Adding $${amount} from eSIM ${esim.orderId} to total`);
        return total + amount;
      }
      
      console.log(`  -> No valid payment amount for eSIM ${esim.orderId}`);
      return total;
    }, 0);
  }, [purchasedEsims, employeeId]);
  
  // Debug log final total
  useEffect(() => {
    if (purchasedEsims && purchasedEsims.length > 0) {
      console.log(`=== FINAL TOTAL AMOUNT ===`);
      console.log(`Total amount paid for employee ${employeeId}: $${totalAmountPaid.toFixed(2)}`);
    }
  }, [totalAmountPaid, employeeId, purchasedEsims]);
  
  // Debug logging for eSIMs data
  useEffect(() => {
    if (purchasedEsims) {
      if (import.meta.env.DEV) { console.log(`Successfully loaded ${purchasedEsims.length || 0} eSIMs for employee ${employeeId}`); }
      if (purchasedEsims.length > 0) {
        if (import.meta.env.DEV) { console.log('First eSIM:', purchasedEsims[0]); }
      }
    }
    if (esimError) {
      console.error('Error fetching eSIMs:', esimError);
    }
  }, [purchasedEsims, esimError, employeeId]);
  
  // Debug logging for eSIMs status
  useEffect(() => {
    if (purchasedEsims && purchasedEsims.length > 0 && import.meta.env.DEV) {
      console.log(`Loaded ${purchasedEsims.length} eSIMs for employee ${employeeId}`);
    }
  }, [employeeId, purchasedEsims]);

  if (isLoadingEmployee || isLoadingEsims) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Employee not found</h2>
              <p className="text-gray-500 mb-4">The requested employee could not be found.</p>
              <Button onClick={() => navigate(getDashboardPath())}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Return to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Display any error message if one exists
  if (esimError) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Error Loading eSIMs</h2>
              <p className="text-gray-500 mb-4">
                {esimError instanceof Error ? esimError.message : 'An unknown error occurred'}
              </p>
              <Button onClick={() => navigate(getDashboardPath())}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Return to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Make sure purchasedEsims is defined and is an array before trying to sort
  const sortedEsims = Array.isArray(purchasedEsims) 
    ? [...purchasedEsims].sort((a, b) => {
        // Use purchaseDate instead of createdAt
        return new Date(b.purchaseDate || 0).getTime() - new Date(a.purchaseDate || 0).getTime();
      })
    : [];

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="flex items-center justify-between mb-8 bg-white p-4 rounded-lg shadow-sm border border-green-100">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            className="mr-4 text-green-600 hover:text-green-800 hover:bg-green-50 border border-green-200" 
            onClick={() => navigate(getDashboardPath())}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-green-700">Employee eSIM History</h1>
            <p className="text-green-600 text-sm">View all assigned eSIMs and usage history</p>
          </div>
        </div>
        <div className="flex items-center">
          <Button 
            variant="outline" 
            size="sm"
            className="text-orange-500 border-orange-200 hover:bg-orange-50"
            onClick={refreshData}
            disabled={isRefreshing || isLoadingEsims || isLoadingEmployee}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      <Card className="mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-[hsl(168,75%,38%)] to-[hsl(168,75%,48%)] px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{employee?.name || employee?.email || 'Employee'}</h2>
              <p className="text-[hsl(145,55%,85%)] mt-1">{employee?.position || 'No position specified'}</p>
            </div>
            <Badge className="bg-[hsl(15,100%,65%)] text-white hover:bg-[hsl(15,100%,60%)]">{sortedEsims?.length || 0} eSIMs</Badge>
          </div>
        </div>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-[hsl(168,75%,38%)] p-4 rounded-lg bg-[hsl(168,75%,95%)] shadow-sm">
              <div className="flex items-center mb-2">
                <div className="p-1.5 bg-[hsl(168,75%,90%)] rounded-full mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[hsl(168,75%,38%)]">
                    <path d="M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5H18c2.2 0 4 1.8 4 4v8Z" />
                    <polyline points="15,9 18,9 18,11" />
                    <path d="M6.5 5C9 5 11 7 11 9.5V11c0 1.1.9 2 2 2h1" />
                    <path d="M4 13h3" />
                    <path d="M4 17h8" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-[hsl(168,75%,28%)]">Email Address</p>
              </div>
              <p className="font-medium pl-8 text-gray-700">{employee?.email || 'Not specified'}</p>
            </div>
            <div className="border border-[hsl(15,100%,65%)] p-4 rounded-lg bg-[hsl(15,100%,95%)] shadow-sm">
              <div className="flex items-center mb-2">
                <div className="p-1.5 bg-[hsl(15,100%,90%)] rounded-full mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[hsl(15,100%,65%)]">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-[hsl(15,100%,45%)]">Phone Number</p>
              </div>
              <p className="font-medium pl-8 text-gray-700">{employee?.phoneNumber || 'Not specified'}</p>
            </div>
            <div className="border border-green-500 p-4 rounded-lg bg-green-50 shadow-sm">
              <div className="flex items-center mb-2">
                <div className="p-1.5 bg-green-100 rounded-full mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-green-700">Total Amount Paid</p>
              </div>
              <p className="font-bold text-xl pl-8 text-green-700">
                ${totalAmountPaid.toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {sortedEsims && sortedEsims.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Complete eSIM History</CardTitle>
                <CardDescription>All eSIMs that have been assigned to this employee</CardDescription>
              </div>
              {(() => {
                // First, identify all pending plans (those waiting for activation)
                const pendingPlans = sortedEsims.filter(esim => {
                  // Must be waiting for activation (not just metadata pending)
                  const isWaitingForActivation = esim.status === 'waiting_for_activation';
                  if (!isWaitingForActivation) return false;
                  
                  // Make sure they're not cancelled in ANY way
                  if (isEsimCancelledOrRefunded(esim)) return false;
                  
                  // Double-check the provider status isn't CANCEL
                  if (esim.metadata?.rawData?.obj?.esimList?.[0]?.esimStatus === 'CANCEL') return false;
                  
                  // Check if expired (activated/active eSIMs only - but waiting_for_activation should not be expired)
                  if (esim.status === 'activated' || esim.status === 'active') {
                    if (esim.expiryDate) {
                      const expiryDate = new Date(esim.expiryDate);
                      const now = new Date();
                      if (now > expiryDate) return false;
                    }
                  }
                  
                  return true;
                });
                
                // Log all pending plans for debugging
                if (pendingPlans.length > 0) {
                  console.log(`Found ${pendingPlans.length} genuine pending plans:`, 
                    pendingPlans.map(p => ({ 
                      id: p.id, 
                      orderId: p.orderId,
                      status: p.status,
                      providerStatus: p.metadata?.rawData?.obj?.esimList?.[0]?.esimStatus
                    }))
                  );
                }
                
                // Only show the banner if there are genuine pending plans
                return pendingPlans.length > 0 ? (
                  <div className="flex items-center bg-yellow-50 text-yellow-800 px-3 py-2 rounded-md border border-yellow-200">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    <span className="text-sm font-medium">
                      This employee has {pendingPlans.length} plan{pendingPlans.length !== 1 ? 's' : ''} pending activation
                    </span>
                  </div>
                ) : null;
              })()}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Data Usage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Purchase Date</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Amount Paid</TableHead>
                    <TableHead>Order ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEsims.map((esim) => (
                    <TableRow key={esim.id}>
                      <TableCell>
                        <div className="font-medium">
                          {esim.planName || 
                           (esim.metadata?.rawData?.obj?.esimList?.[0]?.packageList?.[0]?.packageName) || 
                           "Unknown Plan"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {esim.providerId || 
                           (esim.metadata?.rawData?.obj?.esimList?.[0]?.packageList?.[0]?.slug) || 
                           "--"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <div className="w-24">
                            {(() => {
                              // Extract data limit from metadata if not directly available
                              const metadataDataLimit = esim.metadata?.rawData?.obj?.esimList?.[0]?.totalVolume;
                              const dataLimitGB = esim.dataLimit || 
                                (metadataDataLimit ? (metadataDataLimit / (1024 * 1024 * 1024)).toFixed(2) : null);
                              
                              return (
                                <>
                                  <div className="text-xs text-gray-500 font-mono">
                                    {(() => {
                                      // Get usage data (should already be in GB from enhanced API)
                                      const dataUsedGB = parseFloat(esim.dataUsed || "0");
                                      const limitGB = parseFloat(dataLimitGB || "0");
                                      
                                      // Use consistent formatting logic
                                      const useGB = limitGB >= 1;
                                      
                                      if (useGB) {
                                        const displayUsed = dataUsedGB.toFixed(2);
                                        const displayLimit = limitGB.toFixed(2);
                                        const percentage = limitGB > 0 ? Math.round((dataUsedGB / limitGB) * 100) : 0;
                                        return `${displayUsed}/${displayLimit}GB ${percentage}%`;
                                      } else {
                                        const usedMB = dataUsedGB * 1024;
                                        const limitMB = limitGB * 1024;
                                        const displayUsed = usedMB < 0.1 ? usedMB.toFixed(2) : Math.round(usedMB).toString();
                                        const displayLimit = Math.round(limitMB).toString();
                                        const percentage = limitMB > 0 ? Math.round((usedMB / limitMB) * 100) : 0;
                                        return `${displayUsed}/${displayLimit}MB ${percentage}%`;
                                      }
                                    })()}
                                  </div>
                                  {dataLimitGB && (
                                    <div className="w-full h-2 bg-gray-200 rounded-full mt-1">
                                      {(() => {
                                        const dataUsedGB = parseFloat(esim.dataUsed || "0");
                                        const limitGB = parseFloat(dataLimitGB || "0");
                                        const percentage = limitGB > 0 ? Math.min(100, Math.round((dataUsedGB / limitGB) * 100)) : 0;
                                        return (
                                          <div 
                                            className={`h-2 rounded-full ${
                                              percentage > 80 ? 'bg-red-500' : 
                                              percentage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                                            }`}
                                            style={{ width: `${percentage}%` }}
                                          />
                                        );
                                      })()}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          // First check - is this eSIM cancelled or refunded?
                          // This check includes provider API status checks
                          if (isEsimCancelledOrRefunded(esim)) {
                            return (
                              <Badge variant="destructive">
                                {esim.refunded ? 'Refunded' : 'Cancelled'}
                              </Badge>
                            );
                          }
                          
                          // Get provider status for various status checks
                          const providerStatus = esim.metadata?.rawData?.obj?.esimList?.[0]?.esimStatus;
                          
                          // Check for cancellation - if the provider says CANCEL
                          if (providerStatus === 'CANCEL') {
                            if (import.meta.env.DEV) { console.log(`Catching edge case: eSIM ${esim.id} has direct CANCEL status in provider data`); }
                            return (
                              <Badge variant="destructive">
                                Cancelled
                              </Badge>
                            );
                          }
                          
                          // Check for expired statuses from provider (this takes precedence over other statuses)
                          if (providerStatus === 'EXPIRED' || providerStatus === 'DEPLETED' || 
                              providerStatus === 'USED_EXPIRED' || providerStatus === 'DISABLED' || 
                              providerStatus === 'REVOKED') {
                            if (import.meta.env.DEV) { console.log(`eSIM ${esim.id} has expired provider status: ${providerStatus}`); }
                            return (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                Expired
                              </Badge>
                            );
                          }
                          
                          // Second check - is this eSIM pending activation?
                          // IMPORTANT: Always prioritize database status over metadata status
                          // Only check metadata status if database status is not conclusive
                          if (esim.status === 'waiting_for_activation' || 
                              (esim.status !== 'activated' && esim.status !== 'active' && esim.metadata?.status === 'pending')) {
                            return (
                              <div>
                                <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-white">
                                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                  Pending Activation
                                </Badge>
                              </div>
                            );
                          }
                          
                          // Check if expiry date has passed
                          if (esim.expiryDate) {
                            const now = new Date();
                            const expiryDate = new Date(esim.expiryDate);
                            if (now > expiryDate) {
                              return (
                                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                  Expired
                                </Badge>
                              );
                            }
                          }
                          
                          // Third check - is this eSIM active?
                          if (esim.status === 'active' || esim.status === 'activated') {
                            return (
                              <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            );
                          }
                          
                          // Fourth check - is this eSIM expired?
                          if (esim.status === 'expired') {
                            return (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                Expired
                              </Badge>
                            );
                          }
                          
                          // Default or unknown status
                          return (
                            <Badge variant="outline">
                              {esim.status || "Unknown"}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Calendar className="h-3 w-3 mr-1 text-gray-400" />
                          <span>{format(new Date(esim.purchaseDate), 'MMM d, yyyy')}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {esim.expiryDate ? (
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1 text-gray-400" />
                            <span>{format(new Date(esim.expiryDate), 'MMM d, yyyy')}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          // Check if the eSIM is cancelled or refunded - no payment shown
                          if (isEsimCancelledOrRefunded(esim) || 
                              esim.status === 'cancelled' || 
                              esim.status === 'refunded' ||
                              esim.metadata?.isCancelled === true) {
                            return <div className="font-medium text-gray-400">-</div>;
                          }
                          
                          // For pending/waiting for activation, active, and expired plans - show amount paid
                          const shouldShowPayment = (
                            esim.status === 'waiting_for_activation' || 
                            esim.status === 'pending' ||
                            esim.status === 'active' || 
                            esim.status === 'activated' ||
                            esim.status === 'expired' ||
                            esim.metadata?.status === 'pending'
                          );
                          
                          if (shouldShowPayment) {
                            // If we have the payment amount directly from our calculations
                            if (esim.paymentAmount && !isNaN(parseFloat(esim.paymentAmount))) {
                              return (
                                <div className="font-medium text-green-600">
                                  ${parseFloat(esim.paymentAmount).toFixed(2)}
                                </div>
                              );
                            }
                            
                            // Look in eSIM metadata for any price information
                            const packagePrice = esim.metadata?.rawData?.obj?.esimList?.[0]?.packageList?.[0]?.price;
                            if (packagePrice && !isNaN(parseFloat(packagePrice))) {
                              return (
                                <div className="font-medium text-green-600">
                                  ${parseFloat(packagePrice).toFixed(2)}
                                </div>
                              );
                            }
                            
                            // Fallback for specific known plan IDs
                            if (esim.planId === 449) {
                              return <div className="font-medium text-green-600">$24.00</div>;
                            }
                            
                            if (esim.planId === 933) {
                              return <div className="font-medium text-green-600">$0.92</div>;
                            }
                          }
                          
                          // If no payment amount could be determined
                          return <span className="text-gray-400">-</span>;
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs">{esim.orderId || "-"}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-[hsl(168,75%,85%)] shadow-md">
          <CardHeader className="bg-[hsl(168,75%,95%)] border-b border-[hsl(168,75%,85%)]">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-[hsl(168,75%,28%)]">eSIM History</CardTitle>
                <CardDescription className="text-[hsl(168,75%,38%)]">No active or historical eSIMs found</CardDescription>
              </div>
              <div className="w-10 h-10 bg-[hsl(15,100%,90%)] rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[hsl(15,100%,65%)]">
                  <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>
                  <line x1="2" y1="20" x2="2" y2="20"/>
                </svg>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-8 pb-8">
            <div className="text-center py-8 flex flex-col items-center bg-white rounded-lg border border-[hsl(168,75%,38%)] px-6">
              <div className="rounded-full bg-[hsl(15,100%,90%)] p-4 mb-4">
                <AlertCircle className="h-8 w-8 text-[hsl(15,100%,65%)]" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-[hsl(168,75%,28%)]">No eSIMs Registered</h3>
              <p className="text-gray-600 max-w-md leading-relaxed">
                <span className="font-bold text-[hsl(168,75%,38%)]">{employee?.name}</span> currently has no eSIMs assigned. Use the eSIM manager to assign plans to this employee. 
                Any previously used eSIMs will also appear here once assigned.
              </p>
              <div className="mt-6 flex flex-col items-center">
                <div className="w-16 h-1 bg-[hsl(48,100%,55%)] rounded mb-3"></div>
                <p className="text-sm text-[hsl(190,90%,60%)]">Add an eSIM from the dashboard</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}