// Email service test script for browser console

// Test configuration endpoint
async function checkEmailConfig() {
  try {
    const response = await fetch('/api/email/test-configuration');
    const data = await response.json();
    console.log('Email Configuration Status:', data);
    return data;
  } catch (error) {
    console.error('Error checking email configuration:', error);
    return null;
  }
}

// Test sending email endpoint
async function sendTestEmail(email) {
  try {
    const response = await fetch('/api/email/send-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    console.log('Test Email Result:', data);
    return data;
  } catch (error) {
    console.error('Error sending test email:', error);
    return null;
  }
}

// Run both tests
async function runEmailTests(email = 'hey@simtree.co') {
  console.log('===== Starting Email Service Tests =====');
  
  // Check configuration first
  console.log('\n1. Testing Email Configuration Status:');
  const configResult = await checkEmailConfig();
  
  if (configResult && configResult.configured) {
    console.log('\n2. Email service is configured, sending test email to', email);
    await sendTestEmail(email);
  } else {
    console.log('\n2. Email service is not properly configured, skipping test email');
  }
  
  console.log('\n===== Email Service Tests Complete =====');
}

// Add a global function to run the tests from the browser console
window.testEmailService = runEmailTests;

// Log instructions when script is loaded
console.log('Email test script loaded. Run tests by typing:');
console.log('testEmailService() - to test with default address (hey@simtree.co)');
console.log('testEmailService("your@email.com") - to test with a custom address');