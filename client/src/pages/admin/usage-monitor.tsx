import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import SadminLayout from "@/components/layout/SadminLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Activity, 
  Smartphone, 
  TrendingUp, 
  Clock, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Download
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface EmployeeUsageData {
  employeeId: number;
  employeeName: string;
  companyName: string;
  companyId: number;
  esims: Array<{
    id: number;
    orderId: string;
    iccid: string;
    planName: string;
    dataLimit: string;
    dataUsed: string;
    usagePercentage: number;
    status: string;
    purchaseDate: string;
    activationDate: string | null;
    expiryDate: string | null;
    lastUpdated: string | null;
  }>;
  totalDataLimit: number;
  totalDataUsed: number;
  totalUsagePercentage: number;
  activeEsimsCount: number;
  expiredEsimsCount: number;
}

interface UsageOverviewData {
  employees: EmployeeUsageData[];
  summary: {
    totalEmployees: number;
    totalActiveEsims: number;
    totalExpiredEsims: number;
    totalDataLimit: string;
    totalDataUsed: string;
    averageUsagePercentage: number;
    lastUpdated: string;
  };
}

export default function UsageMonitorPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);

  const isSadminUser = user?.username === 'sadmin' && user?.isSuperAdmin;

  // Fetch usage overview data
  const { data: usageData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/admin/usage-monitor/usage-overview'],
    queryFn: async () => {
      const result = await apiRequest('/api/admin/usage-monitor/usage-overview');
      if (result.success) {
        return result.data as UsageOverviewData;
      }
      throw new Error(result.error || 'Failed to fetch usage data');
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch sync status
  const { data: syncStatus } = useQuery({
    queryKey: ['/api/admin/usage-monitor/sync-status'],
    queryFn: async () => {
      const result = await apiRequest('/api/admin/usage-monitor/sync-status');
      if (result.success) {
        return result.data;
      }
      return null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Manual sync mutation
  const syncUsageMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const result = await fetch(`/api/admin/usage-monitor/sync-usage/${orderId}`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).then(res => res.json());
      if (!result.success) {
        throw new Error(result.error || 'Failed to sync usage');
      }
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Usage data synced successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/usage-monitor/usage-overview'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'activated':
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'expired':
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  const formatDataSize = (sizeGB: string | number) => {
    const size = typeof sizeGB === 'string' ? parseFloat(sizeGB) : sizeGB;
    if (size < 1) {
      return `${(size * 1024).toFixed(0)}MB`;
    }
    return `${size.toFixed(2)}GB`;
  };

  const renderContent = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Activity className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">
              eSIM Usage Monitor
            </h1>
            <p className="text-sm text-gray-600">
              Real-time data usage tracking for all eSIMs by employee
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Sync Schedule Info */}
      {syncStatus && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-blue-900">Automated Usage Sync</p>
                <p className="text-sm text-blue-700">
                  {syncStatus.scheduledSync?.interval} • {syncStatus.note}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-900">Error Loading Data</p>
                <p className="text-sm text-red-700">{error.message}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {usageData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usageData.summary.totalEmployees}</div>
              <p className="text-xs text-muted-foreground">Active accounts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active eSIMs</CardTitle>
              <Smartphone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {usageData.employees.reduce((total, exec) => 
                  total + exec.esims.filter(e => e.status === 'activated').length, 0
                )}
              </div>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Waiting for Activation</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {usageData.employees.reduce((total, exec) => 
                  total + exec.esims.filter(e => e.status === 'waiting_for_activation').length, 0
                )}
              </div>
              <p className="text-xs text-muted-foreground">Pending activation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Data Used</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatDataSize(usageData.summary.totalDataUsed)}</div>
              <p className="text-xs text-muted-foreground">
                of {formatDataSize(usageData.summary.totalDataLimit)} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Usage</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getUsageColor(usageData.summary.averageUsagePercentage)}`}>
                {usageData.summary.averageUsagePercentage}%
              </div>
              <p className="text-xs text-muted-foreground">Across all eSIMs</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Employee Overview</TabsTrigger>
          <TabsTrigger value="details">Detailed eSIM View</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {usageData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Usage by Employee
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {usageData.employees.map((employee) => (
                    <div key={employee.employeeId} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-medium">{employee.employeeName}</h3>
                          <p className="text-sm text-gray-600">{employee.companyName}</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-semibold ${getUsageColor(employee.totalUsagePercentage)}`}>
                            {employee.totalUsagePercentage}%
                          </div>
                          <p className="text-xs text-gray-600">
                            {formatDataSize(employee.totalDataUsed)} / {formatDataSize(employee.totalDataLimit)}
                          </p>
                        </div>
                      </div>
                      
                      <Progress 
                        value={employee.totalUsagePercentage} 
                        className="mb-3"
                      />
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          {employee.esims.filter(e => e.status === 'activated').length} Active
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-orange-600" />
                          {employee.esims.filter(e => e.status === 'waiting_for_activation').length} Waiting
                        </span>
                        {employee.expiredEsimsCount > 0 && (
                          <span className="flex items-center gap-1">
                            <XCircle className="h-4 w-4 text-red-600" />
                            {employee.expiredEsimsCount} Expired
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedEmployee(
                            expandedEmployee === employee.employeeId ? null : employee.employeeId
                          )}
                        >
                          {expandedEmployee === employee.employeeId ? 'Hide' : 'Show'} eSIMs
                        </Button>
                      </div>

                      {expandedEmployee === employee.employeeId && (
                        <div className="mt-4 space-y-2">
                          {employee.esims.map((esim) => (
                            <div key={esim.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                              <div>
                                <p className="font-medium text-sm">{esim.planName}</p>
                                <p className="text-xs text-gray-600">{esim.orderId}</p>
                              </div>
                              <div className="text-right">
                                <Badge className={getStatusColor(esim.status)}>{esim.status}</Badge>
                                <p className="text-xs text-gray-600 mt-1">
                                  {formatDataSize(esim.dataUsed)} / {formatDataSize(esim.dataLimit)} ({esim.usagePercentage}%)
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => syncUsageMutation.mutate(esim.orderId)}
                                disabled={syncUsageMutation.isPending}
                              >
                                <RefreshCw className={`h-4 w-4 ${syncUsageMutation.isPending ? 'animate-spin' : ''}`} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          {usageData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  All eSIMs Detailed View
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageData.employees.flatMap(employee =>
                      employee.esims.map(esim => (
                        <TableRow key={esim.id}>
                          <TableCell className="font-medium">{employee.employeeName}</TableCell>
                          <TableCell>{employee.companyName}</TableCell>
                          <TableCell>{esim.planName}</TableCell>
                          <TableCell className="font-mono text-xs">{esim.orderId}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(esim.status)}>{esim.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {esim.usagePercentage !== undefined && esim.dataUsed !== undefined && esim.dataLimit !== undefined ? (
                              <div className="space-y-1">
                                <div className={`font-medium ${getUsageColor(esim.usagePercentage)}`}>
                                  {esim.usagePercentage}%
                                </div>
                                <div className="text-xs text-gray-600">
                                  {formatDataSize(esim.dataUsed)} / {formatDataSize(esim.dataLimit)}
                                </div>
                                <Progress value={esim.usagePercentage} className="h-1" />
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500">
                                {esim.status === 'waiting_for_activation' ? 'Pending activation' : 'No usage data'}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-gray-600">
                            {esim.lastUpdated ? formatDistanceToNow(new Date(esim.lastUpdated), { addSuffix: true }) : 'Never'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => syncUsageMutation.mutate(esim.orderId)}
                              disabled={syncUsageMutation.isPending}
                            >
                              <RefreshCw className={`h-4 w-4 ${syncUsageMutation.isPending ? 'animate-spin' : ''}`} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
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