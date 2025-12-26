import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import { promisify } from 'util';

// Convert fs operations to Promise-based
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);
const mkdirAsync = promisify(fs.mkdir);

// Path to email templates
const TEMPLATES_DIR = path.join(process.cwd(), 'server', 'templates', 'emails');

// Ensure the templates directory exists
async function ensureTemplateDir() {
  try {
    await statAsync(TEMPLATES_DIR);
    console.log(`Template directory exists at ${TEMPLATES_DIR}`);
  } catch (err) {
    console.log(`Creating template directory at ${TEMPLATES_DIR}`);
    // Create the directory structure if it doesn't exist
    await mkdirAsync(TEMPLATES_DIR, { recursive: true });
    
    // Create a default template
    const defaultTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{{title}}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #773df8; color: white; padding: 10px 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{title}}</h1>
    </div>
    <div class="content">
      <p>Hello {{name}},</p>
      <p>This is a test email template.</p>
      <p>Thank you for using our service!</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} eSIM Management Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
    
    await writeFileAsync(path.join(TEMPLATES_DIR, 'test.html'), defaultTemplate);
  }
}

// Initialize default templates if they don't exist
async function initializeDefaultTemplates() {
  await ensureTemplateDir();
  
  const templates = {
    'welcome.html': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to eSIM Management Platform</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #773df8; color: white; padding: 10px 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .button { display: inline-block; padding: 10px 20px; background-color: #773df8; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to eSIM Management Platform</h1>
    </div>
    <div class="content">
      <p>Hello {{name}},</p>
      <p>Welcome to the eSIM Management Platform! Your account has been created successfully.</p>
      <p>Here are your account details:</p>
      <ul>
        <li>Username: {{username}}</li>
        <li>Company: {{company}}</li>
      </ul>
      <p>You can now login to your account and start managing your eSIMs.</p>
      <a href="{{loginUrl}}" class="button">Login to Your Account</a>
      <p>If you have any questions, please don't hesitate to contact our support team.</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} eSIM Management Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `,
    
    'activation.html': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>eSIM Activation Information</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #773df8; color: white; padding: 10px 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .qr-code { text-align: center; margin: 20px 0; }
    .qr-code img { max-width: 200px; }
    .details { background-color: #eee; padding: 15px; border-radius: 4px; margin: 20px 0; }
    .button { display: inline-block; padding: 10px 20px; background-color: #773df8; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your eSIM is Ready for Activation</h1>
    </div>
    <div class="content">
      <p>Hello {{name}},</p>
      <p>Your eSIM has been provisioned and is ready for activation. Here are your eSIM details:</p>
      
      <div class="details">
        <p><strong>Plan:</strong> {{planName}}</p>
        <p><strong>Data:</strong> {{dataAllowance}}</p>
        <p><strong>Validity:</strong> {{validity}} days</p>
        <p><strong>Order ID:</strong> {{orderId}}</p>
      </div>
      
      <p>Scan the QR code below with your phone to activate your eSIM:</p>
      
      <div class="qr-code">
        <img src="{{qrCodeUrl}}" alt="eSIM Activation QR Code">
      </div>
      
      <p>You can also use the activation code below:</p>
      <p style="text-align: center; font-family: monospace; font-size: 14px; background-color: #eee; padding: 10px; border-radius: 4px;">{{activationCode}}</p>
      
      <p>For detailed activation instructions, please visit:</p>
      <a href="{{activationInstructionsUrl}}" class="button">View Activation Instructions</a>
      
      <p>If you have any issues with activation, please contact our support team.</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} eSIM Management Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `,
    
    'verification.html': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verify Your Email Address</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #773df8; color: white; padding: 10px 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .button { display: inline-block; padding: 10px 20px; background-color: #773df8; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .verify-code { font-family: monospace; font-size: 24px; letter-spacing: 5px; text-align: center; padding: 15px; background-color: #eee; border-radius: 4px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Verify Your Email Address</h1>
    </div>
    <div class="content">
      <p>Hello {{name}},</p>
      <p>Thank you for registering with the eSIM Management Platform. To complete your registration, please verify your email address by clicking the button below:</p>
      
      <div style="text-align: center;">
        <a href="{{verificationUrl}}" class="button">Verify Email Address</a>
      </div>
      
      <p>Alternatively, you can enter the verification code on our website:</p>
      
      <div class="verify-code">
        {{verificationCode}}
      </div>
      
      <p>This verification link and code will expire in 24 hours.</p>
      
      <p>If you did not create an account with us, please ignore this email.</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} eSIM Management Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `,
    
    'password-reset.html': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password Reset Request</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #773df8; color: white; padding: 10px 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .button { display: inline-block; padding: 10px 20px; background-color: #773df8; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .reset-code { font-family: monospace; font-size: 24px; letter-spacing: 5px; text-align: center; padding: 15px; background-color: #eee; border-radius: 4px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hello {{name}},</p>
      <p>We received a request to reset your password for your eSIM Management Platform account. Please click the button below to reset your password:</p>
      
      <div style="text-align: center;">
        <a href="{{resetUrl}}" class="button">Reset Password</a>
      </div>
      
      <p>Alternatively, you can use the following reset code:</p>
      
      <div class="reset-code">
        {{resetCode}}
      </div>
      
      <p>This reset link and code will expire in 1 hour.</p>
      
      <p>If you did not request a password reset, please ignore this email or contact our support team if you have concerns about your account security.</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} eSIM Management Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `
  };
  
  // Check and create default templates if they don't exist
  for (const [filename, content] of Object.entries(templates)) {
    const templatePath = path.join(TEMPLATES_DIR, filename);
    try {
      await statAsync(templatePath);
    } catch (err) {
      await writeFileAsync(templatePath, content);
    }
  }
}

class TemplateService {
  constructor() {
    // Initialize templates on service creation
    initializeDefaultTemplates().catch(err => {
      console.error('Error initializing templates:', err);
    });
  }
  
  /**
   * Get a list of all available templates
   */
  async getTemplates() {
    await ensureTemplateDir();
    
    const files = await readdirAsync(TEMPLATES_DIR);
    const templates = [];
    
    for (const file of files) {
      if (path.extname(file) === '.html') {
        const filePath = path.join(TEMPLATES_DIR, file);
        const stats = await statAsync(filePath);
        
        // Generate a descriptive name and description based on the filename
        let name = file.replace('.html', '');
        name = name.charAt(0).toUpperCase() + name.slice(1); // Capitalize first letter
        
        let description = '';
        switch (name.toLowerCase()) {
          case 'welcome':
            description = 'Sent to new users when their account is created';
            break;
          case 'activation':
            description = 'Contains eSIM activation details and instructions';
            break;
          case 'verification':
            description = 'Sent to verify a user\'s email address';
            break;
          case 'password-reset':
            description = 'Sent when a user requests a password reset';
            break;
          case 'test':
            description = 'Template for testing email sending';
            break;
          default:
            description = `Email template for ${name.toLowerCase()} emails`;
        }
        
        templates.push({
          id: file,
          name: name.replace(/-/g, ' '),
          description,
          filename: file,
          path: filePath,
          lastModified: stats.mtime.toISOString()
        });
      }
    }
    
    return templates;
  }
  
  /**
   * Get the content of a specific template
   */
  async getTemplateContent(templateId: string) {
    await ensureTemplateDir();
    
    const filePath = path.join(TEMPLATES_DIR, templateId);
    
    try {
      return await readFileAsync(filePath, 'utf8');
    } catch (err) {
      console.error(`Error reading template ${templateId}:`, err);
      throw new Error(`Template not found: ${templateId}`);
    }
  }
  
  /**
   * Update the content of a template
   */
  async updateTemplate(templateId: string, content: string) {
    console.log(`Starting template update for: ${templateId}`);
    console.log(`Content length: ${content.length} bytes`);
    
    try {
      await ensureTemplateDir();
      
      // Extra safety check - make sure the directory exists again before writing
      try {
        const stats = await statAsync(TEMPLATES_DIR);
        console.log(`Template directory exists. Directory permissions:`, stats.mode.toString(8));
      } catch (err: any) {
        console.log(`Re-creating template directory at ${TEMPLATES_DIR} during update:`, err.message);
        await mkdirAsync(TEMPLATES_DIR, { recursive: true });
        
        // Verify creation succeeded
        const dirStats = await statAsync(TEMPLATES_DIR);
        console.log(`Created directory with permissions:`, dirStats.mode.toString(8));
      }
      
      const filePath = path.join(TEMPLATES_DIR, templateId);
      console.log(`Updating template at ${filePath}`);
      
      try {
        // Check if file exists and log permissions
        try {
          const fileStats = await statAsync(filePath);
          console.log(`File exists with permissions:`, fileStats.mode.toString(8));
        } catch (err) {
          console.log(`File does not exist yet, will be created`);
        }
        
        // Validate the template by compiling it with Handlebars
        handlebars.compile(content);
        
        // Create a backup of the existing file if it exists
        let backupSuccessful = false;
        try {
          const existingContent = await readFileAsync(filePath, 'utf8');
          const backupPath = `${filePath}.backup`;
          await writeFileAsync(backupPath, existingContent);
          backupSuccessful = true;
          console.log(`Created backup at ${backupPath}`);
        } catch (err) {
          console.log(`No existing file to backup or backup failed:`, err);
        }
        
        // Write the file using Node's synchronous API to avoid any async issues
        try {
          // First attempt with async API for better performance
          await writeFileAsync(filePath, content);
          console.log(`Successfully wrote file using async API`);
        } catch (writeErr) {
          // Fallback to sync API if async fails
          console.log(`Async write failed, trying sync write:`, writeErr);
          fs.writeFileSync(filePath, content);
          console.log(`Successfully wrote file using sync API`);
        }
        
        // Verify file was written correctly
        try {
          const writtenContent = await readFileAsync(filePath, 'utf8');
          console.log(`Verification: Written content length: ${writtenContent.length} bytes`);
          if (writtenContent !== content) {
            console.warn(`Content verification warning: Written content doesn't match original`);
            
            // Restore from backup if available
            if (backupSuccessful) {
              console.log(`Restoring from backup due to verification failure`);
              const backupContent = await readFileAsync(`${filePath}.backup`, 'utf8');
              await writeFileAsync(filePath, backupContent);
              throw new Error('Content verification failed, restored from backup');
            }
          }
        } catch (verifyErr) {
          console.error(`Verification failed:`, verifyErr);
        }
        
        console.log(`Successfully updated template: ${templateId}`);
        return true;
      } catch (err: any) {
        console.error(`Error in template update process for ${templateId}:`, err);
        throw new Error(`Failed to update template: ${err.message || 'Unknown error'}`);
      }
    } catch (outerErr: any) {
      console.error(`Fatal error in updateTemplate for ${templateId}:`, outerErr);
      throw new Error(`Critical template update failure: ${outerErr.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Preview a template with sample data
   */
  async previewTemplate(templateId: string) {
    await ensureTemplateDir();
    
    let content = await this.getTemplateContent(templateId);
    
    // Replace cid:logoST with actual logo path for web preview
    // Handle both single and double quotes, and potential whitespace
    console.log('Original content contains cid:logoST:', content.includes('cid:logoST'));
    content = content.replace(/src\s*=\s*["']cid:logoST["']/gi, 'src="/images/logoST.png"');
    console.log('After replacement contains cid:logoST:', content.includes('cid:logoST'));
    console.log('After replacement contains /images/logoST.png:', content.includes('/images/logoST.png'));
    
    // Create sample data based on the template type
    const sampleData: any = {
      employeeName: 'John Doe',
      name: 'John Doe',
      username: 'johndoe',
      company: 'Example Corp',
      year: new Date().getFullYear(),
      loginUrl: 'https://example.com/login',
      verificationUrl: 'https://example.com/verify?token=sample-token',
      verificationCode: '123456',
      resetUrl: 'https://example.com/reset-password?token=sample-token',
      resetCode: '654321',
      title: 'Sample Email',
      hasValidQrCode: true,
      qrCodeData: 'https://p.qrsim.net/sample-qr-code.png',
      activationCode: 'LPA:1$rsp.example.com$ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    };
    
    // Add specific sample data for eSIM activation template
    if (templateId.includes('activation')) {
      sampleData.planName = 'Global Traveler 5GB';
      sampleData.dataAllowance = '5GB';
      sampleData.validity = '30';
      sampleData.orderId = 'ORD-12345678';
      sampleData.qrCodeUrl = 'https://p.qrsim.net/sample-qr-code.png';
      sampleData.activationCode = 'LPA:1$rsp.example.com$ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      sampleData.activationInstructionsUrl = 'https://example.com/activation-instructions';
    }
    
    // Compile and render the template with sample data
    const template = handlebars.compile(content);
    return template(sampleData);
  }
}

const templateService = new TemplateService();
export default templateService;

// Export individual methods for easier importing as namespaced functions
export const getTemplates = templateService.getTemplates.bind(templateService);
export const getTemplateContent = templateService.getTemplateContent.bind(templateService);
export const updateTemplate = templateService.updateTemplate.bind(templateService);
export const previewTemplate = templateService.previewTemplate.bind(templateService);