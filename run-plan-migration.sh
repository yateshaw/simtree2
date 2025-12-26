#!/bin/bash

# Step 1: Run the migration to remove the unique constraint
echo "Step 1: Removing unique constraint from provider_id column..."
npx tsx server/run-constraint-migration.ts

# Wait a bit to ensure the database changes are fully applied
echo "Waiting for database changes to be applied..."
sleep 2

# Step 2: Sync all plans with the ESim Access API
echo "Step 2: Syncing all plans from ESim Access API..."
npx tsx server/sync-all-plans.ts

echo "Process completed. Check the logs above for details."