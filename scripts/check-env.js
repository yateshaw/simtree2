#!/usr/bin/env node

/**
 * Environment Variable Verification Script
 * 
 * This script checks if all the required environment variables are properly loaded
 * from the .env file and displays their status.
 */

// Import required libraries
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Define required environment variables
const requiredVariables = {
  // Core Environment
  'NODE_ENV': 'Core environment setting',
  'APP_URL': 'Application base URL',
  'BASE_URL': 'Alternative base URL for local development',
  'PORT': 'Port configuration for server',
  'DATABASE_URL': 'PostgreSQL connection string',
  'DATABASE_CA_CERT': 'Database CA Certificate (optional)',
  
  // Authentication & Security
  'SESSION_SECRET': 'Secret for session management',
  
  // Stripe Integration
  'STRIPE_SECRET_KEY': 'Stripe API secret key',
  'STRIPE_WEBHOOK_SECRET': 'Stripe webhook secret',
  'VITE_STRIPE_PUBLIC_KEY': 'Stripe public key (for frontend)',
  
  // Email Configuration
  'SENDGRID_API_KEY': 'SendGrid API key',
  'SENDER_EMAIL': 'Email sender address',
  
  // eSIM Provider API
  'ESIM_ACCESS_CODE': 'eSIM provider access code',
  'ESIM_ACCESS_SECRET': 'eSIM provider secret',
  
  // Client-side Settings
  'VITE_API_URL': 'API URL for client to connect to'
};

// Function to mask sensitive values
const maskValue = (key, value) => {
  if (!value) return 'Not set';
  
  // Mask sensitive values
  if (key.includes('SECRET') || key.includes('KEY') || key.includes('PASSWORD')) {
    if (value.length > 8) {
      return value.substring(0, 4) + '****' + value.substring(value.length - 4);
    } else {
      return '********';
    }
  }
  
  return value;
};

console.log('\n=== Environment Variables Check ===\n');

// Parse .env file to get comments
let envComments = {};
try {
  const envFilePath = path.resolve(__dirname, '../.env');
  const envContent = fs.readFileSync(envFilePath, 'utf8');
  const lines = envContent.split('\n');
  
  let currentComment = '';
  for (const line of lines) {
    if (line.trim().startsWith('#')) {
      // Store comment line
      currentComment = line.trim();
    } else if (line.includes('=')) {
      // Associate comment with variable
      const key = line.split('=')[0].trim();
      if (currentComment) {
        envComments[key] = currentComment;
        currentComment = '';
      }
    }
  }
} catch (error) {
  console.error('Error reading .env file:', error.message);
}

let missingCount = 0;

// Define which variables are optional
const optionalVariables = ['DATABASE_CA_CERT'];

// Check each variable
console.log('--- Required Variables ---');
for (const [key, description] of Object.entries(requiredVariables)) {
  const value = process.env[key];
  const isOptional = optionalVariables.includes(key);
  const status = value ? '✅' : (isOptional ? '⚠️' : '❌');
  const displayValue = maskValue(key, value);
  const category = envComments[key] || '';
  
  if (!value && !isOptional) missingCount++;
  
  console.log(`${status} ${key}: ${displayValue}${isOptional && !value ? ' (optional)' : ''}`);
  console.log(`   Description: ${description}`);
  if (category) console.log(`   Category: ${category}`);
  console.log('');
}

// Summary
console.log('--- Summary ---');
if (missingCount === 0) {
  console.log('✅ All required environment variables are set.');
} else {
  console.log(`❌ Missing ${missingCount} required environment variables.`);
  console.log('Please update your .env file with the missing values.');
}

console.log('\n=== End of Environment Check ===\n');