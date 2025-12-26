import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Wallet, WalletTransaction } from "@shared/schema";
import { 
  DollarSign, 
  FileSpreadsheet, 
  FileText, 
  Gift
} from "lucide-react";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import CreditTopUpDialog from "../stripe/CreditTopUpDialog";
import { convertCurrency, formatCurrency, formatCurrencyForExport } from "@shared/utils/currency";

export default function WalletManager() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [couponCode, setCouponCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showTopUpDialog, setShowTopUpDialog] = useState(false);

  // Fetch company data to get currency
  const { data: companyData, isLoading: isLoadingCompany } = useQuery<{ success: boolean; data?: { currency?: string } }>({
    queryKey: ['/api/company'],
    enabled: !!user?.companyId,
  });

  // Debug: Log company data
  if (import.meta.env.DEV) {
    console.log('[WalletManager] Company data:', companyData);
    console.log('[WalletManager] Company currency:', companyData?.data?.currency);
  }

  // Get company currency, default to USD
  const companyCurrency = (companyData?.data?.currency === 'AED' ? 'AED' : 'USD') as 'USD' | 'AED';

  // Helper function to format amounts in company currency
  const formatAmount = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const convertedAmount = convertCurrency(numAmount, 'USD', companyCurrency);
    return formatCurrency(convertedAmount, companyCurrency);
  };

  const { data: walletData, isLoading: isLoadingWallet } = useQuery({
    queryKey: ['/api/wallet'],
    queryFn: () => apiRequest('/api/wallet'),
    staleTime: 0, // Force fresh data on every load
    gcTime: 0 // Don't cache the result
  });

  // Handle both admin and regular user response formats
  const wallet = walletData?.isAdminView 
    ? walletData.wallets?.find((w: any) => w.companyId === user?.companyId) || { balance: walletData.totalBalance }
    : (Array.isArray(walletData?.wallets) ? walletData.wallets[0] : walletData);
  
  // Debug logging
  if (import.meta.env.DEV && walletData) {
    console.log('WalletData response:', walletData);
    console.log('User companyId:', user?.companyId);
    console.log('Processed wallet:', wallet);
    console.log('Wallet balance to display:', wallet?.balance);
  }

  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery<WalletTransaction[]>({
    queryKey: ['/api/wallet/transactions'],
    queryFn: async () => {
      const response = await apiRequest('/api/wallet/transactions');
      if (import.meta.env.DEV) { console.log('Fetched transactions:', response); }
      return response;
    }
  });

  // Note: Manual balance recalculation has been removed
  // All wallet balances are now automatically calculated and maintained by the system
  // through scheduled wallet balance synchronization

  // First, sort all transactions by date (newest first)
  const sortedTransactions = [...(transactions || [])].sort((a, b) => {
    try {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } catch (e) {
      return 0;
    }
  });

  // Then filter transactions only if dates are selected
  const filteredTransactions = sortedTransactions.filter(tx => {
    if (!tx || !tx.createdAt) return false;
    if (!startDate || !endDate) return true;

    try {
      const txDate = new Date(tx.createdAt);
      const start = new Date(startDate);
      const end = new Date(endDate);

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      return txDate >= start && txDate <= end;
    } catch (e) {
      console.error('Error filtering transaction:', e);
      return false;
    }
  });

  // Recalculate balance based on current filtered transactions
  const calculatedBalance = filteredTransactions.reduce((sum, tx) => {
    const amount = Number(tx.amount);
    // Credit transactions: add the amount
    // Debit transactions: subtract the amount (use abs to handle inconsistent storage)
    return tx.type === 'credit' ? sum + amount : sum - Math.abs(amount);
  }, 0);

  // Mutation for redeeming coupons
  const redeemCouponMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!code || code.trim().length < 6) {
        throw new Error("Please enter a valid coupon code (minimum 6 characters)");
      }
      
      return apiRequest('/api/coupons/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message || "Coupon redeemed successfully",
        variant: "default",
      });
      setCouponCode("");
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/transactions'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Redeeming Coupon",
        description: error.message || "Failed to redeem coupon",
        variant: "destructive",
      });
    },
  });

  if (isLoadingWallet || isLoadingTransactions) {
    return <div>Loading...</div>;
  }

  // Transaction deletion has been removed for security and data integrity

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transactions');
    
    // Add header row
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 25 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Amount', key: 'amount', width: 20 }
    ];
    
    // Add data rows
    filteredTransactions.forEach(tx => {
      const absAmount = Math.abs(Number(tx.amount));
      const convertedAmount = convertCurrency(absAmount, 'USD', companyCurrency);
      worksheet.addRow({
        date: new Date(tx.createdAt).toLocaleString(),
        description: tx.description || "N/A",
        type: tx.type,
        amount: `${tx.type === "credit" ? "+" : "-"}${formatCurrencyForExport(convertedAmount, companyCurrency)}`
      });
    });
    
    // Apply some styling
    worksheet.getRow(1).font = { bold: true };
    
    // Generate buffer and save
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, 'wallet-transactions.xlsx');
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Wallet Transactions', 20, 10);

    doc.setFontSize(10);
    doc.text('Date', 20, 20);
    doc.text('Description', 80, 20);
    doc.text('Amount', 180, 20);

    let y = 30;
    filteredTransactions.forEach((tx) => {
      doc.text(new Date(tx.createdAt).toLocaleString(), 20, y);
      // Handle null description
      const description = tx.description || "N/A";
      const desc = description.length > 40 ? description.substring(0, 37) + '...' : description;
      doc.text(desc, 80, y);
      const absAmount = Math.abs(Number(tx.amount));
      const convertedAmount = convertCurrency(absAmount, 'USD', companyCurrency);
      const amount = `${tx.type === "credit" ? "+" : "-"}${formatCurrencyForExport(convertedAmount, companyCurrency)}`;
      doc.text(amount, 180, y);
      y += 10;

      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save('wallet-transactions.pdf');
  };


  return (
    <div className="space-y-6">
      <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-2xl font-bold">
            <DollarSign className="h-6 w-6 text-primary" />
            Wallet Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2">
            <p className="text-4xl font-bold text-gray-900 dark:text-gray-50 mb-3 sm:mb-0">{formatAmount(Number(wallet?.balance || 0))}</p>
            {/* Manual balance recalculation removed - now happens automatically */}
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {/* Coupon Redemption Section - Main credit method */}
            <div className="flex gap-2 w-full sm:w-auto">
              <Input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Enter coupon code"
                className="w-full max-w-[300px]"
              />
              <Button
                onClick={() => couponCode && redeemCouponMutation.mutate(couponCode)}
                disabled={!couponCode || redeemCouponMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Gift className="mr-2 h-4 w-4" />
                Redeem
              </Button>
            </div>

            {/* Top Up Button */}
            <Button
              onClick={() => setShowTopUpDialog(true)}
              className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
            >
              <DollarSign className="mr-2 h-4 w-4" />
              TOP UP
            </Button>
          </div>
          
          <p className="text-sm text-gray-500 mt-2">
            Enter the coupon code you received to add credit to your wallet.
          </p>
        </CardContent>
      </Card>
      
      <Card className="shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl font-bold">Transaction History</CardTitle>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full sm:w-auto"
              />
              <span className="hidden sm:inline">to</span>
              <span className="inline sm:hidden text-sm text-gray-500 my-1">to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full sm:w-auto"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportToExcel}
                disabled={filteredTransactions.length === 0}
                className="text-sm px-3"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportToPDF}
                disabled={filteredTransactions.length === 0}
                className="text-sm px-3"
              >
                <FileText className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mt-2">
            {filteredTransactions.length === 0 ? (
              <p className="text-center text-gray-500 py-4">
                {startDate || endDate 
                  ? "No transactions found for the selected period" 
                  : "No transactions found"}
              </p>
            ) : (
              filteredTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 pt-2 hover:bg-gray-50 transition-colors px-2 rounded"
                >
                  <div className="mb-2 sm:mb-0">
                    <p className="font-medium line-clamp-2">{tx.description || "N/A"}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <p
                    className={`${tx.type === "credit" ? "text-green-600" : "text-red-600"} 
                               font-medium text-lg sm:text-base sm:ml-4 self-end sm:self-center`}
                  >
                    {tx.type === "credit" ? "+" : "-"}{formatAmount(Math.abs(Number(tx.amount)))}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Credit Top Up Dialog */}
      <CreditTopUpDialog
        isOpen={showTopUpDialog}
        onOpenChange={setShowTopUpDialog}
        onSuccess={(data) => {
          // Refresh wallet data after successful payment
          queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
          queryClient.invalidateQueries({ queryKey: ['/api/wallet/transactions'] });
          toast({
            title: "Payment Successful!",
            description: "Credit has been added to your wallet.",
            variant: "default",
          });
        }}
      />
    </div>
  );
}