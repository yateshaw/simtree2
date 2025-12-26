import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Setup neonConfig
neonConfig.webSocketConstructor = ws;

// Import necessary modules
dotenv.config();

async function migrate() {
  console.log('Starting migration...');
  
  // Connect to database
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Create coupons table with raw SQL
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        amount DECIMAL(10, 2) NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP,
        is_used BOOLEAN NOT NULL DEFAULT FALSE,
        used_by INTEGER REFERENCES users(id),
        used_at TIMESTAMP,
        description TEXT,
        recipient_email TEXT
      );
    `);
    
    console.log('Coupons table created successfully!');
  } catch (error) {
    console.error('Error creating coupons table:', error);
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);