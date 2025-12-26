import { backupDbJob } from '../server/jobs/backup-db.job';

async function testDailyBackup() {
  console.log('='.repeat(60));
  console.log('Testing Daily Full Backup');
  console.log('='.repeat(60));
  
  try {
    const result = await backupDbJob.run();
    
    if (result.success) {
      console.log('\n✅ Daily backup completed successfully!');
      console.log(`📁 Filename: ${result.filename}`);
      console.log(`📊 Size: ${result.size ? (result.size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);
      console.log(`🆔 Google Drive File ID: ${result.fileId || 'N/A'}`);
      console.log('\n💡 Check your DRIVE_FOLDER_ID folder in Google Drive!');
    } else {
      console.error('\n❌ Daily backup failed!');
      console.error(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error('\n❌ Unexpected error during daily backup:');
    console.error(error);
  }
  
  process.exit(0);
}

testDailyBackup();
