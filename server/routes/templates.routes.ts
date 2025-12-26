import express from 'express';
import templateService from '../services/template.service';
import * as emailService from '../services/email.service';

const router = express.Router();

// Middleware to ensure only super admins can access template management
// Using the same middleware pattern as defined in routes.ts
const requireSuperAdmin = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  console.log("User in templates requireSuperAdmin middleware:", req.user);
  
  // Check both role and isSuperAdmin flag for maximum compatibility
  if (req.user.role !== 'superadmin' && req.user.isSuperAdmin !== true) {
    return res.status(403).json({ error: "Super admin access required" });
  }
  
  next();
};

// Get all templates
router.get('/', requireSuperAdmin, async (req, res) => {
  try {
    const templates = await templateService.getTemplates();
    res.json({ success: true, templates });
  } catch (error: any) {
    console.error('Error getting templates:', error);
    res.status(500).json({ 
      error: 'Failed to get templates', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get a specific template's content
router.get('/:templateId', requireSuperAdmin, async (req, res) => {
  try {
    let { templateId } = req.params;
    
    // Add .html extension if not present
    if (!templateId.endsWith('.html')) {
      templateId += '.html';
    }
    
    const content = await templateService.getTemplateContent(templateId);
    res.json({ 
      success: true, 
      content,
      templateId
    });
  } catch (error: any) {
    console.error(`Error getting template ${req.params.templateId}:`, error);
    res.status(404).json({ 
      error: 'Template not found', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update a template - support both POST and PUT methods
router.post('/:templateId', requireSuperAdmin, async (req, res) => {
  try {
    console.log("TEMPLATE UPDATE REQUEST RECEIVED");
    console.log("User:", req.user);
    console.log("Auth status:", req.isAuthenticated());
    
    let { templateId } = req.params;
    const { content } = req.body;
    
    // Add .html extension if not present
    if (!templateId.endsWith('.html')) {
      templateId += '.html';
    }
    
    console.log(`Attempting to update template: ${templateId}`);
    
    if (!content) {
      console.log("Error: Content is required");
      return res.status(400).json({ 
        success: false, 
        error: 'Content is required' 
      });
    }
    
    console.log(`Template content length: ${content.length} bytes`);
    console.log("Calling template service to update template...");
    
    await templateService.updateTemplate(templateId, content);
    
    console.log("Template updated successfully!");
    res.json({ 
      success: true, 
      message: 'Template updated successfully'
    });
  } catch (error: any) {
    console.error(`Error updating template ${req.params.templateId}:`, error);
    // Log the full stack trace to get more details
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    
    res.status(500).json({ 
      error: 'Failed to update template', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update a template - PUT method (duplicate of POST for compatibility)
router.put('/:templateId', requireSuperAdmin, async (req, res) => {
  try {
    console.log("TEMPLATE UPDATE REQUEST RECEIVED (PUT)");
    console.log("User:", req.user);
    console.log("Auth status:", req.isAuthenticated());
    
    let { templateId } = req.params;
    const { content } = req.body;
    
    // Add .html extension if not present
    if (!templateId.endsWith('.html')) {
      templateId += '.html';
    }
    
    console.log(`Attempting to update template: ${templateId}`);
    
    if (!content) {
      console.log("Error: Content is required");
      return res.status(400).json({ 
        success: false, 
        error: 'Content is required' 
      });
    }
    
    console.log(`Template content length: ${content.length} bytes`);
    console.log("Calling template service to update template...");
    
    await templateService.updateTemplate(templateId, content);
    
    console.log("Template updated successfully!");
    res.json({ 
      success: true, 
      message: 'Template updated successfully'
    });
  } catch (error: any) {
    console.error(`Error updating template ${req.params.templateId}:`, error);
    // Log the full stack trace to get more details
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    
    res.status(500).json({ 
      error: 'Failed to update template', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Preview a template
router.get('/:templateId/preview', requireSuperAdmin, async (req, res) => {
  try {
    const { templateId } = req.params;
    const htmlContent = await templateService.previewTemplate(templateId);
    
    // Set content type to HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  } catch (error: any) {
    console.error(`Error previewing template ${req.params.templateId}:`, error);
    res.status(500).send(`
      <html>
        <body>
          <h1>Error Previewing Template</h1>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        </body>
      </html>
    `);
  }
});

// Send a test email
router.post('/:templateId/test', requireSuperAdmin, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email address is required' 
      });
    }
    
    // Get the template content
    const content = await templateService.getTemplateContent(templateId);
    
    // Generate a subject based on the template name
    let subject = 'Test Email';
    if (templateId.includes('welcome')) {
      subject = 'Welcome to eSIM Management Platform';
    } else if (templateId.includes('activation')) {
      subject = 'Your eSIM is Ready for Activation';
    } else if (templateId.includes('verification')) {
      subject = 'Verify Your Email Address';
    } else if (templateId.includes('password-reset')) {
      subject = 'Password Reset Request';
    }
    
    // Create sample data for the template
    const templateData: any = {
      name: 'Test User',
      username: 'testuser',
      company: 'Test Company',
      year: new Date().getFullYear(),
      loginUrl: 'https://example.com/login',
      verificationUrl: 'https://example.com/verify?token=sample-token',
      verificationCode: '123456',
      resetUrl: 'https://example.com/reset-password?token=sample-token',
      resetCode: '654321',
      title: 'Test Email',
    };
    
    // Add specific sample data for eSIM activation template
    if (templateId.includes('activation')) {
      templateData.employeeName = 'Test User';
      templateData.planName = 'Global Traveler 5GB';
      templateData.dataAllowance = '5GB';
      templateData.validity = '30';
      templateData.orderId = 'ORD-12345678';
      templateData.qrCodeData = 'LPA:1$rsp.example.com$ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      templateData.activationCode = 'LPA:1$rsp.example.com$ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      templateData.activationInstructionsUrl = 'https://example.com/activation-instructions';
    }
    
    // Compile template with Handlebars to process variables including cid:logoST
    const handlebars = require('handlebars');
    const template = handlebars.compile(content);
    const compiledHtml = template(templateData);
    
    // Send the test email with compiled content
    await emailService.sendEmail(
      email,
      subject,
      compiledHtml,
      compiledHtml.replace(/<[^>]*>/g, '') // Plain text fallback by stripping HTML tags
    );
    
    res.json({ 
      success: true, 
      message: `Test email sent to ${email}` 
    });
  } catch (error: any) {
    console.error(`Error sending test email for template ${req.params.templateId}:`, error);
    res.status(500).json({ 
      error: 'Failed to send test email', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;