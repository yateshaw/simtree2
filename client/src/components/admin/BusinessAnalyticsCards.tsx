import React, { useMemo, useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building, Users, DollarSign, UserRound, BarChart3, TrendingUp, X } from "lucide-react";
import type { Employee, Company } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import MetricTrendChart, { MetricDataPoint } from "./MetricTrendChart";
import { useQuery } from "@tanstack/react-query";
import { useEventSource } from "@/hooks/useEventSource";
import { EventTypes } from "@/lib/events";
import { useAdminCurrency } from "@/hooks/use-admin-currency";
import { formatCurrency, convertCurrency } from "@shared/utils/currency";

interface BusinessAnalyticsCardsProps {
  companies?: Company[];
  employees?: (Employee & { companyName?: string })[];
  purchasedEsims?: any[];
}

export default function BusinessAnalyticsCards({ 
  companies = [], 
  employees = [],
  purchasedEsims = []
}: BusinessAnalyticsCardsProps) {
  // State for dialog
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [selectedMetric, setSelectedMetric] = useState<{
    title: string;
    value: number;
    description: string;
    valueLabel: string;
    chartType: "line" | "area" | "bar";
    color: string;
    valueFormatter?: (value: number) => string;
    metricKey?: string;
  } | null>(null);

  // Fetch trend data for the selected metric
  const { data: trendData, isLoading: trendLoading } = useQuery<{ success: boolean, data: MetricDataPoint[] }>({
    queryKey: ['/api/admin/trend-data', selectedMetric?.metricKey],
    enabled: !!selectedMetric?.metricKey && isDialogOpen,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!selectedMetric?.metricKey) return { success: false, data: [] };
      const response = await fetch(`/api/admin/trend-data?metric=${selectedMetric.metricKey}&months=6`);
      return response.json();
    }
  });
  
  // Use admin currency from context with fallback
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency for display using admin selected currency
  const formatCurrencyAmount = (amount: number) => {
    // Fallback to USD if adminCurrency is undefined (during initial render)
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(amount, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };
  
  // Calculate business metrics
  const businessCompanies = useMemo(() => companies.filter(company => 
    company.name !== "Simtree" && company.name?.toLowerCase() !== "simtree"
  ), [companies]);
  const totalCompanies = businessCompanies.length;
  const totalEmployees = employees.length;
  
  // State for real-time spending updates
  const [realtimeSpending, setRealtimeSpending] = useState<number | null>(null);

  // Use SSE for real-time spending updates instead of polling
  const { events } = useEventSource({
    url: '/api/events',
    withCredentials: true,
    enabled: true
  });

  // Process SSE events for spending updates
  useEffect(() => {
    const spendingEvents = events.filter(event => event.type === EventTypes.SPENDING_UPDATE);
    if (spendingEvents.length > 0) {
      const latestSpendingEvent = spendingEvents[spendingEvents.length - 1];
      if (latestSpendingEvent.data?.totalSpending !== undefined) {
        setRealtimeSpending(latestSpendingEvent.data.totalSpending);
      }
    }
  }, [events]);

  // Fetch current spending from server
  const { data: serverSpending } = useQuery<{data?: {totalSpending?: number}}>({
    queryKey: ['/api/spending/current'],
    refetchInterval: realtimeSpending === null ? 30000 : false, // Poll until SSE connects
  });

  // Fallback: Fetch wallet transactions for initial load only
  const { data: walletTransactions = [] } = useQuery<any[]>({
    queryKey: ['/api/wallet/transactions'],
    // Only fetch once on mount, then rely on SSE for updates
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false
  });

  // Wallet transactions loaded for spending calculation

  // Calculate total spending based on actual customer revenue (eSIM sales)
  const calculatedSpending = useMemo(() => {
    // Get the first and last days of the current month
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Calculating spending for current month

    // Filter transactions to only include those from the current month
    const currentMonthTransactions = walletTransactions.filter((tx: any) => {
      const txDate = new Date(tx.createdAt);
      return txDate >= currentMonthStart && txDate <= currentMonthEnd;
    });

    // Processing transactions for current month

    // Focus on actual customer sales - transactions that represent revenue from customers
    let totalCustomerRevenue = 0;
    let transactionCount = 0;

    for (const tx of currentMonthTransactions) {
      if (tx.description) {
        const amount = Number(tx.amount);
        let revenueImpact = 0;
        const description = tx.description.toLowerCase();
        
        // Processing transaction
        
        // Look for actual customer sales transactions
        if (tx.type === 'credit' && 
            description.includes('esim sale to') && 
            !description.includes('simtree')) {
          // This is revenue from a customer sale
          revenueImpact = Math.abs(amount);
          transactionCount++;
          
          // Customer sale processed
        } else if (tx.type === 'credit' && 
                   description.includes('refund to') && 
                   !description.includes('simtree')) {
          // This is a refund to a customer (negative revenue)
          revenueImpact = -Math.abs(amount);
          transactionCount++;
          
          if (import.meta.env.DEV) {
            console.log(`  ✓ Customer Refund ${transactionCount}: ${tx.description}, Amount: ${amount}, Revenue Impact: ${revenueImpact}`);
          }
        }
        
        totalCustomerRevenue += revenueImpact;
      }
    }

    return totalCustomerRevenue;
  }, [walletTransactions]);

  // Use real-time spending if available, otherwise use server calculation, then fall back to calculated
  const serverSpendingValue = serverSpending?.data?.totalSpending || 0;
  const totalSpending = realtimeSpending !== null ? realtimeSpending : serverSpendingValue;
  
  const avgSpendingPerCompany = totalCompanies > 0 ? totalSpending / totalCompanies : 0;
  const avgSpendingPerEmployee = totalEmployees > 0 ? totalSpending / totalEmployees : 0;
  const avgEmployeesPerCompany = totalCompanies > 0 ? totalEmployees / totalCompanies : 0;
  
  // Function to open dialog with a specific metric
  const openMetricDialog = (metric: {
    title: string;
    value: number;
    description: string;
    valueLabel: string;
    chartType: "line" | "area" | "bar";
    color: string;
    valueFormatter?: (value: number) => string;
    metricKey?: string;
  }) => {
    setSelectedMetric(metric);
    setIsDialogOpen(true);
  };
  
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Row 1: Main Stats */}
        <Card 
          className="border-0 shadow-sm rounded-xl bg-white hover:shadow-md transition-all cursor-pointer" 
          onClick={() => openMetricDialog({
            title: "Company Growth",
            value: totalCompanies,
            description: "Monthly registered companies",
            valueLabel: "Companies",
            chartType: "bar",
            color: "#3b82f6", // blue-500
            metricKey: "companies"
          })}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Total Companies</p>
                <h3 className="text-3xl font-bold text-gray-900">{totalCompanies}</h3>
                <p className="text-xs text-gray-500 mt-1">Registered business accounts</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Building className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className="border-0 shadow-sm rounded-xl bg-white hover:shadow-md transition-all cursor-pointer" 
          onClick={() => openMetricDialog({
            title: "Employee Growth",
            value: totalEmployees,
            description: "Monthly employee registrations",
            valueLabel: "Employees",
            chartType: "area",
            color: "#6366f1", // indigo-500
            metricKey: "employees"
          })}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Total Employees</p>
                <h3 className="text-3xl font-bold text-gray-900">{totalEmployees}</h3>
                <p className="text-xs text-gray-500 mt-1">Active travel profiles</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className="border-0 shadow-sm rounded-xl bg-white hover:shadow-md transition-all cursor-pointer" 
          onClick={() => openMetricDialog({
            title: "Revenue Growth",
            value: totalSpending,
            description: "Monthly revenue from all clients",
            valueLabel: "Revenue",
            chartType: "line",
            color: "#10b981", // emerald-500
            valueFormatter: formatCurrencyAmount,
            metricKey: "revenue"
          })}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Total Spending</p>
                <h3 className="text-3xl font-bold text-gray-900">{formatCurrencyAmount(totalSpending)}</h3>
                <p className="text-xs text-gray-500 mt-1">Combined client spending</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Row 2: Average Stats */}
        <Card 
          className="border-0 shadow-sm rounded-xl bg-white hover:shadow-md transition-all cursor-pointer" 
          onClick={() => openMetricDialog({
            title: "Team Size Trends",
            value: parseFloat(avgEmployeesPerCompany.toFixed(1)),
            description: "Average employees per company over time",
            valueLabel: "Employees",
            chartType: "line",
            color: "#4b5563", // gray-600
            metricKey: "avg_employees_per_company"
          })}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Avg. Employees per Company</p>
                <h3 className="text-2xl font-bold text-gray-900">{avgEmployeesPerCompany.toFixed(1)}</h3>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-blue-500">Team distribution</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className="border-0 shadow-sm rounded-xl bg-white hover:shadow-md transition-all cursor-pointer" 
          onClick={() => openMetricDialog({
            title: "Company Spending Trends",
            value: avgSpendingPerCompany,
            description: "Average spending per company over time",
            valueLabel: "Spending",
            chartType: "bar",
            color: "#8b5cf6", // purple-500
            valueFormatter: formatCurrencyAmount,
            metricKey: "avg_spending_per_company"
          })}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Avg. Spending per Company</p>
                <h3 className="text-2xl font-bold text-gray-900">{formatCurrencyAmount(avgSpendingPerCompany)}</h3>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-500">Company average</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Building className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className="border-0 shadow-sm rounded-xl bg-white hover:shadow-md transition-all cursor-pointer" 
          onClick={() => openMetricDialog({
            title: "Employee Spending Trends",
            value: avgSpendingPerEmployee,
            description: "Average spending per employee over time",
            valueLabel: "Spending",
            chartType: "area",
            color: "#f59e0b", // amber-500
            valueFormatter: formatCurrencyAmount,
            metricKey: "avg_spending_per_employee"
          })}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Avg. Spending per Employee</p>
                <h3 className="text-2xl font-bold text-gray-900">{formatCurrencyAmount(avgSpendingPerEmployee)}</h3>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-500">Employee average</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                <UserRound className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog for displaying trend data */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px] p-0">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-xl">
                {selectedMetric?.title}
              </DialogTitle>
              {/* Only use the DialogClose component, removing the duplicate X */}
            </div>
            <DialogDescription className="text-sm text-gray-500">
              {selectedMetric?.description}
            </DialogDescription>
          </DialogHeader>
          
          {selectedMetric && (
            <div className="px-6 pb-6">
              {trendLoading ? (
                <div className="flex justify-center items-center h-[350px] w-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                </div>
              ) : (
                <div className="h-[350px] w-full">
                  {Array.isArray(trendData?.data) && trendData?.data.length > 0 ? (
                    <MetricTrendChart
                      title={selectedMetric.title}
                      description={selectedMetric.description}
                      data={trendData?.data || []}
                      chartType={selectedMetric.chartType}
                      valueLabel={selectedMetric.valueLabel}
                      color={selectedMetric.color}
                      valueFormatter={selectedMetric.valueFormatter}
                      height={350}
                      hideCard={true}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center h-full w-full bg-gray-50 rounded-md">
                      <p className="text-gray-500 mb-1">No data available</p>
                      <p className="text-xs text-gray-400">
                        There is insufficient data to display this trend
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}