import { db } from './db';
import { sql } from 'drizzle-orm';

async function addRetailPriceColumn() {
  try {
    console.log('Adding retail price and margin columns to esim_plans table...');
    
    // Check if columns already exist
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'esim_plans' 
      AND column_name IN ('retail_price', 'margin')
    `);
    
    if (checkResult.rows.length < 2) {
      // Add the columns if they don't exist
      await db.execute(sql`
        ALTER TABLE esim_plans 
        ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS margin DECIMAL(10,2) DEFAULT 100
      `);

      // Update retail_price based on provider_price and margin
      await db.execute(sql`
        UPDATE esim_plans 
        SET retail_price = ROUND(provider_price * (1 + margin/100), 2)
        WHERE retail_price IS NULL
      `);

      // Make retail_price NOT NULL after setting initial values
      await db.execute(sql`
        ALTER TABLE esim_plans 
        ALTER COLUMN retail_price SET NOT NULL
      `);
      
      console.log('Retail price and margin columns added successfully');
    } else {
      console.log('Columns already exist');
    }
    
    console.log('Migration completed');
  } catch (error) {
    console.error('Error adding retail price column:', error);
  } finally {
    process.exit();
  }
}

addRetailPriceColumn();
