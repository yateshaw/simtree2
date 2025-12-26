import { spawn } from 'child_process';
import { createGzip } from 'zlib';
import { PassThrough } from 'stream';
import { driveService } from '../services/drive.service';
import { sendBackupSuccessEmail, sendBackupErrorEmail } from '../services/backup-email.service';
import { db, getCurrentDatabaseUrl } from '../db';
import * as schema from '@shared/schema';
import { DistributedLock } from '../utils/distributed-lock';

interface BackupResult {
  success: boolean;
  filename?: string;
  driveFileId?: string;
  size?: number;
  error?: string;
  skipped?: boolean;
}

export class BackupDbJob {
  private isRunning = false;
  private distributedLock = new DistributedLock('daily-backup-job');

  async run(): Promise<BackupResult> {
    if (this.isRunning) {
      console.log('[Backup Job] Backup already in progress locally, skipping...');
      return { success: true, skipped: true };
    }

    const acquired = await this.distributedLock.tryAcquire();
    if (!acquired) {
      console.log('[Backup Job] Another instance is running the backup, skipping...');
      return { success: true, skipped: true };
    }

    this.isRunning = true;
    console.log('[Backup Job] Starting database backup...');

    try {
      const result = await this.performBackup();
      
      if (result.success) {
        await this.logBackup({
          filename: result.filename!,
          sizeBytes: result.size,
          driveFileId: result.driveFileId,
          status: 'SUCCESS',
        });

        await sendBackupSuccessEmail({
          filename: result.filename!,
          driveLink: `https://drive.google.com/file/d/${result.driveFileId}/view`,
          size: result.size!,
          timestamp: new Date(),
        });

        console.log('[Backup Job] ✅ Backup completed successfully');
      } else {
        await this.logBackup({
          filename: result.filename || 'unknown',
          status: 'ERROR',
          error: result.error,
        });

        await sendBackupErrorEmail({
          error: result.error || 'Unknown error',
        });

        console.error('[Backup Job] ❌ Backup failed:', result.error);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Backup Job] Unexpected error:', error);

      await this.logBackup({
        filename: 'unknown',
        status: 'ERROR',
        error: errorMessage,
      });

      await sendBackupErrorEmail({
        error: errorMessage,
      });

      return { success: false, error: errorMessage };
    } finally {
      this.isRunning = false;
      await this.distributedLock.release();
    }
  }

  private async performBackup(): Promise<BackupResult> {
    return new Promise((resolve) => {
      // Use environment-specific database URL (NEVER use Replit's auto-managed DATABASE_URL)
      let databaseUrl: string;
      try {
        databaseUrl = getCurrentDatabaseUrl();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        resolve({ success: false, error: `Database URL not configured: ${errorMsg}` });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `simtree-backup-${timestamp}.sql.gz`;

      console.log(`[Backup Job] Creating backup: ${filename}`);

      const pgDump = spawn('pg_dump', [databaseUrl], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const gzip = createGzip({ level: 9 });
      const passThrough = new PassThrough();

      let stderrData = '';
      let totalSize = 0;

      pgDump.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      passThrough.on('data', (chunk) => {
        totalSize += chunk.length;
      });

      pgDump.stdout.pipe(gzip).pipe(passThrough);

      let uploadPromise: Promise<{ fileId: string; size: number }> | null = null;
      let uploadStarted = false;
      let uploadError: Error | null = null;

      passThrough.once('readable', () => {
        uploadStarted = true;
        uploadPromise = Promise.resolve()
          .then(() => driveService.uploadFile({
            name: filename,
            mimeType: 'application/gzip',
            readableStream: passThrough,
          }))
          .catch((error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('[Backup Job] Upload failed:', err.message);
            uploadError = err;
            return null as any;
          });
      });

      pgDump.on('close', async (code) => {
        if (code !== 0) {
          console.error('[Backup Job] pg_dump failed with code:', code);
          console.error('[Backup Job] stderr:', stderrData);
          resolve({
            success: false,
            filename,
            error: `pg_dump failed with code ${code}: ${stderrData.slice(-200)}`,
          });
          return;
        }

        try {
          if (!uploadStarted || !uploadPromise) {
            throw new Error('Upload did not start - check Google Drive credentials');
          }

          const uploadResult = await uploadPromise;
          
          if (uploadError) {
            throw uploadError;
          }
          
          if (!uploadResult) {
            throw new Error('Upload failed - no result returned');
          }

          console.log(`[Backup Job] Backup created and uploaded: ${filename} (${uploadResult.size} bytes)`);

          await driveService.manageRetention(14);

          resolve({
            success: true,
            filename,
            driveFileId: uploadResult.fileId,
            size: uploadResult.size,
          });
        } catch (uploadError) {
          const errorMsg = uploadError instanceof Error ? uploadError.message : String(uploadError);
          console.error('[Backup Job] Upload or retention failed:', errorMsg);
          resolve({
            success: false,
            filename,
            error: `Upload failed: ${errorMsg}`,
          });
        }
      });

      pgDump.on('error', (error) => {
        console.error('[Backup Job] pg_dump error:', error);
        resolve({
          success: false,
          filename,
          error: `pg_dump error: ${error.message}`,
        });
      });
    });
  }

  private async logBackup(data: schema.InsertBackup): Promise<void> {
    try {
      await db.insert(schema.backups).values(data);
      console.log(`[Backup Job] Logged backup: ${data.filename} (${data.status})`);
    } catch (error) {
      console.error('[Backup Job] Failed to log backup:', error);
    }
  }
}

export const backupDbJob = new BackupDbJob();
