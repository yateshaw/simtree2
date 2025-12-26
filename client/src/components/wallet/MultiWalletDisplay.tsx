import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WalletBalanceCard, WalletWithType, WalletTypeIcon, WalletTransactionWithType } from './WalletTypeDisplay';
import { apiRequest } from '@/lib/queryClient';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminCurrency } from '@/hooks/use-admin-currency';
import { convertCurrency, formatCurrency } from '@shared/utils/currency';

interface MultiWalletDisplayProps {
  companyId?: number;
  showTitle?: boolean;
}



// Map wallet types to proper display names
const getWalletDisplayName = (walletType: string) => {
  switch (walletType) {
    case 'general':
      return 'General';
    case 'profit':
      return 'Profit';
    case 'provider':
      return 'eSIM Access Payments';
    case 'stripe_fees':
      return 'Stripe Fees';
    case 'tax':
      return 'Tax';
    default:
      return walletType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
};

export function MultiWalletDisplay({ companyId, showTitle = true }: MultiWalletDisplayProps) {
  const [, setLocation] = useLocation();

  // Handle wallet click - navigate to the wallet transactions page
  const handleWalletClick = (walletType: string) => {
    // Construct URL with companyId as query parameter if available
    const url = companyId 
      ? `/wallet/wallet-transactions?walletType=${walletType}&companyId=${companyId}`
      : `/wallet/wallet-transactions?walletType=${walletType}`;
    
    setLocation(url);
  };

  // Use the correct wallet endpoints
  const queryKey = companyId
    ? ['/api/wallet/balances-by-type', companyId]
    : ['/api/wallets/all'];

  // Use the wallet-specific API endpoint to get typed wallet balances
  const endpoint = companyId
    ? `/api/wallet/balances-by-type?companyId=${companyId}`
    : '/api/wallets/all';

  // Add error handling and retry logic
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => apiRequest(endpoint),
    retry: 3,
    retryDelay: 1000,
  });

  // Get admin currency context
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency with admin currency
  const formatCurrencyAmount = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(numAmount, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-[100px] w-full" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-[80px] w-full" />
            <Skeleton className="h-[80px] w-full" />
            <Skeleton className="h-[80px] w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    console.error("Error loading wallet data:", error);
    return (
      <Alert variant="destructive">
        <AlertDescription>
          There was an error loading wallet data. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  // Add fallback mechanism for missing data
  const safeData = data || { general: 0, profit: 0, provider: 0, stripe_fees: 0, tax: 0 };
  
  if (!safeData) {
    console.warn("No wallet data available");
    return (
      <Alert>
        <AlertDescription>
          No wallet information available. Contact support if you believe this is an error.
        </AlertDescription>
      </Alert>
    );
  }

  // Handle different response formats
  let walletsByType: Record<string, any> = {};
  let totalBalance = 0;
  let walletEntries: Array<{id: string; walletType: string; balance: number; lastUpdated: string}> = [];

  // Check if data is an array (old format) or object (new balance-by-type format)
  if (Array.isArray(safeData)) {
    // Original format - array of wallet objects
    if (safeData.length === 0) {
      console.warn("Empty wallet array received");
      return (
        <Alert>
          <AlertDescription>
            No wallet information available. Contact support if you believe this is an error.
          </AlertDescription>
        </Alert>
      );
    }

    // Calculate total balance across all wallets
    totalBalance = data.reduce((sum: number, wallet: WalletWithType) => {
      return sum + parseFloat(wallet.balance);
    }, 0);

    // Group wallets by type
    data.forEach((wallet: WalletWithType) => {
      walletsByType[wallet.walletType] = wallet;
    });
    
    walletEntries = data.map((wallet: WalletWithType) => ({
      id: wallet.id.toString(),
      walletType: wallet.walletType,
      balance: parseFloat(wallet.balance),
      lastUpdated: wallet.lastUpdated
    }));
  } else {
    // New format - object with wallet types as keys and balances as values
    // Calculate total balance
    const balances = data as Record<string, number>;
    totalBalance = Object.values(balances).reduce((sum, balance) => sum + Number(balance), 0);
    
    // Create wallet entries from the balances object
    walletEntries = Object.entries(balances).map(([type, balance]) => ({
      id: type,
      walletType: type,
      balance: Number(balance),
      lastUpdated: new Date().toISOString() // Current date as we don't have lastUpdated in this format
    }));
    
    // Create walletsByType for the detailed view
    Object.entries(balances).forEach(([type, balance]) => {
      walletsByType[type] = {
        id: type,
        walletType: type,
        balance: balance,
        lastUpdated: new Date().toISOString()
      };
    });
  }

  return (
    <Card>
      {showTitle && (
        <CardHeader>
          <CardTitle>Wallet Balances</CardTitle>
          <CardDescription>
            Total available: {formatCurrencyAmount(totalBalance)}
          </CardDescription>
        </CardHeader>
      )}
      <CardContent>
        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="detailed">Detailed View</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="space-y-4">
            {walletEntries.map((wallet) => (
              <div 
                key={wallet.id} 
                className="flex justify-between items-center p-3 border rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer"
                onClick={() => handleWalletClick(wallet.walletType)}
                role="button"
                tabIndex={0}
                aria-label={`View ${wallet.walletType} wallet transactions`}
              >
                <div className="flex items-center">
                  <div className="mr-2">
                    <WalletTypeIcon walletType={wallet.walletType as "general" | "profit" | "provider" | "stripe_fees"} />
                  </div>
                  <div>
                    <div className="font-medium">{getWalletDisplayName(wallet.walletType)} Wallet</div>
                    <div className="text-sm text-muted-foreground">
                      Last updated: {new Date(wallet.lastUpdated).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="text-xl font-bold">
                  {formatCurrencyAmount(wallet.balance)}
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="detailed" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {['general', 'profit', 'provider', 'stripe_fees', 'tax'].map(type => {
                const wallet = walletsByType[type];
                return wallet ? (
                  <WalletBalanceCard key={type} wallet={wallet} />
                ) : (
                  <div key={type} className="flex flex-col p-4 rounded-lg border shadow-sm bg-muted">
                    <div className="text-muted-foreground capitalize">
                      {type.replace('_', ' ')} Wallet not found
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}