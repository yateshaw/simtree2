import { Router } from 'express';
import { backupDbJob } from '../../jobs/backup-db.job';
import { backupHourlyJob } from '../../jobs/backup-hourly.job';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

const router = Router();

const BACKUP_WEBHOOK_SECRET = process.env.BACKUP_WEBHOOK_SECRET;

function validateWebhookSecret(req: any, res: any, next: any) {
  const providedSecret = req.headers['x-github-backup-secret'];
  
  if (!BACKUP_WEBHOOK_SECRET) {
    console.error('[GitHub Backup Webhook] BACKUP_WEBHOOK_SECRET not configured');
    return res.status(503).json({
      success: false,
      error: 'Backup webhook not configured'
    });
  }
  
  if (!providedSecret || providedSecret !== BACKUP_WEBHOOK_SECRET) {
    console.warn('[GitHub Backup Webhook] Invalid or missing secret');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }
  
  next();
}

router.post('/webhooks/github-backup', validateWebhookSecret, async (req, res) => {
  try {
    const { type = 'daily', triggered_by } = req.body;
    
    console.log(`[GitHub Backup Webhook] Backup triggered - Type: ${type}, By: ${triggered_by}`);
    
    res.json({
      success: true,
      message: `${type} backup started`,
      timestamp: new Date().toISOString()
    });
    
    setImmediate(async () => {
      try {
        let result;
        
        if (type === 'hourly') {
          result = await backupHourlyJob.run();
        } else {
          result = await backupDbJob.run();
        }
        
        if (result.success) {
          console.log(`[GitHub Backup Webhook] ✅ ${type} backup completed: ${result.filename}`);
        } else {
          console.error(`[GitHub Backup Webhook] ❌ ${type} backup failed: ${result.error}`);
        }
      } catch (error) {
        console.error('[GitHub Backup Webhook] Error running backup:', error);
      }
    });
    
  } catch (error) {
    console.error('[GitHub Backup Webhook] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

router.get('/webhooks/github-backup/status', validateWebhookSecret, async (req, res) => {
  try {
    const latestBackup = await db
      .select()
      .from(schema.backups)
      .orderBy(desc(schema.backups.createdAt))
      .limit(1);
    
    if (latestBackup.length === 0) {
      return res.json({
        success: true,
        status: 'NO_BACKUPS',
        message: 'No backups found'
      });
    }
    
    const backup = latestBackup[0];
    const ageMinutes = (Date.now() - new Date(backup.createdAt).getTime()) / 60000;
    
    res.json({
      success: true,
      status: backup.status,
      lastBackup: {
        id: backup.id,
        filename: backup.filename,
        type: backup.type,
        createdAt: backup.createdAt,
        ageMinutes: Math.round(ageMinutes),
        sizeBytes: backup.sizeBytes,
        sizeMB: backup.sizeBytes ? (backup.sizeBytes / 1024 / 1024).toFixed(2) : null,
        driveFileId: backup.driveFileId,
        error: backup.error
      }
    });
  } catch (error) {
    console.error('[GitHub Backup Webhook] Error fetching status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

router.get('/webhooks/github-backup/history', validateWebhookSecret, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    
    const backups = await db
      .select()
      .from(schema.backups)
      .orderBy(desc(schema.backups.createdAt))
      .limit(limit);
    
    res.json({
      success: true,
      count: backups.length,
      backups: backups.map(b => ({
        id: b.id,
        filename: b.filename,
        type: b.type,
        status: b.status,
        createdAt: b.createdAt,
        sizeBytes: b.sizeBytes,
        sizeMB: b.sizeBytes ? (b.sizeBytes / 1024 / 1024).toFixed(2) : null,
        driveFileId: b.driveFileId,
        driveLink: b.driveFileId ? `https://drive.google.com/file/d/${b.driveFileId}/view` : null,
        error: b.error
      }))
    });
  } catch (error) {
    console.error('[GitHub Backup Webhook] Error fetching history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
