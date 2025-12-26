// Script to run the migration to remove the global email unique constraint
// and replace it with a per-company unique constraint

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up the database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting migration to update email uniqueness constraints...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '0001_remove_email_unique_constraint.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    
    // Start a transaction for safety
    await client.query('BEGIN');
    
    // Run the migration SQL
    await client.query(migrationSql);
    
    // Commit the transaction
    await client.query('COMMIT');
    
    console.log('Migration completed successfully!');
    console.log('Email uniqueness is now enforced at the company level');
    console.log('You can now have users with the same email in different companies');
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
  } finally {
    client.release();
    pool.end();
  }
}

// Run the migration
runMigration();