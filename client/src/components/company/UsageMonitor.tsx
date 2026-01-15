import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, TrendingUp, Eye, Smartphone, Users, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { Skeleton } from '@/components/ui/skeleton';

// Interface for usage data
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
    planValidity: number | null;
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

// Helper function to format data size
const formatDataSize = (sizeStr: string): string => {
  const size = parseFloat(sizeStr);
  if (size >= 1) {
    return `${size.toFixed(2)}GB`;
  } else {
    return `${(size * 1024).toFixed(0)}MB`;
  }
};

// Helper function to get usage color
const getUsageColor = (percentage: number): string => {
  if (percentage >= 90) return 'text-red-600';
  if (percentage >= 70) return 'text-yellow-600';
  return 'text-green-600';
};

export default function UsageMonitor() {
  const { user } = useAuth();
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);

  // Get company ID from user context
  const companyId = user?.companyId;

  // Fetch usage data for this company
  const { data: usageData, isLoading, error, refetch } = useQuery({
    queryKey: [`/api/admin/usage-monitor/company-usage/${companyId}`],
    queryFn: async () => {
      if (!companyId) throw new Error('No company ID available');
      const result = await apiRequest(`/api/admin/usage-monitor/company-usage/${companyId}`);
      if (result.success) {
        return result.data as UsageOverviewData;
      }
      throw new Error(result.error || 'Failed to fetch usage data');
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-2">Failed to load usage data</div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  if (!usageData) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">No usage data available</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Usage Monitor</h2>
          <p className="text-sm text-gray-500">Track your employees' data usage across all eSIM plans. Data updated every 2-3 hours.</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usageData.summary.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">With eSIM plans</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active eSIMs</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {usageData.summary.totalActiveEsims}
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
      </div>

      {/* Employee Usage Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Usage by Employee
          </CardTitle>
          <CardDescription>
            Detailed breakdown of data usage for each employee. Usage data is updated every 2-3 hours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {usageData.employees.map((employee) => (
              <div key={employee.employeeId} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">{employee.employeeName}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {employee.activeEsimsCount} active
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {employee.esims.filter(e => e.status === 'waiting_for_activation').length} waiting
                      </Badge>
                    </div>
                  </div>
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
                
                {/* Show individual plan details for each active eSIM */}
                <div className="space-y-3">
                  {employee.esims.map((esim) => (
                    <div key={esim.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-medium text-sm">{esim.planName}</div>
                          <div className="text-xs text-gray-500">
                            {formatDataSize(esim.dataLimit)} • {esim.planValidity ? `${esim.planValidity} days` : 'N/A'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-semibold ${getUsageColor(esim.usagePercentage)}`}>
                            {esim.usagePercentage}%
                          </div>
                          <p className="text-xs text-gray-600">
                            {formatDataSize(esim.dataUsed)} / {formatDataSize(esim.dataLimit)}
                          </p>
                        </div>
                      </div>
                      <Progress 
                        value={esim.usagePercentage} 
                        className="h-2"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <Badge 
                          variant={esim.status === 'activated' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {esim.status === 'activated' ? 'In Use' : esim.status === 'waiting_for_activation' ? 'Waiting' : esim.status}
                        </Badge>
                        {esim.lastUpdated && (
                          <span className="text-xs text-gray-500">
                            Updated: {new Date(esim.lastUpdated).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Expanded eSIM Details - show additional info like order ID */}
                {expandedEmployee === employee.employeeId && (
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <div className="text-xs text-gray-500 font-medium mb-2">Technical Details</div>
                    {employee.esims.map((esim) => (
                      <div key={`detail-${esim.id}`} className="flex items-center justify-between p-2 bg-gray-100 rounded text-xs">
                        <div>
                          <div className="font-medium">{esim.planName}</div>
                          <div className="text-gray-600">
                            Order: {esim.orderId} • ICCID: ...{esim.iccid.slice(-8)}
                          </div>
                        </div>
                        <div className="text-right text-gray-600">
                          {esim.activationDate && (
                            <div>Activated: {new Date(esim.activationDate).toLocaleDateString()}</div>
                          )}
                          {esim.expiryDate && (
                            <div>Expires: {new Date(esim.expiryDate).toLocaleDateString()}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}