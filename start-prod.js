import { execSync } from 'child_process';

try {
  // Build the client
  console.log('Building client...');
  execSync('cd client && npm run build', { stdio: 'inherit' });

  // Start the server
  console.log('Starting server...');
  execSync('node dist/index.js', { stdio: 'inherit' });
} catch (error) {
  console.error('Error during production start:', error);
  process.exit(1);
}