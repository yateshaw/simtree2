import { backupHourlyJob } from '../server/jobs/backup-hourly.job';

async function testHourlyBackup() {
  console.log('='.repeat(60));
  console.log('Testing Hourly Incremental Backup (Critical Tables Only)');
  console.log('='.repeat(60));
  
  try {
    const result = await backupHourlyJob.run();
    
    if (result.success) {
      console.log('\n✅ Hourly backup completed successfully!');
      console.log(`📁 Filename: ${result.filename}`);
      console.log(`📊 Size: ${result.size ? (result.size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);
      console.log(`🆔 Google Drive File ID: ${result.fileId || 'N/A'}`);
      console.log('\n💡 Check your HOURLY_DRIVE_FOLDER_ID folder in Google Drive!');
    } else {
      console.error('\n❌ Hourly backup failed!');
      console.error(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error('\n❌ Unexpected error during hourly backup:');
    console.error(error);
  }
  
  process.exit(0);
}

testHourlyBackup();
