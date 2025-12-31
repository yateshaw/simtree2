import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SadminLayout from "@/components/layout/SadminLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 
import { FixCompanyDataTool } from "@/components/admin/FixCompanyDataTool";
import { ConnectionMonitoring } from "@/components/admin/ConnectionMonitoring";
import StatusUpdates from "@/components/common/StatusUpdates";
import TemplateManager from "@/components/admin/TemplateManager";
import { StatusFlowMonitor } from "@/components/admin/StatusFlowMonitor";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity, RefreshCw, Users, Mail, Bell, Wallet, Loader2 } from "lucide-react"; 
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function AdminMaintenance() {
  const { user } = useAuth();
  const isSadminUser = user?.username === 'sadmin' && user?.isSuperAdmin;
  const [location] = useLocation();
  const { toast } = useToast();
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [rebalanceResult, setRebalanceResult] = useState<{ updated: number; total: number } | null>(null);

  const handleRebalanceWallets = async () => {
    setIsRebalancing(true);
    setRebalanceResult(null);
    try {
      const response = await apiRequest('/api/admin/rebalance-wallets', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setRebalanceResult({ updated: data.updated, total: data.total });
        toast({
          title: "Wallets Rebalanced",
          description: `Successfully updated ${data.updated} of ${data.total} wallets.`,
        });
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to rebalance wallets",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to rebalance wallets",
        variant: "destructive",
      });
    } finally {
      setIsRebalancing(false);
    }
  };

  // Only super admins can access maintenance page
  if (user && !user.isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[70vh]">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">You don't have permission to access this page.</p>
          <Link href="/admin">
            <Button variant="outline">Return to Dashboard</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // Handle tab query parameter and references to specific components
  const [activeTab, setActiveTab] = useState<string>("maintenance");
  const statusRef = React.useRef<HTMLDivElement>(null);
  const fixRef = React.useRef<HTMLDivElement>(null);
  const monitorRef = React.useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Parse the URL query parameters
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get('tab');
    
    // Map query parameters to appropriate tabs and scroll to relevant sections
    if (tabParam) {
      switch(tabParam) {
        case 'status':
          setActiveTab('maintenance');
          // Scroll to system status section after a short delay to ensure the DOM is ready
          setTimeout(() => {
            if (statusRef.current) {
              statusRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          }, 100);
          break;
        case 'fix':
          setActiveTab('maintenance');
          // Scroll to eSIM fix section after a short delay
          setTimeout(() => {
            if (fixRef.current) {
              fixRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          }, 100);
          break;
        case 'email':
          setActiveTab('templates');
          break;
        case 'flow':
        case 'flow-monitor':
          setActiveTab('flow-monitor');
          break;
        case 'monitor':
          setActiveTab('maintenance');
          // Scroll to API monitoring section after a short delay
          setTimeout(() => {
            if (monitorRef.current) {
              monitorRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          }, 100);
          break;
        default:
          setActiveTab('maintenance');
      }
    }
  }, [location]);

  const renderMaintenanceContent = () => (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:p-6 rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
            System Administration
          </h1>
        </div>
        {!isSadminUser && (
          <Link href="/admin">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft size={16} />
              Back to Dashboard
            </Button>
          </Link>
        )}
      </div>

        <Tabs defaultValue="maintenance" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="maintenance" className="text-base">
              System Maintenance
            </TabsTrigger>
            <TabsTrigger value="flow-monitor" className="text-base">
              Status Flow Monitor
            </TabsTrigger>
            <TabsTrigger value="realtime" className="text-base">
              Real-time Updates
            </TabsTrigger>
            <TabsTrigger value="templates" className="text-base">
              Email Templates
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="maintenance" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">


              <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 pb-3">
                  <CardTitle className="flex items-center gap-2 text-purple-800">
                    <Users size={20} />
                    Company Data Fixer
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-5">
                  <FixCompanyDataTool />
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
                <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 pb-3">
                  <CardTitle className="flex items-center gap-2 text-green-800">
                    <Wallet size={20} />
                    Wallet Balance Recalculation
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Recalculate all wallet balances from transaction history. Use this if wallet balances appear incorrect or show $0.00.
                    </p>
                    <Button 
                      onClick={handleRebalanceWallets} 
                      disabled={isRebalancing}
                      className="w-full bg-green-600 hover:bg-green-700"
                      data-testid="button-rebalance-wallets"
                    >
                      {isRebalancing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Recalculating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Recalculate All Wallet Balances
                        </>
                      )}
                    </Button>
                    {rebalanceResult && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-3">
                        <p className="text-sm text-green-800">
                          Updated {rebalanceResult.updated} of {rebalanceResult.total} wallets.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all" ref={statusRef}>
              <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 pb-3">
                <CardTitle className="flex items-center gap-2 text-purple-800">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" x2="12" y1="16" y2="12"></line>
                    <line x1="12" x2="12.01" y1="8" y2="8"></line>
                  </svg>
                  System Information
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h3 className="text-sm font-medium mb-2">Application Version</h3>
                    <p className="text-sm text-gray-600">1.0.0</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h3 className="text-sm font-medium mb-2">Environment</h3>
                    <p className="text-sm text-gray-600">Production</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h3 className="text-sm font-medium mb-2">Last Maintenance</h3>
                    <p className="text-sm text-gray-600">April 12, 2025</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            


            <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all" ref={monitorRef}>
              <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 pb-3">
                <CardTitle className="flex items-center gap-2 text-purple-800">
                  <Activity size={20} />
                  API Connection Monitoring
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <ConnectionMonitoring />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="flow-monitor" className="space-y-6">
            <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <Activity size={20} />
                  eSIM Status Flow Monitor
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <StatusFlowMonitor />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="realtime" className="space-y-6">
            <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <Bell size={20} />
                  Real-time Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <StatusUpdates isSuperAdmin={user?.isSuperAdmin} />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="templates" className="space-y-6">
            <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 pb-3">
                <CardTitle className="flex items-center gap-2 text-purple-800">
                  <Mail size={20} />
                  Email Template Management
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <TemplateManager />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );

  return isSadminUser ? (
    <SadminLayout>
      {renderMaintenanceContent()}
    </SadminLayout>
  ) : (
    <DashboardLayout>
      {renderMaintenanceContent()}
    </DashboardLayout>
  );
}