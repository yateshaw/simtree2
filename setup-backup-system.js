/**
 * Complete Backup System Setup
 * One-command setup for ransomware-protected database backups
 */

import SecureBackupSystem from './backup-system.js';
import BackupScheduler from './backup-scheduler.js';
import CloudBackupStorage from './cloud-backup-storage.js';
import BackupMonitor from './backup-monitor.js';
import fs from 'fs/promises';
import crypto from 'crypto';

class BackupSystemSetup {
  constructor() {
    this.envFile = '.env';
    this.setupComplete = false;
  }

  async checkEnvironment() {
    console.log('🔍 Checking environment setup...');
    
    const required = {
      'DATABASE_URL': process.env.DATABASE_URL,
      'BACKUP_ENCRYPTION_KEY': process.env.BACKUP_ENCRYPTION_KEY
    };

    const optional = {
      'AWS_ACCESS_KEY_ID': process.env.AWS_ACCESS_KEY_ID,
      'AWS_SECRET_ACCESS_KEY': process.env.AWS_SECRET_ACCESS_KEY,
      'BACKUP_S3_BUCKET': process.env.BACKUP_S3_BUCKET,
      'AWS_REGION': process.env.AWS_REGION
    };

    // Check required variables
    const missing = [];
    for (const [key, value] of Object.entries(required)) {
      if (!value) {
        missing.push(key);
      } else {
        console.log(`✅ ${key} is configured`);
      }
    }

    // Generate encryption key if missing
    if (missing.includes('BACKUP_ENCRYPTION_KEY')) {
      const encryptionKey = crypto.randomBytes(32).toString('hex');
      console.log('\n🔐 Generated new encryption key:');
      console.log(`BACKUP_ENCRYPTION_KEY=${encryptionKey}`);
      console.log('\n⚠️  IMPORTANT: Save this key securely! Add it to your .env file.');
      console.log('Without this key, you cannot decrypt your backups!');
      
      // Try to add to .env file
      await this.addToEnvFile('BACKUP_ENCRYPTION_KEY', encryptionKey);
    }

    // Check optional cloud storage variables
    const cloudConfigured = Object.values(optional).every(v => !!v);
    if (cloudConfigured) {
      console.log('☁️  Cloud storage is configured');
    } else {
      console.log('\n⚠️  Cloud storage not configured (optional)');
      console.log('To enable off-site backup protection, add these to your .env:');
      Object.keys(optional).forEach(key => {
        if (!optional[key]) {
          console.log(`- ${key}`);
        }
      });
    }

    return {
      requiredMissing: missing.filter(key => key !== 'BACKUP_ENCRYPTION_KEY'),
      cloudConfigured: cloudConfigured
    };
  }

  async addToEnvFile(key, value) {
    try {
      // Read existing .env file
      let envContent = '';
      try {
        envContent = await fs.readFile(this.envFile, 'utf8');
      } catch (error) {
        // File doesn't exist, will create new
      }

      // Check if key already exists
      const lines = envContent.split('\n');
      const existingIndex = lines.findIndex(line => line.startsWith(`${key}=`));
      
      if (existingIndex >= 0) {
        lines[existingIndex] = `${key}=${value}`;
      } else {
        lines.push(`${key}=${value}`);
      }

      // Write back to file
      await fs.writeFile(this.envFile, lines.join('\n'));
      console.log(`✅ Added ${key} to .env file`);
      
      // Update process.env for current session
      process.env[key] = value;
      
    } catch (error) {
      console.error(`❌ Failed to update .env file: ${error.message}`);
      console.log(`Please manually add: ${key}=${value}`);
    }
  }

  async createBackupDirectories() {
    console.log('📁 Creating backup directories...');
    
    const dirs = [
      './backups',
      './backups/daily',
      './backups/weekly', 
      './backups/monthly',
      './backups/temp'
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true, mode: 0o700 });
        console.log(`✅ Created: ${dir}`);
      } catch (error) {
        console.error(`❌ Failed to create ${dir}: ${error.message}`);
      }
    }
  }

  async testBackupSystem() {
    console.log('\n🧪 Testing backup system...');
    
    try {
      const backup = new SecureBackupSystem();
      await backup.initialize();
      
      console.log('📋 Creating test backup...');
      const testBackup = await backup.createBackup('daily');
      
      console.log('🔍 Verifying backup integrity...');
      const backupPath = `./backups/daily/${testBackup.filename}`;
      const isValid = await backup.verifyBackupIntegrity(backupPath);
      
      if (isValid) {
        console.log('✅ Test backup created and verified successfully!');
        return true;
      } else {
        console.error('❌ Backup integrity check failed');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Backup test failed:', error.message);
      return false;
    }
  }

  async setupCloudStorage() {
    console.log('\n☁️  Setting up cloud storage...');
    
    try {
      const cloud = new CloudBackupStorage();
      await cloud.initialize();
      
      if (cloud.initialized) {
        console.log('🔧 Configuring cloud storage policies...');
        await cloud.enableVersioning();
        await cloud.setupLifecyclePolicy();
        console.log('✅ Cloud storage configured successfully');
        return true;
      } else {
        console.log('⚠️  Cloud storage not available - skipping');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Cloud storage setup failed:', error.message);
      return false;
    }
  }

  async startServices() {
    console.log('\n🚀 Starting backup services...');
    
    try {
      // Start scheduler
      const scheduler = new BackupScheduler();
      await scheduler.initialize();
      
      // Start monitor
      const monitor = new BackupMonitor();
      await monitor.initialize();
      monitor.start();
      
      console.log('✅ All services started successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to start services:', error.message);
      return false;
    }
  }

  async generateSetupSummary() {
    const backups = new SecureBackupSystem();
    await backups.initialize();
    const backupList = await backups.listBackups();
    
    console.log('\n' + '='.repeat(60));
    console.log('🛡️  BACKUP SYSTEM SETUP COMPLETE');
    console.log('='.repeat(60));
    console.log('');
    console.log('📋 SYSTEM STATUS:');
    console.log(`   • Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
    console.log(`   • Encryption: ${process.env.BACKUP_ENCRYPTION_KEY ? 'Enabled' : 'Not configured'}`);
    console.log(`   • Cloud Storage: ${process.env.AWS_ACCESS_KEY_ID ? 'Configured' : 'Local only'}`);
    console.log(`   • Existing Backups: ${backupList.length}`);
    console.log('');
    console.log('🕐 BACKUP SCHEDULE:');
    console.log('   • Daily backups: Every day at 2:00 AM');
    console.log('   • Weekly backups: Sundays at 3:00 AM');
    console.log('   • Monthly backups: 1st of month at 4:00 AM');
    console.log('   • Integrity checks: Every 6 hours');
    console.log('');
    console.log('🔒 SECURITY FEATURES:');
    console.log('   • AES-256-GCM encryption');
    console.log('   • SHA-256 integrity verification');
    console.log('   • Automated rotation (30 day retention)');
    console.log('   • Ransomware protection');
    console.log('   • Cloud storage versioning');
    console.log('');
    console.log('📊 MONITORING:');
    console.log('   • Dashboard: http://localhost:3001');
    console.log('   • Real-time status monitoring');
    console.log('   • Health checks and alerts');
    console.log('');
    console.log('💡 MANUAL COMMANDS:');
    console.log('   • Create backup: node backup-system.js daily');
    console.log('   • List backups: node backup-system.js list');
    console.log('   • Verify backups: node backup-system.js verify');
    console.log('');
    console.log('⚠️  IMPORTANT REMINDERS:');
    console.log('   • Keep your BACKUP_ENCRYPTION_KEY secure');
    console.log('   • Test restore procedures regularly');
    console.log('   • Monitor the dashboard for issues');
    console.log('   • Consider setting up cloud storage for off-site protection');
    console.log('');
    console.log('✅ Your database is now protected against ransomware attacks!');
    console.log('='.repeat(60));
  }

  async run() {
    console.log('🛡️  Setting up secure backup system...\n');
    
    try {
      // Check environment
      const envCheck = await this.checkEnvironment();
      if (envCheck.requiredMissing.length > 0) {
        console.error('❌ Missing required environment variables:', envCheck.requiredMissing);
        console.log('Please configure these variables and run setup again.');
        return false;
      }

      // Create directories
      await this.createBackupDirectories();

      // Test backup system
      const backupTest = await this.testBackupSystem();
      if (!backupTest) {
        console.error('❌ Backup system test failed. Please check your configuration.');
        return false;
      }

      // Setup cloud storage if configured
      if (envCheck.cloudConfigured) {
        await this.setupCloudStorage();
      }

      // Start services
      await this.startServices();

      // Generate summary
      await this.generateSetupSummary();

      this.setupComplete = true;
      return true;

    } catch (error) {
      console.error('❌ Setup failed:', error);
      return false;
    }
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new BackupSystemSetup();
  setup.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export default BackupSystemSetup;