import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Wallet2, 
  CircleDollarSign, 
  Building2, 
  RefreshCw, 
  Calculator, 
  CreditCard,
  DollarSign,
  UploadCloud,
  Download,
  Plus,
  PieChart
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { User, Wallet, WalletTransaction, Company } from "@shared/schema";
import { MultiWalletDisplay } from "@/components/wallet/MultiWalletDisplay";
import { WalletWithType } from "@/components/wallet/WalletTypeDisplay";
import AddFundsDialog from "./AddFundsDialog";
import { useAdminCurrency } from "@/hooks/use-admin-currency";
import { convertCurrency, formatCurrency } from "@shared/utils/currency";

interface WalletManagementProps {
  defaultTab?: 'simtree' | 'company' | 'provider';
}

// Component to display all company wallet transactions
// Extended transaction type for the dialog
type CompanyTransaction = WalletTransaction & {
  walletType?: string;
};

function CompanyTransactionsDialog({ 
  companyId, 
  companyName,
  isOpen, 
  onOpenChange 
}: { 
  companyId: number;
  companyName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Query all transactions
  const { data: allTransactions = [], isLoading } = useQuery<CompanyTransaction[]>({
    queryKey: ['/api/admin/wallet-transactions'],
    queryFn: () => apiRequest('/api/admin/wallet-transactions'),
    // Only fetch when dialog is open
    enabled: isOpen,
  });
  
  // Filter transactions for this specific company
  const transactions = allTransactions.filter(tx => 'companyId' in tx && tx.companyId === companyId);

  // Get admin currency context
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency with admin currency
  const formatCurrencyAmount = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(numAmount, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{companyName} Wallet Transactions</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Skeleton className="h-64 w-full" />
          </div>
        ) : transactions.length > 0 ? (
          <div className="max-h-[60vh] overflow-y-auto">
            {/* Statement-like layout */}
            <div className="border rounded-md">
              {/* Header */}
              <div className="grid grid-cols-5 py-3 px-4 bg-muted/50 border-b text-sm font-medium">
                <div>Date</div>
                <div className="col-span-2">Description</div>
                <div>Wallet Type</div>
                <div className="text-right">Amount</div>
              </div>
              
              {/* Transactions */}
              <div className="divide-y">
                {transactions.map((tx) => (
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
                      <span className="capitalize">
                        {tx.walletType || 'general'}
                      </span>
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
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            No transactions found for this company
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function WalletManagement({ defaultTab = 'simtree' }: WalletManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | undefined>();
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [addFundsDialogOpen, setAddFundsDialogOpen] = useState(false);
  const [selectedCompanyForTransactions, setSelectedCompanyForTransactions] = useState<{id: number; name: string} | null>(null);
  const [selectedCompanyForFunds, setSelectedCompanyForFunds] = useState<{id: number; name: string} | null>(null);
  
  // Get admin currency context
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency with admin currency
  const formatCurrencyAmount = (amount: number) => {
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(amount, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };
  
  // Function to handle closing the add funds dialog and refresh data
  const handleAddFundsDialogClose = (refreshNeeded: boolean = false) => {
    setAddFundsDialogOpen(false);
    if (refreshNeeded) {
      // Force refresh all wallet data
      queryClient.invalidateQueries({ queryKey: ['/api/admin/wallets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/wallet-transactions'] });
    }
  };
  
  // Fetch all necessary data
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
  });
  
  const typedCompanies = companies as Company[];

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ['/api/admin/wallets'],
  });

  // Fetch all wallet transactions to calculate accurate balances
  const { data: allTransactions = [] } = useQuery<WalletTransaction[]>({
    queryKey: ['/api/admin/wallet-transactions'],
  });

  // Force refresh wallet data to get updated balances
  React.useEffect(() => {
    // Invalidate wallet cache to fetch fresh data from database
    queryClient.invalidateQueries({ queryKey: ['/api/admin/wallets'] });
  }, []);

  // Function to calculate balance from transactions for a specific company
  const calculateCompanyWalletBalance = async (companyId: number): Promise<number> => {
    try {
      // Use the same endpoint that the details page uses - company-specific transactions
      const companyTransactions = await apiRequest<WalletTransaction[]>(`/api/admin/company-transactions/${companyId}`);
      
      return companyTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount) || 0;
        if (tx.type === 'credit') {
          return sum + amount;
        } else if (tx.type === 'debit') {
          return sum - Math.abs(amount);
        }
        return sum;
      }, 0);
    } catch (error) {
      console.error(`Error calculating balance for company ${companyId}:`, error);
      return 0;
    }
  };

  // Define extended types for transactions and wallets
  type ExtendedWallet = Wallet & { 
    companyName?: string 
  };
  
  type ExtendedTransaction = WalletTransaction & { 
    companyName?: string, 
    companyId: number | null
  };
  
  type TransactionDisplay = {
    companyId: number | null;
    companyName?: string;
    walletId: number | null;
    [key: string]: any;
  };
  
  const { data: transactions = [] } = useQuery<ExtendedTransaction[]>({
    queryKey: ['/api/admin/wallet-transactions'],
  });

  // Helper to create missing wallets
  const createMissingWalletsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/create-missing-wallets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create missing wallets');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message || "Successfully created missing wallets",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/wallets'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create missing wallets",
        variant: "destructive",
      });
    }
  });

  // Determine which wallets belong to SimTree vs companies vs providers
  const getCompanyName = (wallet: Wallet & { companyName?: string }) => {
    if (wallet.companyName && wallet.companyName !== 'Unknown') {
      return wallet.companyName;
    }
    
    const company = typedCompanies.find(c => c.id === wallet.companyId);
    return company?.name || 'Unknown';
  };

  // Identify different types of wallets
  // SimTree is identified by company name (case-insensitive) - DO NOT hardcode company ID
  // as it varies between environments (e.g., production has company ID 3)
  const isSimTreeWallet = (wallet: Wallet & { companyName?: string }) => {
    const companyName = getCompanyName(wallet);
    return companyName.toLowerCase().includes('simtree');
  };

  const isProviderWallet = (wallet: Wallet & { companyName?: string }) => {
    const companyName = getCompanyName(wallet);
    // This is just a placeholder example - in a real implementation, this would check if the wallet
    // belongs to an actual provider like Simlessly, etc.
    return companyName.toLowerCase().includes('provider') || 
           companyName.toLowerCase().includes('simlessly');
  };

  // Prepare wallet collections
  const walletsWithCompanyName = wallets as (Wallet & { companyName?: string })[];
  
  const enhancedWallets = walletsWithCompanyName.map(wallet => ({
    ...wallet,
    enhancedCompanyName: getCompanyName(wallet),
    isSimTree: isSimTreeWallet(wallet),
    isProvider: isProviderWallet(wallet)
  }));
  
  // Filter wallets by type
  const simtreeWallets = enhancedWallets.filter(wallet => wallet.isSimTree);
  const companyWallets = enhancedWallets.filter(wallet => !wallet.isSimTree && !wallet.isProvider);
  const providerWallets = enhancedWallets.filter(wallet => wallet.isProvider);
  
  // Calculate balances for the different types of wallets
  const simtreeGeneralWallet = simtreeWallets.find(wallet => wallet.walletType === 'general');
  const simtreeProfitWallet = simtreeWallets.find(wallet => wallet.walletType === 'profit');
  const simtreeProviderWallet = simtreeWallets.find(wallet => wallet.walletType === 'provider');
  const simtreeStripeFeesWallet = simtreeWallets.find(wallet => wallet.walletType === 'stripe_fees');
  
  // SimTree balance should show the sum of all SimTree wallet types
  const simtreeBalance = simtreeWallets.reduce((sum, wallet) => {
    return sum + (Number(wallet.balance) || 0);
  }, 0);
  
  const companyBalance = companyWallets.reduce((sum, wallet) => {
    const balance = Number(wallet.balance) || 0;
    return sum + balance;
  }, 0);
  
  // Get total eSIM provider payment amount (use absolute value of provider wallet balance)
  let providerBalance = 0;
  // Use the already declared simtreeProviderWallet variable from above
  if (simtreeProviderWallet) {
    providerBalance = Math.abs(Number(simtreeProviderWallet.balance) || 0);
  }

  // Filter transactions for each wallet type
  const simtreeTransactions = transactions.filter(tx => 
    simtreeWallets.some(wallet => wallet.id === tx.walletId)
  );

  const companyTransactions = transactions.filter(tx => 
    companyWallets.some(wallet => wallet.id === tx.walletId)
  );

  const providerTransactions = transactions.filter(tx => 
    providerWallets.some(wallet => wallet.id === tx.walletId)
  );

  return (
    <div className="space-y-6 container mx-auto px-4 max-w-7xl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Wallet Management</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() => createMissingWalletsMutation.mutate()}
          disabled={createMissingWalletsMutation.isPending}
        >
          {createMissingWalletsMutation.isPending ? (
            <span className="flex items-center">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </span>
          ) : (
            <span className="flex items-center">
              <Plus className="h-4 w-4 mr-2" />
              Create Missing Wallets
            </span>
          )}
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-purple-50 to-violet-50 hover:shadow-lg transition-all">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-purple-800">
              <CircleDollarSign className="h-5 w-5 text-purple-600" />
              SimTree Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-900 mt-2 mb-1">
              {formatCurrencyAmount(simtreeBalance)}
            </p>
            <p className="text-xs text-purple-600 font-medium">
              Platform profit from eSIM sales
            </p>
          </CardContent>
        </Card>
        
        <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-indigo-50 to-blue-50 hover:shadow-lg transition-all">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-indigo-800">
              <Building2 className="h-5 w-5 text-indigo-600" />
              Company Balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-indigo-900 mt-2 mb-1">
              {formatCurrencyAmount(companyBalance)}
            </p>
            <p className="text-xs text-indigo-600 font-medium">
              Combined balance across all client companies
            </p>
          </CardContent>
        </Card>
        
        <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-emerald-50 to-green-50 hover:shadow-lg transition-all">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-emerald-800">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              Provider Balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-900 mt-2 mb-1">
              {formatCurrencyAmount(Math.abs(providerBalance))}
            </p>
            <p className="text-xs text-emerald-600 font-medium">
              eSIM provider payment accounts
            </p>
          </CardContent>
        </Card>
      </div>
      
      <Tabs defaultValue={defaultTab} className="w-full" 
        onValueChange={value => setActiveTab(value as 'simtree' | 'company' | 'provider')}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="simtree" className="flex items-center justify-center">
            <CircleDollarSign className="h-4 w-4 mr-2" />
            <span>SimTree Wallet</span>
          </TabsTrigger>
          <TabsTrigger value="company" className="flex items-center justify-center">
            <Building2 className="h-4 w-4 mr-2" />
            <span>Company Wallets</span>
          </TabsTrigger>
          <TabsTrigger value="provider" className="flex items-center justify-center">
            <CreditCard className="h-4 w-4 mr-2" />
            <span>eSIM Access Payments</span>
          </TabsTrigger>
        </TabsList>
        
        {/* SimTree Wallet Tab */}
        <TabsContent value="simtree" className="space-y-4 mt-4">
          {/* Multi-Wallet Display Component for SimTree */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-800 mb-3">SimTree Multi-Wallet System</h3>
            {/* Use dynamic SimTree company ID from simtreeWallets - DO NOT hardcode */}
            <MultiWalletDisplay companyId={simtreeWallets[0]?.companyId} />
          </div>

          <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-violet-50 pb-3">
              <CardTitle className="flex items-center gap-2 text-purple-800">
                <CircleDollarSign className="h-5 w-5 text-purple-700" />
                SimTree Profit Transactions
              </CardTitle>
              <CardDescription className="text-purple-600">
                Profit earned from eSIM sales and platform usage fees
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              {simtreeWallets.length > 0 ? (
                <DataTable
                  data={simtreeTransactions.map(tx => {
                    // For Stripe fee transactions, extract company from description prefix
                    let companyName = "SimTree";
                    if (tx.description?.includes("Stripe fees")) {
                      const colonIndex = tx.description.indexOf(':');
                      if (colonIndex > 0) {
                        const prefix = tx.description.substring(0, colonIndex).trim();
                        // Validate against companies list
                        const matchingCompany = typedCompanies.find(c => 
                          c.name.toLowerCase() === prefix.toLowerCase() ||
                          c.name.toLowerCase().includes(prefix.toLowerCase()) ||
                          prefix.toLowerCase().includes(c.name.toLowerCase())
                        );
                        if (matchingCompany) {
                          companyName = matchingCompany.name;
                        } else if (prefix.length > 1 && prefix.length < 50) {
                          companyName = prefix;
                        }
                      }
                    }
                    return {
                      ...tx,
                      companyName
                    };
                  })}
                  columns={[
                    {
                      key: "date",
                      label: "Date & Time",
                      render: (tx: TransactionDisplay) => (
                        <div className="text-sm text-gray-700">
                          {new Date(tx.createdAt).toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </div>
                      )
                    },
                    {
                      key: "description",
                      label: "Description",
                      render: (tx: TransactionDisplay) => (
                        <div className="text-gray-700">
                          {tx.description || 'No description'}
                        </div>
                      )
                    },
                    {
                      key: "walletType",
                      label: "Wallet Type",
                      render: (tx: TransactionDisplay) => (
                        <div className="font-medium capitalize">
                          {tx.walletType || 'general'}
                        </div>
                      )
                    },
                    {
                      key: "type",
                      label: "Type",
                      render: (tx: TransactionDisplay) => (
                        <div className={`font-medium ${tx.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {tx.type === 'credit' ? 'Credit' : 'Debit'}
                        </div>
                      )
                    },
                    {
                      key: "amount",
                      label: "Amount",
                      render: (tx: TransactionDisplay) => (
                        <div className={`font-semibold ${tx.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {tx.type === 'credit' ? '+' : '-'}{formatCurrencyAmount(Math.abs(Number(tx.amount)))}
                        </div>
                      )
                    }
                  ]}
                />
              ) : (
                <div className="text-center py-6">
                  <p className="text-gray-500">No SimTree wallet transactions available</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-purple-50 flex justify-end gap-2 py-3">
              <Button 
                variant="outline" 
                size="sm"
                className="text-purple-700 border-purple-200 hover:bg-purple-100"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Company Wallets Tab */}
        <TabsContent value="company" className="space-y-4 mt-4">
          {/* Company-specific multi-wallet selector */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h3 className="text-lg font-medium text-gray-800">Company Multi-Wallet System</h3>
              <select
                className="px-4 py-2 h-10 border rounded-lg shadow-sm w-full sm:w-auto bg-white border-gray-200 text-gray-800 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                onChange={(e) => {
                  const companyId = parseInt(e.target.value);
                  if (!isNaN(companyId)) {
                    // Selected a specific company
                    const companyElement = document.getElementById('company-multi-wallet');
                    if (companyElement) {
                      // Update the component with the selected company ID 
                      setSelectedCompanyId(companyId);
                      companyElement.style.display = 'block';
                    }
                  } else {
                    // Selected "Select a company"
                    const companyElement = document.getElementById('company-multi-wallet');
                    if (companyElement) {
                      setSelectedCompanyId(undefined);
                      companyElement.style.display = 'none';
                    }
                  }
                }}
                defaultValue=""
              >
                <option value="">Select a company to view multi-wallet</option>
                {companyWallets.map((wallet) => {
                  const company = typedCompanies.find(c => c.id === wallet.companyId);
                  return (
                    <option key={wallet.companyId} value={wallet.companyId || ''}>
                      {company?.name || wallet.companyName || `Company ID: ${wallet.companyId}`}
                    </option>
                  );
                })}
              </select>
            </div>
            <div id="company-multi-wallet" style={{ display: 'none' }}>
              {/* This component will be shown when a company is selected */}
              <MultiWalletDisplay companyId={selectedCompanyId} />
            </div>
          </div>

          <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 pb-3">
              <CardTitle className="flex items-center gap-2 text-indigo-800">
                <Building2 className="h-5 w-5 text-indigo-700" />
                Company Wallets
              </CardTitle>
              <CardDescription className="text-indigo-600">
                Manage client company wallet balances and transactions
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <DataTable
                data={companyWallets}
                columns={[
                  {
                    key: "company",
                    label: "Company",
                    render: (wallet: Wallet & { companyName?: string, isSimTree?: boolean }) => {
                      if (wallet.companyName && wallet.companyName !== 'Unknown') {
                        return (
                          <div className="font-medium text-indigo-800">
                            {wallet.companyName}
                          </div>
                        );
                      }
                      
                      const company = typedCompanies.find(c => c.id === wallet.companyId);
                      
                      return (
                        <div className="font-medium text-indigo-800">
                          {company?.name || 'Unknown'}
                        </div>
                      );
                    }
                  },
                  {
                    key: "balance",
                    label: "Balance",
                    render: (wallet: Wallet) => {
                      // Use the same calculation method as the details page
                      const [calculatedBalance, setCalculatedBalance] = React.useState<number | null>(null);
                      
                      React.useEffect(() => {
                        if (wallet.companyId) {
                          calculateCompanyWalletBalance(wallet.companyId).then(setCalculatedBalance);
                        }
                      }, [wallet.companyId]);
                      
                      const displayBalance = calculatedBalance !== null ? calculatedBalance : parseFloat(wallet.balance) || 0;
                      
                      return (
                        <div className="font-semibold text-emerald-600">
                          {formatCurrencyAmount(displayBalance)}
                        </div>
                      );
                    }
                  },
                  {
                    key: "lastUpdated",
                    label: "Last Updated",
                    render: (wallet: Wallet) => (
                      <div className="text-sm text-gray-600">
                        {new Date(wallet.lastUpdated).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                    )
                  },
                  {
                    key: "actions",
                    label: "Actions",
                    render: (wallet: Wallet) => (
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                          onClick={() => {
                            const company = typedCompanies.find(c => c.id === wallet.companyId);
                            if (wallet.companyId) {
                              setSelectedCompanyForFunds({
                                id: wallet.companyId,
                                name: company?.name || 'Unknown Company'
                              });
                              setAddFundsDialogOpen(true);
                            }
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Funds
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="text-gray-700 border-gray-200 hover:bg-gray-100"
                          onClick={() => {
                            const company = typedCompanies.find(c => c.id === wallet.companyId);
                            if (wallet.companyId) {
                              const companyName = company?.name || 'Unknown Company';
                              // Use navigate from wouter instead of window.location for faster client-side routing
                              setLocation(`/wallet/company-transactions?id=${wallet.companyId}&name=${encodeURIComponent(companyName)}`);
                            }
                          }}
                        >
                          <PieChart className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                      </div>
                    )
                  }
                ]}
              />
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
        </TabsContent>
        
        {/* eSIM Access Payments Tab */}
        <TabsContent value="provider" className="space-y-4 mt-4">
          <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
            <CardHeader className="bg-gradient-to-r from-emerald-50 to-green-50 pb-3">
              <CardTitle className="flex items-center gap-2 text-emerald-800">
                <CreditCard className="h-5 w-5 text-emerald-700" />
                eSIM Access Payments
              </CardTitle>
              <CardDescription className="text-emerald-600">
                Manage eSIM provider payment accounts and balances
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              {providerWallets.length > 0 ? (
                <DataTable
                  data={providerWallets}
                  columns={[
                    {
                      key: "provider",
                      label: "Provider",
                      render: (wallet: Wallet & { companyName?: string }) => (
                        <div className="font-medium text-emerald-800">
                          {getCompanyName(wallet)}
                        </div>
                      )
                    },
                    {
                      key: "balance",
                      label: "Balance",
                      render: (wallet: Wallet) => (
                        <div className="font-semibold text-emerald-600">
                          ${Number(wallet.balance).toFixed(2)}
                        </div>
                      )
                    },
                    {
                      key: "lastUpdated",
                      label: "Last Updated",
                      render: (wallet: Wallet) => (
                        <div className="text-sm text-gray-600">
                          {new Date(wallet.lastUpdated).toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </div>
                      )
                    },
                    {
                      key: "actions",
                      label: "Actions",
                      render: (wallet: Wallet) => (
                        <div className="flex space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            onClick={() => {
                              const company = typedCompanies.find(c => c.id === wallet.companyId);
                              if (wallet.companyId) {
                                setSelectedCompanyForFunds({
                                  id: wallet.companyId,
                                  name: company?.name || 'Unknown Company'
                                });
                                setAddFundsDialogOpen(true);
                              }
                            }}
                          >
                            <UploadCloud className="h-4 w-4 mr-1" />
                            Add Funds
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-gray-700 border-gray-200 hover:bg-gray-100"
                            onClick={() => {
                              const company = typedCompanies.find(c => c.id === wallet.companyId);
                              if (wallet.companyId) {
                                const companyName = company?.name || 'Unknown Company';
                                window.location.href = `https://panel.simtree.co/wallet/company-transactions?id=${wallet.companyId}&name=${encodeURIComponent(companyName)}`;
                              }
                            }}
                          >
                            <PieChart className="h-4 w-4 mr-1" />
                            Details
                          </Button>
                        </div>
                      )
                    }
                  ]}
                />
              ) : (
                <div className="text-center py-6">
                  <p className="text-gray-500">No provider wallets configured yet</p>
                  <Button variant="outline" size="sm" className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Provider Wallet
                  </Button>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-emerald-50 flex justify-end gap-2 py-3">
              <Button 
                variant="outline" 
                size="sm"
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Transaction Dialog for Company Wallets */}
      {selectedCompanyForTransactions && (
        <CompanyTransactionsDialog
          companyId={selectedCompanyForTransactions.id}
          companyName={selectedCompanyForTransactions.name}
          isOpen={transactionDialogOpen}
          onOpenChange={setTransactionDialogOpen}
        />
      )}
      
      {/* Add Funds Dialog */}
      {selectedCompanyForFunds && (
        <AddFundsDialog
          companyId={selectedCompanyForFunds.id}
          companyName={selectedCompanyForFunds.name}
          isOpen={addFundsDialogOpen}
          onOpenChange={handleAddFundsDialogClose}
        />
      )}
    </div>
  );
}