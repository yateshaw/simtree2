/**
 * Secure Console Cleanup Script
 * Removes excessive debugging and implements secure logging
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Patterns to remove or replace
const securityPatterns = [
  // Remove sensitive data logging
  /console\.log\([^)]*🔑 SADMIN USER DETECTED[^)]*\);?/g,
  /console\.log\([^)]*Auth state:[^)]*\);?/g,
  /console\.log\([^)]*User authenticated, checking access control:[^)]*\);?/g,
  /console\.log\([^)]*DEBUG: Purchased eSIMs[^)]*\);?/g,
  /console\.log\([^)]*Loading Stripe with key:[^)]*\);?/g,
  /console\.log\([^)]*Companies:[^)]*\);?/g,
  /console\.log\([^)]*Executive ID mappings[^)]*\);?/g,
  /console\.log\([^)]*All transactions for[^)]*\);?/g,
  /console\.log\([^)]*Dynamic executive-company mapping[^)]*\);?/g,
];

async function cleanupFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let modified = false;
    
    // Apply security patterns
    for (const pattern of securityPatterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, '// Debug logging removed for security');
        modified = true;
      }
    }
    
    // Replace excessive console.log with minimal secure logging
    if (content.includes('console.log') && filePath.includes('client/')) {
      content = content.replace(
        /console\.log\((.*?)\);/g, 
        (match, args) => {
          // Keep only critical error logging
          if (args.includes('error') || args.includes('Error')) {
            return `console.error(${args});`;
          }
          // Remove all other console.log in production
          return `if (import.meta.env.DEV) { console.log(${args}); }`;
        }
      );
      modified = true;
    }
    
    if (modified) {
      await fs.writeFile(filePath, content);
      console.log(`✓ Secured: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

async function findAndCleanFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await findAndCleanFiles(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        await cleanupFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dir}:`, error.message);
  }
}

async function main() {
  console.log('🔒 Starting secure console cleanup...');
  
  // Clean client-side files
  await findAndCleanFiles(path.join(__dirname, 'client/src'));
  
  // Clean server-side files  
  await findAndCleanFiles(path.join(__dirname, 'server'));
  
  console.log('✅ Console cleanup completed. Sensitive debugging removed.');
}

main().catch(console.error);