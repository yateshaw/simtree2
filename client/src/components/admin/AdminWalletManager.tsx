import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Wallet2, CircleDollarSign, Building2, RefreshCw, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { User, Wallet, WalletTransaction, Company } from "@shared/schema";
import { useAdminCurrency } from "@/hooks/use-admin-currency";
import { convertCurrency, formatCurrency } from "@shared/utils/currency";

export default function AdminWalletManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Use admin currency from context with fallback
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency for display using admin selected currency
  const formatCurrencyAmount = (amount: number) => {
    // Fallback to USD if adminCurrency is undefined (during initial render)
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(amount, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };
  
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
  });
  
  // Type-safe companies access to prevent TypeScript errors
  const typedCompanies = companies as Company[];

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ['/api/admin/wallets'],
  });

  // Define a proper extended transaction type with all needed properties
  type ExtendedWallet = Wallet & { 
    companyName?: string 
  };
  
  type ExtendedTransaction = WalletTransaction & { 
    companyName?: string, 
    companyId: number | null
  };
  
  // Define a consistent transaction renderer type
  type TransactionDisplay = {
    companyId: number | null;
    companyName?: string;
    walletId: number | null;
    [key: string]: any; // Allow other properties from WalletTransaction
  };
  
  const { data: transactions = [] } = useQuery<ExtendedTransaction[]>({
    queryKey: ['/api/admin/wallet-transactions'],
  });

  // Mutation to create missing wallets
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
      // Refresh wallet data
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

  const [selectedCompany, setSelectedCompany] = useState<string>("all");

  // Helper function to get a consistent company name 
  const getCompanyName = (wallet: Wallet & { companyName?: string }) => {
    // Get the known company IDs map from company data
    const companyIdMap: Record<number, string> = {};
    typedCompanies.forEach(company => {
      companyIdMap[company.id] = company.name;
    });
    
    // Special case for Simtree - ensure consistent naming by company name (not hardcoded ID)
    if (wallet.companyName && wallet.companyName.toLowerCase().includes('simtree')) {
      return "Simtree";
    }

    // First try to use the companyName directly if it exists and is not 'Unknown'
    if (wallet.companyName && wallet.companyName !== 'Unknown' && wallet.companyName !== 'N/A') {
      return wallet.companyName;
    }
    
    // Then try using the companyId to look up company name
    if (wallet.companyId && companyIdMap[wallet.companyId]) {
      return companyIdMap[wallet.companyId];
    }
    
    // Fall back to finding company by ID
    const company = typedCompanies.find(c => c.id === wallet.companyId);
    if (company?.name) {
      return company.name;
    }
    
    // Final fallback
    return 'Unknown';
  };

  // Identify if a wallet belongs to SimTree (platform)
  // Use company name only - DO NOT hardcode company IDs as they vary by environment
  const isSimTreeWallet = (wallet: Wallet & { companyName?: string }) => {
    const companyName = getCompanyName(wallet);
    return companyName.toLowerCase().includes('simtree');
  };

  // Find selected company name for display
  const selectedCompanyName = selectedCompany !== "all" 
    ? typedCompanies.find(c => c.id === parseInt(selectedCompany))?.name
    : null;

  // For filtering wallets, we need to look through the API response that has already mapped user IDs to company IDs
  // First find all wallets associated with this company by comparing companyName
  // We need to cast wallets to include companyName since our API is adding it
  const walletsWithCompanyName = wallets as (Wallet & { companyName?: string })[];
  
  // For each wallet, determine its proper company name for consistent filtering
  const enhancedWallets = walletsWithCompanyName.map(wallet => ({
    ...wallet,
    enhancedCompanyName: getCompanyName(wallet),
    isSimTree: isSimTreeWallet(wallet)
  }));
  
  // Filter company wallets (excluding SimTree)
  const companyWallets = enhancedWallets.filter(wallet => !wallet.isSimTree);
  
  // Get SimTree wallets
  const simtreeWallets = enhancedWallets.filter(wallet => wallet.isSimTree);
  
  // Filter wallets based on selection
  const filteredWallets = selectedCompany === "all"
    ? enhancedWallets
    : enhancedWallets.filter(w => w.enhancedCompanyName === selectedCompanyName);

  // Calculate total balance for all company wallets (excluding SimTree)
  const totalCompanyBalance = companyWallets.reduce((sum, wallet) => {
    const balance = Number(wallet.balance) || 0;
    return sum + balance;
  }, 0);
  
  // Calculate SimTree platform profit balance
  const simtreeProfitBalance = simtreeWallets.reduce((sum, wallet) => {
    const balance = Number(wallet.balance) || 0;
    return sum + balance;
  }, 0);
  
  // Find SimTree company ID dynamically (for UI conditional logic)
  const simtreeCompany = typedCompanies.find(c => c.name.toLowerCase().includes('simtree'));
  const simtreeCompanyId = simtreeCompany?.id?.toString() || '';
  
  // Check if selected company is SimTree
  const isSimTreeSelected = selectedCompany === simtreeCompanyId || 
    (selectedCompany !== 'all' && typedCompanies.find(c => c.id === parseInt(selectedCompany))?.name.toLowerCase().includes('simtree'));
  
  // Note: Manual balance recalculation has been removed
  // All wallet balances are now automatically calculated and maintained by the system
  // through scheduled wallet balance synchronization

  // Selected display balance
  const displayBalance = selectedCompany === "all" 
    ? (isSimTreeWallet({companyId: parseInt(selectedCompany) || 0} as Wallet) ? simtreeProfitBalance : totalCompanyBalance) 
    : filteredWallets.reduce((sum, wallet) => {
        const balance = Number(wallet.balance) || 0;
        return sum + balance;
      }, 0);

  return (
    <div className="space-y-6 container mx-auto px-4 max-w-7xl">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-auto max-w-md">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
              <line x1="3" x2="21" y1="9" y2="9"></line>
              <line x1="9" x2="9" y1="21" y2="9"></line>
            </svg>
          </div>
          <select
            className="w-full pl-10 pr-10 py-2 border-indigo-200 rounded-lg shadow-sm bg-white focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 transition-all appearance-none"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
          >
            <option value="all">All Companies</option>
            {typedCompanies.map(company => (
              <option key={company.id} value={company.id.toString()}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SimTree Profit Balance */}
      <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-purple-50 to-violet-50 hover:shadow-lg transition-all">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-purple-800">
            <CircleDollarSign className="h-5 w-5 text-purple-600" />
            SimTree Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            {/* Automatically calculate the accurate balance from transactions */}
            {simtreeWallets.length > 0 && (
              <div>
                <p className="text-4xl font-bold text-purple-900 mt-2 mb-1">
                  {(() => {
                    // Get all SimTree wallet transactions for accurate balance calculation
                    const simtreeTransactions = transactions.filter(tx => 
                      simtreeWallets.some(wallet => wallet.id === tx.walletId)
                    );
                    
                    // Calculate the actual balance based on transaction history
                    const calculatedBalance = simtreeTransactions.reduce((sum, tx) => {
                      const amount = parseFloat(tx.amount);
                      // Since amounts are already stored with correct signs, just add them
                      return sum + amount;
                    }, 0);
                    
                    return formatCurrencyAmount(calculatedBalance);
                  })()}
                </p>
                <p className="text-xs text-purple-600 font-medium">
                  SimTree profit from eSIM sales (automatically calculated)
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Client Company Balances - Hide when SimTree is selected */}
      {!isSimTreeSelected && (
        <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-indigo-50 to-blue-50 hover:shadow-lg transition-all">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-indigo-800">
              <Building2 className="h-5 w-5 text-indigo-600" />
              {selectedCompany === "all" ? "Client Company Balances" : `${typedCompanies.find(c => c.id === parseInt(selectedCompany))?.name}'s Balance`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-indigo-900 mt-2 mb-1">
              {selectedCompany === "all" ? formatCurrencyAmount(totalCompanyBalance) : formatCurrencyAmount(displayBalance)}
            </p>
            <p className="text-xs text-indigo-600 font-medium">
              {selectedCompany === "all" ? "Combined balance across all client company wallets" : "Current company balance"}
            </p>
          </CardContent>
        </Card>
      )}

      {selectedCompany === "all" && (
        <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Building2 className="h-5 w-5 text-blue-700" />
              Client Company Balances
            </CardTitle>
            <p className="text-sm text-blue-600 font-medium mt-2">Individual balance for each registered company</p>
          </CardHeader>
          <CardContent className="pt-5">
            <DataTable
              data={companyWallets}
              columns={[
                {
                  key: "company",
                  label: "Company",
                  render: (wallet: Wallet & { companyName?: string, isSimTree?: boolean }) => {
                    // First try to use the companyName directly from the wallet object 
                    // (provided by the backend)
                    if (wallet.companyName && wallet.companyName !== 'Unknown') {
                      return (
                        <div className="font-medium text-indigo-800">
                          {wallet.companyName}
                        </div>
                      );
                    }
                    
                    // If companyName is not provided, fallback to finding by ID
                    const company = typedCompanies.find(c => c.id === wallet.companyId);
                    
                    // Hard-coded company names for known wallets without proper mapping
                    // This is a temporary fix until the database is properly updated
                    const specialCases: Record<number, string> = {
                      // Add wallet IDs mapped to their company names
                      1: "Acme Global Travel",
                      2: "TechCorp International",
                      3: "GlobalLink Ventures"
                    };
                    
                    if (wallet.id && specialCases[wallet.id]) {
                      return (
                        <div className="font-medium text-indigo-800">
                          {specialCases[wallet.id]}
                        </div>
                      );
                    }
                    
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
                }
              ]}
            />
          </CardContent>
        </Card>
      )}
      
      {/* SimTree Profit Transactions */}
      {selectedCompany === "all" && (
        <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-violet-50 pb-3">
            <CardTitle className="flex items-center gap-2 text-purple-800">
              <CircleDollarSign className="h-5 w-5 text-purple-700" />
              SimTree Profit Transactions
            </CardTitle>
            <p className="text-sm text-purple-600 font-medium mt-2">Profit transactions from eSIM sales</p>
          </CardHeader>
          <CardContent className="pt-5">
            {/* Get all transactions from the SimTree wallets */}
            {simtreeWallets.length > 0 ? (
              <DataTable
                data={transactions.filter(tx => 
                  simtreeWallets.some(wallet => wallet.id === tx.walletId)
                ).map(tx => ({
                  ...tx,
                  companyName: "SimTree" // Set explicit company name for SimTree transactions
                }))}
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
                    key: "amount",
                    label: "Amount",
                    render: (tx: TransactionDisplay) => (
                      <span className={`font-semibold ${tx.type === "credit" ? "text-emerald-600" : "text-red-600"}`}>
                        {tx.type === "credit" ? "+" : ""}${Number(tx.amount).toFixed(2)}
                      </span>
                    )
                  }
                ]}
              />
            ) : (
              <div className="py-8 text-center text-gray-500">
                No profit transactions found
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
        <CardHeader className={`bg-gradient-to-r ${isSimTreeSelected ? "from-purple-50 to-violet-50" : "from-emerald-50 to-green-50"} pb-3`}>
          <CardTitle className={`flex items-center gap-2 ${isSimTreeSelected ? "text-purple-800" : "text-emerald-800"}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${isSimTreeSelected ? "text-purple-700" : "text-emerald-700"}`}>
              <rect width="20" height="14" x="2" y="5" rx="2"></rect>
              <line x1="2" x2="22" y1="10" y2="10"></line>
            </svg>
            {selectedCompany === "all" ? "All Transactions" : 
             (isSimTreeSelected ? "SimTree Transactions" : `${typedCompanies.find(c => c.id === parseInt(selectedCompany))?.name}'s Transactions`)}
          </CardTitle>
          <p className={`text-sm ${isSimTreeSelected ? "text-purple-600" : "text-emerald-600"} font-medium mt-2`}>
            {selectedCompany === "all" ? "Transaction history across all company wallets" : 
             (isSimTreeSelected ? "Transaction history for SimTree" : "Transaction history for selected company")}
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <DataTable
            data={selectedCompany === "all" ? 
              // Cast all transactions to TransactionDisplay type
              transactions as unknown as TransactionDisplay[] : 
              // Filter and cast transactions
              transactions.filter(tx => {
                // Helper function to get transaction company name consistently
                const getTxCompanyName = (tx: ExtendedTransaction) => {
                  // Special case mappings - same as above
                  const specialCases: Record<number, string> = {
                    1: "Acme Global Travel",
                    2: "TechCorp International",
                    3: "GlobalLink Ventures"
                  };
                  
                  // Try companyName first if it exists and is not 'Unknown'
                  if (tx.companyName && tx.companyName !== 'Unknown') {
                    return tx.companyName;
                  }
                  
                  // Then try special cases with walletId
                  if (tx.walletId && specialCases[tx.walletId]) {
                    return specialCases[tx.walletId];
                  }
                  
                  // Look for transactions with the same wallet ID
                  // This is the key part for dropdown filtering
                  const walletWithMatchingCompany = enhancedWallets.find(w => 
                    w.enhancedCompanyName === selectedCompanyName && 
                    w.id === tx.walletId
                  );
                  
                  if (walletWithMatchingCompany) {
                    return selectedCompanyName;
                  }
                  
                  // Finally fall back to company lookup by ID
                  const company = typedCompanies.find(c => c.id === tx.companyId);
                  return company?.name || 'Unknown';
                };
                
                // Compare the computed company name to the selected company name
                return getTxCompanyName(tx) === selectedCompanyName;
              }) as unknown as TransactionDisplay[]}
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
                key: "company",
                label: "Company",
                render: (tx: TransactionDisplay) => {
                  // Get the known company IDs map from company data
                  const companyIdMap: Record<number, string> = {};
                  typedCompanies.forEach(company => {
                    companyIdMap[company.id] = company.name;
                  });
                  
                  // Helper function to extract company name from description
                  const extractCompanyFromDescription = (description: string) => {
                    // Try different patterns in the description
                    
                    // 1. Direct company prefix pattern: "CompanyName: action details..."
                    const prefixMatch = description.match(/^([^:]+):/);
                    if (prefixMatch && prefixMatch[1]) {
                      return prefixMatch[1].trim();
                    }
                    
                    // 2. Look for "to CompanyName:" pattern in eSIM sales
                    const toCompanyMatch = description.match(/to\s+([^:]+):/);
                    if (toCompanyMatch && toCompanyMatch[1]) {
                      return toCompanyMatch[1].trim();
                    }
                    
                    // 3. Look for 'to CompanyName' pattern
                    const simpleBeneficiaryMatch = description.match(/\bto\s+([^()\d]+?)(?:\s+for\b|\s*$)/i);
                    if (simpleBeneficiaryMatch && simpleBeneficiaryMatch[1]) {
                      return simpleBeneficiaryMatch[1].trim();
                    }
                    
                    // 4. Extract parenthesized company at end: "... (CompanyName)"
                    const parenthesisMatch = description.match(/\(([^)]+?)\)(?:\s*$|$)/);
                    if (parenthesisMatch && parenthesisMatch[1] && !parenthesisMatch[1].match(/^B\d/)) {
                      // Skip if it's just an order ID like (B25051521460005)
                      return parenthesisMatch[1].trim();
                    }
                    
                    // 5. In refund descriptions: "Refund to CompanyName: ..."
                    const refundMatch = description.match(/Refund\s+to\s+([^:]+):/i);
                    if (refundMatch && refundMatch[1]) {
                      return refundMatch[1].trim();
                    }
                    
                    // 6. Credit via coupon patterns
                    const couponMatch = description.match(/^([^:]+):\s+Simtree\s+credit\s+\(coupon:/i);
                    if (couponMatch && couponMatch[1]) {
                      return couponMatch[1].trim();
                    }
                    
                    // Pattern didn't match
                    return null;
                  };
                  
                  // Validate extracted name against company list
                  const validateCompanyName = (name: string) => {
                    // Check if it matches directly
                    const directMatch = typedCompanies.find(c => 
                      c.name.toLowerCase() === name.toLowerCase()
                    );
                    
                    if (directMatch) return directMatch.name;
                    
                    // Check for partial matches
                    const partialMatch = typedCompanies.find(c => 
                      name.toLowerCase().includes(c.name.toLowerCase()) ||
                      c.name.toLowerCase().includes(name.toLowerCase())
                    );
                    
                    if (partialMatch) return partialMatch.name;
                    
                    // If it looks like a valid company name, return it
                    if (name.length > 3 && !name.match(/^(Unknown|N\/A)$/i)) {
                      return name;
                    }
                    
                    return null;
                  };
                  
                  // Special case for Simtree - ensure consistent naming (use name only, not hardcoded IDs)
                  if (tx.companyName && tx.companyName.toLowerCase().includes('simtree')) {
                    return (
                      <div className="font-medium text-indigo-800">
                        Simtree
                      </div>
                    );
                  }
                  
                  // First try direct company name from transaction if it exists and is not 'Unknown' or 'N/A'
                  if (tx.companyName && tx.companyName !== 'Unknown' && tx.companyName !== 'N/A') {
                    return (
                      <div className="font-medium text-indigo-800">
                        {tx.companyName}
                      </div>
                    );
                  }
                  
                  // Try to extract company from description
                  if (tx.description) {
                    const extractedName = extractCompanyFromDescription(tx.description);
                    if (extractedName) {
                      const validatedName = validateCompanyName(extractedName);
                      if (validatedName) {
                        return (
                          <div className="font-medium text-indigo-800">
                            {validatedName}
                          </div>
                        );
                      }
                    }
                  }
                  
                  // Try using the company ID to look up company name
                  if (tx.companyId && companyIdMap[tx.companyId]) {
                    return (
                      <div className="font-medium text-indigo-800">
                        {companyIdMap[tx.companyId]}
                      </div>
                    );
                  }
                  
                  // Try looking up by wallet ID
                  const wallet = wallets.find(w => w.id === tx.walletId);
                  if (wallet && wallet.companyId && companyIdMap[wallet.companyId]) {
                    return (
                      <div className="font-medium text-indigo-800">
                        {companyIdMap[wallet.companyId]}
                      </div>
                    );
                  }
                  
                  // Final fallback - try one more check in the description for clues
                  if (tx.description) {
                    // Check for any company name mentioned anywhere in the description
                    for (const company of typedCompanies) {
                      if (tx.description.toLowerCase().includes(company.name.toLowerCase())) {
                        return (
                          <div className="font-medium text-indigo-800">
                            {company.name}
                          </div>
                        );
                      }
                    }
                  }
                  
                  // Ultimate fallback
                  return (
                    <div className="font-medium text-indigo-800">
                      {(tx.companyId && companyIdMap[tx.companyId]) || 'Unknown'}
                    </div>
                  );
                }
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
                key: "amount",
                label: "Amount",
                render: (tx: TransactionDisplay) => (
                  <span className={`font-semibold ${tx.type === "credit" ? "text-emerald-600" : "text-red-600"}`}>
                    {tx.type === "credit" ? "+" : "-"}{formatCurrencyAmount(Math.abs(Number(tx.amount)))}
                  </span>
                )
              }
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}