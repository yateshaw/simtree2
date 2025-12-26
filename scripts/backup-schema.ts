import { spawn } from 'child_process';
import { createGzip } from 'zlib';
import { PassThrough } from 'stream';
import { driveService } from '../server/services/drive.service';
import { sendBackupSuccessEmail, sendBackupErrorEmail } from '../server/services/backup-email.service';
import { db } from '../server/db';
import * as schema from '../shared/schema';

interface BackupResult {
  success: boolean;
  filename?: string;
  driveFileId?: string;
  size?: number;
  error?: string;
}

async function performSchemaBackup(): Promise<BackupResult> {
  return new Promise((resolve) => {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      resolve({ success: false, error: 'DATABASE_URL not configured' });
      return;
    }

    const folderId = process.env.SCHEMA_DRIVE_FOLDER_ID;
    if (!folderId) {
      resolve({ success: false, error: 'SCHEMA_DRIVE_FOLDER_ID not configured' });
      return;
    }

    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '-')
      .slice(0, 13) + now.toISOString().slice(14, 16);
    const filename = `schema-backup-${timestamp}.sql.gz`;

    console.log(`[Schema Backup] Creating schema-only backup: ${filename}`);

    const pgDump = spawn('pg_dump', ['--schema-only', databaseUrl], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const gzip = createGzip({ level: 9 });
    const passThrough = new PassThrough();

    let stderrData = '';

    pgDump.stderr.on('data', (data) => {
      stderrData += data.toString();
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
          parents: [folderId],
        }))
        .catch((error) => {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error('[Schema Backup] Upload failed:', err.message);
          uploadError = err;
          return null as any;
        });
    });

    pgDump.on('close', async (code) => {
      if (code !== 0) {
        console.error('[Schema Backup] pg_dump failed with code:', code);
        console.error('[Schema Backup] pg_dump stderr:', stderrData);
        resolve({
          success: false,
          filename,
          error: `pg_dump failed with exit code ${code}: ${stderrData}`,
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

        console.log(`[Schema Backup] Schema backup created and uploaded: ${filename} (${uploadResult.size} bytes)`);
        console.log(`[Schema Backup] No retention cleanup - keeping all schema backups permanently`);

        resolve({
          success: true,
          filename,
          driveFileId: uploadResult.fileId,
          size: uploadResult.size,
        });
      } catch (uploadError) {
        const errorMsg = uploadError instanceof Error ? uploadError.message : String(uploadError);
        console.error('[Schema Backup] Upload failed:', errorMsg);
        resolve({
          success: false,
          filename,
          error: `Upload failed: ${errorMsg}`,
        });
      }
    });

    pgDump.on('error', (error) => {
      console.error('[Schema Backup] pg_dump error:', error);
      resolve({
        success: false,
        filename,
        error: `pg_dump error: ${error.message}`,
      });
    });
  });
}

async function logBackup(data: schema.InsertBackup): Promise<void> {
  try {
    await db.insert(schema.backups).values(data);
    console.log(`[Schema Backup] Logged backup: ${data.filename} (${data.status})`);
  } catch (error) {
    console.error('[Schema Backup] Failed to log backup:', error);
  }
}

async function main() {
  console.log('=================================');
  console.log('Database Schema Backup');
  console.log('=================================\n');

  try {
    const result = await performSchemaBackup();
    
    if (result.success) {
      await logBackup({
        filename: result.filename!,
        sizeBytes: result.size,
        driveFileId: result.driveFileId,
        status: 'SUCCESS',
        type: 'schema',
      });

      await sendBackupSuccessEmail({
        filename: result.filename!,
        driveLink: `https://drive.google.com/file/d/${result.driveFileId}/view`,
        size: result.size!,
        timestamp: new Date(),
      });

      console.log('\n✅ Schema backup completed successfully');
      process.exit(0);
    } else {
      await logBackup({
        filename: result.filename || 'unknown',
        status: 'ERROR',
        type: 'schema',
        error: result.error,
      });

      await sendBackupErrorEmail({
        error: result.error || 'Unknown error',
      });

      console.error('\n❌ Schema backup failed:', result.error);
      process.exit(1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Unexpected error:', error);

    await logBackup({
      filename: 'unknown',
      status: 'ERROR',
      type: 'schema',
      error: errorMessage,
    });

    await sendBackupErrorEmail({
      error: errorMessage,
    });

    process.exit(1);
  }
}

main();
