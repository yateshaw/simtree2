import React, { useState } from 'react';
import SadminLayout from '@/components/layout/SadminLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, BarChart, Wifi, Percent } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ESIMUsage {
  id: number;
  employeeId: number;
  employeeName: string;
  companyName: string;
  planName: string;
  dataLimit: string;
  dataUsed: string;
  startDate: string;
  expiryDate: string | null;
  status: string;
  percentage: number;
}

export default function ESIMUsagePage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  
  // Fetch eSIM usage data
  const { data: usageData, isLoading: isLoadingUsage } = useQuery({
    queryKey: ['/api/admin/usage-monitor/usage-overview'],
    queryFn: async () => {
      try {
        const result = await apiRequest('/api/admin/usage-monitor/usage-overview');
        if (result.success && result.data) {
          // Transform the data to match the expected format
          const { employees, summary } = result.data;
          
          // Get high usage eSIMs (sorted by percentage)
          const highestUsage: ESIMUsage[] = [];
          const usageSummary: ESIMUsage[] = [];
          
          for (const employee of employees || []) {
            for (const esim of employee.esims || []) {
              const usageItem: ESIMUsage = {
                id: esim.id,
                employeeId: employee.employeeId,
                employeeName: employee.employeeName,
                companyName: employee.companyName,
                planName: esim.planName,
                dataLimit: esim.dataLimit,
                dataUsed: esim.dataUsed,
                startDate: esim.purchaseDate,
                expiryDate: esim.expiryDate,
                status: esim.status,
                percentage: esim.usagePercentage || 0,
              };
              usageSummary.push(usageItem);
            }
          }
          
          // Sort by percentage for highest usage
          const sortedByUsage = [...usageSummary].sort((a, b) => b.percentage - a.percentage);
          
          return {
            totalActive: summary?.totalActiveEsims || 0,
            totalInactive: usageSummary.filter(e => e.status === 'waiting_for_activation' || e.status === 'inactive').length,
            totalExpired: summary?.totalExpiredEsims || 0,
            highestUsage: sortedByUsage.slice(0, 5), // Top 5 highest usage
            usageSummary: usageSummary
          };
        }
        return {
          totalActive: 0,
          totalInactive: 0,
          totalExpired: 0,
          highestUsage: [],
          usageSummary: []
        };
      } catch (error) {
        console.error("Error fetching eSIM usage data:", error);
        toast({
          title: "Error",
          description: "Failed to load eSIM usage data. Please try again.",
          variant: "destructive",
        });
        return {
          totalActive: 0,
          totalInactive: 0,
          totalExpired: 0,
          highestUsage: [],
          usageSummary: []
        };
      }
    }
  });

  // Format data size to GB with 2 decimal places
  const formatDataSize = (sizeInGB: string) => {
    return parseFloat(sizeInGB).toFixed(2) + " GB";
  };

  // Calculate percentage of data used
  const calculatePercentage = (used: string, limit: string) => {
    const usedValue = parseFloat(used);
    const limitValue = parseFloat(limit);
    
    if (limitValue === 0) return 0;
    return Math.min(Math.round((usedValue / limitValue) * 100), 100);
  };

  // Get status badge variant based on status
  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'default';
      case 'inactive':
        return 'secondary';
      case 'expired':
        return 'destructive';
      case 'waiting_for_activation':
        return 'warning';
      default:
        return 'outline';
    }
  };

  // Format date string
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Get progress variant based on percentage
  const getProgressVariant = (percentage: number) => {
    if (percentage >= 90) return 'destructive';
    if (percentage >= 75) return 'warning';
    return 'default';
  };

  return (
    <SadminLayout>
      <div className="container mx-auto py-6">
        <h1 className="text-3xl font-bold mb-6">eSIM Usage Analytics</h1>
        
        <Tabs defaultValue="overview" className="w-full mb-6">
          <TabsList className="grid w-full md:w-auto grid-cols-2">
            <TabsTrigger value="overview" onClick={() => setActiveTab('overview')}>Overview</TabsTrigger>
            <TabsTrigger value="detailed" onClick={() => setActiveTab('detailed')}>Detailed Usage</TabsTrigger>
          </TabsList>
        </Tabs>
        
        {activeTab === 'overview' && (
          <div className="grid gap-6 md:grid-cols-3 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active eSIMs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoadingUsage ? <Loader2 className="h-5 w-5 animate-spin" /> : usageData?.totalActive || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Currently active eSIMs
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Waiting for Activation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoadingUsage ? <Loader2 className="h-5 w-5 animate-spin" /> : usageData?.totalInactive || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  eSIMs not yet activated
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Expired</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoadingUsage ? <Loader2 className="h-5 w-5 animate-spin" /> : usageData?.totalExpired || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Expired or cancelled eSIMs
                </p>
              </CardContent>
            </Card>
          </div>
        )}
        
        {activeTab === 'overview' && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>High Data Usage</CardTitle>
              <CardDescription>
                eSIMs with the highest data usage percentages
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingUsage ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  {(usageData?.highestUsage || []).map((usage: ESIMUsage, index: number) => (
                    <div key={index} className="flex items-center justify-between space-x-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center">
                          <Wifi className="mr-2 h-4 w-4 text-muted-foreground" />
                          <p className="text-sm font-medium">{usage.employeeName}</p>
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({usage.companyName})
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{usage.planName}</span>
                          <span>
                            {formatDataSize(usage.dataUsed)} / {formatDataSize(usage.dataLimit)}
                          </span>
                        </div>
                        <Progress 
                          value={usage.percentage} 
                          className={`h-2 ${
                            getProgressVariant(usage.percentage) === 'destructive' 
                              ? 'bg-red-500' 
                              : getProgressVariant(usage.percentage) === 'warning'
                                ? 'bg-yellow-500'
                                : ''
                          }`}
                        />
                      </div>
                      <div className="w-14 text-right">
                        <div className="text-sm font-bold flex items-center justify-end">
                          {usage.percentage}%
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {(!usageData?.highestUsage || usageData.highestUsage.length === 0) && (
                    <div className="text-center py-6 text-muted-foreground">
                      No data usage information available
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        {activeTab === 'detailed' && (
          <Card>
            <CardHeader>
              <CardTitle>Detailed eSIM Usage</CardTitle>
              <CardDescription>
                Complete breakdown of all eSIM data plans and their current usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingUsage ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Data Usage</TableHead>
                        <TableHead>Usage %</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(usageData?.usageSummary || []).length > 0 ? (
                        (usageData?.usageSummary || []).map((usage: ESIMUsage) => {
                          const percentage = calculatePercentage(usage.dataUsed, usage.dataLimit);
                          return (
                            <TableRow key={usage.id}>
                              <TableCell className="font-medium">{usage.employeeName}</TableCell>
                              <TableCell>{usage.companyName}</TableCell>
                              <TableCell>{usage.planName}</TableCell>
                              <TableCell>
                                <div className="flex flex-col space-y-1">
                                  <span className="text-xs text-muted-foreground">
                                    {formatDataSize(usage.dataUsed)} / {formatDataSize(usage.dataLimit)}
                                  </span>
                                  <Progress 
                                    value={percentage} 
                                    className={`h-2 ${
                                      getProgressVariant(percentage) === 'destructive' 
                                        ? 'bg-red-500' 
                                        : getProgressVariant(percentage) === 'warning'
                                          ? 'bg-yellow-500'
                                          : ''
                                    }`}
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center">
                                  <Percent className="mr-1 h-3 w-3 text-muted-foreground" />
                                  <span className={
                                    percentage >= 90 ? "text-red-500 font-bold" : 
                                    percentage >= 75 ? "text-amber-500 font-medium" : 
                                    "text-muted-foreground"
                                  }>
                                    {percentage}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(usage.startDate)}</TableCell>
                              <TableCell>{formatDate(usage.expiryDate)}</TableCell>
                              <TableCell>
                                <Badge variant={getStatusBadgeVariant(usage.status)}>
                                  {usage.status.charAt(0).toUpperCase() + usage.status.slice(1).replace(/_/g, ' ')}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                            No eSIM usage data found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </SadminLayout>
  );
}