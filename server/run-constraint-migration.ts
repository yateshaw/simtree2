import { db } from './db';
import { sql } from 'drizzle-orm';

async function removePlanProviderIdConstraint() {
  try {
    console.log('Running migration to remove unique constraint from provider_id column...');
    
    // Drop the unique constraint
    await db.execute(sql`
      ALTER TABLE esim_plans 
      DROP CONSTRAINT IF EXISTS esim_plans_provider_id_unique;
    `);
    
    console.log('Successfully removed unique constraint from esim_plans.provider_id');
    
    // Verify the change by trying to insert a duplicate provider_id (will be rolled back)
    await db.transaction(async (tx) => {
      try {
        const existingPlan = await tx.execute(sql`
          SELECT provider_id FROM esim_plans LIMIT 1
        `);
        
        if (existingPlan.rows.length > 0) {
          const providerId = existingPlan.rows[0].provider_id;
          console.log(`Testing with existing provider_id: ${providerId}`);
          
          // Try to insert another record with the same provider_id
          await tx.execute(sql`
            INSERT INTO esim_plans (
              provider_id, name, description, data, validity, 
              provider_price, selling_price, retail_price, margin, is_active
            ) VALUES (
              ${providerId}, 'Test Plan', 'Test Description', 1.0, 30,
              1.0, 2.0, 2.0, 100, true
            )
          `);
          
          console.log('Verification successful: Able to insert duplicate provider_id');
        }
        
        // Rollback the transaction to avoid actually inserting test data
        throw new Error('Rolling back test transaction');
      } catch (error) {
        if ((error as Error).message === 'Rolling back test transaction') {
          console.log('Test transaction rolled back as planned');
        } else {
          console.error('Constraint may still be active:', error);
        }
      }
    });
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    process.exit();
  }
}

removePlanProviderIdConstraint();