import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { Company } from "@shared/schema";
import { useAdminCurrency } from "@/hooks/use-admin-currency";
import { convertCurrency, formatCurrency } from "@shared/utils/currency";

export default function RevenueChart({ companies }: { companies?: Company[] }) {
  // Use admin currency from context with fallback
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency for display using admin selected currency
  const formatCurrencyAmount = (amount: number) => {
    // Fallback to USD if adminCurrency is undefined (during initial render)
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(amount, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };
  
  // Get the monthly revenue data from the admin trend-data API
  const { data: revenueData, isLoading } = useQuery({
    queryKey: ['/api/admin/trend-data'],
    queryFn: async () => {
      const response = await fetch('/api/admin/trend-data?metric=revenue');
      if (!response.ok) {
        throw new Error('Failed to fetch revenue data');
      }
      const jsonData = await response.json();
      return jsonData.data; // Extract the data array from the response
    }
  });

  // Create a map of month names to their numbers for sorting
  const monthMap: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };
  
  // Format and sort the data
  const chartData = revenueData ? [...revenueData]
    .sort((a, b) => {
      // Extract month and year
      const [aMonth, aYear] = a.date.split(' ');
      const [bMonth, bYear] = b.date.split(' ');
      
      // Compare years first
      if (aYear !== bYear) {
        return parseInt(aYear) - parseInt(bYear);
      }
      
      // Then compare months
      return monthMap[aMonth] - monthMap[bMonth];
    })
    .map(item => {
      // Convert revenue to admin currency
      const targetCurrency = adminCurrency || 'USD';
      const convertedRevenue = convertCurrency(item.value, 'USD', targetCurrency);
      return {
        month: item.date.split(' ')[0], // Just the month name
        revenue: convertedRevenue,
      };
    }) : [];

  if (isLoading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <XAxis dataKey="month" />
          <YAxis 
            tickFormatter={(value) => formatCurrencyAmount(value)}
          />
          <Tooltip formatter={(value) => [typeof value === 'number' ? formatCurrencyAmount(value) : value, 'Revenue']} />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="hsl(var(--primary))"
            name={`Revenue (${(adminCurrency || 'USD')})`}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
