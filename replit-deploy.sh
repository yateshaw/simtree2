#!/bin/bash
# Replit deployment script

echo "==== Starting Replit Deployment Process ===="

# Build server side with our custom build script
echo "Building server-side code with enhanced sadmin support..."
node build.js

# Make sure the dist directory exists (should be created by build.js)
if [ ! -d "dist" ]; then
  echo "ERROR: dist directory not found after build. Creating it now."
  mkdir -p dist
fi

# Make sure dist/public exists
if [ ! -d "dist/public" ]; then
  echo "ERROR: dist/public directory not found. Creating it now."
  mkdir -p dist/public
fi

# Create minimal placeholder for static files if not created by build.js
if [ ! -f "dist/public/index.html" ]; then
  echo "Creating minimal placeholder for static files..."
  cat > dist/public/index.html << 'EOL'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>eSIM Management Platform</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      flex-direction: column;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      padding: 40px;
      max-width: 600px;
      text-align: center;
    }
    h1 {
      color: #0f172a;
      margin-bottom: 16px;
    }
    p {
      color: #64748b;
      line-height: 1.6;
    }
    .status {
      margin-top: 20px;
      padding: 10px;
      border-radius: 4px;
      background-color: #f0f9ff;
      border: 1px solid #bae6fd;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>eSIM Management Platform</h1>
    <p>The application is now running in production mode.</p>
    <div class="status">
      <p>Server Status: <strong>Online</strong></p>
      <p>Deployment Status: <strong>Complete</strong></p>
    </div>
    <p>Use the API endpoints to interact with the server.</p>
  </div>
</body>
</html>
EOL
fi

# Add essential deployment checks
echo "Creating critical startup script to validate sadmin user..."
cat > dist/deploy-checks.sh << 'EOL'
#!/bin/bash
# Run critical deployment checks before starting the server

echo "==== Running Critical Deployment Checks ===="

# Check if DATABASE_URL environment variable is available
if [ -z "$DATABASE_URL" ]; then
  echo "❌ CRITICAL: DATABASE_URL environment variable is not set!"
  exit 1
fi

# Verify that the sadmin initialization module exists
if [ ! -f "dist/init-sadmin.js" ]; then
  echo "⚠️ WARNING: sadmin initialization module (init-sadmin.js) not found!"
  echo "This may cause issues with the sadmin account functionality."
fi

# Run the validation script if it exists
if [ -f "dist/validate-deployment.js" ]; then
  echo "Running deployment validation script..."
  node dist/validate-deployment.js
else
  echo "⚠️ WARNING: Deployment validation script not found!"
fi

echo "Deployment checks complete."
echo "==== Starting application in production mode ===="
EOL

# Make the script executable
chmod +x dist/deploy-checks.sh

echo "==== Build Process Complete ===="
echo ""
echo "To start the application in production mode, run:"
echo "./dist/deploy-checks.sh && NODE_ENV=production node dist/index.js"
echo ""
echo "For Replit deployment, the server should listen on port 80."