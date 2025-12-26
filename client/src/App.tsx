import React from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useAuth, AuthProvider } from "@/hooks/use-auth.tsx";
import Loader2 from "@/components/Loader2";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import { ProtectedRoute } from "@/lib/protected-route";

// Import all pages directly for stable performance
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import CompleteProfile from "@/pages/complete-profile-enhanced";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminMaintenance from "@/pages/admin-maintenance";
import SadminCoupons from "@/pages/sadmin-coupons";
import FinancialReports from "@/pages/financial-reports";
import SystemStatusPage from "@/pages/admin/system-status";
import EmailTemplatesPage from "@/pages/admin/email-templates";
import TemplateManagerPage from "@/pages/admin/template-manager";
import ApiMonitoringPage from "@/pages/admin/api-monitoring";
import ApiDocumentationPage from "@/pages/admin/api-documentation";
import ConfigurationPage from "@/pages/admin/configuration";
import UsageMonitorPage from "@/pages/admin/usage-monitor";
import BillingPage from "@/pages/admin/billing";
import VerifyReset from "@/pages/verify-reset";
import SetPassword from "@/pages/set-password";
import AccountRecovery from "@/pages/account-recovery";
import WalletPage from "@/pages/wallet";
import PaymentSuccessPage from "@/pages/wallet/payment-success";
import PaymentCancelPage from "@/pages/wallet/payment-cancel";
import SimtreeWalletPage from "@/pages/wallet/simtree";
import CompanyWalletsPage from "@/pages/wallet/companies";
import ProviderWalletsPage from "@/pages/wallet/providers";
import WalletTransactionsPage from "@/pages/wallet/wallet-transactions";
import SimpleStripeTest from "@/pages/SimpleStripeTest";
import PublicStripeTest from "@/pages/public-stripe-test";
import StripeCheckoutTest from "@/pages/stripe-checkout-test";
import StripeTestPage from "@/pages/StripeTestPage";
import PciStripeTest from "@/pages/stripe-test";
import ESIMPlansPage from "@/pages/esim/plans";
import ESIMUsagePage from "@/pages/esim/usage";
import ESIMProvidersPage from "@/pages/esim/providers";
import PlansSearchPage from "@/pages/esim/plans-search";
import EmployeeHistory from "@/pages/employee-history";
import ProfilePage from "@/pages/profile";
import Legal from "@/pages/legal";
import UsageMonitor from "@/pages/UsageMonitor";
import EmployeesList from "@/pages/employees/list";
import EmployeeWallets from "@/pages/employees/wallets";
import CompaniesList from "@/pages/companies/list";
import PendingCompaniesList from "@/pages/companies/pending";
import CompanyTransactionsPage from "@/pages/wallet/company-transactions";
import CompanySettings from "@/pages/company-settings";

// Loading component for auth states
const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin" />
  </div>
);

function Router() {
  const { user, isLoading, needsCompleteProfile } = useAuth();

  // Minimal secure authentication logging
  React.useEffect(() => {
    if (!isLoading && import.meta.env.DEV) {
      // Only log authentication status in development mode
      if (import.meta.env.DEV) { console.log("Auth:", user ? "✓" : "✗"); }
    }
  }, [user, isLoading]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/auth">
          {() => <AuthPage />}
        </Route>
        <Route path="/complete-profile">
          {() => <CompleteProfile />}
        </Route>

        <Route path="/set-password">
          {() => <SetPassword />}
        </Route>
        <Route path="/set-password/:token/:userId">
          {({token, userId}) => <SetPassword token={token} userId={userId} />}
        </Route>
        <Route path="/verify-reset">
          {() => <VerifyReset />}
        </Route>
        <Route path="/account-recovery">
          {() => <AccountRecovery />}
        </Route>
        <Route path="/usage-monitor/:employeeId/:esimId">
          {({employeeId, esimId}) => <UsageMonitor />}
        </Route>
        <Route path="/legal" component={Legal} />
        <Route>
          {() => <Redirect to="/auth" />}
        </Route>
      </Switch>
    );
  }

  if (needsCompleteProfile) {
    return (
      <Switch>
        <Route path="/complete-profile">
          {() => <CompleteProfile />}
        </Route>
        <Route path="/legal" component={Legal} />
        <Route>
          {() => <Redirect to="/complete-profile" />}
        </Route>
      </Switch>
    );
  }

  // Admin specific routes - includes shared admin functionality
  if (user.role === 'admin') {
    return (
      <Switch>
        <Route path="/auth">
          <Redirect to="/" />
        </Route>
        <Route path="/complete-profile">
          {() => <CompleteProfile />}
        </Route>

        <Route path="/set-password">
          {() => <SetPassword />}
        </Route>
        <Route path="/set-password/:token/:userId">
          {({token, userId}) => <SetPassword token={token} userId={userId} />}
        </Route>
        <Route path="/verify-reset">
          {() => <VerifyReset />}
        </Route>
        <Route path="/account-recovery">
          {() => <AccountRecovery />}
        </Route>
        <Route path="/admin/dashboard">
          {() => <AdminDashboard />}
        </Route>
        <Route path="/admin-dashboard">
          {() => <AdminDashboard />}
        </Route>
        <Route path="/admin">
          {() => <Redirect to="/admin/dashboard" />}
        </Route>
        <Route path="/wallet">
          {() => <WalletPage />}
        </Route>
        <Route path="/wallet/payment-success">
          {() => <PaymentSuccessPage />}
        </Route>
        <Route path="/wallet/payment-cancel">
          {() => <PaymentCancelPage />}
        </Route>
        <Route path="/employee-history/:employeeId">
          {({employeeId}) => <EmployeeHistory />}
        </Route>
        <Route path="/profile">
          {() => <ProfilePage />}
        </Route>
        <Route path="/company/settings">
          {() => <CompanySettings />}
        </Route>
        <Route path="/stripe-test">
          {() => <StripeTestPage />}
        </Route>
        <Route path="/pci-stripe-test">
          {() => <PciStripeTest />}
        </Route>
        <Route path="/usage-monitor/:employeeId/:esimId">
          {({employeeId, esimId}) => <UsageMonitor />}
        </Route>
        <Route path="/legal" component={Legal} />
        <Route path="/dashboard">
          {() => <Dashboard />}
        </Route>
        <Route path="/">
          {() => <Dashboard />}
        </Route>
        <Route>
          <NotFound />
        </Route>
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/auth">
        {() => {
          if (user) {
            return user.role === 'superadmin' ? <Redirect to="/admin" /> : <Redirect to="/" />;
          }
          return <AuthPage />;
        }}
      </Route>
      <Route path="/complete-profile">
        {() => <CompleteProfile />}
      </Route>
      <Route path="/set-password">
        {() => <SetPassword />}
      </Route>
      <Route path="/set-password/:token/:userId">
        {({token, userId}) => <SetPassword token={token} userId={userId} />}
      </Route>
      <Route path="/account-recovery">
        {() => <AccountRecovery />}
      </Route>
      <Route path="/complete-profile">
        {() => <CompleteProfile />}
      </Route>
      <Route path="/verify-reset">
        {() => <VerifyReset />}
      </Route>
      
      {/* Super Admin Routes */}
      <ProtectedRoute path="/admin" component={AdminDashboard} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/employees" component={EmployeesList} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/employees/list" component={EmployeesList} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/employees/wallets" component={EmployeeWallets} requireRole={["superadmin"]} />
      
      {/* Legacy routes for backward compatibility */}
      <ProtectedRoute path="/employees" component={EmployeesList} requireRole={["superadmin"]} />
      <ProtectedRoute path="/employees/list" component={EmployeesList} requireRole={["superadmin"]} />
      <ProtectedRoute path="/employees/wallets" component={EmployeeWallets} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/companies" component={CompaniesList} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/companies/list" component={CompaniesList} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/companies/pending" component={PendingCompaniesList} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/maintenance" component={AdminMaintenance} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/wallet/simtree" component={SimtreeWalletPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/wallet/companies" component={CompanyWalletsPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/wallet/providers" component={ProviderWalletsPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/wallet/transactions" component={WalletTransactionsPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/wallet/wallet-transactions" component={WalletTransactionsPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/wallet/company-transactions" component={CompanyTransactionsPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/wallet/company-transactions" component={CompanyTransactionsPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/coupon" component={SadminCoupons} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/billing" component={BillingPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/reports" component={FinancialReports} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/email-templates" component={EmailTemplatesPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/template-manager" component={TemplateManagerPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/api-monitoring" component={ApiMonitoringPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/api-documentation" component={ApiDocumentationPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/configuration" component={ConfigurationPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/usage-monitor" component={UsageMonitorPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/admin/system-status" component={SystemStatusPage} requireRole={["superadmin"]} />
      
      {/* eSIM Routes */}
      <ProtectedRoute path="/esim/plans" component={ESIMPlansPage} />
      <ProtectedRoute path="/esim/usage" component={ESIMUsagePage} />
      <ProtectedRoute path="/esim/providers" component={ESIMProvidersPage} requireRole={["superadmin"]} />
      <ProtectedRoute path="/esim/plans-search" component={PlansSearchPage} />
      
      {/* Test Routes */}
      <Route path="/simple-stripe-test">
        {() => <SimpleStripeTest />}
      </Route><Route path="/public-stripe-test">
        {() => <PublicStripeTest />}
      </Route>
      <ProtectedRoute path="/stripe-checkout-test" component={StripeCheckoutTest} />
      <ProtectedRoute path="/stripe-test" component={StripeTestPage} />
      <ProtectedRoute path="/pci-stripe-test" component={PciStripeTest} requireRole={["superadmin"]} />
      
      {/* Company Routes */}
      <ProtectedRoute path="/wallet" component={WalletPage} />
      <ProtectedRoute path="/wallet/payment-success" component={PaymentSuccessPage} />
      <ProtectedRoute path="/wallet/payment-cancel" component={PaymentCancelPage} />
      <ProtectedRoute path="/employee-history/:employeeId" component={EmployeeHistory} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/company/settings" component={CompanySettings} />
      <Route path="/usage-monitor/:employeeId/:esimId">
        {({employeeId, esimId}) => <UsageMonitor />}
      </Route>
      <Route path="/legal" component={Legal} />
      
      {/* Default Routes - Redirect superadmin to admin panel */}
      <Route path="/dashboard">
        {() => {
          if (user?.isSuperAdmin || user?.role === 'superadmin') {
            return <Redirect to="/admin/dashboard" />;
          }
          return <Dashboard />;
        }}
      </Route>
      <Route path="/">
        {() => {
          if (user?.isSuperAdmin || user?.role === 'superadmin') {
            return <Redirect to="/admin/dashboard" />;
          }
          return <Dashboard />;
        }}
      </Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="min-h-screen bg-background">
          <Router />
          <Toaster />
          <CookieConsentBanner />
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}