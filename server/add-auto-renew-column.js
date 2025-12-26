// Migration script to add auto_renew_enabled column to executives table
import { db } from './db.js';
import { sql } from 'drizzle-orm';

async function addAutoRenewColumn() {
  try {
    console.log('Adding auto_renew_enabled column to executives table...');
    
    // Check if column already exists
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'executives' AND column_name = 'auto_renew_enabled'
    `);
    
    if (checkResult.rows.length === 0) {
      // Add the column if it doesn't exist
      await db.execute(sql`
        ALTER TABLE executives 
        ADD COLUMN IF NOT EXISTS auto_renew_enabled BOOLEAN NOT NULL DEFAULT false
      `);
      console.log('auto_renew_enabled column added successfully');
    } else {
      console.log('auto_renew_enabled column already exists');
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error adding auto_renew_enabled column:', error);
  } finally {
    process.exit(0);
  }
}

// Run the migration
addAutoRenewColumn();