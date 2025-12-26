import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Smartphone, Globe, Calendar, Signal, Database, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UsageData {
  success: boolean;
  data: {
    esim: {
      id: number;
      orderId: string;
      iccid: string;
      status: {
        text: string;
        color: string;
      };
      purchaseDate: string | null;
      activationDate: string | null;
      expiryDate: string | null;
    };
    plan: {
      name: string;
      description: string | null;
      totalDataGB: number;
      validity: number;
      countries: string[];
      speed: string | null;
    } | null;
    usage: {
      usedDataGB: number;
      remainingDataGB: number;
      usagePercentage: number;
      totalDataGB: number;
    };
    employee: {
      name: string;
      position: string;
    };
    company: {
      name: string;
    } | null;
    lastUpdated: string;
    isExpired: boolean;
  };
}

const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const ErrorDisplay = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="flex flex-col items-center justify-center min-h-screen p-6">
    <div className="text-center max-w-md">
      <div className="mb-4 text-red-500">
        <Database className="w-16 h-16 mx-auto mb-4" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Usage Data</h1>
      <p className="text-gray-600 mb-6">{message}</p>
      <Button onClick={onRetry} className="flex items-center gap-2">
        <RefreshCw className="w-4 h-4" />
        Try Again
      </Button>
    </div>
  </div>
);

export default function UsageMonitor() {
  const params = useParams();
  const employeeId = params.employeeId;
  const esimId = params.esimId;
  
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsageData = async () => {
    try {
      const response = await fetch(`/usage/${employeeId}/${esimId}`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to fetch usage data');
      }
      
      if (!result.success) {
        throw new Error(result.message || 'Invalid response format');
      }
      
      setData(result);
      setError(null);
    } catch (err) {
      console.error('Error fetching usage data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (employeeId && esimId) {
      fetchUsageData();
    } else {
      setError('Invalid URL parameters');
      setLoading(false);
    }
  }, [employeeId, esimId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchUsageData();
  };

  const formatData = (gb: number) => {
    if (gb >= 1) {
      return `${gb.toFixed(2)} GB`;
    }
    return `${Math.round(gb * 1024)} MB`;
  };

  const getStatusBadgeColor = (color: string) => {
    switch (color.toLowerCase()) {
      case 'green':
        return 'bg-green-100 text-green-800';
      case 'orange':
        return 'bg-orange-100 text-orange-800';
      case 'red':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !data) {
    return <ErrorDisplay message={error || 'No data available'} onRetry={handleRefresh} />;
  }

  const { esim, plan, usage, employee, company, lastUpdated, isExpired } = data.data;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">eSIM Usage Monitor</h1>
              <p className="text-gray-600 mt-2">Real-time data usage tracking for your eSIM</p>
            </div>
            <Button 
              onClick={handleRefresh} 
              disabled={refreshing}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Status and Warning Cards */}
        {isExpired && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-800">
                <Calendar className="w-5 h-5" />
                <span className="font-semibold">This eSIM has expired</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Usage Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Data Usage Overview
              </CardTitle>
              <CardDescription>Current usage statistics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Used: {formatData(usage.usedDataGB)}</span>
                    <span className="text-sm text-gray-500">
                      {usage.usagePercentage.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={usage.usagePercentage} className="h-3" />
                  <div className="flex justify-between items-center mt-2 text-sm text-gray-600">
                    <span>0 GB</span>
                    <span>{formatData(usage.totalDataGB)} Total</span>
                  </div>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Remaining</p>
                    <p className="text-lg font-semibold text-green-600">
                      {formatData(usage.remainingDataGB)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Allowance</p>
                    <p className="text-lg font-semibold">
                      {formatData(usage.totalDataGB)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* eSIM Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                eSIM Information
              </CardTitle>
              <CardDescription>Device and connection details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Status:</span>
                  <Badge className={getStatusBadgeColor(esim.status.color)}>
                    {esim.status.text}
                  </Badge>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Order ID:</span>
                  <span className="text-sm font-mono">{esim.orderId}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm font-medium">ICCID:</span>
                  <span className="text-sm font-mono truncate ml-2" title={esim.iccid}>
                    {esim.iccid}
                  </span>
                </div>
                
                {esim.purchaseDate && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Purchased:</span>
                    <span className="text-sm">{esim.purchaseDate}</span>
                  </div>
                )}
                
                {esim.activationDate && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Activated:</span>
                    <span className="text-sm">{esim.activationDate}</span>
                  </div>
                )}
                
                {esim.expiryDate && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Expires:</span>
                    <span className={`text-sm ${isExpired ? 'text-red-600 font-semibold' : ''}`}>
                      {esim.expiryDate}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plan Details */}
        {plan && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Plan Details
              </CardTitle>
              <CardDescription>{plan.description || 'Your current plan information'}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Plan Name</p>
                  <p className="font-semibold">{plan.name}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600">Data Allowance</p>
                  <p className="font-semibold">{formatData(plan.totalDataGB)}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600">Validity</p>
                  <p className="font-semibold">{plan.validity} days</p>
                </div>
                
                {plan.speed && (
                  <div>
                    <p className="text-sm text-gray-600">Network Speed</p>
                    <p className="font-semibold flex items-center gap-1">
                      <Signal className="w-4 h-4" />
                      {plan.speed}
                    </p>
                  </div>
                )}
              </div>
              
              {plan.countries && plan.countries.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600 mb-2">Coverage Countries</p>
                  <div className="flex flex-wrap gap-2">
                    {plan.countries.map((country, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {country.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Account Information
            </CardTitle>
            <CardDescription>User and company details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Employee</p>
                <p className="font-semibold">{employee.name}</p>
                <p className="text-sm text-gray-500">{employee.position}</p>
              </div>
              
              {company && (
                <div>
                  <p className="text-sm text-gray-600">Company</p>
                  <p className="font-semibold">{company.name}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Last updated: {new Date(lastUpdated).toLocaleString()}</p>
          <p className="mt-2">Usage data is updated regularly throughout the day</p>
        </div>
      </div>
    </div>
  );
}