import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Activity, CheckCircle, XCircle, Clock, Zap, AlertTriangle, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface WebhookMetrics {
  endpoint: string;
  totalReceived: number;
  successfulProcessed: number;
  failedProcessed: number;
  lastReceived: string | null;
  lastSuccess: string | null;
  lastFailure: string | null;
  responseTimeMs: number[];
  statusCodes: Record<number, number>;
  eventTypes: Record<string, number>;
  isHealthy: boolean;
  healthScore: number;
}

interface WebhookEvent {
  id: string;
  endpoint: string;
  timestamp: string;
  success: boolean;
  responseTimeMs: number;
  statusCode: number;
  eventType?: string;
  orderId?: string;
  error?: string;
}

export default function WebhookMonitoringDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch webhook metrics
  const { data: metrics, refetch: refetchMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['/api/webhook-monitor/metrics'],
    refetchInterval: autoRefresh ? 10000 : false, // Refresh every 10 seconds if auto-refresh is on
  });

  // Fetch recent webhook events
  const { data: recentEvents, refetch: refetchEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['/api/webhook-monitor/events'],
    refetchInterval: autoRefresh ? 5000 : false, // Refresh every 5 seconds if auto-refresh is on
  });

  const webhookMetrics: WebhookMetrics[] = (metrics as any)?.metrics || [];
  const events: WebhookEvent[] = (recentEvents as any)?.events || [];

  const overallHealth = webhookMetrics.length > 0 ? webhookMetrics.every(m => m.isHealthy) : true;
  const criticalEndpoints = webhookMetrics.filter(m => !m.isHealthy);

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const getHealthColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthBadgeColor = (isHealthy: boolean) => {
    return isHealthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getAvgResponseTime = (responseTimes: number[]) => {
    if (responseTimes.length === 0) return 0;
    return Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
  };

  const getSuccessRate = (metrics: WebhookMetrics) => {
    if (metrics.totalReceived === 0) return 100;
    return Math.round((metrics.successfulProcessed / metrics.totalReceived) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Webhook Connection Monitoring
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Real-time health monitoring of all webhook endpoints
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchMetrics();
              refetchEvents();
            }}
            disabled={metricsLoading || eventsLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${(metricsLoading || eventsLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Zap className="h-4 w-4 mr-1" />
            Auto-refresh
          </Button>
        </div>
      </div>

      {/* Overall Health Status */}
      <Alert className={overallHealth ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
        <div className="flex items-center gap-2">
          {overallHealth ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          )}
          <AlertDescription className={overallHealth ? 'text-green-800' : 'text-red-800'}>
            {overallHealth ? (
              'All webhook endpoints are healthy and processing requests normally.'
            ) : (
              `${criticalEndpoints.length} webhook endpoint${criticalEndpoints.length === 1 ? ' is' : 's are'} experiencing issues.`
            )}
          </AlertDescription>
        </div>
      </Alert>

      {/* Webhook Endpoints Health Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {webhookMetrics.map((metric) => (
          <Card key={metric.endpoint} className="border-l-4" style={{ borderLeftColor: metric.isHealthy ? '#10b981' : '#ef4444' }}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {metric.endpoint}
                </CardTitle>
                <Badge className={getHealthBadgeColor(metric.isHealthy)}>
                  {metric.isHealthy ? 'Healthy' : 'Unhealthy'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Health Score */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Health Score</span>
                <span className={`font-semibold ${getHealthColor(metric.healthScore)}`}>
                  {metric.healthScore}%
                </span>
              </div>

              {/* Success Rate */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Success Rate</span>
                <span className="font-semibold text-green-600">
                  {getSuccessRate(metric)}%
                </span>
              </div>

              {/* Request Stats */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-blue-50 p-2 rounded">
                  <div className="text-sm font-semibold text-blue-600">{metric.totalReceived}</div>
                  <div className="text-xs text-blue-500">Total</div>
                </div>
                <div className="bg-green-50 p-2 rounded">
                  <div className="text-sm font-semibold text-green-600">{metric.successfulProcessed}</div>
                  <div className="text-xs text-green-500">Success</div>
                </div>
                <div className="bg-red-50 p-2 rounded">
                  <div className="text-sm font-semibold text-red-600">{metric.failedProcessed}</div>
                  <div className="text-xs text-red-500">Failed</div>
                </div>
              </div>

              {/* Timing Info */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Avg Response Time:</span>
                  <span className="font-medium">{getAvgResponseTime(metric.responseTimeMs)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Last Received:</span>
                  <span className="font-medium">{formatTimestamp(metric.lastReceived)}</span>
                </div>
                {metric.lastFailure && (
                  <div className="flex justify-between text-red-600">
                    <span>Last Failure:</span>
                    <span className="font-medium">{formatTimestamp(metric.lastFailure)}</span>
                  </div>
                )}
              </div>

              {/* Event Types */}
              {Object.keys(metric.eventTypes).length > 0 && (
                <div className="border-t pt-2">
                  <div className="text-xs text-gray-500 mb-1">Event Types:</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(metric.eventTypes).map(([type, count]) => (
                      <Badge key={type} variant="outline" className="text-xs">
                        {type}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Webhook Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" />
            Recent Webhook Events (Last 20)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent webhook events</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events.slice(0, 20).map((event) => (
                <div key={event.id} className={`flex items-center justify-between p-3 rounded border ${
                  event.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}>
                  <div className="flex items-center gap-3">
                    {event.success ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <div>
                      <div className="text-sm font-medium">
                        {event.endpoint}
                      </div>
                      <div className="text-xs text-gray-500">
                        {event.eventType && `${event.eventType} • `}
                        {event.orderId && `Order: ${event.orderId} • `}
                        {formatTimestamp(event.timestamp)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${event.success ? 'text-green-600' : 'text-red-600'}`}>
                      {event.statusCode}
                    </div>
                    <div className="text-xs text-gray-500">
                      {event.responseTimeMs}ms
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}