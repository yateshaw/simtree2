import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL!,
  ssl: { 
    rejectUnauthorized: false // Required for Neon PostgreSQL over HTTPS
  }
});
const db = drizzle(pool);

async function runMigration() {
  try {
    // Create esim_plans table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS esim_plans (
        id SERIAL PRIMARY KEY,
        provider_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        data DECIMAL(10,2) NOT NULL,
        validity INTEGER NOT NULL,
        provider_price DECIMAL(10,2) NOT NULL,
        selling_price DECIMAL(10,2) NOT NULL,
        countries TEXT[],
        is_active BOOLEAN NOT NULL DEFAULT true
      );
    `);

    // Create purchased_esims table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS purchased_esims (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id),
        plan_id INTEGER REFERENCES esim_plans(id),
        iccid TEXT NOT NULL,
        activation_code TEXT,
        qr_code TEXT,
        status TEXT NOT NULL,
        purchase_date TIMESTAMP NOT NULL DEFAULT NOW(),
        activation_date TIMESTAMP,
        expiry_date TIMESTAMP,
        data_used DECIMAL(10,2) DEFAULT 0,
        metadata JSONB
      );
    `);

    // Create plan_history table with proper timestamp handling
    await db.execute(sql`
      DROP TABLE IF EXISTS plan_history;
      CREATE TABLE plan_history (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id),
        plan_name TEXT NOT NULL,
        plan_data DECIMAL(10,2) NOT NULL,
        start_date TIMESTAMP WITH TIME ZONE NOT NULL,
        end_date TIMESTAMP WITH TIME ZONE NOT NULL,
        data_used DECIMAL(10,2) DEFAULT 0,
        status TEXT NOT NULL,
        provider_id TEXT NOT NULL
      );
    `);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();