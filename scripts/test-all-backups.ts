import { backupDbJob } from '../server/jobs/backup-db.job';
import { backupHourlyJob } from '../server/jobs/backup-hourly.job';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAllBackups() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 Testing All Backup Types');
  console.log('='.repeat(70));
  
  // Test 1: Daily Full Backup
  console.log('\n\n📋 TEST 1/3: Daily Full Backup');
  console.log('-'.repeat(70));
  try {
    const dailyResult = await backupDbJob.run();
    if (dailyResult.success) {
      console.log('✅ Daily backup: SUCCESS');
      console.log(`   📁 File: ${dailyResult.filename}`);
      console.log(`   📊 Size: ${dailyResult.size ? (dailyResult.size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);
      console.log(`   🆔 Drive ID: ${dailyResult.fileId || 'N/A'}`);
    } else {
      console.error('❌ Daily backup: FAILED');
      console.error(`   Error: ${dailyResult.error}`);
    }
  } catch (error) {
    console.error('❌ Daily backup: EXCEPTION');
    console.error(error);
  }
  
  await delay(2000);
  
  // Test 2: Hourly Incremental Backup
  console.log('\n\n📋 TEST 2/3: Hourly Incremental Backup');
  console.log('-'.repeat(70));
  try {
    const hourlyResult = await backupHourlyJob.run();
    if (hourlyResult.success) {
      console.log('✅ Hourly backup: SUCCESS');
      console.log(`   📁 File: ${hourlyResult.filename}`);
      console.log(`   📊 Size: ${hourlyResult.size ? (hourlyResult.size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);
      console.log(`   🆔 Drive ID: ${hourlyResult.fileId || 'N/A'}`);
    } else {
      console.error('❌ Hourly backup: FAILED');
      console.error(`   Error: ${hourlyResult.error}`);
    }
  } catch (error) {
    console.error('❌ Hourly backup: EXCEPTION');
    console.error(error);
  }
  
  await delay(2000);
  
  // Test 3: Schema-Only Backup
  console.log('\n\n📋 TEST 3/3: Schema-Only Backup');
  console.log('-'.repeat(70));
  console.log('Running schema backup...');
  
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  try {
    const { stdout, stderr } = await execPromise('npx tsx scripts/backup-schema.ts');
    console.log(stdout);
    if (stderr && !stderr.includes('ExperimentalWarning')) {
      console.error(stderr);
    }
  } catch (error: any) {
    console.error('❌ Schema backup: EXCEPTION');
    console.error(error.message);
  }
  
  console.log('\n\n' + '='.repeat(70));
  console.log('🎉 All backup tests completed!');
  console.log('='.repeat(70));
  console.log('\n💡 Check your Google Drive folders:');
  console.log('   1. DRIVE_FOLDER_ID - Should have the daily backup');
  console.log('   2. HOURLY_DRIVE_FOLDER_ID - Should have the hourly backup');
  console.log('   3. SCHEMA_DRIVE_FOLDER_ID - Should have the schema backup');
  console.log('\n📧 Check your email (yateshaw@gmail.com) for notifications!');
  console.log('\n');
  
  process.exit(0);
}

testAllBackups();
