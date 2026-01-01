import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import SadminLayout from "@/components/layout/SadminLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wallet, RefreshCw, Loader2, Database } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function SystemStatusPage() {
  const { user } = useAuth();
  const isSadminUser = user?.username === 'sadmin' && user?.isSuperAdmin;
  const { toast } = useToast();
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [rebalanceResult, setRebalanceResult] = useState<{ updated: number; total: number } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ migrated: number; created: number; message: string } | null>(null);

  const handleRebalanceWallets = async () => {
    setIsRebalancing(true);
    setRebalanceResult(null);
    try {
      const data = await apiRequest<{ success: boolean; message?: string; updated?: number; total?: number }>('/api/admin/rebalance-wallets', { method: 'POST' });
      if (data.success) {
        setRebalanceResult({ updated: data.updated || 0, total: data.total || 0 });
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

  const handleMigrateSimtreeWallets = async () => {
    setIsMigrating(true);
    setMigrateResult(null);
    try {
      const data = await apiRequest<{ success: boolean; message?: string; migrated?: number; created?: number }>('/api/admin/migrate-simtree-wallets', { method: 'POST' });
      if (data.success) {
        setMigrateResult({ migrated: data.migrated || 0, created: data.created || 0, message: data.message || '' });
        toast({
          title: "SimTree Wallets Migrated",
          description: data.message || "Migration completed successfully.",
        });
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to migrate SimTree wallets",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to migrate SimTree wallets",
        variant: "destructive",
      });
    } finally {
      setIsMigrating(false);
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

  const renderContent = () => (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:p-6 rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
            System Status
          </h1>
        </div>
        <Link href="/admin-maintenance">
          <Button variant="outline" className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Back to Maintenance
          </Button>
        </Link>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
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

        <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Database size={20} />
              SimTree Wallet Migration
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Fix SimTree wallet data. Use this if SimTree wallets show $0.00 after recalculation - it migrates wallets to the correct company ID and recalculates balances.
              </p>
              <Button 
                onClick={handleMigrateSimtreeWallets} 
                disabled={isMigrating}
                className="w-full bg-blue-600 hover:bg-blue-700"
                data-testid="button-migrate-simtree-wallets"
              >
                {isMigrating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Migrating...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    Migrate SimTree Wallets
                  </>
                )}
              </Button>
              {migrateResult && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-800">
                    {migrateResult.message}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return isSadminUser ? (
    <SadminLayout>
      {renderContent()}
    </SadminLayout>
  ) : (
    <DashboardLayout>
      {renderContent()}
    </DashboardLayout>
  );
}