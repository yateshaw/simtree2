import { pool } from '../db';
import { sendEmail } from '../services/email.service';
import { configService } from '../services/config.service';
import cron, { ScheduledTask } from 'node-cron';

const NEON_FREE_TIER_BYTES = parseInt(process.env.NEON_FREE_TIER_BYTES || '1073741824', 10);
const NEON_MAX_CONN = parseInt(process.env.NEON_MAX_CONN || '3', 10);
const USAGE_THRESHOLD = parseFloat(process.env.USAGE_THRESHOLD || '0.9');
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || 'yateshaw@gmail.com';
const CONN_MONITOR_CRON = process.env.CONN_MONITOR_CRON || '*/15 * * * *';
const STORAGE_MONITOR_CRON = process.env.STORAGE_MONITOR_CRON || '0 * * * *';

const THROTTLE_HOURS = 24;
const CONFIG_CATEGORY = 'server';

const log = (message: string) => console.log(`[DB Usage Monitor] ${message}`);

interface UsageAlert {
  type: 'connections' | 'storage';
  current: number;
  limit: number;
  ratio: number;
  threshold: number;
}

async function checkThrottle(alertType: 'connections' | 'storage'): Promise<boolean> {
  const configKey = `db_usage_alert_last_sent_iso_${alertType}`;
  
  try {
    const lastSentStr = await configService.getSystemConfig(configKey);
    
    if (!lastSentStr) {
      return false;
    }
    
    const lastSent = new Date(lastSentStr);
    const now = new Date();
    const hoursSinceLastAlert = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceLastAlert < THROTTLE_HOURS) {
      log(`Alert for ${alertType} throttled (last sent ${hoursSinceLastAlert.toFixed(1)}h ago, next eligible in ${(THROTTLE_HOURS - hoursSinceLastAlert).toFixed(1)}h)`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking throttle for ${alertType}:`, error);
    return false;
  }
}

async function updateThrottle(alertType: 'connections' | 'storage'): Promise<void> {
  const configKey = `db_usage_alert_last_sent_iso_${alertType}`;
  const now = new Date().toISOString();
  
  try {
    await configService.setSystemConfig(
      configKey,
      now,
      CONFIG_CATEGORY,
      `Last alert sent timestamp for ${alertType} usage (ISO 8601 format)`
    );
    log(`Updated throttle timestamp for ${alertType}: ${now}`);
  } catch (error) {
    console.error(`Error updating throttle for ${alertType}:`, error);
  }
}

function generateEmailContent(alert: UsageAlert): { subject: string; html: string; text: string } {
  const percentage = (alert.ratio * 100).toFixed(1);
  const thresholdPercentage = (alert.threshold * 100).toFixed(0);
  const now = new Date().toISOString();
  
  const subject = alert.type === 'connections' 
    ? '⚠️ Neon DB connections near free-tier limit'
    : '⚠️ Neon DB storage near free-tier limit';
  
  const usageDisplay = alert.type === 'connections'
    ? `${alert.current} / ${alert.limit} connections`
    : `${(alert.current / (1024 * 1024 * 1024)).toFixed(2)} GB / ${(alert.limit / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  
  const nextAlertTime = new Date(Date.now() + THROTTLE_HOURS * 60 * 60 * 1000).toISOString();
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <h2 style="color: #ff6b6b; text-align: center;">${subject}</h2>
      
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; font-weight: bold;">Database ${alert.type} usage is high!</p>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;"><strong>Timestamp (UTC):</strong></td>
          <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">${now}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;"><strong>Current Usage:</strong></td>
          <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">${usageDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;"><strong>Usage Percentage:</strong></td>
          <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; color: ${alert.ratio >= 0.95 ? '#dc3545' : '#ffc107'}; font-weight: bold;">${percentage}%</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;"><strong>Alert Threshold:</strong></td>
          <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">${thresholdPercentage}%</td>
        </tr>
        <tr>
          <td style="padding: 10px;"><strong>Next Alert Earliest:</strong></td>
          <td style="padding: 10px;">${nextAlertTime}</td>
        </tr>
      </table>
      
      <div style="background-color: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #0c5460;">💡 Recommendations</h3>
        <ul style="margin-bottom: 0;">
          <li>Consider cleaning old data (connection_logs, plan_history, etc.)</li>
          <li>Review and optimize database queries</li>
          <li>Consider upgrading your Neon database plan</li>
          ${alert.type === 'connections' ? '<li>Check for connection leaks in your application</li>' : '<li>Archive or compress historical data</li>'}
        </ul>
      </div>
      
      <p style="color: #666; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
        This is an automated alert from your DB Usage Monitor. Alerts are throttled to once per 24 hours per metric type.
      </p>
    </div>
  `;
  
  const text = `
${subject}

Database ${alert.type} usage is high!

Timestamp (UTC): ${now}
Current Usage: ${usageDisplay}
Usage Percentage: ${percentage}%
Alert Threshold: ${thresholdPercentage}%
Next Alert Earliest: ${nextAlertTime}

RECOMMENDATIONS:
- Consider cleaning old data (connection_logs, plan_history, etc.)
- Review and optimize database queries
- Consider upgrading your Neon database plan
${alert.type === 'connections' ? '- Check for connection leaks in your application' : '- Archive or compress historical data'}

This is an automated alert from your DB Usage Monitor.
Alerts are throttled to once per 24 hours per metric type.
  `.trim();
  
  return { subject, html, text };
}

async function sendAlert(alert: UsageAlert): Promise<void> {
  const isThrottled = await checkThrottle(alert.type);
  
  if (isThrottled) {
    return;
  }
  
  const { subject, html, text } = generateEmailContent(alert);
  
  try {
    log(`Sending ${alert.type} alert to ${ALERT_EMAIL_TO}...`);
    const emailSent = await sendEmail(ALERT_EMAIL_TO, subject, html, text);
    
    if (emailSent) {
      log(`Alert email sent successfully for ${alert.type}`);
      await updateThrottle(alert.type);
    } else {
      log(`Failed to send alert email for ${alert.type}`);
    }
  } catch (error) {
    console.error(`Error sending alert for ${alert.type}:`, error);
  }
}

export async function checkConnections(): Promise<void> {
  try {
    log('Checking active connections...');
    
    const result = await pool.query<{ active_conns: number }>(`
      SELECT COUNT(*)::int AS active_conns
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    
    const activeConns = result.rows[0]?.active_conns || 0;
    const connRatio = activeConns / NEON_MAX_CONN;
    
    log(`Active connections: ${activeConns} / ${NEON_MAX_CONN} (${(connRatio * 100).toFixed(1)}%)`);
    
    if (connRatio >= USAGE_THRESHOLD) {
      log(`⚠️ Connection usage threshold exceeded: ${(connRatio * 100).toFixed(1)}% >= ${(USAGE_THRESHOLD * 100).toFixed(0)}%`);
      
      await sendAlert({
        type: 'connections',
        current: activeConns,
        limit: NEON_MAX_CONN,
        ratio: connRatio,
        threshold: USAGE_THRESHOLD
      });
    } else {
      log(`✅ Connection usage within limits`);
    }
  } catch (error) {
    console.error('[DB Usage Monitor] Error checking connections:', error);
  }
}

export async function checkStorage(): Promise<void> {
  try {
    log('Checking storage usage...');
    
    const result = await pool.query<{ db_size_bytes: string }>(`
      SELECT pg_database_size(current_database()) AS db_size_bytes
    `);
    
    const dbSizeBytes = parseInt(result.rows[0]?.db_size_bytes || '0', 10);
    const storageRatio = dbSizeBytes / NEON_FREE_TIER_BYTES;
    
    log(`Storage usage: ${(dbSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB / ${(NEON_FREE_TIER_BYTES / (1024 * 1024 * 1024)).toFixed(2)} GB (${(storageRatio * 100).toFixed(1)}%)`);
    
    if (storageRatio >= USAGE_THRESHOLD) {
      log(`⚠️ Storage usage threshold exceeded: ${(storageRatio * 100).toFixed(1)}% >= ${(USAGE_THRESHOLD * 100).toFixed(0)}%`);
      
      await sendAlert({
        type: 'storage',
        current: dbSizeBytes,
        limit: NEON_FREE_TIER_BYTES,
        ratio: storageRatio,
        threshold: USAGE_THRESHOLD
      });
    } else {
      log(`✅ Storage usage within limits`);
    }
  } catch (error) {
    console.error('[DB Usage Monitor] Error checking storage:', error);
  }
}

let connectionMonitorTask: ScheduledTask | null = null;
let storageMonitorTask: ScheduledTask | null = null;

export function startDbUsageMonitor(): void {
  try {
    if (!process.env.USAGE_MONITOR_ENABLED || process.env.USAGE_MONITOR_ENABLED !== 'true') {
      log('DB Usage Monitor is disabled (USAGE_MONITOR_ENABLED != true)');
      return;
    }
    
    log('Starting DB Usage Monitor...');
    log(`Configuration: Connections cron="${CONN_MONITOR_CRON}", Storage cron="${STORAGE_MONITOR_CRON}"`);
    log(`Thresholds: ${(USAGE_THRESHOLD * 100).toFixed(0)}% for both metrics`);
    log(`Limits: ${NEON_MAX_CONN} connections, ${(NEON_FREE_TIER_BYTES / (1024 * 1024 * 1024)).toFixed(2)} GB storage`);
    log(`Alert recipient: ${ALERT_EMAIL_TO}`);
    log(`Throttle window: ${THROTTLE_HOURS} hours`);
    
    if (connectionMonitorTask) {
      connectionMonitorTask.stop();
    }
    
    if (storageMonitorTask) {
      storageMonitorTask.stop();
    }
    
    connectionMonitorTask = cron.schedule(CONN_MONITOR_CRON, async () => {
      await checkConnections();
    });
    
    storageMonitorTask = cron.schedule(STORAGE_MONITOR_CRON, async () => {
      await checkStorage();
    });
    
    log(`✅ DB Usage Monitor started successfully`);
    log(`   - Connections check: every 5 minutes (${CONN_MONITOR_CRON})`);
    log(`   - Storage check: every 1 hour (${STORAGE_MONITOR_CRON})`);
    
    setTimeout(async () => {
      log('Running initial checks...');
      await checkConnections();
      await checkStorage();
    }, 5000);
    
  } catch (error) {
    console.error('[DB Usage Monitor] Error starting monitor:', error);
  }
}

export function stopDbUsageMonitor(): void {
  if (connectionMonitorTask) {
    connectionMonitorTask.stop();
    connectionMonitorTask = null;
  }
  
  if (storageMonitorTask) {
    storageMonitorTask.stop();
    storageMonitorTask = null;
  }
  
  log('DB Usage Monitor stopped');
}
