import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, DollarSign, User, Globe, BarChart, FileText, Mail, MessageSquare, Scale, TrendingUp } from "lucide-react";
import { default as WalletManager } from "@/components/company/WalletManager";
import { planDetails, additionalGBCosts } from "@shared/schema";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import ContactForm from "@/components/company/ContactForm";
import FeedbackForm from "@/components/company/FeedbackForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmployeeTable from "@/components/company/EmployeeTable";
import EsimManager from "@/components/company/EsimManager";
import type { Employee, EsimPlan, PurchasedEsim, WalletTransaction, Company, User as SchemaUser } from "@shared/schema";

// Type for API response wrappers
interface ApiResponse<T> {
  data?: T;
  success?: boolean;
}

// Extended User type with optional fullName field (uses SchemaUser to avoid lucide-react User icon conflict)
interface ExtendedUser extends Partial<SchemaUser> {
  fullName?: string;
}
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PlanComparison from "@/components/company/PlanComparison";
import EmployeeAddButton from "@/components/company/EmployeeAddButton";
import UsageMonitor from "@/components/company/UsageMonitor";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { hasActivePlans, getActiveEsims, getEmployeePlanInfo } from "@/lib/utils/planCalculations";
import { isEsimCancelledOrRefunded } from "@/lib/utils/employeeUtils";
import { useAdminCurrency } from '@/hooks/use-admin-currency';
import { convertCurrency, formatCurrency } from '@shared/utils/currency';

export default function Dashboard() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const [isFeedbackFormOpen, setIsFeedbackFormOpen] = useState(false);
  
  // Tab state management with URL synchronization
  const getInitialTab = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'esim' || tabParam === 'usage') {
        return tabParam;
      }
    }
    return 'employees';
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  
  // Dialog state for viewing eSIM details (hoisted here to survive EmployeeTable re-renders)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedEsim, setSelectedEsim] = useState<any>(null);
  
  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(window.location.search);
    if (value !== 'employees') {
      params.set('tab', value);
    } else {
      params.delete('tab');
    }
    const newSearch = params.toString();
    const newUrl = newSearch ? `${location}?${newSearch}` : location.split('?')[0];
    window.history.replaceState({}, '', newUrl);
  };
  
  // Get admin currency context
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency with admin currency
  const formatCurrencyAmount = (amount: number) => {
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(amount, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };


  const { data: company, isLoading: companyLoading } = useQuery<ApiResponse<Company & { companyName?: string }>>({
    queryKey: ['/api/company'],
    enabled: !!user?.companyId && !user?.isSuperAdmin, // Don't fetch company for super admin
    retry: 5,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    staleTime: 30000 // Refetch after 30 seconds
  });

  // EmployeeTable now handles its own data fetching with SSE
  // We fetch employees here only for dashboard stats
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    enabled: !!user?.companyId,
    staleTime: 1000 * 60 * 5, // 5 minutes - SSE handles real-time updates
    refetchOnWindowFocus: false,
    refetchOnMount: false // Let SSE handle updates
  });

  const { data: plans = [] } = useQuery<EsimPlan[]>({
    queryKey: ['/api/esim/plans'],
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });

  const { data: purchasedEsimsResponse = { data: [] } } = useQuery<ApiResponse<PurchasedEsim[]>>({
    queryKey: ['/api/esim/purchased'],
    staleTime: 1000 * 60 * 5, // 5 minutes - SSE handles real-time updates
    refetchOnWindowFocus: false,
    refetchOnMount: false // Let SSE handle updates
  });

  const purchasedEsims: PurchasedEsim[] = purchasedEsimsResponse?.data || [];

  // Count eSIMs by status for the dashboard display
  // Use the comprehensive plan calculation system instead of simple most recent logic
  const esimStatusCounts = {
    active: 0,
    waiting: 0,
    inactive: 0
  };

  // Calculate status counts based on ALL eSIMs (not just most recent)
  employees.forEach(employee => {
    // Get ALL employee eSIMs (including cancelled ones for proper counting)
    const employeeEsims = purchasedEsims.filter((esim: PurchasedEsim) => esim.employeeId === employee.id);
    
    if (employeeEsims.length === 0) {
      // No eSIMs at all for this employee
      return;
    }
    
    // Count each eSIM individually based on its current status
    employeeEsims.forEach((esim: PurchasedEsim) => {
      if (isEsimCancelledOrRefunded(esim)) {
        // Cancelled eSIMs don't count towards any counter
        return;
      }
      
      if (esim.status === 'activated' || esim.status === 'active') {
        esimStatusCounts.active++;
      } else if (esim.status === 'waiting_for_activation') {
        esimStatusCounts.waiting++;
      } else if (esim.status === 'expired' || esim.status === 'cancelled') {
        esimStatusCounts.inactive++;
      } else {
        // Other statuses (pending, error, etc.) count as inactive
        esimStatusCounts.inactive++;
      }
    });
  });

  // Count employees by their plan status
  const employeeStatusCounts = {
    active: 0,
    inactive: 0
  };

  // Count employees based on whether they have any plans (active or waiting)
  employees.forEach(employee => {
    const planInfo = getEmployeePlanInfo(employee.id, purchasedEsims, plans);
    
    // Employee is active if they have any plans (active or waiting for activation)
    if (planInfo.activePlans && planInfo.activePlans.length > 0) {
      // Check if any of their plans are not cancelled
      const hasNonCancelledPlans = planInfo.activePlans.some(plan => {
        const esim = purchasedEsims.find((e: PurchasedEsim) => e.id === plan.esimId);
        return esim && !isEsimCancelledOrRefunded(esim);
      });
      
      if (hasNonCancelledPlans) {
        employeeStatusCounts.active++;
      } else {
        employeeStatusCounts.inactive++;
      }
    } else {
      // No plans at all - employee is inactive
      employeeStatusCounts.inactive++;
    }
  });

  // Status counts calculated for dashboard metrics

  // Get wallet transactions for spending calculation
  const { data: walletTransactions = [] } = useQuery<WalletTransaction[]>({
    queryKey: ['/api/wallet/transactions'],
  });

  // Calculate total spending based on all purchases minus all refunds for the current month
  const totalSpending = (() => {
    // Get the first and last days of the current month
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Format as date strings for logging
    const startDateStr = currentMonthStart.toISOString().split('T')[0];
    const endDateStr = currentMonthEnd.toISOString().split('T')[0];

    // Filter transactions to only include those from the current month
    const currentMonthTransactions = walletTransactions.filter(tx => {
      const txDate = new Date(tx.createdAt);
      return txDate >= currentMonthStart && txDate <= currentMonthEnd;
    });
    
    // Calculate total revenue impact from eSIM-related transactions
    let totalRevenueImpact = 0;
    let transactionCount = 0;

    for (const tx of currentMonthTransactions) {
      if (tx.description && tx.description.toLowerCase().includes('esim')) {
        const amount = Number(tx.amount);
        
        // For purchases (debits): amount is negative, revenue impact is positive
        // For refunds (credits): amount is positive, revenue impact is negative
        let revenueImpact = 0;
        
        if (tx.type === 'debit' && tx.description.toLowerCase().includes('purchase')) {
          // Purchase: negative amount becomes positive revenue impact
          revenueImpact = Math.abs(amount);
        } else if (tx.type === 'credit' && tx.description.toLowerCase().includes('refund')) {
          // Refund: positive amount becomes negative revenue impact
          revenueImpact = -Math.abs(amount);
        }
        
        totalRevenueImpact += revenueImpact;
        transactionCount++;
      }
    }

    // Final spending calculation complete

    return totalRevenueImpact;
  })();

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-full min-w-full w-full">
        {/* Page header with welcome message */}
        <div className="bg-white rounded-2xl shadow-sm border border-[hsl(168,75%,90%)] p-6 sm:p-8 mb-6" data-testid="dashboard-header">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-base text-[hsl(168,75%,38%)] font-medium mb-1">Welcome to</h2>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center">
                {user?.isSuperAdmin ? 'PLATFORM CONTROL' : 
                 (company?.data?.name ? company.data.name.toUpperCase() : 
                  (companyLoading ? 'LOADING...' : 
                   (user?.companyId ? 'COMPANY DASHBOARD' : 'YOUR DASHBOARD')))}
                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[hsl(168,75%,90%)] text-[hsl(168,75%,38%)]">
                  {user?.isSuperAdmin ? 'Super Admin' : 'Business'}
                </span>
              </h1>
              <p className="text-gray-500 mt-1">
                {user?.isSuperAdmin ? 'Full platform administration and monitoring' : 'Manage your global connectivity in one place'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
              <div data-testid="button-add-employee">
                <EmployeeAddButton />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Total Spending */}
          <Card className="bg-white border border-[hsl(168,75%,85%)] rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200" data-testid="monthly-spending-card">
            <CardHeader className="pb-0 pt-5 px-5">
              <CardTitle className="flex items-center text-gray-800 font-semibold">
                <span className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(168,75%,95%)] text-[hsl(168,75%,38%)]">
                  <DollarSign className="h-5 w-5" />
                </span>
                <span>Monthly Spending</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pt-3 pb-5">
              <div className="flex items-baseline">
                <p className="text-3xl font-bold text-[hsl(168,75%,38%)]">{formatCurrencyAmount(totalSpending)}</p>
                {adminCurrency === 'AED' && <span className="ml-2 text-sm text-gray-500">AED</span>}
              </div>
              <p className="text-xs text-gray-500 mt-1">Current billing period</p>
            </CardContent>
          </Card>

          {/* eSIM Status */}
          <Card className="bg-white border border-[hsl(15,100%,85%)] rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200" data-testid="esim-status-card">
            <CardHeader className="pb-0 pt-5 px-5">
              <CardTitle className="flex items-center text-gray-800 font-semibold">
                <span className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(15,100%,95%)] text-[hsl(15,100%,65%)]">
                  <Globe className="h-5 w-5" />
                </span>
                <span>eSIM Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pt-3 pb-5">
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Active</p>
                  <div className="flex items-baseline">
                    <p className="text-2xl font-bold text-[hsl(168,75%,38%)]">{esimStatusCounts.active}</p>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Waiting</p>
                  <div className="flex items-baseline">
                    <p className="text-2xl font-bold text-[hsl(48,100%,55%)]">{esimStatusCounts.waiting}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employee Counter */}
          <Card className="bg-white border border-[hsl(190,90%,75%)] rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200" data-testid="employees-count-card">
            <CardHeader className="pb-0 pt-5 px-5">
              <CardTitle className="flex items-center text-gray-800 font-semibold">
                <span className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(190,90%,95%)] text-[hsl(190,90%,60%)]">
                  <User className="h-5 w-5" />
                </span>
                <span>Employees</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pt-3 pb-5">
              <div className="flex justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Active</p>
                  <div className="flex items-baseline">
                    <p className="text-2xl font-bold text-[hsl(168,75%,38%)]">{employeeStatusCounts.active}</p>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Inactive</p>
                  <div className="flex items-baseline">
                    <p className="text-2xl font-bold text-[hsl(15,15%,60%)]">{employeeStatusCounts.inactive}</p>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">Total</p>
                  <div className="flex items-baseline">
                    <p className="text-2xl font-bold text-[hsl(220,85%,55%)]">{employeeStatusCounts.active + employeeStatusCounts.inactive}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main sections with tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-[hsl(168,75%,85%)] p-1 w-full">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="border-b border-[hsl(168,75%,90%)]">
              <TabsList className="flex w-full bg-transparent h-14 gap-4 px-5">
                <TabsTrigger 
                  value="employees" 
                  className="flex items-center gap-2 data-[state=active]:border-b-2 data-[state=active]:border-[hsl(168,75%,38%)] data-[state=active]:text-[hsl(168,75%,38%)] data-[state=active]:font-medium rounded-none px-1 py-3 hover:text-[hsl(168,75%,45%)] transition-colors text-gray-600"
                  data-testid="employees-tab"
                >
                  <User className="h-4 w-4" />
                  Employees
                </TabsTrigger>
                <TabsTrigger 
                  value="esim" 
                  className="flex items-center gap-2 data-[state=active]:border-b-2 data-[state=active]:border-[hsl(168,75%,38%)] data-[state=active]:text-[hsl(168,75%,38%)] data-[state=active]:font-medium rounded-none px-1 py-3 hover:text-[hsl(168,75%,45%)] transition-colors text-gray-600"
                  data-testid="bulk-assignment-tab"
                >
                  <Globe className="h-4 w-4" />
                  Bulk Assignment
                </TabsTrigger>
                <TabsTrigger 
                  value="usage" 
                  className="flex items-center gap-2 data-[state=active]:border-b-2 data-[state=active]:border-[hsl(168,75%,38%)] data-[state=active]:text-[hsl(168,75%,38%)] data-[state=active]:font-medium rounded-none px-1 py-3 hover:text-[hsl(168,75%,45%)] transition-colors text-gray-600"
                  data-testid="usage-monitor-tab"
                >
                  <TrendingUp className="h-4 w-4" />
                  Usage Monitor
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab content */}
            <div className="p-2 sm:p-4">
              <TabsContent value="employees" className="m-0">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-800">Employee Overview</h2>
                    <div className="flex gap-2">
                      <span className="px-2 py-0.5 text-xs font-medium bg-[hsl(168,75%,95%)] text-[hsl(168,75%,38%)] rounded-full">
                        {employeeStatusCounts.active} active
                      </span>
                      <span className="px-2 py-0.5 text-xs font-medium bg-[hsl(15,15%,95%)] text-[hsl(15,15%,60%)] rounded-full">
                        {employeeStatusCounts.inactive} inactive
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg">
                  <EmployeeTable 
                    dialogState={{
                      showDetailsDialog,
                      setShowDetailsDialog,
                      selectedEmployee,
                      setSelectedEmployee,
                      selectedEsim,
                      setSelectedEsim
                    }}
                  />
                </div>
              </TabsContent>

              <TabsContent value="esim" className="m-0 space-y-6">
                {/* Plans section */}
                <div>
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Available eSIM Plans</h2>
                    <p className="text-sm text-gray-500">Select from our global range of data plans for your employees</p>
                  </div>
                  
                  <div className="bg-white overflow-hidden rounded-lg">
                    <PlanComparison plans={plans ?? []} />
                  </div>
                </div>

              </TabsContent>

              <TabsContent value="usage" className="m-0">
                <div className="bg-white rounded-lg">
                  <UsageMonitor />
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-center gap-4 mt-8">
          <Dialog open={isContactFormOpen} onOpenChange={setIsContactFormOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="px-6 py-3 text-sm font-medium">
                Contact Us
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <ContactForm
                companyName={company?.data?.name || company?.data?.companyName || ""}
                userEmail={user?.email || ""}
                userName={(user as ExtendedUser)?.fullName || user?.username || ""}
                onClose={() => setIsContactFormOpen(false)}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={isFeedbackFormOpen} onOpenChange={setIsFeedbackFormOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="px-6 py-3 text-sm font-medium">
                Send Feedback
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <FeedbackForm
                companyName={company?.data?.name || company?.data?.companyName || ""}
                userEmail={user?.email || ""}
                userName={(user as ExtendedUser)?.fullName || user?.username || ""}
                onClose={() => setIsFeedbackFormOpen(false)}
              />
            </DialogContent>
          </Dialog>

          <Button 
            variant="outline" 
            className="px-6 py-3 text-sm font-medium"
            onClick={() => setLocation('/legal')}
          >
            Legal
          </Button>
        </div>
      </div>

    </DashboardLayout>
  );
}