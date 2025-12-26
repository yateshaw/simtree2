import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from "@shared/schema";
import WebSocket from 'ws';

// Configure Neon for Node.js environment
neonConfig.webSocketConstructor = WebSocket;
neonConfig.pipelineConnect = false;
neonConfig.useSecureWebSocket = true;
neonConfig.pipelineTLS = false;

/**
 * Masks database credentials in a URL for safe logging
 */
function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    if (parsed.username) {
      parsed.username = parsed.username.substring(0, 3) + '***';
    }
    return parsed.toString();
  } catch {
    return '[invalid URL]';
  }
}

/**
 * Gets the appropriate database URL based on environment.
 * STRICT: Uses PROD_DATABASE_URL in production, DEV_DATABASE_URL in development.
 * NO FALLBACKS - fails fast if the required variable is not set.
 */
function getDatabaseUrl(): string {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Diagnostic logging to help debug deployment issues
  console.log('[DB Config] Environment diagnostics:');
  console.log(`   NODE_ENV: ${nodeEnv}`);
  console.log(`   PROD_DATABASE_URL exists: ${!!process.env.PROD_DATABASE_URL}`);
  console.log(`   DEV_DATABASE_URL exists: ${!!process.env.DEV_DATABASE_URL}`);
  console.log(`   DATABASE_URL exists: ${!!process.env.DATABASE_URL}`);
  
  if (nodeEnv === 'production') {
    const url = process.env.PROD_DATABASE_URL;
    if (!url) {
      const errorMsg = `❌ FATAL: PROD_DATABASE_URL not set in production environment

DEBUGGING CHECKLIST:
1. Go to Deployments → Settings → Environment Variables
2. Ensure "Sync secrets from Repl" is ENABLED
3. Check that PROD_DATABASE_URL is listed and has a value (not empty)
4. If it shows as "overridden", delete the override to use the synced secret
5. If issues persist, DELETE the deployment and create a new one to force resync

Set PROD_DATABASE_URL in Replit Secrets with your production database connection string.`;
      console.error(errorMsg);
      throw new Error('PROD_DATABASE_URL required in production.');
    }
    console.log('🚀 Using PRODUCTION database (source: PROD_DATABASE_URL)');
    console.log(`   URL: ${maskDatabaseUrl(url)}`);
    return url;
  } else {
    const url = process.env.DEV_DATABASE_URL;
    if (!url) {
      const errorMsg = `❌ FATAL: DEV_DATABASE_URL not set in development environment
   Set DEV_DATABASE_URL in Replit Secrets`;
      console.error(errorMsg);
      throw new Error('DEV_DATABASE_URL required in development.');
    }
    console.log('🔧 Using DEVELOPMENT database (source: DEV_DATABASE_URL)');
    console.log(`   URL: ${maskDatabaseUrl(url)}`);
    return url;
  }
}

const databaseUrl = getDatabaseUrl();

// Using Neon's serverless driver for better performance
export const pool = new Pool({ 
  connectionString: databaseUrl,
  max: 3, // Reduce max connections for faster startup
  idleTimeoutMillis: 30000, // Reduce idle timeout
  connectionTimeoutMillis: 10000, // Reduce connection timeout for faster startup
});

// Add comprehensive connection error handling
pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

pool.on('connect', () => {
  console.log('Database client connected');
});

pool.on('remove', () => {
  console.log('Database client removed');
});

/**
 * Tests the database connection and logs the connected database name.
 * @returns true if connection successful, false otherwise
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT current_database(), NOW()');
    const dbName = result.rows[0]?.current_database;
    const timestamp = result.rows[0]?.now;
    console.log(`📊 Connected to: ${dbName}`);
    console.log(`   Server time: ${timestamp}`);
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    return false;
  }
}

/**
 * Gets the current database URL for use in backup jobs and other tools.
 * This ensures backup jobs use the same environment-specific URL.
 */
export function getCurrentDatabaseUrl(): string {
  return databaseUrl;
}

export const db = drizzle(pool, { schema });
