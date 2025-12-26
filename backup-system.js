/**
 * Secure Database Backup System
 * Protection against ransomware and data corruption
 */

import { Pool } from 'pg';
import fs from 'fs/promises';
import crypto from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

class SecureBackupSystem {
  constructor() {
    this.backupDir = './backups';
    this.encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || this.generateEncryptionKey();
    this.maxBackups = 30; // Keep 30 days of backups
    this.compressionLevel = 9; // Maximum compression
  }

  generateEncryptionKey() {
    // Generate a strong encryption key if not provided
    const key = crypto.randomBytes(32).toString('hex');
    console.log('⚠️  Generated new encryption key. Save this securely:');
    console.log(`BACKUP_ENCRYPTION_KEY=${key}`);
    console.log('Add this to your environment variables!');
    return key;
  }

  async initialize() {
    try {
      // Create backup directory with restricted permissions
      await fs.mkdir(this.backupDir, { recursive: true, mode: 0o700 });
      
      // Create subdirectories for different backup types
      await fs.mkdir(path.join(this.backupDir, 'daily'), { recursive: true });
      await fs.mkdir(path.join(this.backupDir, 'weekly'), { recursive: true });
      await fs.mkdir(path.join(this.backupDir, 'monthly'), { recursive: true });
      
      console.log('✅ Backup system initialized');
    } catch (error) {
      console.error('❌ Failed to initialize backup system:', error);
      throw error;
    }
  }

  async createDatabaseDump() {
    return new Promise((resolve, reject) => {
      if (!process.env.DATABASE_URL) {
        reject(new Error('DATABASE_URL not found'));
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `backup_${timestamp}.sql`;
      const filepath = path.join(this.backupDir, 'temp', filename);

      // Ensure temp directory exists
      fs.mkdir(path.join(this.backupDir, 'temp'), { recursive: true });

      // Use pg_dump with compression and verbose output
      const pgDump = spawn('pg_dump', [
        '--verbose',
        '--no-password',
        '--format=custom',
        '--compress=9',
        '--file=' + filepath,
        process.env.DATABASE_URL
      ]);

      let stderr = '';
      
      pgDump.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pgDump.on('close', (code) => {
        if (code === 0) {
          resolve(filepath);
        } else {
          reject(new Error(`pg_dump failed with code ${code}: ${stderr}`));
        }
      });

      pgDump.on('error', (error) => {
        reject(error);
      });
    });
  }

  async encryptFile(inputPath, outputPath) {
    try {
      const algorithm = 'aes-256-gcm';
      const iv = crypto.randomBytes(16);
      const key = Buffer.from(this.encryptionKey, 'hex');
      
      const cipher = crypto.createCipher(algorithm, key);
      cipher.setAAD(Buffer.from('backup-data'));

      const input = await fs.readFile(inputPath);
      const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
      const authTag = cipher.getAuthTag();

      // Combine IV, auth tag, and encrypted data
      const result = Buffer.concat([iv, authTag, encrypted]);
      await fs.writeFile(outputPath, result);

      // Calculate hash for integrity verification
      const hash = crypto.createHash('sha256').update(result).digest('hex');
      await fs.writeFile(outputPath + '.hash', hash);

      console.log(`🔐 File encrypted: ${outputPath}`);
      return hash;
    } catch (error) {
      console.error('❌ Encryption failed:', error);
      throw error;
    }
  }

  async createBackup(type = 'daily') {
    try {
      console.log(`🚀 Starting ${type} backup...`);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dumpPath = await this.createDatabaseDump();
      
      // Create encrypted backup
      const backupFilename = `${type}_backup_${timestamp}.encrypted`;
      const backupPath = path.join(this.backupDir, type, backupFilename);
      const hash = await this.encryptFile(dumpPath, backupPath);

      // Create backup metadata
      const metadata = {
        timestamp: new Date().toISOString(),
        type: type,
        filename: backupFilename,
        hash: hash,
        size: (await fs.stat(backupPath)).size,
        originalDump: path.basename(dumpPath)
      };

      await fs.writeFile(
        path.join(this.backupDir, type, `${backupFilename}.meta`),
        JSON.stringify(metadata, null, 2)
      );

      // Clean up temporary dump
      await fs.unlink(dumpPath);

      console.log(`✅ ${type} backup completed: ${backupFilename}`);
      console.log(`📊 Backup size: ${(metadata.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`🔍 Hash: ${hash.substring(0, 16)}...`);

      return metadata;
    } catch (error) {
      console.error(`❌ ${type} backup failed:`, error);
      throw error;
    }
  }

  async verifyBackupIntegrity(backupPath) {
    try {
      const data = await fs.readFile(backupPath);
      const expectedHash = await fs.readFile(backupPath + '.hash', 'utf8');
      const actualHash = crypto.createHash('sha256').update(data).digest('hex');

      if (expectedHash.trim() === actualHash) {
        console.log(`✅ Backup integrity verified: ${path.basename(backupPath)}`);
        return true;
      } else {
        console.error(`❌ Backup integrity check failed: ${path.basename(backupPath)}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Integrity verification failed:', error);
      return false;
    }
  }

  async cleanupOldBackups(type = 'daily') {
    try {
      const backupTypeDir = path.join(this.backupDir, type);
      const files = await fs.readdir(backupTypeDir);
      
      const backupFiles = files
        .filter(file => file.endsWith('.encrypted'))
        .map(file => ({
          name: file,
          path: path.join(backupTypeDir, file),
          stats: null
        }));

      // Get file stats for sorting by date
      for (const file of backupFiles) {
        file.stats = await fs.stat(file.path);
      }

      // Sort by creation time (newest first)
      backupFiles.sort((a, b) => b.stats.birthtime - a.stats.birthtime);

      // Keep only the most recent backups
      const maxBackupsForType = type === 'monthly' ? 12 : (type === 'weekly' ? 8 : this.maxBackups);
      const filesToDelete = backupFiles.slice(maxBackupsForType);

      for (const file of filesToDelete) {
        await fs.unlink(file.path);
        await fs.unlink(file.path + '.hash').catch(() => {}); // Ignore if hash file doesn't exist
        await fs.unlink(file.path + '.meta').catch(() => {}); // Ignore if meta file doesn't exist
        console.log(`🗑️  Cleaned up old backup: ${file.name}`);
      }

      console.log(`🧹 Cleanup completed for ${type} backups`);
    } catch (error) {
      console.error(`❌ Cleanup failed for ${type} backups:`, error);
    }
  }

  async listBackups() {
    try {
      const types = ['daily', 'weekly', 'monthly'];
      const allBackups = [];

      for (const type of types) {
        const typeDir = path.join(this.backupDir, type);
        try {
          const files = await fs.readdir(typeDir);
          const metaFiles = files.filter(file => file.endsWith('.meta'));

          for (const metaFile of metaFiles) {
            const metaPath = path.join(typeDir, metaFile);
            const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));
            metadata.type = type;
            allBackups.push(metadata);
          }
        } catch (error) {
          // Directory might not exist yet
          continue;
        }
      }

      return allBackups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error('❌ Failed to list backups:', error);
      return [];
    }
  }

  async runFullBackupCycle() {
    try {
      console.log('🔄 Starting full backup cycle...');
      
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday
      const dayOfMonth = now.getDate();
      
      // Always create daily backup
      await this.createBackup('daily');
      await this.cleanupOldBackups('daily');
      
      // Create weekly backup on Sundays
      if (dayOfWeek === 0) {
        await this.createBackup('weekly');
        await this.cleanupOldBackups('weekly');
      }
      
      // Create monthly backup on the 1st
      if (dayOfMonth === 1) {
        await this.createBackup('monthly');
        await this.cleanupOldBackups('monthly');
      }

      // Verify recent backups
      const backups = await this.listBackups();
      const recentBackups = backups.slice(0, 3); // Check last 3 backups
      
      for (const backup of recentBackups) {
        const backupPath = path.join(this.backupDir, backup.type, backup.filename);
        await this.verifyBackupIntegrity(backupPath);
      }

      console.log('✅ Full backup cycle completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Full backup cycle failed:', error);
      return false;
    }
  }
}

// CLI interface
async function main() {
  const backup = new SecureBackupSystem();
  const command = process.argv[2];

  try {
    await backup.initialize();

    switch (command) {
      case 'daily':
        await backup.createBackup('daily');
        break;
      case 'weekly':
        await backup.createBackup('weekly');
        break;
      case 'monthly':
        await backup.createBackup('monthly');
        break;
      case 'full':
        await backup.runFullBackupCycle();
        break;
      case 'list':
        const backups = await backup.listBackups();
        console.log('\n📋 Available backups:');
        backups.forEach(backup => {
          console.log(`  ${backup.type.padEnd(8)} | ${backup.timestamp} | ${(backup.size / 1024 / 1024).toFixed(2)} MB`);
        });
        break;
      case 'verify':
        const allBackups = await backup.listBackups();
        console.log('\n🔍 Verifying all backups...');
        for (const b of allBackups) {
          const backupPath = path.join(backup.backupDir, b.type, b.filename);
          await backup.verifyBackupIntegrity(backupPath);
        }
        break;
      default:
        console.log('Usage: node backup-system.js [daily|weekly|monthly|full|list|verify]');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Backup operation failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SecureBackupSystem;