import React from 'react';
import SadminLayout from '@/components/layout/SadminLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, DollarSign, CreditCard, TrendingUp, BarChart } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

// Format price helper function
const formatPrice = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
};

interface RevenueData {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface Transaction {
  id: number;
  date: string;
  amount: number;
  type: string;
  description: string;
  status: string;
  companyName?: string;
  employeeName?: string;
}

export default function FinancialReports() {
  // Placeholder query for financial data - this would be replaced with actual API endpoint
  const { data: financialData, isLoading: isLoadingFinancial } = useQuery({
    queryKey: ['/api/admin/financial-summary'],
    queryFn: async () => {
      try {
        const result = await apiRequest('/api/admin/financial-summary');
        if (result.success) {
          return result.data;
        }
        return {
          totalRevenue: 0,
          totalExpenses: 0,
          totalProfit: 0,
          recentTransactions: []
        };
      } catch (error) {
        console.error("Error fetching financial data:", error);
        return {
          totalRevenue: 0,
          totalExpenses: 0,
          totalProfit: 0,
          recentTransactions: []
        };
      }
    }
  });

  // Monthly revenue data query
  const { data: revenueData, isLoading: isLoadingRevenue } = useQuery({
    queryKey: ['/api/admin/revenue-data'],
    queryFn: async () => {
      try {
        const result = await apiRequest('/api/admin/revenue-data');
        if (result.success) {
          return result.data;
        }
        return [];
      } catch (error) {
        console.error("Error fetching revenue data:", error);
        return [];
      }
    }
  });

  // Transactions data query
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/admin/transactions'],
    queryFn: async () => {
      try {
        const result = await apiRequest('/api/admin/transactions');
        if (result.success) {
          return result.data;
        }
        return [];
      } catch (error) {
        console.error("Error fetching transactions:", error);
        return [];
      }
    }
  });

  return (
    <SadminLayout>
      <div className="container mx-auto py-6">
        <h1 className="text-3xl font-bold mb-6">Financial Reports</h1>
        
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-3 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>
          
          {/* Overview Tab */}
          <TabsContent value="overview">
            {isLoadingFinancial ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatPrice(financialData?.totalRevenue || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      +12.5% from last month
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Expenses</CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatPrice(financialData?.totalExpenses || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      +2.1% from last month
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Profit</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatPrice(financialData?.totalProfit || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      +18.7% from last month
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
            
            <div className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Transactions</CardTitle>
                  <CardDescription>
                    The latest financial transactions across the platform
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingFinancial ? (
                    <div className="flex items-center justify-center p-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(financialData?.recentTransactions || []).length > 0 ? (
                          (financialData?.recentTransactions || []).map((transaction: Transaction) => (
                            <TableRow key={transaction.id}>
                              <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                              <TableCell>{transaction.description}</TableCell>
                              <TableCell>{transaction.companyName || 'N/A'}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  transaction.type === 'credit' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {transaction.type === 'credit' ? 'Credit' : 'Debit'}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                <span className={transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                                  {transaction.type === 'credit' ? '+' : '-'}{formatPrice(Math.abs(Number(transaction.amount)))}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                              No transactions found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Revenue Tab */}
          <TabsContent value="revenue">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Revenue</CardTitle>
                <CardDescription>
                  Revenue, expenses, and profit breakdown by month
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingRevenue ? (
                  <div className="flex items-center justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Expenses</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(revenueData || []).length > 0 ? (
                        (revenueData || []).map((month: RevenueData) => (
                          <TableRow key={month.month}>
                            <TableCell>{month.month}</TableCell>
                            <TableCell className="text-right">{formatPrice(month.revenue)}</TableCell>
                            <TableCell className="text-right">{formatPrice(month.expenses)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatPrice(month.profit)}
                            </TableCell>
                            <TableCell className="text-right">
                              {month.revenue > 0 
                                ? `${((month.profit / month.revenue) * 100).toFixed(1)}%` 
                                : '0%'}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                            No revenue data available
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Transactions Tab */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>All Transactions</CardTitle>
                <CardDescription>
                  Complete history of financial transactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingTransactions ? (
                  <div className="flex items-center justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(transactions || []).length > 0 ? (
                        (transactions || []).map((transaction: Transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                            <TableCell>{transaction.description}</TableCell>
                            <TableCell>{transaction.companyName || 'N/A'}</TableCell>
                            <TableCell>{transaction.employeeName || 'N/A'}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                transaction.type === 'credit' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {transaction.type === 'credit' ? 'Credit' : 'Debit'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                transaction.status === 'completed' 
                                  ? 'bg-green-100 text-green-800' 
                                  : transaction.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }`}>
                                {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              <span className={transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                                {transaction.type === 'credit' ? '+' : '-'}{formatPrice(Math.abs(Number(transaction.amount)))}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                            No transactions found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SadminLayout>
  );
}