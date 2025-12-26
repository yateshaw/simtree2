import { EsimAccessService } from './services/esim-access';
import { DatabaseStorage } from './storage';
import { db } from './db';

async function syncAllPlans() {
  try {
    console.log('Starting full plan synchronization...');
    
    // First ensure the constraint migration has been applied
    console.log('Checking if migration has been applied...');
    try {
      // Try to get plans with the same provider_id
      const duplicateCheck = await db.execute(`
        SELECT provider_id, COUNT(*) as count 
        FROM esim_plans 
        GROUP BY provider_id 
        HAVING COUNT(*) > 1 
        LIMIT 1
      `);
      
      // If we get results, it means we can have duplicates (constraint is gone)
      if (duplicateCheck.rows.length > 0) {
        console.log('Migration confirmed: unique constraint has been removed');
      } else {
        console.log('Warning: No duplicate provider_ids found yet. This is expected if the migration was just applied.');
      }
    } catch (error) {
      console.warn('Could not verify migration status:', error);
    }
    
    // Initialize the ESim Access service and storage
    const esimAccessService = new EsimAccessService();
    const storage = new DatabaseStorage();
    
    // Check the connection to the ESim Access API
    const connected = await esimAccessService.verifyConnection();
    if (!connected) {
      throw new Error('Could not connect to ESim Access API');
    }
    
    console.log('Connection to ESim Access API verified, syncing plans...');
    
    // Sync plans using the updated service that doesn't deduplicate
    const result = await esimAccessService.syncPlansWithDatabase(storage);
    
    console.log('Plan synchronization completed:');
    console.log(`- Total plans from API: ${result.total}`);
    console.log(`- Plans synced to database: ${result.synced}`);
    console.log(`- Failed plans: ${result.failed}`);
    
    // Count how many plans are now in the database
    const countResult = await db.execute('SELECT COUNT(*) as count FROM esim_plans');
    const planCount = countResult.rows[0].count;
    console.log(`- Total plans in database after sync: ${planCount}`);
    
  } catch (error) {
    console.error('Error during plan synchronization:', error);
  } finally {
    process.exit();
  }
}

syncAllPlans();