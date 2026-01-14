import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getBaseUrl } from '../env';
import * as templateService from './template.service';
import handlebars from 'handlebars';

dotenv.config();

// Initialize SendGrid with API key
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
  console.log('[Email Service] SendGrid API key configured successfully');
} else {
  console.warn('[Email Service] SendGrid API key is not set');
}

// The sender email to use (IMPORTANT: must be verified in SendGrid)
// Use environment variable for sender email, but always include "Simtree" name
const fromEmail = process.env.SENDGRID_FROM_EMAIL ? 
  `Simtree <${process.env.SENDGRID_FROM_EMAIL}>` : 
  'Simtree <hey@simtree.co>';
const VERIFIED_SENDGRID_EMAIL = fromEmail;

console.log(`[Email Service] Using sender email: ${fromEmail}`);
console.log(`[Email Service] Using base URL: ${getBaseUrl()}`);

/**
 * Get the Simtree logo as an attachment for emails
 * @returns SendGrid attachment object or null if file not found
 */
const getLogoAttachment = () => {
  // Try multiple logo formats for maximum email client compatibility
  const logoOptions = [
    { path: 'public/images/logoST.png', type: 'image/png', filename: 'simtree-logo.png' },
    { path: 'public/images/simtree-logo-optimized.svg', type: 'image/svg+xml', filename: 'simtree-logo.svg' }
  ];
  
  for (const option of logoOptions) {
    try {
      const logoPath = path.join(process.cwd(), option.path);
      console.log('[Email Service] Attempting to load logo from:', logoPath);
      
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        const logoBase64 = logoBuffer.toString('base64');
        
        console.log('[Email Service] Logo loaded successfully, size:', logoBuffer.length, 'bytes, type:', option.type);
        
        // Enhanced attachment object with multiple compatibility fields
        return {
          content: logoBase64,
          filename: option.filename,
          type: option.type,
          disposition: 'inline',
          content_id: 'logoST',
          cid: 'logoST'
        };
      }
    } catch (error) {
      console.warn('[Email Service] Failed to load logo from', option.path, ':', error instanceof Error ? error.message : String(error));
      continue;
    }
  }
  
  console.error('[Email Service] No usable logo file found');
  return null;
};

/**
 * Check if the email service is configured properly
 * @returns boolean indicating if the service is configured
 */
export const isConfigured = (): boolean => {
  return !!apiKey;
};

/**
 * Send a verification email to a user's email address
 * @param email User's email address
 * @param username User's username
 * @param verificationToken Verification token for account activation
 * @param customUrl Optional custom URL to use instead of the default verification URL
 */
export const sendVerificationEmail = async (
  email: string,
  username: string,
  verificationToken: string,
  customUrl?: string
): Promise<boolean> => {
  try {
    // Get the base URL (handles Replit environment)
    const baseUrl = getBaseUrl();
    // If a custom URL is provided, use it, otherwise use the set-password endpoint (old /api/email/verify endpoint is obsolete)
    const verificationUrl = customUrl || `${baseUrl}/set-password?token=${verificationToken}`;

    // Extract token and userId for the set-password URL
    let token = null;
    let userId = null;
    
    if (customUrl) {
      try {
        const url = new URL(customUrl);
        token = url.searchParams.get('token');
        userId = url.searchParams.get('userId');
        console.log('Verification Email Params:', { token, userId, customUrl });
      } catch (e) {
        console.error('Error parsing custom URL:', e);
      }
    }

    // Make sure the URL is properly encoded for HTML
    const encodedVerificationUrl = verificationUrl.replace(/&/g, '&amp;');

    const buttonText = customUrl ? 'Set Your Password' : 'Verify Email Address';
    const emailSubject = customUrl ? 'Complete Your Registration - Set Your Password' : 'Verify Your eSIM Platform Account';
    const emailBody = customUrl 
      ? `Thank you for signing up for the eSIM Platform. To complete your registration, please set your password by clicking the button below:`
      : `Thank you for signing up for the eSIM Platform. To complete your registration, please verify your email address by clicking the button below:`;

    // Add manual instructions for set-password if applicable
    // Include both direct path parameter link and manual entry option
    let manualInstructions = '';
    if (token && userId) {
      manualInstructions = `
        <p>If the button doesn't work, try visiting this direct link:</p>
        <p style="background-color: #f8f8f8; padding: 10px; border-radius: 3px; word-break: break-all;"><a href="${baseUrl}/set-password/${token}/${userId}">${baseUrl}/set-password/${token}/${userId}</a></p>
        
        <p>If the links don't work, please visit <strong>${baseUrl}/set-password</strong> manually and enter:</p>
        <ul>
          <li>Token: <strong>${token}</strong></li>
          <li>User ID: <strong>${userId}</strong></li>
        </ul>
      `;
    }

    // Try to get template from template service first
    let htmlContent;
    try {
      const templateContent = await templateService.getTemplateContent('verification.html');
      
      // Replace template variables with actual values
      const template = handlebars.compile(templateContent);
      htmlContent = template({
        username,
        emailBody,
        buttonText,
        encodedVerificationUrl,
        verificationUrl,
        manualInstructions,
        year: new Date().getFullYear()
      });
    } catch (templateError) {
      console.warn('Template not found or error compiling template, falling back to hardcoded template:', templateError);
      // Fallback to hardcoded template if template service fails
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333; text-align: center;">Complete Your Registration</h2>
          <p>Hello ${username},</p>
          <p>${emailBody}</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${encodedVerificationUrl}" style="background-color: #4a6cf7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">${buttonText}</a>
          </div>
          <p>This link will expire in 24 hours.</p>
          <p>If you can't click the button, you can copy and paste the following link into your browser:</p>
          <p style="background-color: #f8f8f8; padding: 10px; border-radius: 3px; word-break: break-all;"><a href="${encodedVerificationUrl}">${verificationUrl}</a></p>
          ${manualInstructions}
          <p>If you did not create an account, you can safely ignore this email.</p>
          <p>Thank you,<br>The eSIM Platform Team</p>
        </div>
      `;
    }

    const plainText = `Hello ${username},\n\n${emailBody}\n\n${verificationUrl}\n\nThis link will expire in 24 hours.\n\n${token && userId ? `If the link doesn't work, please visit: ${baseUrl}/set-password and enter the following information:\nToken: ${token}\nUser ID: ${userId}\n\n` : ''}If you did not create an account, you can safely ignore this email.\n\nThank you,\nThe eSIM Platform Team`;

    const msg: any = {
      to: email,
      from: fromEmail,
      subject: emailSubject,
      text: plainText,
      html: htmlContent,
      attachments: []
    };

    // Add logo attachment if available
    const logoAttachment = getLogoAttachment();
    if (logoAttachment) {
      msg.attachments.push(logoAttachment);
    }

    if (!apiKey) {
      console.log('SendGrid API key not set. Skipping email sending.');
      console.log('Would have sent email to:', email);
      console.log('Verification URL:', verificationUrl);
      return true;
    }

    await sgMail.send(msg);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
};

/**
 * Send a welcome email after account verification
 * @param email User's email address
 * @param username User's username
 */
export const sendWelcomeEmail = async (
  email: string,
  username: string
): Promise<boolean> => {
  try {
    // Get the base URL (handles Replit environment)
    const baseUrl = getBaseUrl();
    
    // Try to get template from template service first
    let htmlContent;
    try {
      const templateContent = await templateService.getTemplateContent('welcome.html');
      
      // Replace template variables with actual values
      const template = handlebars.compile(templateContent);
      htmlContent = template({
        username,
        baseUrl,
        year: new Date().getFullYear()
      });
    } catch (templateError) {
      console.warn('Template not found or error compiling template, falling back to hardcoded template:', templateError);
      // Fallback to hardcoded template if template service fails
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333; text-align: center;">Welcome to eSIM Platform!</h2>
          <p>Hello ${username},</p>
          <p>Thank you for verifying your email address. Your account is now active.</p>
          <p>You can now log in to your account and start using our platform.</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${baseUrl}/auth?tab=login" style="background-color: #4a6cf7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Log In Now</a>
          </div>
          <p>Thank you,<br>The eSIM Platform Team</p>
        </div>
      `;
    }
    
    const plainText = `Hello ${username},\n\nThank you for verifying your email address. Your account is now active.\n\nYou can now log in to your account and start using our platform.\n\nThank you,\nThe eSIM Platform Team`;
    
    const msg: any = {
      to: email,
      from: fromEmail,
      subject: 'Welcome to eSIM Platform!',
      text: plainText,
      html: htmlContent,
      attachments: []
    };

    // Add logo attachment if available
    const logoAttachment = getLogoAttachment();
    if (logoAttachment) {
      msg.attachments.push(logoAttachment);
    }

    if (!apiKey) {
      console.log('SendGrid API key not set. Skipping email sending.');
      console.log('Would have sent welcome email to:', email);
      return true;
    }

    await sgMail.send(msg);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
};

/**
 * Send a password reset email
 * @param email User's email address
 * @param username User's username
 * @param resetLink Link to reset password
 */
export const sendPasswordResetEmail = async (
  email: string,
  username: string,
  resetLink: string
): Promise<boolean> => {
  try {
    // Extract token and userId from the resetLink
    // Parse the path segments to extract parameters
    const url = new URL(resetLink);
    
    // The URL is now in format /set-password/token/userId
    const pathSegments = url.pathname.split('/');
    // Extracting token and userId from path segments
    const token = pathSegments[pathSegments.length - 2]; // Second to last segment
    const userId = pathSegments[pathSegments.length - 1]; // Last segment

    // Log for debugging
    console.log('Reset Email Params:', { token, userId, resetLink });

    const encodedResetLink = resetLink.replace(/&/g, '&amp;');
    
    // Try to get template from template service first
    let htmlContent;
    try {
      const templateContent = await templateService.getTemplateContent('password-reset.html');
      
      // Replace template variables with actual values
      const template = handlebars.compile(templateContent);
      htmlContent = template({
        username,
        encodedResetLink,
        resetLink,
        urlOrigin: url.origin,
        token,
        userId,
        year: new Date().getFullYear()
      });
    } catch (templateError) {
      console.warn('Template not found or error compiling template, falling back to hardcoded template:', templateError);
      // Fallback to hardcoded template if template service fails
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333; text-align: center;">Reset Your Password</h2>
          <p>Hello ${username},</p>
          <p>You requested to reset your password. Please click the button below to set a new password:</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${encodedResetLink}" style="background-color: #4a6cf7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Set New Password</a>
          </div>
          <p>This link will expire in 1 hour.</p>
          <p>If you can't click the button, you can copy and paste the following link into your browser:</p>
          <p style="background-color: #f8f8f8; padding: 10px; border-radius: 3px; word-break: break-all;"><a href="${encodedResetLink}">${resetLink}</a></p>
          <p>If neither option works, please visit <strong>${url.origin}/set-password</strong> manually and enter:</p>
          <ul>
            <li>Token: <strong>${token}</strong></li>
            <li>User ID: <strong>${userId}</strong></li>
          </ul>
          <p>If you did not request a password reset, you can safely ignore this email.</p>
          <p>Thank you,<br>The eSIM Platform Team</p>
        </div>
      `;
    }
    
    const plainText = `Hello ${username},\n\nYou requested to reset your password. Please click the link below to set a new password:\n\n${resetLink}\n\nIf copy-pasting doesn't work, please visit: ${url.origin}/set-password and enter the following information:\nToken: ${token}\nUser ID: ${userId}\n\nThis link will expire in 1 hour.\n\nIf you did not request a password reset, you can safely ignore this email.\n\nThank you,\nThe eSIM Platform Team`;

    const msg: any = {
      to: email,
      from: fromEmail,
      subject: 'Reset Your Password - eSIM Platform',
      text: plainText,
      html: htmlContent,
      attachments: []
    };

    // Add logo attachment if available
    const logoAttachment = getLogoAttachment();
    if (logoAttachment) {
      msg.attachments.push(logoAttachment);
    }

    if (!apiKey) {
      console.log('SendGrid API key not set. Skipping email sending.');
      console.log('Would have sent password reset email to:', email);
      console.log('Reset link:', resetLink);
      return true;
    }

    await sgMail.send(msg);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};

/**
 * Generic function to send an email
 * @param to Recipient email address
 * @param subject Email subject
 * @param html HTML content of the email
 * @param text Plain text content of the email
 */
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<boolean> => {
  try {
    const msg: any = {
      to,
      from: fromEmail,
      subject,
      html,
      text,
      attachments: []
    };

    // Add logo attachment if available
    const logoAttachment = getLogoAttachment();
    if (logoAttachment) {
      msg.attachments.push(logoAttachment);
    }

    if (!apiKey) {
      console.log('SendGrid API key not set. Skipping email sending.');
      console.log('Would have sent email to:', to);
      return true;
    }

    try {
      console.log('Sending email from:', fromEmail, 'to:', to, 'subject:', subject);
      await sgMail.send(msg);
      console.log('Email sent successfully');
      return true;
    } catch (sgError) {
      // Handle SendGrid-specific errors
      console.error('SendGrid API Error:', sgError);
      
      // TypeScript-safe error handling
      interface SendGridError {
        code?: number;
        message?: string;
        response?: {
          body?: {
            errors?: Array<{
              message?: string;
              field?: string;
              help?: string;
            }>;
          };
        };
      }
      
      // Cast to our interface if it's an object
      const sgErrorObj = (typeof sgError === 'object' && sgError !== null) ? sgError as SendGridError : {};
      
      // If it's a 403 error, likely related to sender verification
      if (sgErrorObj.code === 403) {
        console.error('403 Forbidden: The email address ' + fromEmail + ' is not verified in SendGrid');
        
        // Check for detailed errors in response body
        if (sgErrorObj.response?.body?.errors?.length) {
          console.error('Detailed error information:', sgErrorObj.response.body.errors);
        }
      }
      
      throw sgError;
    }
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

/**
 * Send an eSIM activation email to an employee
 * @param emailData Email data containing recipient, employee name, activation link, and QR code
 * @returns Promise resolving to boolean indicating success or failure
 */
export const sendActivationEmail = async (
  emailData: {
    to: string;
    employeeName: string;
    activationLink: string;
    qrCodeData: string | null;
    activationCode: string | null;
    employeeId?: number;
    esimId?: number;
    planDetails?: {
      name: string;
      dataAllowance: string;
      validity: number;
      countries: string[];
      speed?: string;
    };
  }
): Promise<boolean> => {
  try {
    // Get the base URL (handles Replit environment)
    const baseUrl = getBaseUrl();
    
    // Create the full activation URL
    const activationUrl = `${baseUrl}/${emailData.activationLink}`;
    
    // Create usage monitoring link if employee and eSIM IDs are provided
    let usageMonitoringUrl = null;
    if (emailData.employeeId && emailData.esimId) {
      usageMonitoringUrl = `${baseUrl}/usage-monitor/${emailData.employeeId}/${emailData.esimId}`;
    }
    
    // Log QR code data for debugging
    console.log('QR Code Data attempted for use:', emailData.qrCodeData ? 'Present' : 'Missing');
    console.log('Activation Code Data attempted for use:', emailData.activationCode ? 'Present' : 'Missing');

    // Validate and handle the QR code data
    let qrCodeDataForEmail = emailData.qrCodeData;
    let activationCodeForEmail = emailData.activationCode;
    let hasValidQrCode = false;
    
    console.log('QR Code Raw Input:', {
      type: typeof qrCodeDataForEmail,
      value: qrCodeDataForEmail,
      isNull: qrCodeDataForEmail === null,
      isEmptyString: qrCodeDataForEmail === '',
      length: qrCodeDataForEmail ? qrCodeDataForEmail.length : 0
    });
    
    console.log('Activation Code Raw Input:', {
      type: typeof activationCodeForEmail,
      value: activationCodeForEmail,
      isNull: activationCodeForEmail === null,
      isEmptyString: activationCodeForEmail === '',
      length: activationCodeForEmail ? activationCodeForEmail.length : 0
    });
    
    if (!qrCodeDataForEmail || typeof qrCodeDataForEmail !== 'string') {
      console.warn('Missing QR code data detected - will use fallback in email');
      qrCodeDataForEmail = null;
      hasValidQrCode = false;
    } else if (!qrCodeDataForEmail.startsWith('http')) {
      console.warn('Invalid QR code URL detected (not a URL):', qrCodeDataForEmail);
      // Check if it might be a data URL (base64)
      if (qrCodeDataForEmail.startsWith('data:')) {
        console.log('Found base64 data URL for QR code');
        hasValidQrCode = true;
      } else {
        // This could be raw activation code text - ok to continue but not a valid QR
        console.log('Non-URL QR data found, treating as invalid:', qrCodeDataForEmail);
        qrCodeDataForEmail = null;
        hasValidQrCode = false;
      }
    } else {
      // Valid URL-based QR code
      console.log('Valid QR code URL detected:', qrCodeDataForEmail);
      
      // Additional check to validate the URL format is correct and that the URL exists
      try {
        const url = new URL(qrCodeDataForEmail);
        console.log('QR Code URL is valid:', url.href);
        
        // Ensure image URL ends with an image extension
        const isImage = /\.(png|jpg|jpeg|gif|svg)$/i.test(url.pathname);
        if (!isImage && !url.pathname.includes('/')) {
          console.warn('QR code URL does not appear to be an image, but will attempt to use it anyway:', url.href);
        }
        
        hasValidQrCode = true;
      } catch (e) {
        console.error('QR code URL validation failed:', e);
        qrCodeDataForEmail = null;
        hasValidQrCode = false;
      }
    }
    
    // Try to get template from template service first
    let htmlContent;
    try {
      const templateContent = await templateService.getTemplateContent('activation.html');
      
      // Replace template variables with actual values
      const template = handlebars.compile(templateContent);
      htmlContent = template({
        employeeName: emailData.employeeName,
        qrCodeData: qrCodeDataForEmail,
        hasValidQrCode: hasValidQrCode,
        activationUrl,
        activationCode: activationCodeForEmail,
        planDetails: emailData.planDetails,
        usageMonitoringUrl: usageMonitoringUrl,
        year: new Date().getFullYear()
      });
    } catch (templateError) {
      console.warn('Template not found or error compiling template, falling back to hardcoded template:', templateError);
      // Fallback to hardcoded template if template service fails
      htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your eSIM Activation Instructions</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #773df8; color: white; padding: 10px 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .button { display: inline-block; padding: 10px 20px; background-color: #4a6cf7; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
    .qr-container { text-align: center; margin: 25px 0; }
    .qr-image { max-width: 250px; height: auto; border: 1px solid #ddd; padding: 10px; background-color: white; margin: 0 auto; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${emailData.planDetails ? `${emailData.planDetails.name} Plan Assigned` : 'Your eSIM Activation Instructions'}</h1>
    </div>
    <div class="content">
      <p>Hello ${emailData.employeeName},</p>
      <p>Your eSIM is ready to be activated! Follow these steps to install your eSIM profile:</p>
      
      ${emailData.planDetails ? `
      <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4a6cf7;">
        <h3 style="color: #333; margin: 0 0 15px 0;">📱 Your eSIM Plan Details</h3>
        <div style="display: grid; gap: 8px;">
          <div><strong>Plan Name:</strong> ${emailData.planDetails.name}</div>
          <div><strong>Data Allowance:</strong> ${emailData.planDetails.dataAllowance}GB</div>
          <div><strong>Validity Period:</strong> ${emailData.planDetails.validity} days</div>
          <div><strong>Coverage:</strong> ${emailData.planDetails.countries.map(c => c.toUpperCase()).join(', ')}</div>
          ${emailData.planDetails.speed ? `<div><strong>Network Speed:</strong> ${emailData.planDetails.speed}</div>` : ''}
        </div>
      </div>
      ` : ''}
      
      ${hasValidQrCode ? `
      <div class="qr-container">
        <p><strong>Scan this QR code with your camera app:</strong></p>
        <img class="qr-image" src="${qrCodeDataForEmail}" alt="eSIM QR Code" width="200" height="200" style="display: block; margin: 0 auto; border: 1px solid #ddd; padding: 10px; background-color: white;">
        <p><small>If you cannot see the QR code above, please <a href="${qrCodeDataForEmail}" target="_blank" rel="noopener noreferrer">click here to open the QR code in your browser</a></small></p>
      </div>
      ` : `
      <div class="qr-container" style="border: 1px dashed #ccc; padding: 15px; background-color: #f9f9f9; text-align: center;">
        <p><strong>QR code not available</strong></p>
        <p>Please use the activation button below instead.</p>
      </div>
      `}
      
      <p><strong>Your Activation Code:</strong></p>
      <div style="font-family: monospace; background-color: #eee; padding: 10px; border-radius: 4px; word-break: break-all; text-align: center; margin: 15px 0; font-size: 14px;">
        ${activationCodeForEmail || "Not available"}
      </div>
      
      <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #773df8;">
        <h3>iPhone Activation Instructions:</h3>
        <ol>
          <li>Go to Settings > Cellular/Mobile Data</li>
          <li>Tap "Add Cellular/Mobile Plan"</li>
          <li>Select "Enter Details Manually"</li>
          <li>Enter the activation code shown above</li>
        </ol>
      </div>
      
      <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #773df8;">
        <h3>Android Activation Instructions:</h3>
        <ol>
          <li>Go to Settings > Network & Internet > SIMs (or Mobile Network)</li>
          <li>Tap on "+ Add" or "Add mobile plan"</li>
          <li>Choose "Enter code manually" option</li>
          <li>Enter the activation code shown above</li>
        </ol>
        <p><small>Menu options may vary based on your Android device manufacturer and OS version.</small></p>
      </div>
      
      ${usageMonitoringUrl ? `
      <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4a6cf7;">
        <h3 style="color: #333; margin: 0 0 15px 0;">📊 Monitor Your Data Usage</h3>
        <p>You can monitor your eSIM data usage anytime by visiting:</p>
        <div style="text-align: center; margin: 15px 0;">
          <a href="${usageMonitoringUrl}" style="display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">View Usage Dashboard</a>
        </div>
        <p><small>This link is unique to your eSIM and will show real-time usage information.</small></p>
      </div>
      ` : ''}
      
      <p>If you have any questions or need assistance, please contact your company administrator.</p>
      <p>Thank you,<br>The Simtree Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Simtree. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
    }
    
    const plainText = `Hello ${emailData.employeeName},

Your eSIM is ready to be activated! Please follow these instructions:

${emailData.planDetails ? `
eSIM Plan Details:
- Plan Name: ${emailData.planDetails.name}
- Data Allowance: ${emailData.planDetails.dataAllowance}GB
- Validity Period: ${emailData.planDetails.validity} days
- Coverage: ${emailData.planDetails.countries.map(c => c.toUpperCase()).join(', ')}${emailData.planDetails.speed ? `
- Network Speed: ${emailData.planDetails.speed}` : ''}

` : ''}

${hasValidQrCode ? 
`1. Check the email in HTML format to see the QR code for activation.
   (If you can't see the QR code, please view this email in a modern email client that supports HTML)` : 
`1. The QR code is currently not available for this eSIM.`}

2. Your activation code: ${activationCodeForEmail || "Not available"}

3. For iPhone users:
   - Go to Settings > Cellular/Mobile Data
   - Tap "Add Cellular/Mobile Plan"
   - Select "Enter Details Manually"
   - Enter the activation code shown above

4. For Android users:
   - Go to Settings > Network & Internet > SIMs (or Mobile Network)
   - Tap on "+ Add" or "Add mobile plan"
   - Choose "Enter code manually" option
   - Enter the activation code shown above

If you have any questions or need assistance, please contact your company administrator.

${usageMonitoringUrl ? `
Monitor Your Data Usage:
You can monitor your eSIM data usage anytime by visiting: ${usageMonitoringUrl}
This link is unique to your eSIM and will show real-time usage information.

` : ''}Thank you,
The Simtree Team`;

    const subject = emailData.planDetails 
      ? `Your ${emailData.planDetails.name} eSIM Plan is Ready for Activation`
      : 'Your eSIM Activation Instructions';

    const msg: any = {
      to: emailData.to,
      from: fromEmail,
      subject: subject,
      text: plainText,
      html: htmlContent,
      attachments: []
    };

    // Add logo attachment if available
    const logoAttachment = getLogoAttachment();
    if (logoAttachment) {
      msg.attachments.push(logoAttachment);
    }

    if (!apiKey) {
      console.log('SendGrid API key not set. Skipping email sending.');
      console.log('Would have sent activation email to:', emailData.to);
      return true;
    }

    try {
      // Log what we're trying to send
      console.log('Sending activation email from:', msg.from, 'to:', msg.to);
      await sgMail.send(msg);
      console.log('Email sent successfully');
      return true;
    } catch (sgError) {
      // Handle SendGrid-specific errors more clearly
      console.error('SendGrid API Error sending activation email:', sgError);
      
      // TypeScript-safe error handling
      interface SendGridError {
        code?: number;
        message?: string;
        response?: {
          body?: {
            errors?: Array<{
              message?: string;
              field?: string;
              help?: string;
            }>;
          };
        };
      }
      
      // Cast to our interface if it's an object
      const sgErrorObj = (typeof sgError === 'object' && sgError !== null) ? sgError as SendGridError : {};
      
      // If it's a 403 error, likely related to sender verification
      if (sgErrorObj.code === 403) {
        console.error('403 Forbidden: The email address ' + msg.from + ' is not verified in SendGrid');
        
        // Check for detailed errors in response body
        if (sgErrorObj.response?.body?.errors?.length) {
          console.error('Detailed error information:', sgErrorObj.response.body.errors);
        }
      }
      
      throw sgError;
    }
  } catch (error) {
    console.error('Error sending activation email:', error);
    return false;
  }
};

/**
 * Send a contact form email
 * @param contactData Contact form data
 */
export const sendContactFormEmail = async (contactData: {
  name: string;
  email: string;
  companyName: string;
  subject: string;
  message: string;
  contactNumber?: string;
}): Promise<boolean> => {
  try {
    // Use provided contact number or generate one
    const contactNumber = contactData.contactNumber || `CF-${Date.now().toString().slice(-8)}`;
    
    const toEmail = 'simtreeapp@gmail.com';
    const emailSubject = `Contact Form #${contactNumber}: ${contactData.subject}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
        <div style="background-color: #168775; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 24px;">Contact Form #${contactNumber}</h2>
          <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">New Contact Form Submission</p>
        </div>
        
        <div style="padding: 20px; background-color: white; border-radius: 0 0 8px 8px;">
          <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #168775; border-radius: 4px;">
            <h3 style="margin: 0 0 10px 0; color: #168775;">Contact Information</h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${contactData.name}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${contactData.email}</p>
            <p style="margin: 5px 0;"><strong>Company:</strong> ${contactData.companyName}</p>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h3 style="color: #333; margin-bottom: 10px;">Subject</h3>
            <p style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; margin: 0;">${contactData.subject}</p>
          </div>
          
          <div>
            <h3 style="color: #333; margin-bottom: 10px;">Message</h3>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; white-space: pre-wrap; line-height: 1.6;">${contactData.message}</div>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background-color: #e8f4fd; border-radius: 4px; font-size: 12px; color: #666;">
            <p style="margin: 0;"><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
            <p style="margin: 5px 0 0 0;"><strong>Reply to:</strong> ${contactData.email}</p>
          </div>
        </div>
      </div>
    `;
    
    const plainText = `
Contact Form #${contactNumber}

Name: ${contactData.name}
Email: ${contactData.email}
Company: ${contactData.companyName}
Subject: ${contactData.subject}

Message:
${contactData.message}

Submitted: ${new Date().toLocaleString()}
Reply to: ${contactData.email}
    `;

    const msg: any = {
      to: toEmail,
      from: fromEmail,
      subject: emailSubject,
      text: plainText,
      html: htmlContent,
      attachments: []
    };

    // Add logo attachment if available
    const logoAttachment = getLogoAttachment();
    if (logoAttachment) {
      msg.attachments.push(logoAttachment);
    }

    if (!apiKey) {
      console.log('SendGrid API key not set. Skipping email sending.');
      console.log('Would have sent contact form email to:', toEmail);
      return true;
    }

    try {
      console.log('Sending contact form email from:', msg.from, 'to:', msg.to, 'subject:', msg.subject);
      await sgMail.send(msg);
      console.log('Contact form email sent successfully');
      return true;
    } catch (sgError) {
      console.error('SendGrid API Error sending contact form email:', sgError);
      throw sgError;
    }
  } catch (error) {
    console.error('Error sending contact form email:', error);
    return false;
  }
};

/**
 * Send a feedback form email
 * @param feedbackData Feedback form data
 */
export const sendFeedbackFormEmail = async (feedbackData: {
  name: string;
  email: string;
  companyName: string;
  subject: string;
  message: string;
  feedbackNumber?: string;
}): Promise<boolean> => {
  try {
    // Use provided feedback number or generate one
    const feedbackNumber = feedbackData.feedbackNumber || `FB-${Date.now().toString().slice(-8)}`;
    
    const toEmail = 'simtreeapp@gmail.com';
    const emailSubject = `Feedback #${feedbackNumber}: ${feedbackData.subject}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
        <div style="background-color: #168775; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 24px;">Feedback #${feedbackNumber}</h2>
          <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">New Feedback Submission</p>
        </div>
        
        <div style="padding: 20px; background-color: white; border-radius: 0 0 8px 8px;">
          <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #168775; border-radius: 4px;">
            <h3 style="margin: 0 0 10px 0; color: #168775;">Customer Information</h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${feedbackData.name}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${feedbackData.email}</p>
            <p style="margin: 5px 0;"><strong>Company:</strong> ${feedbackData.companyName}</p>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h3 style="color: #333; margin-bottom: 10px;">Feedback Topic</h3>
            <p style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; margin: 0;">${feedbackData.subject}</p>
          </div>
          
          <div>
            <h3 style="color: #333; margin-bottom: 10px;">Feedback Details</h3>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; white-space: pre-wrap; line-height: 1.6;">${feedbackData.message}</div>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background-color: #e8f4fd; border-radius: 4px; font-size: 12px; color: #666;">
            <p style="margin: 0;"><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
            <p style="margin: 5px 0 0 0;"><strong>Reply to:</strong> ${feedbackData.email}</p>
          </div>
        </div>
      </div>
    `;
    
    const plainText = `
Feedback #${feedbackNumber}

Name: ${feedbackData.name}
Email: ${feedbackData.email}
Company: ${feedbackData.companyName}
Subject: ${feedbackData.subject}

Message:
${feedbackData.message}

Submitted: ${new Date().toLocaleString()}
Reply to: ${feedbackData.email}
    `;

    const msg: any = {
      to: toEmail,
      from: fromEmail,
      subject: emailSubject,
      text: plainText,
      html: htmlContent,
      attachments: []
    };

    // Add logo attachment if available
    const logoAttachment = getLogoAttachment();
    if (logoAttachment) {
      msg.attachments.push(logoAttachment);
    }

    if (!apiKey) {
      console.log('SendGrid API key not set. Skipping email sending.');
      console.log('Would have sent feedback form email to:', toEmail);
      return true;
    }

    try {
      console.log('Sending feedback form email from:', msg.from, 'to:', msg.to, 'subject:', msg.subject);
      await sgMail.send(msg);
      console.log('Feedback form email sent successfully');
      return true;
    } catch (sgError) {
      console.error('SendGrid API Error sending feedback form email:', sgError);
      throw sgError;
    }
  } catch (error) {
    console.error('Error sending feedback form email:', error);
    return false;
  }
};