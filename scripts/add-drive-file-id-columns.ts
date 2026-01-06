import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

const PROD_DATABASE_URL = process.env.PROD_DATABASE_URL;
if (!PROD_DATABASE_URL) {
  console.error('ERROR: PROD_DATABASE_URL environment variable is required');
  process.exit(1);
}

console.log('[Migration] Connecting to PRODUCTION database...');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: PROD_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log('[Migration] Adding drive_file_id columns...');
    
    await client.query('ALTER TABLE receipts ADD COLUMN IF NOT EXISTS drive_file_id TEXT');
    console.log('[Migration] ✓ Added drive_file_id to receipts');
    
    await client.query('ALTER TABLE bills ADD COLUMN IF NOT EXISTS drive_file_id TEXT');
    console.log('[Migration] ✓ Added drive_file_id to bills');
    
    await client.query('ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS drive_file_id TEXT');
    console.log('[Migration] ✓ Added drive_file_id to credit_notes');
    
    console.log('[Migration] Complete!');
  } finally {
    client.release();
    process.exit(0);
  }
}

main();
