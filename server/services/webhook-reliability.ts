/**
 * Webhook Reliability Enhancement Service
 * Implements intelligent retry logic, failure detection, and automated recovery
 */

// Lazy load these imports to avoid circular dependencies
let webhookMonitor: any;
let syncEsimStatuses: any;
let storage: any;
let PERFORMANCE_CONFIG: any;

// Lazy initialization function
function initializeDependencies() {
  if (!webhookMonitor) {
    webhookMonitor = require('./webhookMonitor').webhookMonitor;
  }
  if (!syncEsimStatuses) {
    syncEsimStatuses = require('../cron/esim-status-sync').syncEsimStatuses;
  }
  if (!storage) {
    storage = require('../storage').storage;
  }
  if (!PERFORMANCE_CONFIG) {
    PERFORMANCE_CONFIG = require('../performance-config').PERFORMANCE_CONFIG;
  }
}

interface WebhookFailurePattern {
  endpoint: string;
  consecutiveFailures: number;
  lastFailureTime: Date;
  recoveryAttempts: number;
  isInRecoveryMode: boolean;
}

class WebhookReliabilityService {
  private failurePatterns = new Map<string, WebhookFailurePattern>();
  private recoveryInterval: NodeJS.Timeout | null = null;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly RECOVERY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
  private readonly MAX_RECOVERY_ATTEMPTS = 5;

  constructor() {
    // Delay initialization to avoid circular dependencies
    setTimeout(() => {
      this.startMonitoring();
    }, 1000);
  }

  private startMonitoring() {
    initializeDependencies();
    
    // Monitor webhook health and trigger recovery when needed
    webhookMonitor.on('healthChange', (event) => {
      this.handleHealthChange(event);
    });

    // Periodic recovery check - only when failures detected
    this.recoveryInterval = setInterval(() => {
      this.checkAndRecover();
    }, this.RECOVERY_CHECK_INTERVAL);

    console.log('[Webhook Reliability] Monitoring service started');
  }

  private handleHealthChange(event: any) {
    const { endpoint, isHealthy, metrics } = event;
    
    if (!isHealthy) {
      this.recordFailure(endpoint);
    } else {
      this.recordRecovery(endpoint);
    }
  }

  private recordFailure(endpoint: string) {
    let pattern = this.failurePatterns.get(endpoint);
    
    if (!pattern) {
      pattern = {
        endpoint,
        consecutiveFailures: 0,
        lastFailureTime: new Date(),
        recoveryAttempts: 0,
        isInRecoveryMode: false
      };
      this.failurePatterns.set(endpoint, pattern);
    }

    pattern.consecutiveFailures++;
    pattern.lastFailureTime = new Date();

    console.log(`[Webhook Reliability] Recorded failure for ${endpoint} (${pattern.consecutiveFailures} consecutive)`);

    // Trigger immediate recovery if threshold exceeded
    if (pattern.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES && !pattern.isInRecoveryMode) {
      this.triggerRecovery(endpoint, pattern);
    }
  }

  private recordRecovery(endpoint: string) {
    const pattern = this.failurePatterns.get(endpoint);
    if (pattern) {
      pattern.consecutiveFailures = 0;
      pattern.isInRecoveryMode = false;
      pattern.recoveryAttempts = 0;
      console.log(`[Webhook Reliability] Recorded recovery for ${endpoint}`);
    }
  }

  private async triggerRecovery(endpoint: string, pattern: WebhookFailurePattern) {
    if (pattern.recoveryAttempts >= this.MAX_RECOVERY_ATTEMPTS) {
      console.warn(`[Webhook Reliability] Max recovery attempts reached for ${endpoint}`);
      return;
    }

    pattern.isInRecoveryMode = true;
    pattern.recoveryAttempts++;

    console.log(`[Webhook Reliability] Triggering recovery for ${endpoint} (attempt ${pattern.recoveryAttempts})`);

    try {
      // Intelligent recovery based on endpoint type
      if (endpoint.includes('esim')) {
        await this.recoverEsimWebhooks();
      }
      
      console.log(`[Webhook Reliability] Recovery completed for ${endpoint}`);
    } catch (error) {
      console.error(`[Webhook Reliability] Recovery failed for ${endpoint}:`, error);
    }
  }

  private async recoverEsimWebhooks() {
    // Only sync a small subset of potentially affected records
    console.log('[Webhook Reliability] Running targeted eSIM recovery sync...');
    
    try {
      // Run orphan-only sync to catch missed webhook updates
      const updatedCount = await syncEsimStatuses(storage, undefined, true);
      console.log(`[Webhook Reliability] Recovery sync updated ${updatedCount} eSIMs`);
    } catch (error) {
      console.error('[Webhook Reliability] Recovery sync failed:', error);
      throw error;
    }
  }

  private async checkAndRecover() {
    // Only check if there are active failure patterns
    if (this.failurePatterns.size === 0) {
      return;
    }

    console.log('[Webhook Reliability] Running periodic recovery check...');
    
    for (const [endpoint, pattern] of this.failurePatterns) {
      const timeSinceLastFailure = Date.now() - pattern.lastFailureTime.getTime();
      
      // If failures are old and in recovery mode, attempt another recovery
      if (pattern.isInRecoveryMode && timeSinceLastFailure > 30 * 60 * 1000) { // 30 minutes
        await this.triggerRecovery(endpoint, pattern);
      }
    }
  }

  public getFailurePatterns(): WebhookFailurePattern[] {
    return Array.from(this.failurePatterns.values());
  }

  public getHealthSummary() {
    const totalEndpoints = this.failurePatterns.size;
    const unhealthyEndpoints = Array.from(this.failurePatterns.values())
      .filter(p => p.consecutiveFailures > 0 || p.isInRecoveryMode);
    
    return {
      totalEndpoints,
      unhealthyCount: unhealthyEndpoints.length,
      healthyCount: totalEndpoints - unhealthyEndpoints.length,
      inRecoveryMode: unhealthyEndpoints.filter(p => p.isInRecoveryMode).length
    };
  }

  public stop() {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }
  }
}

export const webhookReliability = new WebhookReliabilityService();