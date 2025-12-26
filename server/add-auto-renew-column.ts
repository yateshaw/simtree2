import { db } from './db';
import { sql } from 'drizzle-orm';

/**
 * Migration script to add auto_renew_enabled column to employees table
 */
async function addAutoRenewColumn() {
  try {
    console.log('Adding auto_renew_enabled column to employees table...');
    
    // Check if column already exists
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employees' AND column_name = 'auto_renew_enabled'
    `);
    
    if (checkResult.rows.length === 0) {
      // Add the column if it doesn't exist
      await db.execute(sql`
        ALTER TABLE employees 
        ADD COLUMN IF NOT EXISTS auto_renew_enabled BOOLEAN NOT NULL DEFAULT false
      `);
      console.log('auto_renew_enabled column added successfully');
    } else {
      console.log('auto_renew_enabled column already exists');
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error adding auto_renew_enabled column:', error);
  }
}

// Run the migration
addAutoRenewColumn().then(() => {
  console.log('Migration finished');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});