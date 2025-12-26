/**
 * Automated Backup Scheduler
 * Runs secure backups at scheduled intervals
 */

import cron from 'node-cron';
import SecureBackupSystem from './backup-system.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class BackupScheduler {
  constructor() {
    this.backup = new SecureBackupSystem();
    this.isRunning = false;
    this.lastBackupStatus = null;
  }

  async initialize() {
    try {
      await this.backup.initialize();
      console.log('🕐 Backup scheduler initialized');
      
      // Check if required tools are available
      await this.checkSystemRequirements();
      
      this.setupSchedules();
      this.isRunning = true;
      
      console.log('✅ Automatic backup system is now active');
      console.log('📅 Schedule:');
      console.log('   - Daily backups: Every day at 2:00 AM');
      console.log('   - Weekly backups: Sundays at 3:00 AM');
      console.log('   - Monthly backups: 1st of month at 4:00 AM');
      
    } catch (error) {
      console.error('❌ Failed to initialize backup scheduler:', error);
      throw error;
    }
  }

  async checkSystemRequirements() {
    try {
      // Check if pg_dump is available
      await execAsync('pg_dump --version');
      console.log('✅ pg_dump is available');
    } catch (error) {
      console.error('❌ pg_dump not found. Please install PostgreSQL client tools.');
      throw new Error('pg_dump is required for database backups');
    }
  }

  setupSchedules() {
    // Daily backup at 2:00 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('🌙 Starting scheduled daily backup...');
      try {
        await this.backup.createBackup('daily');
        await this.backup.cleanupOldBackups('daily');
        this.lastBackupStatus = { type: 'daily', status: 'success', timestamp: new Date() };
        console.log('✅ Scheduled daily backup completed');
      } catch (error) {
        this.lastBackupStatus = { type: 'daily', status: 'failed', timestamp: new Date(), error: error.message };
        console.error('❌ Scheduled daily backup failed:', error);
      }
    });

    // Weekly backup on Sundays at 3:00 AM
    cron.schedule('0 3 * * 0', async () => {
      console.log('📅 Starting scheduled weekly backup...');
      try {
        await this.backup.createBackup('weekly');
        await this.backup.cleanupOldBackups('weekly');
        this.lastBackupStatus = { type: 'weekly', status: 'success', timestamp: new Date() };
        console.log('✅ Scheduled weekly backup completed');
      } catch (error) {
        this.lastBackupStatus = { type: 'weekly', status: 'failed', timestamp: new Date(), error: error.message };
        console.error('❌ Scheduled weekly backup failed:', error);
      }
    });

    // Monthly backup on 1st at 4:00 AM
    cron.schedule('0 4 1 * *', async () => {
      console.log('📆 Starting scheduled monthly backup...');
      try {
        await this.backup.createBackup('monthly');
        await this.backup.cleanupOldBackups('monthly');
        this.lastBackupStatus = { type: 'monthly', status: 'success', timestamp: new Date() };
        console.log('✅ Scheduled monthly backup completed');
      } catch (error) {
        this.lastBackupStatus = { type: 'monthly', status: 'failed', timestamp: new Date(), error: error.message };
        console.error('❌ Scheduled monthly backup failed:', error);
      }
    });

    // Integrity check every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      console.log('🔍 Running scheduled integrity check...');
      try {
        const backups = await this.backup.listBackups();
        const recentBackups = backups.slice(0, 5); // Check last 5 backups
        
        for (const backup of recentBackups) {
          const backupPath = path.join(this.backup.backupDir, backup.type, backup.filename);
          const isValid = await this.backup.verifyBackupIntegrity(backupPath);
          if (!isValid) {
            console.error(`⚠️  Backup integrity issue detected: ${backup.filename}`);
          }
        }
        console.log('✅ Integrity check completed');
      } catch (error) {
        console.error('❌ Integrity check failed:', error);
      }
    });

    console.log('📋 Backup schedules configured');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastBackup: this.lastBackupStatus,
      nextBackups: {
        daily: '2:00 AM daily',
        weekly: '3:00 AM on Sundays',
        monthly: '4:00 AM on 1st of month'
      }
    };
  }

  async stop() {
    this.isRunning = false;
    console.log('🛑 Backup scheduler stopped');
  }
}

export default BackupScheduler;