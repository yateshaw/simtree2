import React, { useState, useEffect } from 'react';
import { useAuth } from "@/hooks/use-auth";
import SadminSidebar from './SadminSidebar';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogOut, DollarSign } from 'lucide-react';
import { Currency } from '@shared/utils/currency';
import { AdminCurrencyContext, useAdminCurrency } from '@/hooks/use-admin-currency';

interface ExtendedUser {
  id: number;
  username: string;
  role: string;
  isSuperAdmin?: boolean;
}


interface SadminLayoutProps {
  children: React.ReactNode;
}

export default function SadminLayout({
  children
}: SadminLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(64); // Default to 64px (minimized)
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  
  // Use the global currency manager
  const { adminCurrency, setAdminCurrency } = useAdminCurrency();
  
  // Handle sidebar width changes
  const handleSidebarResize = (width: number) => {
    setSidebarWidth(width);
  };
  
  // Check if we're on mobile on component mount and window resize
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768); // 768px is standard md breakpoint
    };
    
    // Check initially
    checkIfMobile();
    
    // Set up event listener for window resize
    window.addEventListener('resize', checkIfMobile);
    
    // Clean up
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Create an event listener to handle sidebar expansion state
  useEffect(() => {
    const handleSidebarChange = (e: CustomEvent) => {
      setSidebarExpanded(e.detail.expanded);
    };
    
    // Add event listener for custom sidebar toggle event
    window.addEventListener('sidebarToggle' as any, handleSidebarChange as any);
    
    return () => {
      window.removeEventListener('sidebarToggle' as any, handleSidebarChange as any);
    };
  }, []);
  
  // If no user is logged in, redirect to auth page (handles logout case)
  if (!user) {
    window.location.href = '/auth';
    return null;
  }
  
  // Only sadmin users should use this layout
  if (!user.isSuperAdmin) {
    return <div className="p-8 text-center">
      <h1 className="text-xl font-bold text-red-600">Access Denied</h1>
      <p className="mt-2 text-gray-600">You don't have permission to access this area.</p>
    </div>;
  }

  // Get page title based on current location
  const getPageTitle = () => {
    if (location === '/admin') return 'Super Admin Dashboard';
    if (location.includes('maintenance')) return 'System Maintenance';
    if (location.includes('coupons')) return 'Coupon Management';
    if (location.includes('companies')) return 'Company Management';
    if (location.includes('employees')) return 'Employee Management';
    if (location.includes('esim')) return 'eSIM Management';
    return 'SIMTREE Admin';
  };

  
  return (
    <div className="flex h-screen bg-gray-50">
        {/* Sidebar - always present but minimized */}
        <SadminSidebar />
        
        {/* Main content area with header and content */}
        <div className="flex-1 flex flex-col">
          {/* Header with currency selector and logout button */}
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">{getPageTitle()}</h1>
            <div className="flex items-center gap-4">
              {/* Currency Selector */}
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-gray-600" />
                <Select value={adminCurrency} onValueChange={(value) => {
                  console.log('[SadminLayout] Currency dropdown changed from', adminCurrency, 'to', value);
                  setAdminCurrency(value as Currency);
                }}>
                  <SelectTrigger className="w-[80px] h-8 text-sm border-gray-200 focus:border-blue-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                  </SelectContent>
                </Select>
                {/* Test buttons for debugging */}
                <button 
                  onClick={() => {
                    console.log('[TEST] Forcing currency to USD');
                    setAdminCurrency('USD');
                  }}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  USD
                </button>
                <button 
                  onClick={() => {
                    console.log('[TEST] Forcing currency to AED');
                    setAdminCurrency('AED');
                  }}
                  className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  AED
                </button>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout()}
                className="gap-2 text-gray-600 hover:text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
            </div>
          </header>
          
          {/* Main content - scrollable */}
          <main className={cn(
            "flex-1 overflow-y-auto pb-10",
            "transition-all duration-300 ease-in-out",
            isMobile ? "pt-0 ml-0" : "ml-0"
          )}>
            <div className="container px-4 py-6 mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
  );
}