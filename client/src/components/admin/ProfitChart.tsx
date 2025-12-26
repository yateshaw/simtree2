import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Loader2, TrendingUp } from "lucide-react";
import type { Company, EsimPlan } from "@shared/schema";
import { formatCurrency } from "@/lib/utils/formatters";
import { useAdminCurrency } from "@/hooks/use-admin-currency";
import { convertCurrency, formatCurrency as formatCurrencyWithSymbol } from "@shared/utils/currency";

// We'll use dynamically loaded data from the API instead of hardcoded values

export default function ProfitChart({ companies }: { companies?: Company[] }) {
  // Use admin currency from context with fallback
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency for display using admin selected currency
  const formatCurrencyAmount = (amount: number) => {
    // Fallback to USD if adminCurrency is undefined (during initial render)
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(amount, 'USD', targetCurrency);
    return formatCurrencyWithSymbol(convertedAmount, targetCurrency);
  };
  
  // Fetch all plans to get actual margin data
  const { data: plansResponse, isLoading: isPlansLoading } = useQuery<{ success: boolean, data: EsimPlan[] }>({
    queryKey: ["/api/admin/plans"],
  });
  
  // Extract plans from the response
  const plans = plansResponse?.success ? plansResponse.data : [];
  
  // Calculate average margin across all plans
  const averageMargin = React.useMemo(() => {
    if (!plans || plans.length === 0) return 0.40; // Default to 40% if no plans
    
    const totalMargin = plans.reduce((sum, plan) => {
      const margin = plan.margin !== undefined ? Number(plan.margin) / 100 : 0;
      return sum + margin;
    }, 0);
    
    return totalMargin / plans.length;
  }, [plans]);

  // Format profit percentage for display
  const profitPercentage = (averageMargin * 100).toFixed(0);
  
  // Fetch revenue data from API
  const { data: revenueData, isLoading: isRevenueLoading } = useQuery({
    queryKey: ['/api/admin/trend-data/revenue'],
    queryFn: async () => {
      const response = await fetch('/api/admin/trend-data?metric=revenue');
      if (!response.ok) {
        throw new Error('Failed to fetch revenue data');
      }
      const jsonData = await response.json();
      return jsonData.data || [];
    }
  });

  // Create monthly profit data
  const chartData = React.useMemo(() => {
    if (!revenueData) return [];
    
    // Map revenue data to include profit and costs
    // In this business model costs are 0 and profit equals revenue
    // Convert all values to admin currency
    const targetCurrency = adminCurrency || 'USD';
    return revenueData.map((item: any) => {
      const convertedRevenue = convertCurrency(item.value || 0, 'USD', targetCurrency);
      return {
        month: item.date.split(' ')[0], // Just the month name
        revenue: convertedRevenue,
        costs: 0,
        profit: convertedRevenue,
      };
    });
  }, [revenueData]);
  
  // Calculate total profit from the current month
  const totalProfit = React.useMemo(() => {
    if (!chartData || chartData.length === 0) return 0;
    
    // Get current month - simplified to use the last month in the data
    const lastMonth = chartData[chartData.length - 1];
    return lastMonth?.profit || 0;
  }, [chartData]);
  
  // Get current month name
  const currentMonth = React.useMemo(() => {
    if (!chartData || chartData.length === 0) return "";
    
    // Use the last month in the data
    return chartData[chartData.length - 1]?.month || "";
  }, [chartData]);

  if (isPlansLoading || isRevenueLoading) {
    return (
      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-green-50 pb-3">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="text-green-600" size={20} />
            Profit Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex h-[300px] w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="bg-gradient-to-r from-gray-50 to-green-50 pb-3">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="text-green-600" size={20} />
          Profit Analysis
        </CardTitle>
        <CardDescription>
          Average profit margin of {profitPercentage}% {currentMonth ? `(${formatCurrencyAmount(totalProfit)} in ${currentMonth})` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{
                top: 10,
                right: 30,
                left: 0,
                bottom: 0,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis 
                tickFormatter={(value) => formatCurrencyAmount(value)}
              />
              <Tooltip formatter={(value: any) => [typeof value === 'number' ? formatCurrencyAmount(value) : value]} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#4F46E5" 
                fill="#4F46E588" 
                name="Revenue"
              />
              <Area 
                type="monotone" 
                dataKey="costs" 
                stroke="#F43F5E" 
                fill="#F43F5E88" 
                name="Costs"
              />
              <Area 
                type="monotone" 
                dataKey="profit" 
                stroke="#10B981" 
                fill="#10B98188" 
                name="Profit"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}