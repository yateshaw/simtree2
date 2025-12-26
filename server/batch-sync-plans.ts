import { EsimAccessService } from './services/esim-access';
import { db } from './db';
import { esimPlans } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

async function batchSyncPlans() {
  try {
    console.log('Starting batch plan synchronization...');
    
    // Initialize the ESim Access service
    const esimAccessService = new EsimAccessService();
    
    // Check the connection to the ESim Access API
    const connected = await esimAccessService.verifyConnection();
    if (!connected) {
      throw new Error('Could not connect to ESim Access API');
    }
    
    console.log('Connection to ESim Access API verified, fetching plans...');
    
    // Get all plans from the API
    const allPlans = await esimAccessService.getAvailablePlans();
    console.log(`Retrieved ${allPlans.length} plans from the API`);
    
    // First clear existing plans by setting them inactive
    await db.execute(sql`UPDATE esim_plans SET is_active = false`);
    console.log('Set all existing plans to inactive');
    
    // Process plans in batches
    const BATCH_SIZE = 50;
    let syncedCount = 0;
    let errorCount = 0;
    
    // Generate unique providerIds with suffixes for duplicate package codes
    const processedIds = new Map<string, number>();
    const plansToSync = allPlans.map(plan => {
      const baseProviderId = plan.providerId;
      const count = processedIds.get(baseProviderId) || 0;
      processedIds.set(baseProviderId, count + 1);
      
      // If this is a duplicate, append a suffix to make the providerId unique
      const uniqueProviderId = count > 0 ? `${baseProviderId}-${count}` : baseProviderId;
      
      return {
        ...plan,
        providerId: uniqueProviderId
      };
    });
    
    console.log(`Prepared ${plansToSync.length} plans for sync, starting in batches of ${BATCH_SIZE}`);
    
    for (let i = 0; i < plansToSync.length; i += BATCH_SIZE) {
      const batchPlans = plansToSync.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(plansToSync.length / BATCH_SIZE)} (${batchPlans.length} plans)`);
      
      for (const plan of batchPlans) {
        try {
          // Check if plan already exists
          const existingPlan = await db.select()
            .from(esimPlans)
            .where(eq(esimPlans.providerId, plan.providerId))
            .limit(1);
          
          const planData = {
            providerId: plan.providerId,
            name: plan.name,
            description: plan.description,
            data: plan.data,
            validity: plan.validity,
            providerPrice: plan.providerPrice,
            sellingPrice: plan.sellingPrice,
            margin: existingPlan[0]?.margin || "100",
            retailPrice: (Number(plan.providerPrice) * (1 + Number(existingPlan[0]?.margin || 100) / 100)).toString(),
            countries: plan.countries,
            speed: plan.speed,
            isActive: true
          };
          
          if (existingPlan.length > 0) {
            // Update existing plan
            await db.update(esimPlans)
              .set(planData)
              .where(eq(esimPlans.id, existingPlan[0].id));
            
            if ((i + batchPlans.indexOf(plan)) % 10 === 0) {
              console.log(`Updated plan: ${plan.name} (${plan.providerId})`);
            }
          } else {
            // Create new plan
            await db.insert(esimPlans).values(planData);
            
            if ((i + batchPlans.indexOf(plan)) % 10 === 0) {
              console.log(`Created new plan: ${plan.name} (${plan.providerId})`);
            }
          }
          
          syncedCount++;
        } catch (error) {
          console.error(`Failed to sync plan ${plan.name}:`, error);
          errorCount++;
        }
      }
      
      // Report progress
      console.log(`Progress: ${syncedCount}/${plansToSync.length} plans processed (${errorCount} errors)`);
      
      // Check DB count occasionally
      if (i % (BATCH_SIZE * 5) === 0) {
        const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM esim_plans WHERE is_active = true`);
        console.log(`Current active plans in database: ${countResult.rows[0].count}`);
      }
    }
    
    // Count how many plans are now in the database
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM esim_plans WHERE is_active = true`);
    const planCount = countResult.rows[0].count;
    
    console.log('\nPlan synchronization completed:');
    console.log(`- Total plans from API: ${allPlans.length}`);
    console.log(`- Plans synced to database: ${syncedCount}`);
    console.log(`- Failed plans: ${errorCount}`);
    console.log(`- Total active plans in database: ${planCount}`);
    
  } catch (error) {
    console.error('Error during plan synchronization:', error);
  } finally {
    process.exit();
  }
}

batchSyncPlans();