import { EsimAccessService } from './services/esim-access';
import { db } from './db';
import { sql } from 'drizzle-orm';

async function checkESIMPlanStatus() {
  try {
    console.log('Checking eSIM plan synchronization status...');
    
    // Count total plans in the database
    const dbCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM esim_plans`);
    const dbCount = dbCountResult.rows[0].count;
    console.log(`Total plans in database: ${dbCount}`);
    
    // Check for duplicate provider IDs
    const duplicates = await db.execute(sql`
      SELECT provider_id, COUNT(*) 
      FROM esim_plans 
      GROUP BY provider_id 
      HAVING COUNT(*) > 1
    `);
    
    const duplicateCount = duplicates.rows.length;
    console.log(`Provider IDs with duplicates: ${duplicateCount}`);
    
    // Sample of duplicates
    if (duplicateCount > 0) {
      console.log('\nSample of duplicate provider IDs:');
      for (let i = 0; i < Math.min(5, duplicateCount); i++) {
        console.log(`- ${duplicates.rows[i].provider_id} appears ${duplicates.rows[i].count} times`);
      }
    }
    
    // Get count from API
    console.log('\nConnecting to eSIM Access API to get plan count...');
    const esimAccessService = new EsimAccessService();
    const connected = await esimAccessService.verifyConnection();
    
    if (connected) {
      const apiPlans = await esimAccessService.getAvailablePlans();
      console.log(`Total plans available from API: ${apiPlans.length}`);
      
      // Calculate stats
      console.log('\nSummary:');
      console.log(`- API has ${apiPlans.length} plans available`);
      console.log(`- Database has ${dbCount} plans stored`);
      console.log(`- Difference: ${apiPlans.length - dbCount} plans`);
      
      // Check if our sync implementation is correctly handling duplicate provider IDs
      const providerIds = new Set();
      const providerIdDups = [];
      
      for (const plan of apiPlans) {
        if (providerIds.has(plan.providerId)) {
          providerIdDups.push(plan.providerId);
        } else {
          providerIds.add(plan.providerId);
        }
      }
      
      if (providerIdDups.length > 0) {
        console.log(`\nWARNING: Found ${providerIdDups.length} duplicate provider IDs in API response`);
        console.log('This is unexpected as the API should return unique provider IDs');
        console.log('Sample duplicates:', providerIdDups.slice(0, 5));
      } else {
        console.log('\nAPI response contains all unique provider IDs as expected');
        console.log('Our implementation handles potential duplicates by adding suffixes');
      }
      
      // Suggest path forward
      console.log('\nAction Required:');
      if (apiPlans.length > dbCount) {
        console.log('Complete synchronization needs to be finalized:');
        console.log('1. Run the batch-sync-plans.ts script to completion');
        console.log('2. Ensure that provider_id unique constraint is permanently removed');
        console.log('3. Verify that daily sync process is updated to import all plans');
      } else {
        console.log('Synchronization appears complete. Next steps:');
        console.log('1. Verify that daily sync process is updated to import all plans');
        console.log('2. Monitor to ensure synchronization continues to work correctly');
      }
    } else {
      console.log('Could not connect to eSIM Access API');
    }
    
  } catch (error) {
    console.error('Error during status check:', error);
  } finally {
    process.exit();
  }
}

checkESIMPlanStatus();