import { db } from './db';
import { esimPlans } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

async function findDuplicateProviderIds() {
  try {
    console.log('Checking for duplicate providerIds in the database...');
    
    // First see if there are duplicate provider_ids
    const duplicates = await db.execute(sql`
      SELECT provider_id, COUNT(*) 
      FROM esim_plans 
      GROUP BY provider_id 
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.rows.length > 0) {
      console.log(`Found ${duplicates.rows.length} provider IDs with duplicates`);
      for (const row of duplicates.rows) {
        console.log(`Provider ID ${row.provider_id} appears ${row.count} times`);
      }
    } else {
      console.log('No duplicate provider IDs found - this is good!');
    }
    
    // Now perform a test - let's insert another plan with a suffix
    const [existingPlan] = await db.select().from(esimPlans).limit(1);
    if (existingPlan) {
      const newProviderId = `${existingPlan.providerId}-test`;
      
      console.log(`Testing with duplicate provider ID: ${existingPlan.providerId} -> ${newProviderId}`);
      
      // Try to insert a duplicate with a suffix
      await db.insert(esimPlans).values({
        providerId: newProviderId,
        name: `${existingPlan.name} (Copy)`,
        description: existingPlan.description,
        data: existingPlan.data,
        validity: existingPlan.validity,
        providerPrice: existingPlan.providerPrice,
        sellingPrice: existingPlan.sellingPrice,
        retailPrice: existingPlan.retailPrice,
        margin: existingPlan.margin,
        countries: existingPlan.countries,
        speed: existingPlan.speed,
        isActive: true
      });
      
      console.log('Successfully inserted test plan with modified provider ID');
      
      // Clean up the test plan
      await db.delete(esimPlans).where(eq(esimPlans.providerId, newProviderId));
      console.log('Cleaned up test plan');
    }
    
    // Count total plans
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM esim_plans`);
    console.log(`Total plans in database: ${countResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Error during plan check:', error);
  } finally {
    process.exit();
  }
}

findDuplicateProviderIds();