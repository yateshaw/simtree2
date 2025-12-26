import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from '@/lib/queryClient';
import { AlertCircle, CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { ServerConnection, ConnectionLog } from '@shared/schema';
import { useEventSource } from '@/hooks/useEventSource';
import { EventTypes } from '@/lib/events';

// Type for backend ServerStatus
type ServerStatus = 'online' | 'offline' | 'degraded' | 'warning' | 'unknown';

// Type for service status display
interface ServiceStatus {
  status: ServerStatus;
  lastChecked: string;
  responseTime?: number;
  message?: string | null;
}

const StatusIcon = ({ status }: { status: ServerStatus }) => {
  switch (status) {
    case 'online':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'offline':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'degraded':
      return <AlertTriangle className="h-5 w-5 text-orange-500" />;
    case 'warning':
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    default:
      return <Clock className="h-5 w-5 text-gray-500" />;
  }
};

const StatusBadge = ({ status }: { status: ServerStatus }) => {
  const variants: Record<ServerStatus, string> = {
    online: 'bg-green-100 text-green-800 border-green-300',
    offline: 'bg-red-100 text-red-800 border-red-300',
    degraded: 'bg-orange-100 text-orange-800 border-orange-300',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    unknown: 'bg-gray-100 text-gray-800 border-gray-300'
  };

  const labels: Record<ServerStatus, string> = {
    online: 'Online',
    offline: 'Offline',
    degraded: 'Degraded',
    warning: 'Warning',
    unknown: 'Unknown'
  };

  return (
    <Badge variant="outline" className={`${variants[status]} px-2 py-1`}>
      <StatusIcon status={status} />
      <span className="ml-1">{labels[status]}</span>
    </Badge>
  );
};

const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
};

const formatTimeAgo = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
};

export const ConnectionMonitoring: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('status');
  const { events } = useEventSource();

  // Types for API responses
  interface ApiResponse<T> {
    success: boolean;
    data: T;
  }

  // Process SSE events for connection monitoring updates
  useEffect(() => {
    const connectionEvents = events.filter(event => event.type === EventTypes.CONNECTION_STATUS);
    if (connectionEvents.length > 0) {
      // Invalidate queries when connection status updates are received
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance/connections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance/service-statuses'] });
    }
  }, [events, queryClient]);

  // Get all connections - converted from polling to SSE
  const { 
    data: connections, 
    isLoading: isLoadingConnections,
    error: connectionsError
  } = useQuery<ApiResponse<ServerConnection[]>>({ 
    queryKey: ['/api/maintenance/connections'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Get all service statuses - converted from polling to SSE
  const { 
    data: serviceStatuses, 
    isLoading: isLoadingStatuses,
    error: statusesError
  } = useQuery<ApiResponse<Record<string, ServiceStatus>>>({ 
    queryKey: ['/api/maintenance/service-statuses'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Get connection logs - keep minimal polling for logs as they're less critical
  const { 
    data: logs, 
    isLoading: isLoadingLogs,
    error: logsError
  } = useQuery<ApiResponse<ConnectionLog[]>>({ 
    queryKey: ['/api/maintenance/connection-logs'],
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false
  });

  // Manual check of a service
  const checkServiceMutation = useMutation({
    mutationFn: (serviceName: string) => 
      apiRequest(`/api/maintenance/connections/check/${serviceName}`, { 
        method: 'POST' 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance/connections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance/service-statuses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance/connection-logs'] });
    }
  });

  // Delete old logs
  const deleteOldLogsMutation = useMutation({
    mutationFn: (days: number) => 
      apiRequest(`/api/maintenance/connection-logs?days=${days}`, { 
        method: 'DELETE' 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance/connection-logs'] });
    }
  });
  
  const handleServiceCheck = (serviceName: string) => {
    checkServiceMutation.mutate(serviceName);
  };

  const handleDeleteOldLogs = (days: number) => {
    if (confirm(`Delete connection logs older than ${days} days?`)) {
      deleteOldLogsMutation.mutate(days);
    }
  };

  if (isLoadingConnections || isLoadingStatuses) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (connectionsError || statusesError) {
    return (
      <div className="bg-red-50 p-4 rounded-md border border-red-200 flex items-center space-x-2 text-red-700">
        <AlertCircle className="h-5 w-5" />
        <span>Error loading connection data. Please try again later.</span>
      </div>
    );
  }

  return (
    <Tabs 
      defaultValue="status" 
      value={activeTab} 
      onValueChange={setActiveTab}
      className="w-full"
    >
      <TabsList className="grid grid-cols-2">
        <TabsTrigger value="status">Service Status</TabsTrigger>
        <TabsTrigger value="logs">Connection Logs</TabsTrigger>
      </TabsList>
      
      <TabsContent value="status" className="space-y-4 pt-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">API Services Status</h3>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/maintenance/connections'] });
              queryClient.invalidateQueries({ queryKey: ['/api/maintenance/service-statuses'] });
            }}
            className="flex items-center gap-1"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Check</TableHead>
              <TableHead className="text-right">Response Time</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {connections?.data && serviceStatuses?.data && 
              Object.entries(serviceStatuses.data).map(([serviceName, serviceStatus]) => {
                const connection = connections.data.find(conn => conn.serviceName === serviceName);
                return (
                  <TableRow key={serviceName}>
                    <TableCell className="font-medium">{serviceName}</TableCell>
                    <TableCell>
                      <StatusBadge status={serviceStatus.status as ServerStatus} />
                    </TableCell>
                    <TableCell>{formatTimeAgo(serviceStatus.lastChecked)}</TableCell>
                    <TableCell className="text-right">
                      {serviceStatus.responseTime ? `${serviceStatus.responseTime}ms` : 'N/A'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {serviceStatus.message || 'No message'}
                    </TableCell>
                    <TableCell>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleServiceCheck(serviceName)}
                        disabled={checkServiceMutation.isPending}
                      >
                        {checkServiceMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <span>Check Now</span>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            }
          </TableBody>
        </Table>
      </TabsContent>
      
      <TabsContent value="logs" className="space-y-4 pt-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Connection Logs</h3>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/maintenance/connection-logs'] })}
              className="flex items-center gap-1"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleDeleteOldLogs(30)}
              disabled={deleteOldLogsMutation.isPending}
              className="flex items-center gap-1"
            >
              <XCircle className="h-4 w-4" />
              Clear Old Logs
            </Button>
          </div>
        </div>

        {isLoadingLogs ? (
          <Skeleton className="h-[400px] w-full" />
        ) : logsError ? (
          <div className="bg-red-50 p-4 rounded-md border border-red-200 flex items-center space-x-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>Error loading connection logs. Please try again later.</span>
          </div>
        ) : (
          <div className="border rounded-md max-h-[400px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Response Time</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs?.data && logs.data.map((log, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{log.serviceName}</TableCell>
                    <TableCell>
                      <StatusBadge status={log.status as ServerStatus} />
                    </TableCell>
                    <TableCell>{formatDateTime(log.timestamp)}</TableCell>
                    <TableCell>{log.responseTime ? `${log.responseTime}ms` : 'N/A'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {log.message || 'No message'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
};