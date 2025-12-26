/**
 * Migration: Remove currentPlan column from executives table
 * 
 * This migration removes the currentPlan field from the executives table as part of
 * the multiple plan support implementation. All plan information is now derived
 * from the purchased_esims table.
 * 
 * Phase 5 of the Multiple Plan Support Migration
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const db = drizzle(pool);

async function removeCurrentPlanColumn() {
  console.log('Starting migration: Remove currentPlan column from executives table');
  
  try {
    // First, verify the column exists
    const columnCheck = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'executives' 
      AND column_name = 'current_plan'
    `);
    
    if (columnCheck.rows.length === 0) {
      console.log('✓ currentPlan column does not exist - migration already completed');
      return;
    }
    
    console.log('✓ currentPlan column found - proceeding with removal');
    
    // Drop the currentPlan column
    await db.execute(sql`
      ALTER TABLE executives 
      DROP COLUMN IF EXISTS current_plan
    `);
    
    console.log('✓ Successfully removed currentPlan column from executives table');
    
    // Verify the column was removed
    const verifyCheck = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'executives' 
      AND column_name = 'current_plan'
    `);
    
    if (verifyCheck.rows.length === 0) {
      console.log('✓ Migration verification successful - currentPlan column removed');
    } else {
      console.error('✗ Migration verification failed - currentPlan column still exists');
    }
    
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

async function main() {
  try {
    await removeCurrentPlanColumn();
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Auto-run when executed directly
main().catch(console.error);

export { removeCurrentPlanColumn };