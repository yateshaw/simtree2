import { Router } from 'express';
import { z } from 'zod';
import { sendVerificationEmail, sendWelcomeEmail, sendActivationEmail, isConfigured, sendEmail } from '../services/email.service';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storage } from '../storage';

const router = Router();

// Email verification route
router.get('/verify', async (req, res) => {
  try {
    const token = req.query.token as string;
    
    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token is required' });
    }

    // Find user with this verification token
    const [user] = await db.select()
      .from(schema.users)
      .where(eq(schema.users.verificationToken, token));

    if (!user) {
      return res.status(404).json({ success: false, message: 'Invalid verification token' });
    }

    // Check if token has expired
    if (user.verificationTokenExpiry && new Date(user.verificationTokenExpiry) < new Date()) {
      return res.status(400).json({ success: false, message: 'Verification token has expired' });
    }

    // Update user to be verified
    await db.update(schema.users)
      .set({
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null
      })
      .where(eq(schema.users.id, user.id));

    // Do NOT send welcome email here
    // It will be sent after the company profile is completed
    // This ensures proper user-company association

    // Redirect to frontend page for completing profile
    res.redirect(`/complete-profile?verified=true&userId=${user.id}`);

  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = z.object({
      email: z.string().email()
    }).parse(req.body);

    // Find user with this email
    const [user] = await db.select()
      .from(schema.users)
      .where(eq(schema.users.email, email));

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'User is already verified' });
    }

    // Generate new verification token
    const verificationToken = Math.random().toString(36).substring(2, 15) + 
                             Math.random().toString(36).substring(2, 15);
    
    // Set token expiry to 24 hours from now
    const verificationTokenExpiry = new Date();
    verificationTokenExpiry.setHours(verificationTokenExpiry.getHours() + 24);

    // Update user with new verification token
    await db.update(schema.users)
      .set({
        verificationToken,
        verificationTokenExpiry: verificationTokenExpiry.toISOString()
      })
      .where(eq(schema.users.id, user.id));

    // Send verification email
    const success = await sendVerificationEmail(user.email, user.username, verificationToken);

    if (success) {
      res.json({ success: true, message: 'Verification email sent successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to send verification email' });
    }
  } catch (error) {
    console.error('Error resending verification email:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: 'Invalid request data', errors: error.errors });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// Send individual activation email to an employee
router.post('/send-individual-activation', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Log the raw request body for debugging
    console.log('Received activation request body:', req.body);
    
    // Handle potential string conversion issues
    let employeeId: number;
    if (typeof req.body.employeeId === 'string') {
      employeeId = parseInt(req.body.employeeId, 10);
    } else {
      employeeId = Number(req.body.employeeId);
    }
    
    // Validate after conversion
    if (isNaN(employeeId) || employeeId <= 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid employee ID: ${JSON.stringify(req.body.employeeId)}`
      });
    }

    console.log('Processed employeeId:', employeeId, typeof employeeId);

    // Get the employee from storage
    const employee = await storage.getEmployee(employeeId);
    if (!employee) {
      return res.status(404).json({ 
        success: false, 
        message: `Employee not found with ID: ${employeeId}` 
      });
    }

    // Skip the currentPlan check since this field doesn't exist in the database
    // The proper validation is done below by checking actual eSIMs
    
    // Get all eSIMs for this employee to check for active ones
    const allEsims = await storage.getPurchasedEsims({ employeeId });
    
    // Find any eSIM that has a valid activation status
    const activeEsimExists = allEsims.some(esim => {
      // Check basic status first
      const hasActiveStatus = (
        esim.status === 'active' || 
        esim.status === 'activated' || 
        esim.status === 'waiting_for_activation'
      );
      
      // If it doesn't have an active status, it's definitely not active
      if (!hasActiveStatus) return false;
      
      // Now we need to check if it's been cancelled/refunded in metadata
      // We need to be careful with the type here, so we'll do some safe checks
      let isCancelled = false;
      
      // Check if metadata exists and is an object
      if (esim.metadata && typeof esim.metadata === 'object') {
        const meta = esim.metadata as Record<string, any>;
        
        // Check for direct cancellation flags
        if (meta.isCancelled === true || meta.refunded === true) {
          isCancelled = true;
        }
        
        // Check for CANCEL status in the rawData structure (if it exists)
        if (meta.rawData && 
            typeof meta.rawData === 'object' && 
            meta.rawData.obj && 
            typeof meta.rawData.obj === 'object' && 
            Array.isArray(meta.rawData.obj.esimList) && 
            meta.rawData.obj.esimList[0] && 
            meta.rawData.obj.esimList[0].esimStatus === 'CANCEL'
        ) {
          isCancelled = true;
        }
      }
      
      // Return true only if it has active status AND is not cancelled
      return hasActiveStatus && !isCancelled;
    });
    
    if (!activeEsimExists) {
      return res.status(400).json({
        success: false,
        message: 'Employee has no active plans or all plans have been cancelled'
      });
    }

    // Get the eSIM for this employee
    try {
      const eSims = await storage.getPurchasedEsims({ employeeId });
      console.log('Retrieved eSims:', eSims);
      
      // Find the most recent eSIM with activation data that isn't cancelled
      const validEsim = eSims.find(esim => {
        // Basic requirements
        const hasRequiredData = 
          esim.status === 'waiting_for_activation' && 
          esim.qrCode && 
          esim.activationCode;
        
        if (!hasRequiredData) return false;
        
        // Check for cancellation in metadata
        let isCancelled = false;
        
        if (esim.metadata && typeof esim.metadata === 'object') {
          const meta = esim.metadata as Record<string, any>;
          
          // Check cancellation flags
          if (meta.isCancelled === true || meta.refunded === true) {
            isCancelled = true;
          }
          
          // Check for CANCEL status in nested structure
          if (meta.rawData && 
              typeof meta.rawData === 'object' && 
              meta.rawData.obj && 
              typeof meta.rawData.obj === 'object' && 
              Array.isArray(meta.rawData.obj.esimList) && 
              meta.rawData.obj.esimList[0] && 
              meta.rawData.obj.esimList[0].esimStatus === 'CANCEL'
          ) {
            isCancelled = true;
          }
        }
        
        // Only return true if it has the required data AND is not cancelled
        return hasRequiredData && !isCancelled;
      });
  
      if (!validEsim) {
        return res.status(404).json({
          success: false,
          message: 'No valid eSIM found for this employee or eSIM data not yet available'
        });
      }
  
      // Create properly formatted activation link
      const activationPath = `activate/${employeeId}/${validEsim.id}`;
      
      // Check QR code data - but provide fallback for situations when it's missing
      if (!validEsim.qrCode) {
        console.warn(`Warning: eSIM ${validEsim.id} for employee ${employeeId} has missing QR code. Email will still be sent with just the activation link.`);
      }
      
      // Generate a data URL with activation code if available but QR code is missing
      let qrCodeData = validEsim.qrCode;
      if (!qrCodeData && validEsim.activationCode) {
        console.log(`Using activation code to generate fallback QR code for eSIM ${validEsim.id}`);
        try {
          // Prepare to use the activation code URL directly if QR code is missing
          // This will let the user click the link in their email
          qrCodeData = validEsim.activationCode;
        } catch (qrError) {
          console.error('Failed to generate fallback QR code:', qrError);
        }
      }
  
      // Prepare email data
      const emailData = {
        to: employee.email,
        employeeName: employee.name,
        activationLink: activationPath,
        qrCodeData: qrCodeData || null // Use null to properly trigger the conditional logic in email template
      };

      // Send activation email with detailed error handling
      try {
        console.log('Attempting to send activation email with data:', {
          to: emailData.to,
          from: 'hey@simtree.co',
          employeeName: emailData.employeeName,
          hasQrCode: !!emailData.qrCodeData
        });
        
        const success = await sendActivationEmail(emailData);
        
        if (success) {
          res.json({ 
            success: true, 
            message: `Activation email sent successfully to ${employee.name} (${employee.email})` 
          });
        } else {
          res.status(500).json({ 
            success: false, 
            message: 'Failed to send activation email - check server logs for details' 
          });
        }
      } catch (emailError) {
        console.error('Detailed email sending error:', emailError);
        res.status(500).json({ 
          success: false, 
          message: 'Error sending activation email',
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error in eSIM retrieval or email sending:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving eSIM data',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error sending activation email:', error);
    
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid request data', 
        errors: error.errors 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// Test route to check email service configuration
router.get('/test-configuration', async (req, res) => {
  try {
    // Import config service
    const { configService } = await import('../services/config.service');
    
    // Check if email service is configured
    const configured = isConfigured();
    
    // Get the environment values without exposing the actual API key
    const emailConfig = await configService.getEmailConfig();
    const fromEmail = emailConfig.sender;
    const hasApiKey = !!process.env.SENDGRID_API_KEY;
    
    // Return the configuration status
    res.json({
      success: true,
      configured,
      fromEmail,
      hasApiKey,
      message: configured 
        ? 'Email service is properly configured' 
        : 'Email service is not properly configured'
    });
  } catch (error) {
    console.error('Error checking email configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking email configuration',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Serve a simple HTML test page directly from the server
router.get('/test-html', (req, res) => {
  // Create a simple HTML page
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Test Interface</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        line-height: 1.6;
      }
      h1 {
        color: #333;
        border-bottom: 1px solid #ddd;
        padding-bottom: 10px;
      }
      .section {
        background-color: #f5f5f5;
        border-radius: 5px;
        padding: 15px;
        margin-bottom: 20px;
      }
      button {
        background-color: #4CAF50;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 4px;
        cursor: pointer;
      }
      button:hover {
        background-color: #45a049;
      }
      input {
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        width: 300px;
      }
      #results {
        background-color: #fff;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 15px;
        min-height: 200px;
        white-space: pre-wrap;
        font-family: monospace;
        overflow-y: auto;
      }
    </style>
  </head>
  <body>
    <h1>Email Service Test Tool</h1>
    
    <div class="section">
      <h2>Test Email Configuration</h2>
      <p>Check if SendGrid email service is properly configured.</p>
      <button id="checkConfig">Check Configuration</button>
    </div>
    
    <div class="section">
      <h2>Send Test Email</h2>
      <p>Send a test email to verify email delivery.</p>
      <input type="email" id="emailInput" value="hey@simtree.co" placeholder="Enter email address">
      <button id="sendEmail">Send Test Email</button>
    </div>
    
    <div class="section">
      <h2>Run All Tests</h2>
      <p>Run both configuration check and test email sending.</p>
      <button id="runAll">Run All Tests</button>
    </div>
    
    <h2>Test Results</h2>
    <div id="results">Results will appear here...</div>
    
    <script>
      // Configuration test
      document.getElementById('checkConfig').addEventListener('click', async function() {
        const resultsDiv = document.getElementById('results');
        resultsDiv.textContent = 'Checking email configuration...\\n';
        
        try {
          const response = await fetch('/api/email/test-configuration');
          const data = await response.json();
          resultsDiv.textContent += JSON.stringify(data, null, 2) + '\\n';
        } catch (error) {
          resultsDiv.textContent += 'Error checking configuration: ' + error.message + '\\n';
        }
      });
      
      // Send test email
      document.getElementById('sendEmail').addEventListener('click', async function() {
        const emailInput = document.getElementById('emailInput').value;
        const resultsDiv = document.getElementById('results');
        
        if (!emailInput) {
          resultsDiv.textContent = 'Please enter an email address\\n';
          return;
        }
        
        resultsDiv.textContent = 'Sending test email to ' + emailInput + '...\\n';
        
        try {
          const response = await fetch('/api/email/send-test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: emailInput })
          });
          
          const data = await response.json();
          resultsDiv.textContent += JSON.stringify(data, null, 2) + '\\n';
        } catch (error) {
          resultsDiv.textContent += 'Error sending test email: ' + error.message + '\\n';
        }
      });
      
      // Run all tests
      document.getElementById('runAll').addEventListener('click', async function() {
        const emailInput = document.getElementById('emailInput').value;
        const resultsDiv = document.getElementById('results');
        
        if (!emailInput) {
          resultsDiv.textContent = 'Please enter an email address\\n';
          return;
        }
        
        resultsDiv.textContent = '===== Starting Email Service Tests =====\\n';
        
        // Check configuration first
        resultsDiv.textContent += '\\n1. Testing Email Configuration Status:\\n';
        
        try {
          const configResponse = await fetch('/api/email/test-configuration');
          const configData = await configResponse.json();
          resultsDiv.textContent += JSON.stringify(configData, null, 2) + '\\n';
          
          if (configData.configured) {
            resultsDiv.textContent += '\\n2. Email service is configured, sending test email to ' + emailInput + '\\n';
            
            try {
              const emailResponse = await fetch('/api/email/send-test', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: emailInput })
              });
              
              const emailData = await emailResponse.json();
              resultsDiv.textContent += JSON.stringify(emailData, null, 2) + '\\n';
            } catch (error) {
              resultsDiv.textContent += 'Error sending test email: ' + error.message + '\\n';
            }
          } else {
            resultsDiv.textContent += '\\n2. Email service is not properly configured, skipping test email\\n';
          }
        } catch (error) {
          resultsDiv.textContent += 'Error checking configuration: ' + error.message + '\\n';
        }
        
        resultsDiv.textContent += '\\n===== Email Service Tests Complete =====\\n';
      });
    </script>
  </body>
  </html>
  `;
  
  // Send the HTML content
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlContent);
});

// Test route to send a test email (requires admin authentication in production)
router.post('/send-test', async (req, res) => {
  try {
    // In production, you'd want to check authentication here
    // if (!req.isAuthenticated() || !req.user.isAdmin) {
    //   return res.status(401).json({ success: false, message: 'Admin authentication required' });
    // }

    const { email } = z.object({
      email: z.string().email()
    }).parse(req.body);

    // Log the attempt
    console.log(`Attempting to send test email to: ${email}`);

    // Check if API key is set
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'SendGrid API key not configured' 
      });
    }
    
    // Import the email service functions
    const { sendEmail } = await import('../services/email.service');
    
    // Create the message - use environment variable for consistency
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'hey@simtree.co';
    const subject = 'eSIM Platform - Email Test';
    const text = 'This is a test email from the eSIM Platform to verify that email sending is working correctly.';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333; text-align: center;">Email Test</h2>
        <p>This is a test email from the eSIM Platform to verify that email sending is working correctly.</p>
        <p>If you received this email, it means the email service is properly configured and working!</p>
        <p>Sender: ${fromEmail}</p>
        <p>Time: ${new Date().toISOString()}</p>
      </div>
    `;
    
    try {
      // Send the email using our email service
      const success = await sendEmail(email, subject, html, text);
      
      // Return success
      res.json({ 
        success: true, 
        message: `Test email sent successfully to ${email}`,
        fromEmail
      });
    } catch (sgError) {
      // Get error details
      const errorCode = sgError && typeof sgError === 'object' && 'code' in sgError ? sgError.code : undefined;
      const errorMessage = sgError && typeof sgError === 'object' && 'message' in sgError ? sgError.message : 'Unknown SendGrid error';
      
      console.error('SendGrid error:', sgError);
      
      // Handle SendGrid-specific errors
      if (errorCode === 403) {
        return res.status(403).json({
          success: false,
          message: 'Sender verification error. The email address used as the sender is not verified in SendGrid.',
          fromEmail,
          errorCode,
          errorMessage
        });
      }
      
      // Return general error
      res.status(500).json({
        success: false,
        message: 'Failed to send test email',
        fromEmail,
        errorCode,
        errorMessage
      });
    }
  } catch (error) {
    console.error('Error in test email route:', error);
    
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid email address', 
        errors: error.errors 
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// Contact form endpoint
const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

router.post('/contact/send', async (req, res) => {
  try {
    const data = contactFormSchema.parse(req.body);
    
    // Check if API key is set
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'Email service not configured' 
      });
    }
    
    // Import the dedicated contact form email service
    const { sendContactFormEmail } = await import('../services/email.service');
    
    try {
      // Get the next sequential contact number from database
      let contactNumber: string;
      try {
        const { db } = await import('../db');
        
        // Use PostgreSQL's UPDATE to increment atomically
        const result = await db.execute(`
          UPDATE contact_counter 
          SET current_number = current_number + 1, last_updated = NOW() 
          WHERE id = 1
          RETURNING current_number;
        `);
        
        if (result.rows.length > 0) {
          // Format the contact number as 8-digit zero-padded string
          contactNumber = (result.rows[0] as any).current_number.toString().padStart(8, '0');
        } else {
          // If no rows affected, insert initial record
          await db.execute(`INSERT INTO contact_counter (id, current_number) VALUES (1, 1);`);
          contactNumber = '00000001';
        }
      } catch (dbError) {
        // Fallback to timestamp-based numbering if database fails
        console.log('Database counter failed, using timestamp fallback:', dbError);
        contactNumber = `CF-${Date.now().toString().slice(-8)}`;
      }
      
      // Log the contact form submission for manual follow-up
      console.log('=== CONTACT FORM SUBMISSION ===');
      console.log('Contact Number:', contactNumber);
      console.log('Timestamp:', new Date().toISOString());
      console.log('From:', data.name, `(${data.email})`);
      console.log('Company:', data.companyName);
      console.log('Subject:', data.subject);
      console.log('Message:', data.message);
      console.log('=================================');
      
      // Send the email using the dedicated contact form function
      const success = await sendContactFormEmail({
        ...data,
        contactNumber
      });
      
      if (success) {
        res.json({ 
          success: true, 
          message: 'Your message has been sent successfully. We will get back to you soon!'
        });
      } else {
        // Even if email fails, log the submission and return success
        // This ensures users get feedback while email delivery is being fixed
        console.log('Email sending failed, but contact form submission logged for manual follow-up');
        res.json({ 
          success: true, 
          message: 'Your message has been received. We will get back to you soon!'
        });
      }
    } catch (emailError) {
      console.error('Contact form email error:', emailError);
      res.status(500).json({
        success: false,
        message: 'Failed to send message. Please try again.',
        error: emailError instanceof Error ? emailError.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Contact form validation error:', error);
    
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid form data', 
        errors: error.errors 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// Feedback form endpoint
const feedbackFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

router.post('/feedback/send', async (req, res) => {
  try {
    const data = feedbackFormSchema.parse(req.body);
    
    // Check if API key is set
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'Email service not configured' 
      });
    }
    
    // Import the dedicated feedback form email service
    const { sendFeedbackFormEmail } = await import('../services/email.service');
    
    try {
      // Get the next sequential feedback number from database
      let feedbackNumber: string;
      try {
        const { db } = await import('../db');
        
        // Use PostgreSQL's UPDATE to increment atomically
        const result = await db.execute(`
          UPDATE feedback_counter 
          SET current_number = current_number + 1, last_updated = NOW() 
          WHERE id = 1
          RETURNING current_number;
        `);
        
        if (result.rows.length > 0) {
          // Format the feedback number as 8-digit zero-padded string
          feedbackNumber = (result.rows[0] as any).current_number.toString().padStart(8, '0');
        } else {
          // If no rows affected, insert initial record
          await db.execute(`INSERT INTO feedback_counter (id, current_number) VALUES (1, 1);`);
          feedbackNumber = '00000001';
        }
      } catch (dbError) {
        // Fallback to timestamp-based numbering if database fails
        console.log('Database counter failed, using timestamp fallback:', dbError);
        feedbackNumber = `FB-${Date.now().toString().slice(-8)}`;
      }
      
      // Log the feedback form submission for manual follow-up
      console.log('=== FEEDBACK FORM SUBMISSION ===');
      console.log('Feedback Number:', feedbackNumber);
      console.log('Timestamp:', new Date().toISOString());
      console.log('From:', data.name, `(${data.email})`);
      console.log('Company:', data.companyName);
      console.log('Subject:', data.subject);
      console.log('Message:', data.message);
      console.log('=================================');
      
      // Send the email using the dedicated feedback form function
      const success = await sendFeedbackFormEmail({
        ...data,
        feedbackNumber
      });
      
      if (success) {
        res.json({ 
          success: true, 
          message: 'Your feedback has been sent successfully. Thank you for helping us improve!'
        });
      } else {
        // Even if email fails, log the submission and return success
        // This ensures users get feedback while email delivery is being fixed
        console.log('Email sending failed, but feedback form submission logged for manual follow-up');
        res.json({ 
          success: true, 
          message: 'Your feedback has been received. Thank you for helping us improve!'
        });
      }
    } catch (emailError) {
      console.error('Feedback form email error:', emailError);
      res.status(500).json({
        success: false,
        message: 'Failed to send feedback. Please try again.',
        error: emailError instanceof Error ? emailError.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Feedback form validation error:', error);
    
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid form data', 
        errors: error.errors 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

export default router;