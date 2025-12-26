import React from 'react';
import { CircleDollarSign, Wallet, Briefcase, Building2, CreditCard, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAdminCurrency } from '@/hooks/use-admin-currency';
import { convertCurrency, formatCurrency } from '@shared/utils/currency';

// Interface for wallet transaction with wallet type
export interface WalletTransactionWithType {
  id: number;
  walletId: number;
  amount: string;
  type: 'credit' | 'debit' | 'refund' | 'cancellation';
  description?: string;
  createdAt: string;
  companyId?: number;
  companyName?: string;
  walletType: 'general' | 'profit' | 'provider' | 'stripe_fees' | 'tax';
  // Optional related fields
  relatedTransactionId?: number;
  esimPlanId?: number;
  esimOrderId?: string;
}

// Interface for wallet with type
export interface WalletWithType {
  id: number;
  companyId: number;
  balance: string;
  lastUpdated: string;
  walletType: 'general' | 'profit' | 'provider' | 'stripe_fees' | 'tax';
  providerId?: string;
}

interface WalletTypeBadgeProps {
  walletType: 'general' | 'profit' | 'provider' | 'stripe_fees' | 'tax';
  showTooltip?: boolean;
}

export function WalletTypeIcon({ walletType }: { walletType: 'general' | 'profit' | 'provider' | 'stripe_fees' | 'tax' }) {
  switch (walletType) {
    case 'general':
      return <Wallet className="h-4 w-4" />;
    case 'profit':
      return <CircleDollarSign className="h-4 w-4" />;
    case 'provider':
      return <Building2 className="h-4 w-4" />;
    case 'stripe_fees':
      return <CreditCard className="h-4 w-4" />;
    case 'tax':
      return <FileText className="h-4 w-4" />;
    default:
      return <Briefcase className="h-4 w-4" />;
  }
}

export function WalletTypeBadge({ walletType, showTooltip = true }: WalletTypeBadgeProps) {
  const getWalletTypeDetails = (type: 'general' | 'profit' | 'provider' | 'stripe_fees' | 'tax') => {
    switch (type) {
      case 'general':
        return {
          icon: <Wallet className="h-4 w-4 mr-1" />,
          label: 'General',
          variant: 'outline' as const,
          description: 'Records all transactions across the company',
        };
      case 'profit':
        return {
          icon: <CircleDollarSign className="h-4 w-4 mr-1" />,
          label: 'Profit',
          variant: 'default' as const,
          description: 'Tracks profit margins from eSIM sales',
        };
      case 'provider':
        return {
          icon: <Building2 className="h-4 w-4 mr-1" />,
          label: 'eSIM Access Payments',
          variant: 'secondary' as const,
          description: 'Manages costs paid to eSIM providers',
        };
      case 'stripe_fees':
        return {
          icon: <CreditCard className="h-4 w-4 mr-1" />,
          label: 'Stripe Fees',
          variant: 'destructive' as const,
          description: 'Tracks Stripe payment processing fees',
        };
      case 'tax':
        return {
          icon: <FileText className="h-4 w-4 mr-1" />,
          label: 'Tax',
          variant: 'default' as const,
          description: 'Manages tax-related transactions and reserves',
        };
      default:
        return {
          icon: <Briefcase className="h-4 w-4 mr-1" />,
          label: 'Unknown',
          variant: 'outline' as const,
          description: 'Unknown wallet type',
        };
    }
  };

  const details = getWalletTypeDetails(walletType);

  const badge = (
    <Badge variant={details.variant} className="flex items-center">
      {details.icon}
      {details.label}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <p>{details.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function WalletBalanceCard({ wallet }: { wallet: WalletWithType }) {
  // Get admin currency context
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency with admin currency
  const formatCurrencyAmount = (amount: string | number) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(numAmount, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };

  // For provider wallet, show the absolute value instead of negative
  const displayBalance = wallet.walletType === 'provider' ? 
    Math.abs(parseFloat(wallet.balance)) : 
    parseFloat(wallet.balance);

  return (
    <div className="flex flex-col p-4 rounded-lg border shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <WalletTypeBadge walletType={wallet.walletType} />
        <span className="text-sm text-muted-foreground">
          Last updated: {new Date(wallet.lastUpdated).toLocaleString()}
        </span>
      </div>
      <div className="text-2xl font-bold mt-2">
        {formatCurrencyAmount(displayBalance)}
      </div>
    </div>
  );
}