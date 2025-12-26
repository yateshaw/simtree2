-- Migration: Remove unique constraint from esim_plans.provider_id
-- This will allow storing multiple plans with the same provider ID

-- Drop the unique constraint
ALTER TABLE esim_plans 
DROP CONSTRAINT IF EXISTS esim_plans_provider_id_unique;

-- Ensure the new changes are reflected in the database
-- by recreating the provider_id column as non-unique
-- This is a backup approach if simply dropping the constraint doesn't work
ALTER TABLE esim_plans 
ALTER COLUMN provider_id SET NOT NULL;