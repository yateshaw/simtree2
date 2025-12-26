import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import SadminLayout from '@/components/layout/SadminLayout';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, ChevronLeft } from 'lucide-react';
import type { WalletTransaction, Wallet } from '@shared/schema';
import { useAdminCurrency } from '@/hooks/use-admin-currency';
import { convertCurrency, formatCurrency } from '@shared/utils/currency';

// Extended transaction type
type CompanyTransaction = WalletTransaction & {
  walletType?: string;
  companyId?: number;
  companyName?: string;
  walletId?: number;
};

export default function CompanyTransactionsPage() {
  const [location, setLocation] = useLocation();
  const [companyInfo, setCompanyInfo] = useState<{ id: number; name: string } | null>(null);
  
  // Get admin currency using the global currency manager
  const { adminCurrency } = useAdminCurrency();
  
  
  // Parse company ID and name from URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const name = params.get('name');
    
    if (id && name) {
      setCompanyInfo({
        id: parseInt(id),
        name: decodeURIComponent(name)
      });
    }
  }, []);
  
  // Get all wallets for reference (used to find company IDs)
  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ['/api/admin/wallets'],
    enabled: !!companyInfo?.id,
  });

  // Use the dedicated company transactions API endpoint
  const { data: transactions = [], isLoading } = useQuery<CompanyTransaction[]>({
    queryKey: ['/api/admin/company-transactions', companyInfo?.id],
    queryFn: () => apiRequest(`/api/admin/company-transactions/${companyInfo?.id}`),
    // Only fetch if we have a company ID
    enabled: !!companyInfo?.id,
  });

  // Calculate balance from transactions to ensure accuracy
  const calculatedBalance = transactions.reduce((sum, tx) => {
    const amount = parseFloat(tx.amount) || 0;
    if (tx.type === 'credit') {
      return sum + amount;
    } else if (tx.type === 'debit') {
      return sum - Math.abs(amount); // Ensure debit amounts are subtracted
    }
    return sum;
  }, 0);
  
  // Format currency with admin currency
  const formatCurrencyAmount = React.useCallback((amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(numAmount, 'USD', targetCurrency);
    console.log(`[formatCurrencyAmount] adminCurrency=${adminCurrency}, converting ${numAmount} USD -> ${convertedAmount} ${targetCurrency}`);
    const formatted = formatCurrency(convertedAmount, targetCurrency);
    console.log(`[formatCurrencyAmount] Formatted result: ${formatted}`);
    return formatted;
  }, [adminCurrency]);

  return (
    <SadminLayout>
      <div className="space-y-6">
        <div className="container mx-auto max-w-6xl">
          <Card className="shadow-md border-0 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="text-indigo-700 border-indigo-200 mb-2"
                    onClick={() => setLocation('/admin/wallet/companies')}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back to Wallets
                  </Button>
                  <CardTitle className="flex items-center gap-2 text-indigo-800">
                    {companyInfo ? companyInfo.name : 'Company'} Wallet Transactions
                  </CardTitle>
                  <CardDescription className="text-indigo-600 flex items-center justify-between">
                    <span>Complete history of all wallet transactions</span>
                    <span className="font-semibold text-lg bg-indigo-50 px-3 py-1 rounded-md text-indigo-800">
                      Balance: {formatCurrencyAmount(calculatedBalance)}
                    </span>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Skeleton className="h-64 w-full" />
                  </div>
                ) : transactions.length > 0 ? (
                  <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                    {/* Statement-like layout */}
                    <div className="border-t border-b">
                      {/* Header */}
                      <div className="grid grid-cols-6 py-3 px-4 bg-gray-50 border-b text-sm font-medium">
                        <div>Date</div>
                        <div className="col-span-2">Description</div>
                        <div>Wallet Type</div>
                        <div>Type</div>
                        <div className="text-right">Amount</div>
                      </div>
                      
                      {/* Transactions */}
                      <div className="divide-y">
                        {transactions.map((tx) => (
                          <div key={tx.id} className="grid grid-cols-6 py-3 px-4 text-sm hover:bg-gray-50">
                            <div className="text-gray-600">
                              {new Date(tx.createdAt).toLocaleString().split(',')[0]}
                              <div className="text-xs text-gray-500">
                                {new Date(tx.createdAt).toLocaleString().split(',')[1]?.trim()}
                              </div>
                            </div>
                            <div className="col-span-2">
                              {tx.description || 'N/A'}
                            </div>
                            <div>
                              <span className="capitalize">
                                {tx.walletType || 'general'}
                              </span>
                            </div>
                            <div>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                tx.type === 'credit' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {tx.type === 'credit' ? 'Credit' : 'Debit'}
                              </span>
                            </div>
                            <div className="text-right font-medium">
                              <span className={tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                                {tx.type === 'credit' ? '+' : '-'}{formatCurrencyAmount(Math.abs(Number(tx.amount)))}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-gray-500">
                    No transactions found for this company
                  </div>
                )}
              </CardContent>
              
              <CardFooter className="bg-indigo-50 flex justify-end gap-2 py-3">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </CardFooter>
            </Card>
        </div>
      </div>
    </SadminLayout>
  );
}