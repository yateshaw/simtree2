#!/usr/bin/env node

/**
 * Simple startup script for the backup protection system
 */

import dotenv from 'dotenv';
dotenv.config();

console.log('🛡️  Starting Ransomware Protection System...\n');

// Check if this is the first run
const isFirstRun = !process.env.BACKUP_ENCRYPTION_KEY;

if (isFirstRun) {
  console.log('🆕 First-time setup detected. Running initial configuration...\n');
  
  // Import and run setup
  const { default: BackupSystemSetup } = await import('./setup-backup-system.js');
  const setup = new BackupSystemSetup();
  
  const success = await setup.run();
  
  if (!success) {
    console.error('\n❌ Setup failed. Please check the errors above and try again.');
    process.exit(1);
  }
  
  console.log('\n🎉 Setup completed successfully!');
  console.log('📊 Backup monitor is now running at: http://localhost:3001');
  console.log('🔄 Automatic backups are scheduled and active.');
  
} else {
  console.log('✅ System already configured. Starting services...\n');
  
  try {
    // Start the scheduler and monitor
    const { default: BackupScheduler } = await import('./backup-scheduler.js');
    const { default: BackupMonitor } = await import('./backup-monitor.js');
    
    const scheduler = new BackupScheduler();
    const monitor = new BackupMonitor();
    
    await scheduler.initialize();
    await monitor.initialize();
    monitor.start();
    
    console.log('✅ Backup protection system is running!');
    console.log('📊 Monitor dashboard: http://localhost:3001');
    console.log('🕐 Automatic backups: Active');
    console.log('\nPress Ctrl+C to stop the system.');
    
  } catch (error) {
    console.error('❌ Failed to start backup system:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down backup protection system...');
  console.log('✅ Goodbye!');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Backup protection system terminated.');
  process.exit(0);
});