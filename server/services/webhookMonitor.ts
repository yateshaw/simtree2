import { EventEmitter } from "events";

export interface WebhookMetrics {
  endpoint: string;
  totalReceived: number;
  successfulProcessed: number;
  failedProcessed: number;
  lastReceived: Date | null;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  responseTimeMs: number[];
  statusCodes: Record<number, number>;
  eventTypes: Record<string, number>;
  isHealthy: boolean;
  healthScore: number;
}

export interface WebhookEvent {
  id: string;
  endpoint: string;
  timestamp: Date;
  success: boolean;
  responseTimeMs: number;
  statusCode: number;
  eventType?: string;
  orderId?: string;
  error?: string;
  payload?: any;
}

class WebhookMonitoringService extends EventEmitter {
  private metrics: Map<string, WebhookMetrics> = new Map();
  private recentEvents: WebhookEvent[] = [];
  private maxRecentEvents = 1000;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeMetrics();
    this.startHealthChecking();
  }

  private initializeMetrics() {
    // Initialize metrics for known webhook endpoints
    const endpoints = [
      '/api/esim/webhook',
      '/api/webhooks/esim/webhook',
      '/api/stripe/webhook',
      '/api/payment/webhook'
    ];

    endpoints.forEach(endpoint => {
      this.metrics.set(endpoint, {
        endpoint,
        totalReceived: 0,
        successfulProcessed: 0,
        failedProcessed: 0,
        lastReceived: null,
        lastSuccess: null,
        lastFailure: null,
        responseTimeMs: [],
        statusCodes: {},
        eventTypes: {},
        isHealthy: true,
        healthScore: 100
      });
    });
  }

  private startHealthChecking() {
    this.healthCheckInterval = setInterval(() => {
      this.calculateHealthScores();
    }, 30000); // Check every 30 seconds
  }

  private calculateHealthScores() {
    const now = new Date();
    
    this.metrics.forEach((metric, endpoint) => {
      let healthScore = 100;
      let isHealthy = true;

      // Check if we've received webhooks recently (within last 5 minutes for active endpoints)
      if (metric.lastReceived) {
        const minutesSinceLastReceived = (now.getTime() - metric.lastReceived.getTime()) / (1000 * 60);
        
        // Only penalize for eSIM webhook endpoint if it's been more than 30 minutes
        if (endpoint === '/api/esim/webhook' && minutesSinceLastReceived > 30) {
          healthScore -= 20;
        }
      }

      // Check success rate
      if (metric.totalReceived > 0) {
        const successRate = (metric.successfulProcessed / metric.totalReceived) * 100;
        if (successRate < 95) {
          healthScore -= (95 - successRate) * 2;
          isHealthy = false;
        }
      }

      // Check for recent failures
      if (metric.lastFailure) {
        const minutesSinceLastFailure = (now.getTime() - metric.lastFailure.getTime()) / (1000 * 60);
        if (minutesSinceLastFailure < 10) {
          healthScore -= 30;
          isHealthy = false;
        }
      }

      // Check average response time
      if (metric.responseTimeMs.length > 0) {
        const avgResponseTime = metric.responseTimeMs.reduce((a, b) => a + b, 0) / metric.responseTimeMs.length;
        if (avgResponseTime > 1000) { // More than 1 second
          healthScore -= 15;
        }
      }

      metric.healthScore = Math.max(0, Math.round(healthScore));
      metric.isHealthy = isHealthy && healthScore > 70;

      // Emit health change events
      this.emit('healthChange', {
        endpoint,
        isHealthy: metric.isHealthy,
        healthScore: metric.healthScore,
        metrics: metric
      });
    });
  }

  public recordWebhookEvent(event: Omit<WebhookEvent, 'id' | 'timestamp'>) {
    const webhookEvent: WebhookEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    // Add to recent events
    this.recentEvents.unshift(webhookEvent);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents = this.recentEvents.slice(0, this.maxRecentEvents);
    }

    // Update metrics
    let metric = this.metrics.get(event.endpoint);
    if (!metric) {
      metric = {
        endpoint: event.endpoint,
        totalReceived: 0,
        successfulProcessed: 0,
        failedProcessed: 0,
        lastReceived: null,
        lastSuccess: null,
        lastFailure: null,
        responseTimeMs: [],
        statusCodes: {},
        eventTypes: {},
        isHealthy: true,
        healthScore: 100
      };
      this.metrics.set(event.endpoint, metric);
    }

    // Update metrics
    metric.totalReceived++;
    metric.lastReceived = webhookEvent.timestamp;

    if (event.success) {
      metric.successfulProcessed++;
      metric.lastSuccess = webhookEvent.timestamp;
    } else {
      metric.failedProcessed++;
      metric.lastFailure = webhookEvent.timestamp;
    }

    // Track response time (keep last 100 measurements)
    metric.responseTimeMs.push(event.responseTimeMs);
    if (metric.responseTimeMs.length > 100) {
      metric.responseTimeMs = metric.responseTimeMs.slice(-100);
    }

    // Track status codes
    metric.statusCodes[event.statusCode] = (metric.statusCodes[event.statusCode] || 0) + 1;

    // Track event types
    if (event.eventType) {
      metric.eventTypes[event.eventType] = (metric.eventTypes[event.eventType] || 0) + 1;
    }

    // Emit real-time event
    this.emit('webhookReceived', webhookEvent);

    console.log(`[Webhook Monitor] Recorded ${event.success ? 'successful' : 'failed'} webhook: ${event.endpoint}`);
  }

  public getMetrics(): WebhookMetrics[] {
    return Array.from(this.metrics.values());
  }

  public getMetricsForEndpoint(endpoint: string): WebhookMetrics | undefined {
    return this.metrics.get(endpoint);
  }

  public getRecentEvents(limit: number = 50): WebhookEvent[] {
    return this.recentEvents.slice(0, limit);
  }

  public getHealthStatus(): { isHealthy: boolean; unhealthyEndpoints: string[] } {
    const unhealthyEndpoints: string[] = [];
    let overallHealthy = true;

    this.metrics.forEach((metric, endpoint) => {
      if (!metric.isHealthy) {
        unhealthyEndpoints.push(endpoint);
        overallHealthy = false;
      }
    });

    return {
      isHealthy: overallHealthy,
      unhealthyEndpoints
    };
  }

  public resetMetrics(endpoint?: string) {
    if (endpoint) {
      const metric = this.metrics.get(endpoint);
      if (metric) {
        Object.assign(metric, {
          totalReceived: 0,
          successfulProcessed: 0,
          failedProcessed: 0,
          lastReceived: null,
          lastSuccess: null,
          lastFailure: null,
          responseTimeMs: [],
          statusCodes: {},
          eventTypes: {},
          isHealthy: true,
          healthScore: 100
        });
      }
    } else {
      this.metrics.clear();
      this.recentEvents = [];
      this.initializeMetrics();
    }
  }

  public stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

// Global singleton instance
export const webhookMonitor = new WebhookMonitoringService();