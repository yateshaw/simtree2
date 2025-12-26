#!/bin/bash
# Start the application in production mode

echo "==== Starting eSIM Management Platform in Production Mode ===="
echo "Setting environment variables..."
export NODE_ENV=production
export PORT=80

echo "Running pre-start validation checks..."
if [ -f "dist/deploy-checks.sh" ]; then
  echo "Found deployment checks script, running it..."
  chmod +x dist/deploy-checks.sh
  ./dist/deploy-checks.sh
else
  echo "WARNING: Deployment checks script not found!"
  
  # Fallback check for sadmin user
  if [ -n "$DATABASE_URL" ]; then
    echo "Performing manual sadmin check..."
    # Create a temporary script to check sadmin status
    cat > /tmp/check-sadmin.js << 'EOL'
import { Pool } from 'pg';

async function checkSadmin() {
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    console.log("Checking sadmin user existence...");
    
    const result = await pool.query("SELECT id, username, email, is_admin, is_super_admin FROM users WHERE username = 'sadmin'");
    
    if (result.rows.length === 0) {
      console.error("❌ CRITICAL: sadmin user not found in database!");
    } else {
      console.log("✓ Found sadmin user:", result.rows[0]);
      
      if (!result.rows[0].email) {
        console.error("❌ CRITICAL: sadmin email is null! Authentication may fail.");
        
        // Try to fix it directly
        console.log("Attempting emergency fix for sadmin email...");
        await pool.query("UPDATE users SET email = 'superadmin@esimplatform.com' WHERE username = 'sadmin'");
        
        // Verify fix
        const checkResult = await pool.query("SELECT email FROM users WHERE username = 'sadmin'");
        console.log("After fix attempt, sadmin email is:", checkResult.rows[0].email);
      }
    }
    
    await pool.end();
  } catch (error) {
    console.error("Error checking sadmin:", error);
  }
}

checkSadmin();
EOL
    
    echo "Running sadmin check script..."
    node /tmp/check-sadmin.js
    rm /tmp/check-sadmin.js
  else
    echo "DATABASE_URL not set, skipping sadmin check"
  fi
fi

echo "Starting server on port $PORT..."
node dist/index.js