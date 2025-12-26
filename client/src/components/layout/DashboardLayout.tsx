import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, DollarSign, ArrowLeft, HelpCircle, Settings } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Wallet, WalletTransaction } from "@shared/schema";
import NotificationBell from "@/components/common/NotificationBell";
import { useState, useEffect } from "react";
import TooltipOnboarding from "@/components/onboarding/TooltipOnboarding";
import { AdminCurrencyContext, useAdminCurrency } from '@/hooks/use-admin-currency';
import { Currency, convertCurrency, formatCurrency } from '@shared/utils/currency';

// Extend User type for this component
interface ExtendedUser {
  id: number;
  username: string;
  role: string;
  isSuperAdmin?: boolean;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logout, user } = useAuth();
  // Cast user to the extended type that includes isSuperAdmin
  const extendedUser = user as ExtendedUser | null;
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { setAdminCurrency: setGlobalCurrency } = useAdminCurrency();
  
  // Admin currency state for super admin users (with localStorage persistence)
  const [adminCurrency, setAdminCurrencyState] = useState<Currency>(() => {
    if (extendedUser?.isSuperAdmin) {
      const saved = localStorage.getItem('adminCurrency');
      return saved ? (saved as Currency) : 'USD';
    }
    return 'USD';
  });
  
  const setAdminCurrency = (currency: Currency) => {
    if (extendedUser?.isSuperAdmin) {
      setAdminCurrencyState(currency);
      localStorage.setItem('adminCurrency', currency);
    }
  };

  // Fetch company data to sync currency for regular company users
  const { data: companyData } = useQuery({
    queryKey: ['/api/company'],
    enabled: !!user && !extendedUser?.isSuperAdmin,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Sync global currency manager with company currency for non-admin users
  useEffect(() => {
    if (!extendedUser?.isSuperAdmin && companyData) {
      const company = (companyData as any)?.data || companyData;
      const companyCurrency = company?.currency;
      if (companyCurrency && (companyCurrency === 'USD' || companyCurrency === 'AED')) {
        setGlobalCurrency(companyCurrency as Currency);
      }
    }
  }, [companyData, extendedUser?.isSuperAdmin, setGlobalCurrency]);

  // Check if user needs onboarding
  useEffect(() => {
    const onboardingCompleted = localStorage.getItem('onboarding_completed');
    const onboardingSkipped = localStorage.getItem('onboarding_skipped');
    
    // Show onboarding if user hasn't completed it or skipped it
    if (!onboardingCompleted && !onboardingSkipped) {
      setShowOnboarding(true);
    }
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem('onboarding_completed', 'true');
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem('onboarding_skipped', 'true');
    setShowOnboarding(false);
  };

  const startOnboardingTour = () => {
    // Clear any previous onboarding state
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('onboarding_skipped');
    setShowOnboarding(true);
  };

  const { data: walletData } = useQuery({
    queryKey: ['/api/wallet'],
    staleTime: 2 * 60 * 1000, // 2 minutes - use SSE for real-time updates
    refetchOnWindowFocus: false,
    refetchOnMount: true
  });

  // Handle both admin and regular user response formats to get wallet balance
  const wallet = (walletData as any)?.isAdminView 
    ? (walletData as any).wallets?.find((w: any) => w.companyId === user?.companyId) 
    : (Array.isArray((walletData as any)?.wallets) ? (walletData as any).wallets[0] : walletData);

  // Just use the wallet balance directly from database - no calculations
  const walletBalance = wallet?.balance ? parseFloat(wallet.balance) : 0;
  
  // For super admin, we want to show the admin wallet balance (sum of all company balances)
  const { data: adminWallets = [] } = useQuery<Wallet[]>({
    queryKey: ['/api/admin/wallets'],
    enabled: extendedUser?.isSuperAdmin === true
  });
  
  const adminTotalBalance = adminWallets.reduce((sum, wallet) => {
    return sum + (Number(wallet.balance) || 0);
  }, 0);
  
  // Final balance: use admin total for super admin, otherwise use wallet balance directly
  const balance = extendedUser?.isSuperAdmin ? adminTotalBalance : walletBalance;
  
  // Get company currency for balance display
  const company = (companyData as any)?.data || companyData;
  const companyCurrency = (company?.currency === 'AED' ? 'AED' : 'USD') as 'USD' | 'AED';
  
  // Format balance with company currency
  const formattedBalance = (() => {
    if (extendedUser?.isSuperAdmin) {
      // Super admin sees USD
      return `$${balance.toFixed(2)}`;
    } else {
      // Regular users see their company currency
      const convertedAmount = convertCurrency(balance, 'USD', companyCurrency);
      return formatCurrency(convertedAmount, companyCurrency);
    }
  })();
  
  // Wrapper component without admin currency context (handled by SadminLayout for super admins)
  const ContentWrapper = ({ children }: { children: React.ReactNode }) => {
    return <>{children}</>;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f5fafd]">
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link href={extendedUser?.isSuperAdmin ? "/admin" : "/"} className="inline-flex">
                <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" data-testid="logo-home-link">
                  <img 
                    src="/images/logo chip.png" 
                    alt="Company Logo" 
                    className="h-10 w-auto object-contain"
                    loading="eager"
                    decoding="async"
                  />
                  <div className="flex flex-col">
                    <h1 className="text-xl font-bold leading-tight">
                      <span className="text-[#ff7070]">SIM</span><span className="text-[#0d7a72]">TREE</span>
                    </h1>
                    <p className="text-xs text-gray-500 leading-tight">Global Connectivity</p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Right side navigation */}
            <div className="flex items-center space-x-4">
              {window.location.pathname === '/wallet' ? (
                <Link href={extendedUser?.isSuperAdmin ? "/admin" : "/"} className="inline-flex">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="whitespace-nowrap">Back to Dashboard</span>
                  </Button>
                </Link>
              ) : (
                <Link href="/wallet" className="inline-flex">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-white hover:bg-gray-50 transition-colors border border-[#0d7a72]/20 text-[#0d7a72] font-medium"
                    data-testid="balance-button"
                  >
                    <DollarSign className="h-5 w-5 text-[#0d7a72]" />
                    <span className="whitespace-nowrap">Balance: {formattedBalance}</span>
                  </Button>
                </Link>
              )}
              
              {/* Company Settings Button */}
              <Link href="/company/settings" className="inline-flex">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium"
                  data-testid="button-company-settings"
                >
                  <Settings className="h-4 w-4" />
                  <span className="whitespace-nowrap">Settings</span>
                </Button>
              </Link>
              
              {/* Take Tour Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={startOnboardingTour}
                className="gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700 font-medium"
                data-testid="button-start-tour"
              >
                <HelpCircle className="h-4 w-4" />
                <span className="whitespace-nowrap">Take Tour</span>
              </Button>
              
              {/* Notification Bell */}
              <NotificationBell />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout()}
                className="gap-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      <main className="flex-1 overflow-auto">
        <div className="w-full px-6 sm:px-8 lg:px-10 py-6">
          <ContentWrapper>
            {children}
          </ContentWrapper>
        </div>
      </main>
      
      {/* Tooltip Onboarding */}
      {showOnboarding && (
        <TooltipOnboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
    </div>
  );
}