import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import DashboardLayout from "@/components/layout/DashboardLayout";
import { apiRequest } from '@/lib/queryClient';
import { Button } from "@/components/ui/button";
import { ChevronLeft, Download, Wallet } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from '@/components/ui/skeleton';
import type { WalletTransaction, Company } from "@shared/schema";
import { useAdminCurrency } from '@/hooks/use-admin-currency';
import { convertCurrency, formatCurrency, formatCurrencyForExport } from '@shared/utils/currency';

// Extended transaction type with additional properties
type WalletTransactionWithType = WalletTransaction & { 
  type: 'credit' | 'debit';
  companyName?: string;
  companyId?: number;
  relatedTransactionId?: number;
};

interface WalletTransactionsPageProps {
  params?: {
    walletType?: string;
  };
}

export default function WalletTransactionsPage({ params }: WalletTransactionsPageProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Get walletType and companyId from URL search params
  const searchParams = typeof window !== 'undefined' 
    ? new URLSearchParams(window.location.search) 
    : new URLSearchParams();
  const walletType = searchParams.get('walletType') || params?.walletType || 'general';
  const companyId = searchParams.get('companyId') ? parseInt(searchParams.get('companyId')!) : undefined;
  
  // Get admin currency context
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency with admin currency
  const formatCurrencyAmount = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(numAmount, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };
  
  // Get wallet balance
  const { data: walletData } = useQuery({
    queryKey: ['/api/wallet/balances-by-type', companyId],
    queryFn: () => companyId 
      ? apiRequest(`/api/wallet/balances-by-type?companyId=${companyId}`)
      : apiRequest('/api/wallets/all'),
  });
  
  // Calculate wallet balance for the specific wallet type
  const walletBalance = walletData && typeof walletData === 'object'
    ? (Array.isArray(walletData) 
        ? walletData.find(w => w.walletType === walletType)?.balance || "0.00"
        : walletData[walletType] || "0.00") 
    : "0.00";

  // Query transactions for this specific wallet type
  const transactionEndpoint = companyId
    ? `/api/wallet/transactions?walletType=${walletType}&companyId=${companyId}`
    : `/api/wallet/transactions?walletType=${walletType}`;

  const { data: rawTransactions = [], isLoading } = useQuery<WalletTransactionWithType[]>({
    queryKey: ['/api/wallet/transactions', walletType, companyId],
    queryFn: () => apiRequest(transactionEndpoint),
    // Only fetch when dialog is open
    enabled: !!walletType,
  });

  // Sort transactions by date (newest first)
  const transactions = [...rawTransactions].sort((a, b) => {
    try {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } catch (e) {
      return 0;
    }
  });
  
  // Get all wallet transactions to find related transactions
  const { data: allTransactions = [] } = useQuery<WalletTransactionWithType[]>({
    queryKey: ['/api/admin/wallet-transactions'],
    // Only fetch when we have transactions with relatedTransactionId
    enabled: transactions.some(tx => tx.relatedTransactionId),
  });

  // Get all companies for accurate name mapping
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
  });

  // Handle export to CSV
  const handleExportCSV = () => {
    if (transactions.length === 0) {
      toast({
        title: "No data to export",
        description: "There are no transactions to export.",
        variant: "destructive",
      });
      return;
    }
    
    // Create CSV content
    const headers = ['Date', 'Description', 'Company', 'Amount', 'Type'];
    const rows = transactions.map(tx => {
      // Find the purchasing company for eSIM sales
      const purchasingCompany = tx.type === 'credit' && tx.description?.includes("eSIM Sale") && tx.relatedTransactionId
        ? allTransactions.find(t => t.id === tx.relatedTransactionId)?.companyName || 'Unknown'
        : null;
      
      const targetCurrency = adminCurrency || 'USD';
      const absAmount = Math.abs(Number(tx.amount));
      const convertedAmount = convertCurrency(absAmount, 'USD', targetCurrency);
        
      return [
        new Date(tx.createdAt).toLocaleString(),
        tx.description || 'N/A',
        purchasingCompany || tx.companyName || 'N/A',
        formatCurrencyForExport(convertedAmount, targetCurrency),
        tx.type
      ];
    });
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${walletType}-wallet-transactions.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format wallet type for display
  const capitalizeWalletType = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);
  const formattedWalletType = capitalizeWalletType(walletType);

  return (
    <DashboardLayout>
      <div className="container mx-auto max-w-6xl py-8">
        {/* Wallet Balance Card */}
        <Card className="shadow-md border mb-6">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 pb-4">
            <CardTitle className="text-xl">Current Balance</CardTitle>
            <CardDescription>
              {formattedWalletType} wallet balance
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <div className="flex items-center">
              <Wallet className="h-10 w-10 mr-4 text-primary" />
              <div>
                <h3 className="text-3xl font-bold">{formatCurrencyAmount(walletBalance)}</h3>
                <Badge variant={walletType === 'general' ? 'default' : walletType === 'profit' ? 'secondary' : 'outline'} className="mt-2">
                  {formattedWalletType}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Transactions Card */}
        <Card className="shadow-md border">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <Button 
                  variant="outline"
                  size="sm"
                  className="mb-2"
                  onClick={() => setLocation('/wallet')}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back to Wallets
                </Button>
                <CardTitle className="flex items-center gap-2">
                  {formattedWalletType} Wallet Transactions
                </CardTitle>
                <CardDescription className="flex items-center justify-between">
                  <span>Complete history of all {formattedWalletType.toLowerCase()} wallet transactions</span>
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
              <div className="w-full">
                {/* Statement-like layout */}
                <div className="border-t border-b">
                  {/* Header */}
                  <div className="grid grid-cols-5 py-3 px-4 bg-muted/50 border-b text-sm font-medium">
                    <div>Date</div>
                    <div className="col-span-2">Description</div>
                    <div>Company</div>
                    <div className="text-right">Amount</div>
                  </div>
                  
                  {/* Transactions */}
                  <div className="divide-y">
                    {transactions.map((tx) => {
                      // Find the purchasing company for eSIM sales
                      const purchasingCompany = tx.type === 'credit' && tx.description?.includes("eSIM Sale") && tx.relatedTransactionId
                        ? allTransactions.find(t => t.id === tx.relatedTransactionId)?.companyName || 'Unknown'
                        : null;
                      
                      return (
                        <div key={tx.id} className="grid grid-cols-5 py-3 px-4 text-sm">
                          <div className="text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleString().split(',')[0]}
                            <br/>
                            {new Date(tx.createdAt).toLocaleString().split(',')[1]?.trim()}
                          </div>
                          <div className="col-span-2">
                            {tx.description || 'N/A'}
                          </div>
                          <div>
                            {(() => {
                              // For transactions related to eSIM Sales or purchases
                              // First, check for target company from related transaction
                              if (tx.description?.includes("eSIM Sale") || 
                                  tx.description?.includes("Refund to") ||
                                  tx.description?.includes("cancelled eSIM")) {
                                  
                                // If we have a related transaction with a company name, use that
                                if (tx.relatedTransactionId) {
                                  const relatedTx = allTransactions.find(t => t.id === tx.relatedTransactionId);
                                  
                                  // If we find a transaction with a company name, use it
                                  if (relatedTx?.companyName && 
                                      relatedTx.companyName !== 'Simtree' && 
                                      relatedTx.companyName !== 'Unknown') {
                                    return relatedTx.companyName;
                                  }
                                }
                                
                                // Look for company name in the description (for legacy transactions)
                                if (tx.description?.includes("eSIM Sale to")) {
                                  const match = tx.description.match(/eSIM Sale to ([^:]+):/);
                                  if (match && match[1]) return match[1].trim();
                                }
                                
                                if (tx.description?.includes("Refund to")) {
                                  const match = tx.description.match(/Refund to ([^:]+):/);
                                  if (match && match[1]) return match[1].trim();
                                }
                                
                                // For older records - infer company based on employee
                                if (tx.description?.includes("Juan Pablo") || 
                                    tx.description?.includes("Marcos Molina")) {
                                  return "Yatecorp LLC";
                                } else if (tx.description?.includes("Gustavo")) {
                                  return "Cloutfit.ai";
                                }
                              }
                              
                              // For Stripe fee transactions that start with "companyName: Stripe fees..."
                              if (tx.description?.includes("Stripe fees")) {
                                const colonIndex = tx.description.indexOf(':');
                                if (colonIndex > 0) {
                                  const companyPrefix = tx.description.substring(0, colonIndex).trim();
                                  // Validate against companies list
                                  const matchingCompany = companies.find(c => 
                                    c.name.toLowerCase() === companyPrefix.toLowerCase() ||
                                    c.name.toLowerCase().includes(companyPrefix.toLowerCase()) ||
                                    companyPrefix.toLowerCase().includes(c.name.toLowerCase())
                                  );
                                  if (matchingCompany) {
                                    return matchingCompany.name;
                                  }
                                  // If it looks like a company name prefix, use it
                                  if (companyPrefix.length > 1 && companyPrefix.length < 50) {
                                    return companyPrefix;
                                  }
                                }
                              }
                              
                              // For coupon credits and other transactions that start with company name
                              if (tx.description?.includes("Simtree credit") ||
                                  tx.description?.includes("coupon:")) {
                                
                                // Most transactions have "Company: action" format
                                const companyPrefix = tx.description.split(':')[0]?.trim();
                                if (companyPrefix && 
                                    (companyPrefix.includes("LLC") || 
                                     companyPrefix.includes("Cloutfit") ||
                                     companyPrefix.includes("American"))) {
                                  return companyPrefix;
                                }
                              }
                              
                              // If this transaction has a companyName directly
                              if (tx.companyName && tx.companyName !== 'Unknown') {
                                return tx.companyName;
                              }
                              
                              // For specific known companies based on description
                              if (tx.description?.includes("Yatecorp")) {
                                return "Yatecorp LLC";
                              } else if (tx.description?.includes("Cloutfit")) {
                                return "Cloutfit.ai";
                              } else if (tx.description?.includes("American Trucks")) {
                                return "American Trucks";
                              }
                              
                              // Create dynamic company mapping from actual database data
                              const companyMap: Record<number, string> = {};
                              companies.forEach(company => {
                                companyMap[company.id] = company.name;
                              });
                              
                              // Use companyId if available - use real database company data
                              if (tx.companyId && tx.companyId > 1 && companyMap[tx.companyId]) {
                                return companyMap[tx.companyId];
                              }
                              
                              // Default fallback - try to make a best guess
                              return tx.description?.includes("Yatecorp") ? "Yatecorp LLC" : 
                                     tx.description?.includes("Cloutfit") ? "Cloutfit.ai" : 
                                     tx.description?.includes("American") ? "American Trucks" : 
                                     "Unknown";
                            })()}
                          </div>
                          <div className="text-right font-medium">
                            <span className={tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                              {tx.type === 'credit' ? '+' : '-'}{formatCurrencyAmount(Math.abs(Number(tx.amount)))}
                            </span>
                            <div className="mt-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                tx.type === 'credit' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {tx.type === 'credit' ? 'Credit' : 'Debit'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No transactions found for this wallet type
              </div>
            )}
          </CardContent>
          
          <CardFooter className="bg-gray-50 flex justify-end gap-2 py-3">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExportCSV}
              disabled={transactions.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardFooter>
        </Card>
      </div>
    </DashboardLayout>
  );
}