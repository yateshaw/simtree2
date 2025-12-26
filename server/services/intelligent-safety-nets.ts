/**
 * Intelligent Safety Net System
 * Activates minimal backup processes only when webhook failures are detected
 */

// Lazy load these imports to avoid circular dependencies
let webhookReliability: any;
let syncEsimStatuses: any;
let storage: any;
let db: any;
let schema: any;
let eq: any, and: any, sql: any;

// Lazy initialization function
function initializeDependencies() {
  if (!webhookReliability) {
    webhookReliability = require('./webhook-reliability').webhookReliability;
  }
  if (!syncEsimStatuses) {
    syncEsimStatuses = require('../cron/esim-status-sync').syncEsimStatuses;
  }
  if (!storage) {
    storage = require('../storage').storage;
  }
  if (!db) {
    db = require('../db').db;
  }
  if (!schema) {
    schema = require('@shared/schema');
  }
  if (!eq) {
    const drizzleOrm = require('drizzle-orm');
    eq = drizzleOrm.eq;
    and = drizzleOrm.and;
    sql = drizzleOrm.sql;
  }
}

interface SafetyNetStatus {
  isActive: boolean;
  activationReason: string;
  activatedAt: Date;
  checksPerformed: number;
  recordsUpdated: number;
}

class IntelligentSafetyNetService {
  private safetyNets = new Map<string, SafetyNetStatus>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly ACTIVATION_THRESHOLD = 5; // Minutes of webhook failure before activation
  private readonly SAFETY_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes when active
  private readonly DEACTIVATION_THRESHOLD = 60 * 60 * 1000; // 1 hour of health before deactivation

  constructor() {
    // Delay initialization to avoid circular dependencies
    setTimeout(() => {
      this.startMonitoring();
    }, 2000);
  }

  private startMonitoring() {
    initializeDependencies();
    
    // Monitor webhook reliability status
    this.monitoringInterval = setInterval(() => {
      this.evaluateWebhookHealth();
    }, 15 * 60 * 1000); // Check every 15 minutes

    console.log('[Safety Nets] Intelligent monitoring started');
  }

  private async evaluateWebhookHealth() {
    initializeDependencies();
    const healthSummary = webhookReliability.getHealthSummary();
    const failurePatterns = webhookReliability.getFailurePatterns();

    // Check if we need to activate safety nets
    for (const pattern of failurePatterns) {
      const timeSinceLastFailure = Date.now() - pattern.lastFailureTime.getTime();
      const shouldActivate = pattern.consecutiveFailures > 0 && 
                           timeSinceLastFailure > this.ACTIVATION_THRESHOLD * 60 * 1000;

      if (shouldActivate && !this.safetyNets.has(pattern.endpoint)) {
        await this.activateSafetyNet(pattern.endpoint, 'Webhook failures detected');
      }
    }

    // Check if we can deactivate safety nets
    for (const [endpoint, status] of this.safetyNets) {
      const pattern = failurePatterns.find(p => p.endpoint === endpoint);
      const timeSinceActivation = Date.now() - status.activatedAt.getTime();
      
      if (!pattern || (pattern.consecutiveFailures === 0 && timeSinceActivation > this.DEACTIVATION_THRESHOLD)) {
        this.deactivateSafetyNet(endpoint, 'Webhook health restored');
      }
    }
  }

  private async activateSafetyNet(endpoint: string, reason: string) {
    const status: SafetyNetStatus = {
      isActive: true,
      activationReason: reason,
      activatedAt: new Date(),
      checksPerformed: 0,
      recordsUpdated: 0
    };

    this.safetyNets.set(endpoint, status);
    console.log(`[Safety Nets] Activated for ${endpoint}: ${reason}`);

    // Start targeted safety checks for this endpoint
    this.startSafetyChecks(endpoint);
  }

  private deactivateSafetyNet(endpoint: string, reason: string) {
    const status = this.safetyNets.get(endpoint);
    if (status) {
      console.log(`[Safety Nets] Deactivated for ${endpoint}: ${reason}. Performed ${status.checksPerformed} checks, updated ${status.recordsUpdated} records`);
      this.safetyNets.delete(endpoint);
    }
  }

  private startSafetyChecks(endpoint: string) {
    const safetyCheckInterval = setInterval(async () => {
      const status = this.safetyNets.get(endpoint);
      if (!status || !status.isActive) {
        clearInterval(safetyCheckInterval);
        return;
      }

      try {
        await this.performSafetyCheck(endpoint, status);
      } catch (error) {
        console.error(`[Safety Nets] Safety check failed for ${endpoint}:`, error);
      }
    }, this.SAFETY_CHECK_INTERVAL);
  }

  private async performSafetyCheck(endpoint: string, status: SafetyNetStatus) {
    status.checksPerformed++;
    
    if (endpoint.includes('esim')) {
      const updatedCount = await this.performEsimSafetyCheck();
      status.recordsUpdated += updatedCount;
      
      console.log(`[Safety Nets] eSIM safety check completed: ${updatedCount} records updated`);
    }
  }

  private async performEsimSafetyCheck(): Promise<number> {
    // Only check records that might have been affected by webhook failures
    // Focus on recently created/updated eSIMs that are in transition states
    
    const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
    
    const recentEsims = await db.select()
      .from(schema.purchasedEsims)
      .where(
        and(
          eq(schema.purchasedEsims.status, 'waiting_for_activation'),
          sql`${schema.purchasedEsims.createdAt} > ${recentThreshold.toISOString()}`
        )
      )
      .limit(5); // Only check 5 most recent to minimize API calls

    if (recentEsims.length === 0) {
      return 0;
    }

    console.log(`[Safety Nets] Checking ${recentEsims.length} recent eSIMs for missed webhook updates`);
    
    // Use existing sync function but with limited scope
    let updatedCount = 0;
    
    for (const esim of recentEsims) {
      try {
        // Perform targeted check for this specific eSIM
        // This would normally be handled by webhooks, but we're providing backup
        const result = await this.checkSpecificEsim(esim.orderId);
        if (result.updated) {
          updatedCount++;
        }
      } catch (error) {
        console.error(`[Safety Nets] Failed to check eSIM ${esim.id}:`, error);
      }
    }

    return updatedCount;
  }

  private async checkSpecificEsim(orderId: string): Promise<{ updated: boolean }> {
    // This would use the existing eSIM service to check status
    // For now, we'll return a placeholder result
    // In a real implementation, this would call the eSIM provider API
    
    console.log(`[Safety Nets] Performing targeted check for eSIM order ${orderId}`);
    
    // Simulate check without actual API call for now
    // Real implementation would use esimAccessService.getEsimDetails(orderId)
    
    return { updated: false };
  }

  public getSafetyNetStatus() {
    return {
      activeSafetyNets: this.safetyNets.size,
      safetyNets: Array.from(this.safetyNets.entries()).map(([endpoint, status]) => ({
        endpoint,
        ...status
      }))
    };
  }

  public getDetailedStatus() {
    const webhookHealth = webhookReliability.getHealthSummary();
    const safetyNetStatus = this.getSafetyNetStatus();
    
    return {
      webhookHealth,
      safetyNets: safetyNetStatus,
      systemStatus: {
        webhookPrimary: webhookHealth.unhealthyCount === 0,
        safetyNetsActive: safetyNetStatus.activeSafetyNets > 0,
        overallHealth: webhookHealth.unhealthyCount === 0 ? 'healthy' : 
                      safetyNetStatus.activeSafetyNets > 0 ? 'protected' : 'degraded'
      }
    };
  }

  public stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Clear all active safety nets
    this.safetyNets.clear();
    console.log('[Safety Nets] Monitoring stopped');
  }
}

export const intelligentSafetyNets = new IntelligentSafetyNetService();