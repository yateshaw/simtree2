import React, { useState, useEffect, createContext, useContext } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  Users,
  Building,
  CreditCard,
  Gift,
  Settings,
  Wifi,
  Activity,
  Globe,
  HelpCircle,
  BarChart,
  RefreshCw,
  Mail,
  FileText,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight as ChevronExpand,
  Receipt
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Create a context for the sidebar collapsed state just for the items
const SidebarContext = createContext(false);

// Sidebar menu item interface
interface SidebarItemProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  active: boolean;
  hasSubmenu?: boolean;
  expanded?: boolean;
  toggleExpand?: () => void;
  onItemClick?: () => void;
}

// Submenu item interface
interface SidebarSubmenuItemProps {
  href: string;
  title: string;
  active: boolean;
  onItemClick?: () => void;
}

// Sidebar menu item component
const SidebarItem = ({
  href,
  icon,
  title,
  active,
  hasSubmenu = false,
  expanded = false,
  toggleExpand,
  onItemClick
}: SidebarItemProps) => {
  // Access isCollapsed from parent component context
  const isCollapsed = useContext(SidebarContext);
  
  // If sidebar is collapsed, wrap with tooltip for title
  const content = (
    <div className={cn("relative", { "mb-1": !hasSubmenu })}>
      <Link href={href}>
        <div
          className={cn(
            "flex items-center py-2.5 text-sm font-medium rounded-md cursor-pointer transition-colors group",
            isCollapsed ? "justify-center px-2" : "px-4",
            active && !hasSubmenu
              ? "bg-indigo-100 text-indigo-900"
              : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-800"
          )}
          onClick={(e) => {
            if (isCollapsed) {
              // When sidebar is collapsed, clicking any icon should expand it
              e.preventDefault();
              (window as any).sidebarExpandHandler?.();
              return;
            }
            if (hasSubmenu && toggleExpand) {
              e.preventDefault();
              toggleExpand();
            }
            if (!hasSubmenu && onItemClick) {
              onItemClick();
            }
          }}
        >
          <span className={cn(
            isCollapsed ? "mr-0" : "mr-3",
            active ? "text-indigo-700" : "text-gray-500 group-hover:text-indigo-600"
          )}>
            {icon}
          </span>
          {!isCollapsed && <span>{title}</span>}
          {hasSubmenu && !isCollapsed && (
            <span className="ml-auto">
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
  
  // If collapsed, wrap with tooltip
  if (isCollapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {content}
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{title}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return content;
};

// Submenu item component
const SidebarSubmenuItem = ({ href, title, active, onItemClick }: SidebarSubmenuItemProps) => {
  const isCollapsed = useContext(SidebarContext);
  
  // If sidebar is collapsed, don't show submenu items
  if (isCollapsed) return null;
  
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center py-2 pl-10 pr-4 text-sm rounded-md cursor-pointer transition-colors",
          active
            ? "bg-indigo-50 text-indigo-900"
            : "text-gray-600 hover:bg-indigo-50 hover:text-indigo-800"
        )}
        onClick={onItemClick}
      >
        <span className="w-2 h-2 mr-2 rounded-full bg-indigo-300"></span>
        {title}
      </div>
    </Link>
  );
};

export default function SadminSidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  
  // State for sidebar collapse
  const [isCollapsed, setIsCollapsed] = useState(true);
  
  // State for mobile sidebar
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Function to expand sidebar and dispatch event
  const expandSidebar = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      
      // Dispatch custom event to notify layout of sidebar state change
      const event = new CustomEvent('sidebarToggle', { 
        detail: { expanded: true } 
      });
      window.dispatchEvent(event);
    }
  };
  
  // Track expanded state for submenus
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    companies: false,
    employees: false,
    esim: false,
    wallet: false,
    tools: true,
  });
  
  // Toggle submenu expansion
  const toggleSubmenu = (menu: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menu]: !prev[menu]
    }));
  };

  // Close mobile sidebar when clicking on a menu item
  const closeMobileSidebar = () => {
    if (isMobile) {
      setIsMobileOpen(false);
    }
  };
  
  // Check if a path is active, handling both path and query parameters
  const isActive = (path: string) => {
    // Special case for dashboard
    if (path === '/admin/dashboard' && (location === '/admin/dashboard' || location === '/admin')) {
      return true;
    }
    
    // For paths with query parameters (like /admin-maintenance?tab=status)
    if (path.includes('?')) {
      const [basePath, queryString] = path.split('?');
      const searchParams = new URLSearchParams(queryString);
      const currentSearchParams = new URLSearchParams(window.location.search);
      
      // Check if base path matches and if the specified query parameter matches
      if (location.startsWith(basePath)) {
        // For tab parameters, verify the correct tab is active
        if (searchParams.has('tab')) {
          return currentSearchParams.get('tab') === searchParams.get('tab');
        }
        return true;
      }
      return false;
    }
    
    // For regular paths without query parameters
    if (path !== '/admin/dashboard' && path !== '/admin' && location.startsWith(path)) {
      // If the current location has no query parameters or we're not checking a maintenance path
      if (!location.includes('?') || !path.includes('admin-maintenance')) {
        return true;
      }
    }
    
    return false;
  };
  
  // Check if a submenu has an active child
  const hasActiveChild = (paths: string[]) => {
    return paths.some(path => isActive(path));
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
    
    // Register the expand sidebar handler for menu items to use
    (window as any).sidebarExpandHandler = expandSidebar;
    
    // Clean up
    return () => {
      window.removeEventListener('resize', checkIfMobile);
      delete (window as any).sidebarExpandHandler;
    };
  }, []);

  // The sidebar content - shared between desktop and mobile views
  const renderSidebarContent = () => (
    <div className={cn(
      "flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-300 ease-in-out",
      isCollapsed ? "w-16" : "w-full"
    )}>
      {/* Logo and brand section */}
      <div className={cn(
        "border-b border-gray-200",
        isCollapsed ? "px-2 py-4" : "px-4 py-5"
      )}>
        <div className="flex items-center">
          <Link href="/admin">
            <div className={cn(
              "flex items-center cursor-pointer hover:opacity-80 transition-opacity",
              isCollapsed ? "gap-0" : "gap-3"
            )}>
              <img 
                src="/images/logo chip.png" 
                alt="Company Logo" 
                className={cn(
                  "object-contain",
                  isCollapsed ? "h-8 w-auto" : "h-10 w-auto"
                )}
                loading="eager"
                decoding="async"
              />
              {!isCollapsed && (
                <div className="flex flex-col">
                  <h1 className="text-xl font-bold leading-tight">
                    <span className="text-[#ff7070]">SIM</span><span className="text-[#0d7a72]">TREE</span>
                  </h1>
                  <p className="text-xs text-gray-500 leading-tight">Global Connectivity</p>
                </div>
              )}
            </div>
          </Link>
          {isMobile && !isCollapsed && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="ml-auto text-gray-500"
              onClick={() => setIsMobileOpen(false)}
            >
              <X size={20} />
            </Button>
          )}
          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "text-gray-500 hover:text-indigo-700",
                isCollapsed ? "ml-auto" : "ml-auto"
              )}
              onClick={() => {
                const newState = !isCollapsed;
                setIsCollapsed(newState);
                
                // Dispatch custom event to notify layout of sidebar state change
                const event = new CustomEvent('sidebarToggle', { 
                  detail: { expanded: !newState } 
                });
                window.dispatchEvent(event);
              }}
            >
              {isCollapsed ? <ChevronExpand size={16} /> : <ChevronLeft size={16} />}
            </Button>
          )}
        </div>
      </div>
      
      {/* Sidebar menu */}
      <div className="flex-1 py-4 px-2 overflow-y-auto">
        <div className="space-y-1">
          <SidebarItem
            href="/admin"
            icon={<BarChart size={20} />}
            title="Dashboard"
            active={isActive('/admin/dashboard') || (isActive('/admin') && !location.includes('/admin-maintenance'))}
            onItemClick={closeMobileSidebar}
          />
          
          {/* Companies section */}
          <SidebarItem
            href="/admin/companies"
            icon={<Building size={20} />}
            title="Companies"
            active={hasActiveChild(['/admin/companies'])}
            hasSubmenu={true}
            expanded={expandedMenus.companies}
            toggleExpand={() => toggleSubmenu('companies')}
          />
          
          {expandedMenus.companies && (
            <div className="ml-2 pb-1 space-y-1 border-l border-gray-200 pl-2">
              <SidebarSubmenuItem
                href="/admin/companies/list"
                title="All Companies"
                active={isActive('/admin/companies/list')}
                onItemClick={closeMobileSidebar}
              />
              <SidebarSubmenuItem
                href="/admin/companies/pending"
                title="Pending Approvals"
                active={isActive('/admin/companies/pending')}
                onItemClick={closeMobileSidebar}
              />
            </div>
          )}
          
          {/* Employees section */}
          <SidebarItem
            href="/admin/employees/list"
            icon={<Users size={20} />}
            title="Employees"
            active={isActive('/admin/employees/list') || hasActiveChild(['/admin/employees'])}
            onItemClick={closeMobileSidebar}
          />
          
          {/* Wallet Management section */}
          <SidebarItem
            href="/admin/wallet/simtree"
            icon={<CreditCard size={20} />}
            title="Wallet Management"
            active={hasActiveChild(['/admin/wallet'])}
            hasSubmenu={true}
            expanded={expandedMenus.wallet}
            toggleExpand={() => toggleSubmenu('wallet')}
          />
          
          {expandedMenus.wallet && (
            <div className="ml-2 pb-1 space-y-1 border-l border-gray-200 pl-2">
              <SidebarSubmenuItem
                href="/admin/wallet/simtree"
                title="SimTree Wallet"
                active={isActive('/admin/wallet/simtree')}
                onItemClick={closeMobileSidebar}
              />
              <SidebarSubmenuItem
                href="/admin/wallet/companies"
                title="Company Wallets"
                active={isActive('/admin/wallet/companies')}
                onItemClick={closeMobileSidebar}
              />
              <SidebarSubmenuItem
                href="/admin/wallet/providers"
                title="eSIM Access Payments"
                active={isActive('/admin/wallet/providers')}
                onItemClick={closeMobileSidebar}
              />
            </div>
          )}
          
          {/* eSIM Management section */}
          <SidebarItem
            href="/esim/plans"
            icon={<Wifi size={20} />}
            title="eSIM Management"
            active={hasActiveChild(['/esim'])}
            hasSubmenu={true}
            expanded={expandedMenus.esim}
            toggleExpand={() => toggleSubmenu('esim')}
          />
          
          {expandedMenus.esim && (
            <div className="ml-2 pb-1 space-y-1 border-l border-gray-200 pl-2">
              <SidebarSubmenuItem
                href="/esim/plans"
                title="eSIM Plans"
                active={isActive('/esim/plans')}
                onItemClick={closeMobileSidebar}
              />
              <SidebarSubmenuItem
                href="/esim/usage"
                title="Usage Analytics"
                active={isActive('/esim/usage')}
                onItemClick={closeMobileSidebar}
              />
              <SidebarSubmenuItem
                href="/esim/providers"
                title="Providers"
                active={isActive('/esim/providers')}
                onItemClick={closeMobileSidebar}
              />
            </div>
          )}
          
          {/* Coupons section */}
          <SidebarItem
            href="/admin/coupon"
            icon={<Gift size={20} />}
            title="Coupons"
            active={isActive('/admin/coupon')}
            onItemClick={closeMobileSidebar}
          />
          
          {/* Financial section */}
          <SidebarItem
            href="/admin/reports"
            icon={<BarChart size={20} />}
            title="Financial Reports"
            active={isActive('/admin/reports')}
            onItemClick={closeMobileSidebar}
          />
          
          {/* Billing section */}
          <SidebarItem
            href="/admin/billing"
            icon={<Receipt size={20} />}
            title="Billing Management"
            active={isActive('/admin/billing')}
            onItemClick={closeMobileSidebar}
          />
          
          {!isCollapsed && (
            <div className="pt-4 pb-2">
              <div className="px-2 space-y-1">
                <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Maintenance
                </p>
              </div>
            </div>
          )}
          
          {/* Tools section */}
          <SidebarItem
            href="/admin/maintenance"
            icon={<Settings size={20} />}
            title="Maintenance Tools"
            active={isActive('/admin/maintenance')}
            hasSubmenu={true}
            expanded={expandedMenus.tools}
            toggleExpand={() => toggleSubmenu('tools')}
          />
          
          {expandedMenus.tools && (
            <div className="ml-2 pb-1 space-y-1 border-l border-gray-200 pl-2">
              <SidebarSubmenuItem
                href="/admin/system-status"
                title="System Status"
                active={isActive('/admin/system-status')}
                onItemClick={closeMobileSidebar}
              />

              <SidebarSubmenuItem
                href="/admin/maintenance?tab=flow-monitor"
                title="Status Flow Monitor"
                active={isActive('/admin/maintenance') && location.includes('flow-monitor')}
                onItemClick={closeMobileSidebar}
              />
              <SidebarSubmenuItem
                href="/admin/email-templates"
                title="Email Templates"
                active={isActive('/admin/email-templates')}
                onItemClick={closeMobileSidebar}
              />
              <SidebarSubmenuItem
                href="/admin/api-monitoring"
                title="API Monitoring"
                active={isActive('/admin/api-monitoring')}
                onItemClick={closeMobileSidebar}
              />
              <SidebarSubmenuItem
                href="/admin/api-documentation"
                title="API Documentation"
                active={isActive('/admin/api-documentation')}
                onItemClick={closeMobileSidebar}
              />
              <SidebarSubmenuItem
                href="/admin/configuration"
                title="System Configuration"
                active={isActive('/admin/configuration')}
                onItemClick={closeMobileSidebar}
              />
              <SidebarSubmenuItem
                href="/admin/usage-monitor"
                title="Usage Monitor"
                active={isActive('/admin/usage-monitor')}
                onItemClick={closeMobileSidebar}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* User section - now without logout button */}
      <div className="border-t border-gray-200 py-4 px-2">
        <div className={cn(
          "flex items-center",
          isCollapsed ? "justify-center" : "px-2"
        )}>
          <div className={cn(
            "flex items-center gap-2"
          )}>
            <img 
              src="/images/logo chip.png" 
              alt="Company Logo" 
              className={cn(
                "object-contain",
                isCollapsed ? "h-6 w-auto" : "h-8 w-auto"
              )}
              loading="eager"
              decoding="async"
            />
            {!isCollapsed && (
              <div>
                <p className="text-sm font-medium text-gray-800">Super Admin</p>
                <p className="text-xs text-gray-500">sadmin@esimplatform.com</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <SidebarContext.Provider value={isCollapsed}>
      {/* Mobile version - uses Sheet component for slide-out drawer */}
      {isMobile ? (
        <>
          {/* Mobile menu button */}
          <div className="fixed top-4 left-4 z-50">
            <Button
              variant="ghost"
              size="icon"
              className="bg-white shadow-md border border-gray-200 text-gray-700"
              onClick={() => setIsMobileOpen(true)}
            >
              <Menu size={20} />
            </Button>
          </div>
          
          {/* Mobile sidebar using Sheet component */}
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetContent side="left" className="p-0 max-w-[280px] sm:max-w-[350px]">
              {renderSidebarContent()}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        // Desktop version - always present sidebar (either collapsed or expanded)
        <aside 
          className={cn(
            "h-full bg-white border-r border-gray-200 shadow-sm transition-all duration-300 ease-in-out",
            isCollapsed ? "w-16" : "w-64"
          )}
        >
          {renderSidebarContent()}
          
          {/* Toggle button at bottom of sidebar */}
          <div className="absolute bottom-4 right-0 transform translate-x-1/2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full h-8 w-8 p-0 flex items-center justify-center bg-white border border-gray-200 shadow-sm"
              onClick={() => {
                const newState = !isCollapsed;
                setIsCollapsed(newState);
                
                // Dispatch custom event to notify layout of sidebar state change
                const event = new CustomEvent('sidebarToggle', { 
                  detail: { expanded: !newState } 
                });
                window.dispatchEvent(event);
              }}
            >
              {isCollapsed ? <ChevronExpand size={14} /> : <ChevronLeft size={14} />}
            </Button>
          </div>
        </aside>
      )}
    </SidebarContext.Provider>
  );
}