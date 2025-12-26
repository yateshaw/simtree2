# Deploying the eSIM Management Platform on Replit

This guide explains how to deploy the eSIM Management Platform on Replit.

## Prerequisites

- The project must be in a working state with all dependencies installed
- A Replit account with the ability to deploy applications

## Important: Configuration for Deployment

Before deploying, make the following adjustments to your .replit file (these changes can only be made through the Replit UI interface):

1. Navigate to the "Secrets" tab and ensure all your environment variables are set
2. Update the deployment section in the .replit file (using the Files interface) to:

```
[deployment]
deploymentTarget = "cloudrun"
build = ["sh", "replit-deploy.sh"]
run = ["sh", "start-production.sh"]
```

These changes will use our custom build and startup scripts optimized for Replit deployment.

## Deployment Steps

### 1. Fix the `__dirname` Reference

The application was originally using CommonJS-style `__dirname` but needs to use ES Module compatible code for deployment. We've fixed this by:

1. Adding the following code to `server/index.ts`:
   ```typescript
   import { fileURLToPath } from 'url';
   import { dirname } from 'path';

   // Get __dirname equivalent in ES modules
   const __filename = fileURLToPath(import.meta.url);
   const __dirname = dirname(__filename);
   ```

### 2. Fix Port Configuration

Replit deployments forward traffic to port 80, so we've updated the code to handle this:

1. Modified the port configuration in `server/index.ts` to use port 80 in production mode:
   ```typescript
   // For Replit deployment, we need to use port 80 or the port specified in the environment
   const BASE_PORT = process.env.NODE_ENV === 'production' ? 
                    (parseInt(process.env.PORT || '80', 10)) : 
                    (parseInt(process.env.PORT || '5000', 10));
   ```

### 3. Build for Deployment

We've created custom deployment scripts to simplify the process:

1. Use `./replit-deploy.sh` to build the application for deployment:
   ```bash
   # Make it executable if needed
   chmod +x replit-deploy.sh
   
   # Run the build script
   ./replit-deploy.sh
   ```

   This script:
   - Builds the server-side code
   - Creates a basic static HTML page
   - Sets up the dist directory structure

### 4. Start in Production Mode

1. Use `./start-production.sh` to run the application in production mode:
   ```bash
   # Make it executable if needed
   chmod +x start-production.sh
   
   # Start the production server
   ./start-production.sh
   ```

   This script:
   - Sets NODE_ENV to production
   - Sets PORT to 80
   - Starts the Node.js server

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure no other services are running on port 80. In development mode, the application will try alternative ports.

2. **Missing static files**: If the client-side build fails, the `replit-deploy.sh` script creates a minimal placeholder HTML page.

3. **Database connectivity**: Ensure the PostgreSQL database is properly configured and accessible.

## Manual Deployment

If the scripts don't work for any reason, you can deploy manually:

1. Build the server:
   ```bash
   mkdir -p dist
   esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
   ```

2. Start in production mode:
   ```bash
   NODE_ENV=production PORT=80 node dist/index.js
   ```

---

For more information about Replit deployments, refer to the [Replit documentation](https://docs.replit.com/hosting/deployments/introduction-to-deployments).