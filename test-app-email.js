// Test script for the application's coupon email functionality
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import sgMail from '@sendgrid/mail';
import fs from 'fs';
import handlebars from 'handlebars';

// Load environment variables
dotenv.config();

// Configure paths for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SendGrid
const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  console.error('SENDGRID_API_KEY is not set in environment variables');
  process.exit(1);
}
sgMail.setApiKey(apiKey);

// Configure the email template directory
const TEMPLATE_DIR = path.join(__dirname, 'server/templates/emails');

// Helper function to compile a template with handlebars
async function compileTemplate(templateName, data) {
  try {
    const templatePath = path.join(TEMPLATE_DIR, `${templateName}.handlebars`);
    console.log(`Loading template from: ${templatePath}`);
    
    // Check if template exists
    try {
      await fs.promises.access(templatePath);
      console.log(`Template exists at ${templatePath}`);
    } catch (err) {
      console.error(`Template not found at ${templatePath}`);
      throw new Error(`Template not found: ${templatePath}`);
    }
    
    // Read and compile template
    const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
    console.log(`Template content loaded (${templateContent.length} bytes)`);
    const template = handlebars.compile(templateContent);
    return template(data);
  } catch (error) {
    console.error(`Error compiling template ${templateName}:`, error);
    throw error;
  }
}

// Test function to send a coupon email
async function testSendCouponEmail() {
  const recipientEmail = 'test@example.com'; // Replace with your email
  const subject = 'Test Coupon Email (App Logic)';
  const couponCode = 'TESTCODE12345';
  const amount = 50.00;
  const description = 'This is a test coupon from the application logic';
  
  try {
    console.log('===== EMAIL SENDING DETAILS =====');
    console.log(`Recipient: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Coupon Code: ${couponCode}`);
    console.log(`Amount: ${amount.toFixed(2)}`);
    console.log(`Description: ${description || 'none'}`);
    
    // Prepare template data
    const templateData = {
      code: couponCode,
      amount: amount.toFixed(2),
      description: description,
      expiryDate: null,
      year: new Date().getFullYear()
    };
    
    console.log('Template data:', templateData);

    // Compile the HTML email
    const html = await compileTemplate('coupon', templateData);
    console.log('HTML email compiled successfully');

    // Use verified sender email that's already working
    const verifiedSenderEmail = 'Simtree <hey@simtree.co>';
    
    // Set up email data with proper typing for SendGrid
    const msg = {
      to: recipientEmail,
      from: verifiedSenderEmail, 
      subject: subject,
      html: html,
    };
    
    console.log('Email data prepared:', { 
      to: msg.to, 
      from: msg.from, 
      subject: msg.subject,
      htmlLength: html.length
    });

    // Send the email
    console.log('Sending email via SendGrid...');
    await sgMail.send(msg);
    console.log(`Coupon email sent successfully to ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error('Error sending coupon email:', error);
    
    // Handle SendGrid specific errors
    if (error.response && error.response.body && error.response.body.errors) {
      const sendGridErrors = error.response.body.errors;
      console.error('SendGrid API errors:', JSON.stringify(sendGridErrors, null, 2));
      
      // Check for sender identity verification error
      const senderIdentityError = sendGridErrors.find(err => 
        err.field === 'from' && err.message.includes('verified Sender Identity')
      );
      
      if (senderIdentityError) {
        console.error('\nSENDER IDENTITY ERROR: The sender email address has not been verified in SendGrid.');
        console.error('To fix this, you need to verify your sender domain or email in the SendGrid dashboard.');
      }
    }
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return false;
  }
}

// Run the test
testSendCouponEmail()
  .then(result => {
    console.log(`\nTest result: ${result ? 'SUCCESS' : 'FAILED'}`);
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Unhandled error during test:', err);
    process.exit(1);
  });