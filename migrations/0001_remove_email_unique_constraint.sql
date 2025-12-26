-- Migration to remove the global email uniqueness constraint
-- and add a composite constraint for (email, company_id)

-- First, drop the existing constraint on email
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;

-- Add the composite unique constraint for email and company_id
CREATE UNIQUE INDEX users_email_company_idx 
  ON users (email, company_id) 
  WHERE company_id IS NOT NULL;