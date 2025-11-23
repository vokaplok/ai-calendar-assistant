// Test script to manually run transaction sync
const { exec } = require('child_process');

console.log('🧪 Testing transaction sync locally...\n');

// Change NODE_ENV to development for local testing
process.env.NODE_ENV = 'development';

// Test via Telegram bot command
const testCommand = `curl -X POST http://localhost:3002/telegram/test -H "Content-Type: application/json" -d '{"message": {"text": "/transactions", "from": {"id": 12345}}}'`;

exec('npm run start:dev', (error, stdout, stderr) => {
  if (error) {
    console.error('Error starting app:', error);
    return;
  }
  
  // Wait a bit for server to start, then test
  setTimeout(() => {
    console.log('📡 Testing /transactions command...');
    exec(testCommand, (testError, testStdout, testStderr) => {
      if (testError) {
        console.error('Test error:', testError);
        return;
      }
      console.log('Test result:', testStdout);
    });
  }, 3000);
});