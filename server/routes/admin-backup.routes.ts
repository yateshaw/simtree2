import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/auth';
import { backupDbJob } from '../jobs/backup-db.job';
import { db } from '../db';
import * as schema from '@shared/schema';
import { desc } from 'drizzle-orm';

const router = Router();

router.post('/admin/backup/run-now', requireSuperAdmin, async (req, res) => {
  try {
    console.log('[Admin Backup] Manual backup requested by:', req.user?.username);
    
    const result = await backupDbJob.run();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Backup completed successfully',
        filename: result.filename,
        driveFileId: result.driveFileId,
        size: result.size,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Backup failed',
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Admin Backup] Error running manual backup:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get('/admin/backup/history', requireSuperAdmin, async (req, res) => {
  try {
    const backups = await db
      .select()
      .from(schema.backups)
      .orderBy(desc(schema.backups.createdAt))
      .limit(10);

    res.json({
      success: true,
      backups: backups.map(backup => ({
        id: backup.id,
        createdAt: backup.createdAt,
        filename: backup.filename,
        sizeBytes: backup.sizeBytes,
        sizeMB: backup.sizeBytes ? (backup.sizeBytes / 1024 / 1024).toFixed(2) : null,
        driveFileId: backup.driveFileId,
        driveLink: backup.driveFileId 
          ? `https://drive.google.com/file/d/${backup.driveFileId}/view`
          : null,
        status: backup.status,
        error: backup.error,
      })),
    });
  } catch (error) {
    console.error('[Admin Backup] Error fetching backup history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch backup history',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
