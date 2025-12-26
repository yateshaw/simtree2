import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import WebhookMonitoringDashboard from "./WebhookMonitoringDashboard";
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  XCircle, 
  Activity,
  ArrowRight,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  Zap
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEventSource } from '@/hooks/useEventSource';
import { EventTypes } from '@/lib/events';

interface StatusFlowEvent {
  id: number;
  esimId: number;
  employeeId: number;
  employeeName: string;
  orderId: string;
  fromStatus: string;
  toStatus: string;
  timestamp: string;
  isValidTransition: boolean;
  validationErrors: string[];
  metadata: any;
  providerStatus?: string;
}

interface FlowValidation {
  esimId: number;
  orderId: string;
  employeeName: string;
  currentStatus: string;
  expectedStatus: string;
  isValid: boolean;
  issues: string[];
  stuckDuration?: number;
  lastUpdate: string;
}

interface StatusFlowStats {
  totalEsims: number;
  statusCounts: Record<string, number>;
  invalidTransitions: number;
  stuckEsims: number;
  avgActivationTime: number;
  successRate: number;
}

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  'no_plan': ['pending'],
  'pending': ['waiting_for_activation', 'cancelled'],
  'waiting_for_activation': ['activated', 'cancelled'],
  'activated': ['active', 'expired', 'cancelled'],
  'active': ['expired', 'cancelled'],
  'expired': ['cancelled'],
  'cancelled': []
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  'no_plan': 'Employee has no assigned plan',
  'pending': 'eSIM order placed, waiting for provider to process',
  'waiting_for_activation': 'eSIM ready with QR code, waiting for user activation',
  'activated': 'eSIM activated by user but not yet showing usage',
  'active': 'eSIM actively being used with data consumption',
  'expired': 'eSIM reached expiry date or data limit',
  'cancelled': 'eSIM cancelled and refunded'
};

const EXPECTED_FLOW_STEPS = [
  { 
    status: 'no_plan', 
    description: 'Employee created without plan', 
    duration: 0,
    webhooks: [],
    sse: [],
    triggers: ['Manual plan assignment']
  },
  { 
    status: 'pending', 
    description: 'Plan purchased, eSIM being provisioned', 
    duration: 300,
    webhooks: ['Provider provisioning status'],
    sse: ['Wallet balance update', 'Order status change'],
    triggers: ['Provider API response', 'Provisioning completion webhook']
  },
  { 
    status: 'waiting_for_activation', 
    description: 'QR code ready, waiting for user', 
    duration: 86400,
    webhooks: ['QR code generation', 'Activation detection'],
    sse: ['QR code available', 'Activation reminders'],
    triggers: ['User scans QR code', 'Activation webhook from provider']
  },
  { 
    status: 'activated', 
    description: 'User scanned QR, eSIM connecting', 
    duration: 900,
    webhooks: ['Network connection status', 'First data usage'],
    sse: ['Connection status', 'Data usage detection'],
    triggers: ['First data usage webhook', 'Network registration']
  },
  { 
    status: 'active', 
    description: 'eSIM in use, data flowing', 
    duration: null,
    webhooks: ['Usage updates', 'Data limit warnings', 'Expiry notifications'],
    sse: ['Real-time usage updates', 'Alert notifications'],
    triggers: ['Plan expiry', 'Data limit reached', 'User cancellation']
  }
];

export function StatusFlowMonitor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { events } = useEventSource();

  // Process SSE events for status flow updates
  useEffect(() => {
    const statusEvents = events.filter(event => 
      event.type === EventTypes.ESIM_STATUS_CHANGE || 
      event.type === EventTypes.EXECUTIVE_UPDATE
    );
    if (statusEvents.length > 0) {
      // Invalidate status flow queries when eSIM status changes
      queryClient.invalidateQueries({ queryKey: ['/api/admin/status-flow-events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/status-flow-validations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/status-flow-stats'] });
    }
  }, [events, queryClient]);

  // Fetch status flow events - converted from polling to SSE
  const { data: flowEvents, isLoading: eventsLoading, refetch: refetchEvents } = useQuery<StatusFlowEvent[]>({
    queryKey: ['/api/admin/status-flow-events'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Fetch flow validations - converted from polling to SSE
  const { data: flowValidations, isLoading: validationsLoading, refetch: refetchValidations } = useQuery<FlowValidation[]>({
    queryKey: ['/api/admin/status-flow-validations'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Fetch flow statistics - converted from polling to SSE
  const { data: flowStats, isLoading: statsLoading, refetch: refetchStats } = useQuery<StatusFlowStats>({
    queryKey: ['/api/admin/status-flow-stats'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Fix stuck eSIMs mutation
  const fixStuckEsimsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/fix-stuck-esims', {
        method: 'POST'
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Stuck eSIMs Fixed",
        description: `Fixed ${data.fixed} stuck eSIMs`
      });
      refetchValidations();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to fix stuck eSIMs",
        variant: "destructive"
      });
    }
  });

  // Force status sync mutation
  const forceStatusSyncMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/force-status-sync', {
        method: 'POST'
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Status Sync Complete",
        description: `Synced ${data.synced} eSIMs with provider`
      });
      refetchEvents();
      refetchValidations();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to sync status with provider",
        variant: "destructive"
      });
    }
  });

  const getStatusBadge = (status: string, isValid: boolean = true) => {
    const baseClasses = "font-medium text-xs";
    
    if (!isValid) {
      return <Badge variant="destructive" className={baseClasses}>Invalid: {status}</Badge>;
    }

    switch (status) {
      case 'no_plan':
        return <Badge variant="outline" className={`${baseClasses} bg-gray-100 text-gray-700`}>No Plan</Badge>;
      case 'pending':
        return <Badge variant="secondary" className={`${baseClasses} bg-blue-100 text-blue-700`}>Pending</Badge>;
      case 'waiting_for_activation':
        return <Badge variant="secondary" className={`${baseClasses} bg-yellow-100 text-yellow-700`}>Waiting Activation</Badge>;
      case 'activated':
        return <Badge variant="secondary" className={`${baseClasses} bg-green-100 text-green-700`}>Activated</Badge>;
      case 'active':
        return <Badge variant="default" className={`${baseClasses} bg-green-500 text-white`}>Active</Badge>;
      case 'expired':
        return <Badge variant="secondary" className={`${baseClasses} bg-orange-100 text-orange-700`}>Expired</Badge>;
      case 'cancelled':
        return <Badge variant="destructive" className={baseClasses}>Cancelled</Badge>;
      default:
        return <Badge variant="outline" className={baseClasses}>{status}</Badge>;
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const getProgressForStatus = (status: string, duration: number) => {
    const step = EXPECTED_FLOW_STEPS.find(s => s.status === status);
    if (!step || !step.duration) return 100;
    
    const progress = Math.min((duration / step.duration) * 100, 100);
    return progress;
  };

  if (eventsLoading || validationsLoading || statsLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Loading status flow monitor...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Status Flow Monitor
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Monitor and validate eSIM status transitions throughout the complete lifecycle
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {autoRefresh ? 'Pause' : 'Resume'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetchEvents();
                  refetchValidations();
                  refetchStats();
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="flow-events">Flow Events</TabsTrigger>
          <TabsTrigger value="validations">Validations</TabsTrigger>
          <TabsTrigger value="webhook-monitoring">Webhook Monitor</TabsTrigger>
          <TabsTrigger value="expected-flow">Expected Flow</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {flowStats && (
            <>
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{flowStats.totalEsims}</div>
                    <div className="text-sm text-muted-foreground">Total eSIMs</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-red-600">{flowStats.invalidTransitions}</div>
                    <div className="text-sm text-muted-foreground">Invalid Transitions</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-yellow-600">{flowStats.stuckEsims}</div>
                    <div className="text-sm text-muted-foreground">Stuck eSIMs</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-green-600">{flowStats.successRate.toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">Success Rate</div>
                  </CardContent>
                </Card>
              </div>

              {/* Status Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(flowStats.statusCounts).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(status)}
                        </div>
                        <span className="font-semibold">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* eSIM Lifecycle Flow with Webhooks and SSE */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-blue-500" />
                    Complete eSIM Lifecycle Flow
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    How webhooks and real-time updates work at each stage
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {EXPECTED_FLOW_STEPS.map((step, index) => (
                      <div key={step.status} className="relative">
                        {index < EXPECTED_FLOW_STEPS.length - 1 && (
                          <div className="absolute left-6 top-12 w-0.5 h-16 bg-border"></div>
                        )}
                        
                        <div className="flex gap-4">
                          <div className="flex-shrink-0">
                            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-sm font-medium ${
                              step.status === 'no_plan' ? 'bg-gray-100 border-gray-300 text-gray-600' :
                              step.status === 'pending' ? 'bg-blue-100 border-blue-300 text-blue-700' :
                              step.status === 'waiting_for_activation' ? 'bg-yellow-100 border-yellow-300 text-yellow-700' :
                              step.status === 'activated' ? 'bg-purple-100 border-purple-300 text-purple-700' :
                              'bg-green-100 border-green-300 text-green-700'
                            }`}>
                              {index + 1}
                            </div>
                          </div>
                          
                          <div className="flex-grow">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg capitalize">
                                {step.status.replace('_', ' ')}
                              </h3>
                              {step.duration && (
                                <Badge variant="outline" className="text-xs">
                                  Max {step.duration < 3600 ? `${Math.round(step.duration/60)}min` : 
                                       step.duration < 86400 ? `${Math.round(step.duration/3600)}hr` : 
                                       `${Math.round(step.duration/86400)}day`}
                                </Badge>
                              )}
                            </div>
                            
                            <p className="text-muted-foreground mb-3">{step.description}</p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {/* Webhooks */}
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium text-blue-700 flex items-center gap-1">
                                  <Activity className="h-3 w-3" />
                                  Webhooks
                                </h4>
                                {step.webhooks.length > 0 ? (
                                  <div className="space-y-1">
                                    {step.webhooks.map((webhook, idx) => (
                                      <Badge key={idx} variant="secondary" className="text-xs mr-1 mb-1">
                                        {webhook}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No webhooks</span>
                                )}
                              </div>
                              
                              {/* SSE Updates */}
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium text-purple-700 flex items-center gap-1">
                                  <Zap className="h-3 w-3" />
                                  Real-time Updates
                                </h4>
                                {step.sse.length > 0 ? (
                                  <div className="space-y-1">
                                    {step.sse.map((sse, idx) => (
                                      <Badge key={idx} variant="outline" className="text-xs mr-1 mb-1 border-purple-200">
                                        {sse}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No live updates</span>
                                )}
                              </div>
                              
                              {/* Triggers */}
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium text-green-700 flex items-center gap-1">
                                  <ArrowRight className="h-3 w-3" />
                                  Next Stage Triggers
                                </h4>
                                {step.triggers.length > 0 ? (
                                  <div className="space-y-1">
                                    {step.triggers.map((trigger, idx) => (
                                      <Badge key={idx} variant="default" className="text-xs mr-1 mb-1 bg-green-100 text-green-800">
                                        {trigger}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Final stage</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-900 mb-2">How Real-time Updates Work</h4>
                    <div className="text-sm text-blue-800 space-y-1">
                      <p><strong>Webhooks:</strong> External provider sends instant notifications when status changes</p>
                      <p><strong>SSE:</strong> Server immediately pushes updates to all connected admin interfaces</p>
                      <p><strong>Database:</strong> Status changes are logged with full audit trail and metadata</p>
                      <p><strong>Monitoring:</strong> Webhook activity is tracked in the monitoring dashboard</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <Button
                      onClick={() => fixStuckEsimsMutation.mutate()}
                      disabled={fixStuckEsimsMutation.isPending}
                      variant="outline"
                    >
                      {fixStuckEsimsMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4 mr-2" />
                      )}
                      Fix Stuck eSIMs
                    </Button>
                    <Button
                      onClick={() => forceStatusSyncMutation.mutate()}
                      disabled={forceStatusSyncMutation.isPending}
                      variant="outline"
                    >
                      {forceStatusSyncMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Force Provider Sync
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="flow-events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Status Changes</CardTitle>
              <p className="text-sm text-muted-foreground">
                Monitor all status transitions in real-time
              </p>
            </CardHeader>
            <CardContent>
              {flowEvents && flowEvents.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Transition</TableHead>
                      <TableHead>Valid</TableHead>
                      <TableHead>Provider Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flowEvents.slice(0, 50).map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="text-xs">
                          {new Date(event.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium">
                          {event.employeeName}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {event.orderId}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(event.fromStatus)}
                            <ArrowRight className="h-3 w-3" />
                            {getStatusBadge(event.toStatus, event.isValidTransition)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {event.isValidTransition ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                        </TableCell>
                        <TableCell>
                          {event.providerStatus && (
                            <Badge variant="outline" className="text-xs">
                              {event.providerStatus}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No flow events recorded yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Flow Validations</CardTitle>
              <p className="text-sm text-muted-foreground">
                eSIMs that may be stuck or have invalid states
              </p>
            </CardHeader>
            <CardContent>
              {flowValidations && flowValidations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Current Status</TableHead>
                      <TableHead>Issues</TableHead>
                      <TableHead>Stuck Duration</TableHead>
                      <TableHead>Last Update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flowValidations.map((validation, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {validation.employeeName}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {validation.orderId}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(validation.currentStatus, validation.isValid)}
                        </TableCell>
                        <TableCell>
                          {validation.issues.length > 0 ? (
                            <div className="space-y-1">
                              {validation.issues.map((issue, idx) => (
                                <Badge key={idx} variant="destructive" className="text-xs mr-1">
                                  {issue}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-green-600 text-sm">No issues</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {validation.stuckDuration ? (
                            <span className="text-red-600">
                              {formatDuration(validation.stuckDuration)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(validation.lastUpdate).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-green-600">
                  All eSIMs are following the expected flow
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhook-monitoring" className="space-y-4">
          <WebhookMonitoringDashboard />
        </TabsContent>

        <TabsContent value="expected-flow" className="space-y-4">
          {/* Complete Flow Description */}
          <Card>
            <CardHeader>
              <CardTitle>Complete eSIM Status Flow Description</CardTitle>
              <p className="text-sm text-muted-foreground">
                Comprehensive overview of the entire eSIM lifecycle from creation to completion
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="prose prose-sm max-w-none">
                <h3 className="text-lg font-semibold mb-4">The Complete eSIM Lifecycle Flow</h3>
                
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <h4 className="font-semibold text-blue-900 mb-2">Flow Overview</h4>
                  <p className="text-blue-800">
                    The eSIM status flow tracks an employee's journey from having no plan to actively using data. 
                    Each status represents a specific stage in the provisioning and activation process, with defined 
                    expectations for duration and required system actions.
                  </p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    How Status Updates Work
                  </h4>
                  <div className="text-blue-800 space-y-2">
                    <p>
                      eSIM status changes happen automatically when external systems send us updates:
                    </p>
                    <ul className="ml-4 space-y-1 text-sm">
                      <li>• When provider finishes creating eSIM → status becomes "waiting for activation"</li>
                      <li>• When user scans QR code → status becomes "activated"</li>
                      <li>• When data usage starts → status becomes "active"</li>
                      <li>• When plan expires → status becomes "expired"</li>
                    </ul>
                    <p className="text-sm mt-2">
                      The Webhook Monitor tab shows if these automatic updates are working properly.
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="border-l-4 border-gray-300 pl-4">
                    <h4 className="font-semibold text-gray-900">Stage 1: NO PLAN</h4>
                    <p className="text-sm text-gray-600 mb-2">Initial state when an employee is created without any assigned plan.</p>
                    <div className="text-xs space-y-1">
                      <p><strong>System Requirements:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Employee record exists in database with valid company assignment</li>
                        <li>Employee has name, email, phone number, and position</li>
                        <li>No active plans detected</li>
                        <li>No purchased eSIMs associated with this employee</li>
                      </ul>
                      <p><strong>Expected Duration:</strong> Indefinite (until plan is assigned)</p>
                      <p><strong>Valid Transitions:</strong> → PENDING (when plan is purchased)</p>
                    </div>
                  </div>

                  <div className="border-l-4 border-blue-400 pl-4">
                    <h4 className="font-semibold text-blue-900">Stage 2: PENDING</h4>
                    <p className="text-sm text-blue-600 mb-2">Plan has been purchased and eSIM provisioning is in progress.</p>
                    <div className="text-xs space-y-1">
                      <p><strong>What Happens:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Company wallet is charged for the plan cost</li>
                        <li>Payment is processed and validated</li>
                        <li>Order is sent to eSIM Access API with plan details</li>
                        <li>Provider begins eSIM provisioning process</li>
                        <li>purchasedEsim record created with status 'pending'</li>
                        <li>Employee's plan assignment completed</li>
                      </ul>
                      <p><strong>System Monitoring:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>API calls to provider to check provisioning status</li>
                        <li>Error handling for failed provisioning attempts</li>
                        <li>Automatic retry logic for temporary failures</li>
                        <li>Refund processing if provisioning fails permanently</li>
                      </ul>
                      <p><strong>Expected Duration:</strong> 2-10 minutes</p>
                      <p><strong>Alert Threshold:</strong> If pending {'>'}10 minutes, investigate provider issues</p>
                      <p><strong>Valid Transitions:</strong> → WAITING_FOR_ACTIVATION (success) | → CANCELLED (failure/refund)</p>
                    </div>
                  </div>

                  <div className="border-l-4 border-yellow-400 pl-4">
                    <h4 className="font-semibold text-yellow-900">Stage 3: WAITING_FOR_ACTIVATION</h4>
                    <p className="text-sm text-yellow-600 mb-2">eSIM is ready with QR code, awaiting user activation.</p>
                    <div className="text-xs space-y-1">
                      <p><strong>What Happens:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Provider returns QR code URL and activation code</li>
                        <li>eSIM record updated with QR code and activation details</li>
                        <li>QR code becomes available in employee's interface</li>
                        <li>Email notification sent to employee with activation instructions</li>
                        <li>Employee can scan QR code to add eSIM to their device</li>
                      </ul>
                      <p><strong>System Monitoring:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Regular checks with provider for activation status</li>
                        <li>Monitor for user scanning QR code</li>
                        <li>Track time since QR code was made available</li>
                        <li>Send reminder emails if not activated within 24 hours</li>
                      </ul>
                      <p><strong>User Actions Required:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Employee must scan QR code with their device</li>
                        <li>Device must support eSIM technology</li>
                        <li>Employee should be in a supported country/region</li>
                      </ul>
                      <p><strong>Expected Duration:</strong> 1-48 hours (user dependent)</p>
                      <p><strong>Alert Threshold:</strong> If waiting {'>'} 48 hours, contact employee</p>
                      <p><strong>Valid Transitions:</strong> → ACTIVATED (user scans QR) | → CANCELLED (refund request)</p>
                    </div>
                  </div>

                  <div className="border-l-4 border-green-400 pl-4">
                    <h4 className="font-semibold text-green-900">Stage 4: ACTIVATED</h4>
                    <p className="text-sm text-green-600 mb-2">User has scanned QR code, eSIM is connecting to network.</p>
                    <div className="text-xs space-y-1">
                      <p><strong>What Happens:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Provider detects QR code scan and eSIM installation</li>
                        <li>eSIM profile is downloaded to user's device</li>
                        <li>Device attempts initial network connection</li>
                        <li>Carrier authentication and registration process</li>
                        <li>Data plan activation on provider network</li>
                      </ul>
                      <p><strong>System Monitoring:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Check provider API for 'ONBOARD' status confirmation</li>
                        <li>Monitor for first data usage to confirm connectivity</li>
                        <li>Validate network registration success</li>
                        <li>Set up regular data usage synchronization</li>
                      </ul>
                      <p><strong>Technical Requirements:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Device must complete eSIM profile installation</li>
                        <li>Network connectivity must be established</li>
                        <li>Carrier must confirm subscriber registration</li>
                        <li>Data plan must be active on provider side</li>
                      </ul>
                      <p><strong>Expected Duration:</strong> 5-15 minutes</p>
                      <p><strong>Alert Threshold:</strong> If activated {'>'} 30 minutes without data, check connectivity</p>
                      <p><strong>Valid Transitions:</strong> → ACTIVE (data usage detected) | → CANCELLED (connection fails)</p>
                    </div>
                  </div>

                  <div className="border-l-4 border-emerald-500 pl-4">
                    <h4 className="font-semibold text-emerald-900">Stage 5: ACTIVE</h4>
                    <p className="text-sm text-emerald-600 mb-2">eSIM is fully operational and consuming data.</p>
                    <div className="text-xs space-y-1">
                      <p><strong>What Happens:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Regular data usage reporting from provider</li>
                        <li>Real-time or periodic usage synchronization</li>
                        <li>Data consumption tracking and monitoring</li>
                        <li>Usage alerts and notifications</li>
                        <li>Plan expiry date and validity tracking</li>
                      </ul>
                      <p><strong>System Monitoring:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Daily data usage synchronization from provider API</li>
                        <li>Monitor approaching data limits (80%, 90%, 95%)</li>
                        <li>Track plan expiry date and validity period</li>
                        <li>Check for network connectivity issues</li>
                        <li>Monitor for auto-renewal eligibility</li>
                      </ul>
                      <p><strong>Ongoing Operations:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Data usage updates reflected in employee dashboard</li>
                        <li>Usage alerts sent at configured thresholds</li>
                        <li>Plan renewal notifications before expiry</li>
                        <li>Support for manual plan cancellation</li>
                      </ul>
                      <p><strong>Expected Duration:</strong> Until plan expires or is cancelled</p>
                      <p><strong>Valid Transitions:</strong> → EXPIRED (plan ends) | → CANCELLED (user cancels)</p>
                    </div>
                  </div>

                  <div className="border-l-4 border-orange-400 pl-4">
                    <h4 className="font-semibold text-orange-900">Stage 6: EXPIRED</h4>
                    <p className="text-sm text-orange-600 mb-2">Plan has reached its validity period or data limit.</p>
                    <div className="text-xs space-y-1">
                      <p><strong>What Happens:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Provider detects plan expiry (time or data based)</li>
                        <li>Network access is terminated by provider</li>
                        <li>Final data usage is recorded and synchronized</li>
                        <li>Employee's plan status updated</li>
                        <li>Auto-renewal process triggered if enabled</li>
                      </ul>
                      <p><strong>System Actions:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Clear employee's plan assignments</li>
                        <li>Create plan history record with final usage</li>
                        <li>Send expiry notification to employee</li>
                        <li>Process auto-renewal if configured and wallet has funds</li>
                        <li>Archive eSIM record for historical reporting</li>
                      </ul>
                      <p><strong>Valid Transitions:</strong> → CANCELLED (clean up) | → PENDING (auto-renewal)</p>
                    </div>
                  </div>

                  <div className="border-l-4 border-red-400 pl-4">
                    <h4 className="font-semibold text-red-900">Stage 7: CANCELLED</h4>
                    <p className="text-sm text-red-600 mb-2">Plan has been cancelled and refunded.</p>
                    <div className="text-xs space-y-1">
                      <p><strong>What Happens:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>User requests cancellation or system auto-cancels</li>
                        <li>Provider API called to cancel eSIM service</li>
                        <li>Refund amount calculated based on usage</li>
                        <li>Company wallet credited with refund amount</li>
                        <li>eSIM marked as cancelled in all systems</li>
                      </ul>
                      <p><strong>System Cleanup:</strong></p>
                      <ul className="list-disc ml-4">
                        <li>Employee's plan assignments cleared</li>
                        <li>Plan history updated with cancellation details</li>
                        <li>Wallet transaction created for refund</li>
                        <li>Cancellation notification sent</li>
                        <li>Remove from active monitoring</li>
                      </ul>
                      <p><strong>Final State:</strong> Terminal - no further transitions possible</p>
                    </div>
                  </div>
                </div>

                <div className="bg-yellow-50 p-4 rounded-lg mt-6">
                  <h4 className="font-semibold text-yellow-900 mb-2">Critical Monitoring Points</h4>
                  <ul className="text-yellow-800 text-sm space-y-1">
                    <li><strong>Pending &gt; 10 minutes:</strong> Check provider API connectivity and order status</li>
                    <li><strong>Waiting &gt; 48 hours:</strong> Send activation reminder or offer support</li>
                    <li><strong>Activated &gt; 30 minutes:</strong> Investigate connectivity issues</li>
                    <li><strong>Provider status conflicts:</strong> Sync database with provider API immediately</li>
                    <li><strong>Failed transitions:</strong> Log for investigation and potential manual intervention</li>
                  </ul>
                </div>

                <div className="bg-green-50 p-4 rounded-lg mt-4">
                  <h4 className="font-semibold text-green-900 mb-2">Success Metrics</h4>
                  <ul className="text-green-800 text-sm space-y-1">
                    <li><strong>Provisioning Success Rate:</strong> &gt; 95% of PENDING should reach WAITING_FOR_ACTIVATION</li>
                    <li><strong>Activation Rate:</strong> &gt; 80% of WAITING_FOR_ACTIVATION should reach ACTIVATED within 48 hours</li>
                    <li><strong>Connection Success:</strong> &gt; 98% of ACTIVATED should reach ACTIVE within 15 minutes</li>
                    <li><strong>Average Activation Time:</strong> &lt; 24 hours from purchase to active usage</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Visual Flow Steps */}
          <Card>
            <CardHeader>
              <CardTitle>Visual Flow Steps</CardTitle>
              <p className="text-sm text-muted-foreground">
                Step-by-step visual representation of the status transitions
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {EXPECTED_FLOW_STEPS.map((step, index) => (
                  <div key={step.status} className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                        {index + 1}
                      </div>
                      {index < EXPECTED_FLOW_STEPS.length - 1 && (
                        <div className="w-px h-12 bg-gray-200 mt-2"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusBadge(step.status)}
                        {step.duration && (
                          <span className="text-sm text-muted-foreground">
                            Expected duration: {formatDuration(step.duration)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {step.description}
                      </p>
                      {step.status !== 'no_plan' && (
                        <div className="mt-3">
                          <strong className="text-xs">Valid next states:</strong>
                          <div className="flex gap-2 mt-1">
                            {VALID_STATUS_TRANSITIONS[step.status]?.map(nextStatus => (
                              <div key={nextStatus} className="flex items-center gap-1">
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                {getStatusBadge(nextStatus)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}