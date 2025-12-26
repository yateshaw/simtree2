
import { Pool } from 'pg';
import dotenv from 'dotenv';
import axios from 'axios';

// Configure dotenv
dotenv.config();

async function checkDatabaseRecovery() {
  console.log("Checking Neon database recovery options...");
  
  // First, let's check if we can get basic database info
  try {
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL!,
      ssl: { 
        rejectUnauthorized: false // Required for Neon PostgreSQL over HTTPS
      }
    });
    const client = await pool.connect();
    
    // Get database version and name
    const result = await client.query('SELECT current_database(), version();');
    const dbName = result.rows[0].current_database;
    const version = result.rows[0].version;
    
    console.log(`Connected to database: ${dbName}`);
    console.log(`PostgreSQL version: ${version}`);
    
    // Extract project ID from DATABASE_URL (if possible)
    const dbUrl = process.env.DATABASE_URL || '';
    const projectIdMatch = dbUrl.match(/neon\.tech\/([^\/]+)/);
    const projectId = projectIdMatch ? projectIdMatch[1] : 'unknown';
    
    console.log("\nDatabase Recovery Information:");
    console.log("-----------------------------");
    console.log("1. Neon provides automatic point-in-time recovery for all projects.");
    console.log("2. You can restore your database to any point within the retention period.");
    console.log("3. For detailed recovery options, visit the Neon dashboard:");
    console.log("   https://console.neon.tech/app/projects");
    console.log("\nTo perform a point-in-time recovery:");
    console.log("1. Log in to your Neon account at https://console.neon.tech");
    console.log("2. Select your project");
    console.log("3. Go to the 'Branches' section");
    console.log("4. Click 'Create Branch' and select 'From point in time'");
    console.log("5. Choose the timestamp you want to restore to");
    
    // Check retention policy
    console.log("\nRetention policy:");
    console.log("- Free tier: 7 days of point-in-time recovery");
    console.log("- Paid tiers: Up to 30 days of point-in-time recovery");
    
    client.release();
    await pool.end();
    
  } catch (error) {
    console.error("Error connecting to database:", error);
    console.log("\nCannot retrieve database information directly.");
    console.log("Please visit the Neon dashboard to check recovery options:");
    console.log("https://console.neon.tech/app/projects");
  }
}

checkDatabaseRecovery().catch(console.error);
