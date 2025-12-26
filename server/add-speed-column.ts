
import { db } from './db';
import { sql } from 'drizzle-orm';

async function addSpeedColumn() {
  try {
    console.log('Adding speed column to esim_plans table...');
    
    // Check if column already exists
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'esim_plans' AND column_name = 'speed'
    `);
    
    if (checkResult.rows.length === 0) {
      // Add the column if it doesn't exist
      await db.execute(sql`
        ALTER TABLE esim_plans 
        ADD COLUMN IF NOT EXISTS speed TEXT
      `);
      console.log('Speed column added successfully');
    } else {
      console.log('Speed column already exists');
    }
    
    console.log('Migration completed');
  } catch (error) {
    console.error('Error adding speed column:', error);
  } finally {
    process.exit();
  }
}

addSpeedColumn();
