// Custom build script for Replit deployment
import { exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting custom build process for Replit deployment...');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Ensure public directory exists
if (!fs.existsSync('dist/public')) {
  fs.mkdirSync('dist/public', { recursive: true });
}

// Special copy for init-sadmin to ensure it's included in the build
console.log('Copying init-sadmin.ts to dist...');
try {
  if (!fs.existsSync('./dist/server')) {
    fs.mkdirSync('./dist/server', { recursive: true });
  }
  fs.copyFileSync('./server/init-sadmin.ts', './dist/server/init-sadmin.ts');
  console.log('Successfully copied init-sadmin.ts');
} catch (copyError) {
  console.error('Error copying init-sadmin.ts:', copyError);
}

// Build the server side
console.log('Building server-side code...');
exec('esbuild server/index.ts server/init-sadmin.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', (error, stdout, stderr) => {
  if (error) {
    console.error(`Server build error: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`Server build stderr: ${stderr}`);
  }
  console.log('Server build completed successfully');
  
  // Copy existing public files if any
  if (fs.existsSync('public')) {
    console.log('Copying public files...');
    fs.readdirSync('public').forEach(file => {
      fs.copyFileSync(path.join('public', file), path.join('dist/public', file));
    });
  }
  
  // Create a special deployment validation file to run post-init checks
  console.log('Creating deployment validation script...');
  const validationScript = `
// Production validation script
// This script validates critical resources are present after deployment
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../shared/schema';

async function validateDeployment() {
  console.log('==== Running post-deployment validation ====');
  try {
    // Connect to database using the environment DATABASE_URL
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable not found!');
    }
    
    const pool = new Pool({ connectionString });
    console.log('Database connection established');
    
    // Check database connection
    await pool.query('SELECT 1 as connection_test');
    console.log('Database connection verified');
    
    // Check if sadmin user exists with proper email
    const db = drizzle(pool);
    const [sadminUser] = await db.select().from(schema.users)
      .where(eq(schema.users.username, 'sadmin'))
      .execute();
      
    if (!sadminUser) {
      console.error('❌ CRITICAL: sadmin user does not exist in the database!');
    } else {
      console.log('✓ sadmin user exists with ID:', sadminUser.id);
      
      if (!sadminUser.email) {
        console.error('❌ CRITICAL: sadmin user email is null!');
      } else {
        console.log('✓ sadmin user email is set to:', sadminUser.email);
      }
      
      if (!sadminUser.isAdmin || !sadminUser.isSuperAdmin) {
        console.error('❌ CRITICAL: sadmin user does not have proper admin privileges!');
      } else {
        console.log('✓ sadmin user has proper admin privileges');
      }
    }
    
    console.log('Deployment validation completed');
    await pool.end();
  } catch (error) {
    console.error('Deployment validation failed:', error);
  }
}

validateDeployment().catch(console.error);
  `;
  
  // Write the validation script to the dist directory
  fs.writeFileSync('./dist/validate-deployment.js', validationScript);
  console.log('Deployment validation script created');
  
  console.log('Build process completed successfully. The application is ready for Replit deployment.');
});