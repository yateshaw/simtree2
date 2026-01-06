import sgMail from '@sendgrid/mail';
import { promises as fs } from 'fs';
import handlebars from 'handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { pdfStorageService } from './pdf-storage.service';

// Get current file path and directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SendGrid with API key
if (!process.env.SENDGRID_API_KEY) {
  console.error('SENDGRID_API_KEY is not defined in the environment variables');
} else {
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // SendGrid API key configured
    
    // Check sender email configuration
    if (!process.env.SENDGRID_FROM_EMAIL) {
      console.error('[Email Service] SENDGRID_FROM_EMAIL is not set in environment variables');
    }
  } catch (error) {
    console.error('[Email Service] Failed to initialize SendGrid:', error);
  }
}

// Path to the email templates - use process.cwd() for production compatibility
// In development: /home/runner/workspace/server/templates/emails
// In production: /home/runner/workspace/server/templates/emails (same path works)
const TEMPLATE_DIR = path.join(process.cwd(), 'server/templates/emails');
console.log(`[Email Service] Template directory: ${TEMPLATE_DIR}`);

// Helper to compile a template with handlebars
export async function compileTemplate(templateName: string, data: any): Promise<string> {
  try {
    const templatePath = path.join(TEMPLATE_DIR, `${templateName}.handlebars`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateContent);
    return template(data);
  } catch (error) {
    console.error(`Error compiling template ${templateName}:`, error);
    throw error;
  }
}

// Helper to find Chrome/Chromium executable dynamically
async function findChromiumPath(): Promise<string | undefined> {
  const { execSync } = await import('child_process');
  const fsModule = await import('fs');
  
  // First try to use `which chromium` command
  try {
    const chromiumPath = execSync('which chromium', { encoding: 'utf8' }).trim();
    if (chromiumPath && fsModule.existsSync(chromiumPath)) {
      console.log(`[PDF] Found Chromium via 'which': ${chromiumPath}`);
      return chromiumPath;
    }
  } catch (e) {
    // which chromium failed, try other methods
  }
  
  // Try to use `which chromium-browser` command
  try {
    const chromiumPath = execSync('which chromium-browser', { encoding: 'utf8' }).trim();
    if (chromiumPath && fsModule.existsSync(chromiumPath)) {
      console.log(`[PDF] Found Chromium via 'which chromium-browser': ${chromiumPath}`);
      return chromiumPath;
    }
  } catch (e) {
    // which chromium-browser failed, try other methods
  }
  
  // Check known paths
  const knownPaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/home/runner/.cache/puppeteer/chrome/linux-140.0.7339.80/chrome-linux64/chrome',
    puppeteer.executablePath(),
  ].filter(Boolean);
  
  for (const chromePath of knownPaths) {
    if (chromePath && fsModule.existsSync(chromePath)) {
      console.log(`[PDF] Found Chrome at known path: ${chromePath}`);
      return chromePath;
    }
  }
  
  // Search in Nix store as a fallback
  try {
    const nixPath = execSync('find /nix/store -name "chromium" -type f -executable 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
    if (nixPath && fsModule.existsSync(nixPath)) {
      console.log(`[PDF] Found Chromium in Nix store: ${nixPath}`);
      return nixPath;
    }
  } catch (e) {
    // Nix search failed
  }
  
  return undefined;
}

// Helper to convert HTML to PDF using Puppeteer
export async function convertHtmlToPdf(html: string): Promise<Buffer> {
  let browser = null;
  try {
    console.log('[PDF] Launching Puppeteer browser for PDF generation');
    
    // Find Chrome executable dynamically
    const executablePath = await findChromiumPath();
    
    if (!executablePath) {
      console.log('[PDF] No Chrome path found, letting Puppeteer detect automatically');
    }
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    
    const page = await browser.newPage();
    console.log('[PDF] Setting HTML content for PDF generation');
    
    // Set the HTML content
    await page.setContent(html, { 
      waitUntil: 'networkidle0' 
    });
    
    console.log('[PDF] Generating PDF buffer');
    // Generate PDF
    const pdfUint8Array = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    // Convert Uint8Array to Buffer
    const pdfBuffer = Buffer.from(pdfUint8Array);
    console.log(`[PDF] PDF generated successfully, size: ${pdfBuffer.length} bytes`);
    return pdfBuffer;
  } catch (error) {
    console.error('[PDF] Error generating PDF:', error);
    throw error;
  } finally {
    if (browser) {
      console.log('[PDF] Closing Puppeteer browser');
      await browser.close();
    }
  }
}

// Send a coupon email
export async function sendCouponEmail(
  recipientEmail: string, 
  subject: string, 
  couponCode: string, 
  amount: number,
  expiryDate?: Date,
  description?: string
): Promise<boolean> {
  let msg: any = null; // Declare msg at function level for error handling
  try {
    console.log('===== EMAIL SENDING DETAILS =====');
    console.log(`Recipient: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Coupon Code: ${couponCode}`);
    console.log(`Amount: ${amount.toFixed(2)}`);
    console.log(`Expiry Date: ${expiryDate ? expiryDate.toLocaleDateString() : 'none'}`);
    console.log(`Description: ${description || 'none'}`);
    
    // Check if SendGrid API key is available
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SendGrid API key is not available');
      return false;
    }
    
    // Use verified sender email from environment variable with proper name format
    // This must be verified in SendGrid
    const verifiedSenderEmail = process.env.SENDGRID_FROM_EMAIL ? 
      { name: 'Simtree', email: process.env.SENDGRID_FROM_EMAIL } : 
      { name: 'Simtree', email: 'hey@simtree.co' };
    // Using verified sender email from environment

    // Check if template directory exists
    const templatePath = path.join(TEMPLATE_DIR, 'coupon.handlebars');
    try {
      await fs.access(templatePath);
      console.log(`Template exists at ${templatePath}`);
    } catch (err) {
      console.error(`Template not found at ${templatePath}`);
      return false;
    }

    // Prepare template data
    const templateData = {
      code: couponCode,
      amount: amount.toFixed(2),
      description: description || 'Credit coupon for your wallet',
      expiryDate: expiryDate ? expiryDate.toLocaleDateString() : null,
      year: new Date().getFullYear()
    };
    
    console.log('Template data:', templateData);

    // Compile the HTML email
    const html = await compileTemplate('coupon', templateData);
    console.log('HTML email compiled successfully');

    // Set up email data with proper typing for SendGrid
    msg = {
      to: recipientEmail,
      from: verifiedSenderEmail, // Use the verified sender email
      subject: subject || `Simtree - You've received a $${amount.toFixed(2)} credit coupon!`,
      html,
    };
    
    console.log('Email data prepared:', { 
      to: msg.to, 
      from: msg.from, 
      subject: msg.subject,
      htmlLength: html.length
    });

    // Send the email
    console.log('Sending email via SendGrid...');
    try {
      const [response] = await sgMail.send(msg);
      console.log(`Coupon email sent successfully to ${recipientEmail} with status code: ${response?.statusCode}`);
      return true;
    } catch (sendError) {
      console.error(`Failed to send email to ${recipientEmail}:`, sendError);
      // Re-throw to be caught by the outer catch block
      throw sendError;
    }
  } catch (error: unknown) {
    console.error('Error sending coupon email:', error);
    
    // Define TypeScript types for SendGrid errors
    interface SendGridErrorItem {
      message: string;
      field: string;
      help?: string | null;
    }
    
    interface SendGridErrorResponse {
      response?: {
        body?: {
          errors?: SendGridErrorItem[];
        };
      };
    }
    
    // Handle SendGrid specific errors with proper typing
    const sendGridError = error as SendGridErrorResponse;
    if (sendGridError?.response?.body?.errors) {
      const sendGridErrors = sendGridError.response.body.errors;
      console.error('SendGrid API errors:', JSON.stringify(sendGridErrors, null, 2));
      
      // Check for sender identity verification error
      const senderIdentityError = sendGridErrors.find(err => 
        err.field === 'from' && err.message.includes('verified Sender Identity')
      );
      
      if (senderIdentityError) {
        console.error('\nSENDER IDENTITY ERROR: The sender email address has not been verified in SendGrid.');
        console.error('To fix this, you need to verify your sender domain or email in the SendGrid dashboard.');
        console.error('Visit: https://sendgrid.com/docs/for-developers/sending-email/sender-identity/');
        console.error(`The sender email was: ${msg?.from}`);
      }
    }
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return false;
  }
}

// Send receipt email
export async function sendReceiptEmail(
  recipientEmail: string,
  receipt: any,
  company: any,
  transaction?: any
): Promise<boolean> {
  try {
    console.log(`[Email] Sending receipt email to ${recipientEmail} for receipt ${receipt.receiptNumber}`);
    
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SendGrid API key is not available');
      return false;
    }

    const verifiedSenderEmail = process.env.SENDGRID_FROM_EMAIL ? 
      { name: 'Simtree', email: process.env.SENDGRID_FROM_EMAIL } : 
      { name: 'Simtree', email: 'hey@simtree.co' };

    // Prepare template data
    const templateData = {
      receiptNumber: receipt.receiptNumber,
      companyName: company.name,
      amount: parseFloat(receipt.amount).toFixed(2),
      paymentMethod: receipt.paymentMethod || 'N/A',
      description: receipt.description || 'Credit Addition',
      date: new Date(receipt.createdAt).toLocaleDateString(),
      year: new Date().getFullYear(),
      stripePaymentId: receipt.stripePaymentId || 'N/A'
    };

    // Compile the HTML email using receipt template
    console.log(`[Email] Compiling receipt template for ${receipt.receiptNumber}`);
    const html = await compileTemplate('receipt', templateData);
    console.log(`[Email] Receipt template compiled successfully, length: ${html.length}`);

    // Convert receipt HTML to PDF
    console.log(`[Email] Converting receipt HTML to PDF for ${receipt.receiptNumber}`);
    const receiptPdfBuffer = await convertHtmlToPdf(html);
    console.log(`[Email] Receipt PDF generated successfully, size: ${receiptPdfBuffer.length} bytes`);

    // Store receipt PDF to Google Drive (production only)
    try {
      await pdfStorageService.storeReceipt(receiptPdfBuffer, receipt.receiptNumber, company.name);
    } catch (storageError) {
      console.error(`[Email] Failed to store receipt PDF to Drive:`, storageError);
    }

    // Convert PDF to base64 for attachment
    const receiptPdfBase64 = receiptPdfBuffer.toString('base64');
    console.log(`[Email] Receipt PDF converted to base64, length: ${receiptPdfBase64.length}`);

    const msg = {
      to: recipientEmail,
      from: verifiedSenderEmail,
      subject: `Receipt ${receipt.receiptNumber} - Credit Added to Your Account`,
      html,
      attachments: [
        {
          content: receiptPdfBase64,
          filename: `receipt-${receipt.receiptNumber}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };

    console.log(`[Email] Sending receipt email to ${recipientEmail}`);
    const [response] = await sgMail.send(msg);
    console.log(`[Email] Receipt email sent successfully to ${recipientEmail} with status: ${response?.statusCode}`);
    return true;
  } catch (error) {
    console.error('[Email] Error sending receipt email:', error);
    return false;
  }
}

// Generate invoice HTML (exported for viewing bills)
export async function generateInvoiceHTML(
  bill: any,
  company: any,
  billItems: any[],
  embedLogo: boolean = true
): Promise<string> {
  // Separate eSIM items from VAT items
  const esimItems = billItems.filter(item => 
    !item.planName?.includes('VAT (5%)') && 
    !item.customDescription?.includes('5% VAT')
  );
  
  const vatItems = billItems.filter(item => 
    item.planName?.includes('VAT (5%)') || 
    item.customDescription?.includes('5% VAT')
  );
  
  // Calculate totals
  const subtotal = esimItems.reduce((sum, item) => sum + parseFloat(item.totalAmount), 0);
  const vatTotal = vatItems.reduce((sum, item) => sum + parseFloat(item.totalAmount), 0);
  const isUAECompany = vatTotal > 0;
  
  console.log(`[Email] Invoice VAT calculation:`, {
    esimItems: esimItems.length,
    vatItems: vatItems.length,
    subtotal: subtotal.toFixed(2),
    vatTotal: vatTotal.toFixed(2),
    isUAECompany
  });
  
  // Format bill items for template (show all items)
  const formattedItems = billItems.map(item => ({
    planName: item.planName,
    planDescription: item.planDescription || '',
    customDescription: item.customDescription || '',
    countries: Array.isArray(item.countries) ? item.countries.join(', ') : '',
    dataAmount: item.dataAmount ? parseFloat(item.dataAmount).toFixed(1) + ' GB' : '',
    validity: item.validity ? item.validity + ' days' : '',
    quantity: item.quantity,
    unitPrice: parseFloat(item.unitPrice).toFixed(2),
    totalAmount: parseFloat(item.totalAmount).toFixed(2),
    isVATItem: item.planName?.includes('VAT (5%)') || item.customDescription?.includes('5% VAT')
  }));

  // Calculate due date (30 days from billing date)
  const billingDate = new Date(bill.billingDate);
  const dueDate = new Date(billingDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Prepare template data for invoice with VAT breakdown
  const invoiceTemplateData = {
    billNumber: bill.billNumber,
    companyName: company.name,
    companyAddress: company.address || '[Client Business Address]',
    companyTrn: company.taxNumber || '[Tax Registration Number]',
    billingDate: billingDate.toLocaleDateString(),
    dueDate: dueDate.toLocaleDateString(),
    subtotalAmount: subtotal.toFixed(2),
    vatAmount: vatTotal.toFixed(2),
    totalAmount: parseFloat(bill.totalAmount).toFixed(2),
    currency: bill.currency || 'USD',
    items: formattedItems,
    itemCount: billItems.length,
    hasVAT: isUAECompany,
    year: new Date().getFullYear()
  };

  // Compile the professional invoice HTML
  let html = await compileTemplate('invoice-template', invoiceTemplateData);
  
  // If embedLogo is true, replace cid:logoST with base64 data URL for PDF viewing
  if (embedLogo) {
    try {
      const logoPath = path.join(process.cwd(), 'public/images/logoST.png');
      console.log(`[Email] Looking for logo at: ${logoPath}`);
      const logoBuffer = await fs.readFile(logoPath);
      const logoBase64 = logoBuffer.toString('base64');
      const logoDataUrl = `data:image/png;base64,${logoBase64}`;
      html = html.replace('src="cid:logoST"', `src="${logoDataUrl}"`);
      console.log('[Email] Embedded logo as base64 for PDF viewing');
    } catch (logoError) {
      console.error('[Email] Failed to embed logo:', logoError);
    }
  }
  
  return html;
}

// Send bill email
export async function sendBillEmail(
  recipientEmail: string,
  bill: any,
  company: any,
  billItems: any[]
): Promise<boolean> {
  try {
    console.log(`[Email] Starting to send bill email to ${recipientEmail} for bill ${bill.billNumber}`);
    console.log(`[Email] Bill details: ID=${bill.id}, Amount=${bill.totalAmount}, Date=${bill.billingDate}`);
    console.log(`[Email] Company details: Name=${company.name}, ID=${company.id}`);
    console.log(`[Email] Bill items count: ${billItems.length}`);
    
    if (!process.env.SENDGRID_API_KEY) {
      console.error('[Email] SendGrid API key is not available');
      return false;
    }

    const verifiedSenderEmail = process.env.SENDGRID_FROM_EMAIL ? 
      { name: 'Simtree', email: process.env.SENDGRID_FROM_EMAIL } : 
      { name: 'Simtree', email: 'hey@simtree.co' };

    console.log(`[Email] Using sender email: ${JSON.stringify(verifiedSenderEmail)}`);

    // Prepare template data for simple email
    const emailTemplateData = {
      billNumber: bill.billNumber,
      companyName: company.name,
      year: new Date().getFullYear()
    };

    console.log(`[Email] Email template data:`, emailTemplateData);

    // Compile the simple email HTML
    console.log(`[Email] Compiling bill-simple template`);
    const emailHtml = await compileTemplate('bill-simple', emailTemplateData);
    console.log(`[Email] Bill-simple template compiled successfully, length: ${emailHtml.length}`);
    
    // Generate the professional invoice HTML using the exported function
    console.log(`[Email] Generating invoice HTML`);
    const invoiceHtml = await generateInvoiceHTML(bill, company, billItems);
    console.log(`[Email] Invoice HTML generated successfully, length: ${invoiceHtml.length}`);

    // Convert invoice HTML to PDF
    console.log(`[Email] Converting invoice HTML to PDF`);
    const invoicePdfBuffer = await convertHtmlToPdf(invoiceHtml);
    console.log(`[Email] Invoice PDF generated successfully, size: ${invoicePdfBuffer.length} bytes`);

    // Store invoice PDF to Google Drive (production only)
    try {
      await pdfStorageService.storeInvoice(invoicePdfBuffer, bill.billNumber, company.name);
    } catch (storageError) {
      console.error(`[Email] Failed to store invoice PDF to Drive:`, storageError);
    }

    // Convert PDF to base64 for attachment
    const invoicePdfBase64 = invoicePdfBuffer.toString('base64');
    console.log(`[Email] Invoice PDF converted to base64, length: ${invoicePdfBase64.length}`);

    const msg = {
      to: recipientEmail,
      from: verifiedSenderEmail,
      subject: `Your invoice is ready - ${bill.billNumber}`,
      html: emailHtml,
      attachments: [
        {
          content: invoicePdfBase64,
          filename: `invoice-${bill.billNumber}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };

    console.log(`[Email] Sending email via SendGrid to ${recipientEmail}`);
    const [response] = await sgMail.send(msg);
    console.log(`[Email] SendGrid response status: ${response?.statusCode}`);
    console.log(`[Email] SendGrid response headers:`, response?.headers);
    console.log(`[Email] Bill email sent successfully to ${recipientEmail} for bill ${bill.billNumber}`);
    return true;
  } catch (error) {
    console.error(`[Email] Error sending bill email to ${recipientEmail} for bill ${bill.billNumber}:`, error);
    if (error instanceof Error) {
      console.error(`[Email] Error message: ${error.message}`);
      console.error(`[Email] Error stack: ${error.stack}`);
    }
    if (error && typeof error === 'object' && 'response' in error) {
      console.error(`[Email] SendGrid error response:`, (error as any).response?.body);
    }
    return false;
  }
}

// Generate credit note HTML for PDF attachment
async function generateCreditNoteHTML(
  creditNote: any,
  company: any,
  creditNoteItems: any[]
): Promise<string> {
  const isUAECompany = company?.country === 'UAE' || company?.country === 'United Arab Emirates';
  
  const formattedItems = creditNoteItems.map(item => ({
    planName: item.planName,
    planDescription: item.planDescription || '',
    quantity: item.quantity,
    unitPrice: parseFloat(item.unitPrice).toFixed(2),
    totalAmount: parseFloat(item.totalAmount).toFixed(2)
  }));

  const creditDate = new Date(creditNote.creditDate);

  const templateData = {
    creditNoteNumber: creditNote.creditNoteNumber,
    companyName: company.name,
    companyAddress: company.address || '[Client Business Address]',
    companyTrn: company.taxNumber || '[Tax Registration Number]',
    creditDate: creditDate.toLocaleDateString(),
    reason: creditNote.reason || 'eSIM cancellation refund',
    originalBillNumber: creditNote.originalBillId ? `Related to Bill ID: ${creditNote.originalBillId}` : null,
    totalAmount: parseFloat(creditNote.totalAmount).toFixed(2),
    currency: creditNote.currency || 'USD',
    items: formattedItems,
    itemCount: creditNoteItems.length,
    hasVAT: isUAECompany,
    year: new Date().getFullYear()
  };

  return await compileTemplate('credit-note', templateData);
}

// Send credit note email
export async function sendCreditNoteEmail(
  recipientEmail: string,
  creditNote: any,
  company: any,
  creditNoteItems: any[]
): Promise<boolean> {
  try {
    console.log(`[Email] Starting to send credit note email to ${recipientEmail} for credit note ${creditNote.creditNoteNumber}`);
    
    if (!process.env.SENDGRID_API_KEY) {
      console.error('[Email] SendGrid API key is not available');
      return false;
    }

    const verifiedSenderEmail = process.env.SENDGRID_FROM_EMAIL ? 
      { name: 'Simtree', email: process.env.SENDGRID_FROM_EMAIL } : 
      { name: 'Simtree', email: 'hey@simtree.co' };

    const emailTemplateData = {
      creditNoteNumber: creditNote.creditNoteNumber,
      companyName: company.name,
      year: new Date().getFullYear()
    };

    const emailHtml = await compileTemplate('credit-note-simple', emailTemplateData);
    
    const creditNoteHtml = await generateCreditNoteHTML(creditNote, company, creditNoteItems);

    const creditNotePdfBuffer = await convertHtmlToPdf(creditNoteHtml);

    // Store credit note PDF to Google Drive (production only)
    try {
      await pdfStorageService.storeCreditNote(creditNotePdfBuffer, creditNote.creditNoteNumber, company.name);
    } catch (storageError) {
      console.error(`[Email] Failed to store credit note PDF to Drive:`, storageError);
    }

    const creditNotePdfBase64 = creditNotePdfBuffer.toString('base64');

    const msg = {
      to: recipientEmail,
      from: verifiedSenderEmail,
      subject: `Credit Note Issued - ${creditNote.creditNoteNumber}`,
      html: emailHtml,
      attachments: [
        {
          content: creditNotePdfBase64,
          filename: `credit-note-${creditNote.creditNoteNumber}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };

    console.log(`[Email] Sending credit note email via SendGrid to ${recipientEmail}`);
    const [response] = await sgMail.send(msg);
    console.log(`[Email] Credit note email sent successfully to ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error(`[Email] Error sending credit note email to ${recipientEmail}:`, error);
    if (error instanceof Error) {
      console.error(`[Email] Error message: ${error.message}`);
    }
    return false;
  }
}

// Send daily eSIM purchase summary email
export async function sendDailyEsimSummaryEmail(
  recipientEmail: string,
  company: any,
  purchases: any[],
  summaryDate: Date
): Promise<boolean> {
  try {
    console.log(`[Email] Sending daily eSIM purchase summary to ${recipientEmail} for company ${company.name}`);
    
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SendGrid API key is not available');
      return false;
    }

    const verifiedSenderEmail = process.env.SENDGRID_FROM_EMAIL ? 
      { name: 'Simtree', email: process.env.SENDGRID_FROM_EMAIL } : 
      { name: 'Simtree', email: 'hey@simtree.co' };

    // Calculate summary data
    const totalPurchases = purchases.length;
    const totalAmount = purchases.reduce((sum, purchase) => sum + parseFloat(purchase.sellingPrice || '0'), 0);
    
    // Format purchases for email
    const formattedPurchases = purchases.map((purchase, index) => ({
      number: index + 1,
      employeeName: purchase.employeeName,
      planName: purchase.planName,
      countries: Array.isArray(purchase.countries) ? purchase.countries.join(', ') : (purchase.countries || 'N/A'),
      dataAmount: purchase.dataAmount ? `${purchase.dataAmount} GB` : 'N/A',
      validity: purchase.validity ? `${purchase.validity} days` : 'N/A',
      price: parseFloat(purchase.sellingPrice || '0').toFixed(2),
      purchaseTime: new Date(purchase.purchaseDate).toLocaleTimeString(),
      status: purchase.status || 'Pending'
    }));

    // Prepare template data
    const templateData = {
      companyName: company.name,
      summaryDate: summaryDate.toLocaleDateString(),
      totalPurchases,
      totalAmount: totalAmount.toFixed(2),
      purchases: formattedPurchases,
      year: new Date().getFullYear()
    };

    // Create HTML content for daily summary
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily eSIM Purchase Summary</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .summary-stats { background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .purchase-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .purchase-table th, .purchase-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    .purchase-table th { background-color: #f5f5f5; font-weight: bold; }
    .purchase-table tr:nth-child(even) { background-color: #f9f9f9; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
    .price { font-weight: bold; color: #2e7d32; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Daily eSIM Purchase Summary</h2>
      <p><strong>Company:</strong> ${templateData.companyName}</p>
      <p><strong>Date:</strong> ${templateData.summaryDate}</p>
    </div>

    <div class="summary-stats">
      <h3>Summary</h3>
      <p><strong>Total eSIM Purchases:</strong> ${templateData.totalPurchases}</p>
      <p><strong>Total Amount:</strong> $${templateData.totalAmount}</p>
    </div>

    <h3>Purchase Details</h3>
    <table class="purchase-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Employee</th>
          <th>Plan</th>
          <th>Countries</th>
          <th>Data</th>
          <th>Validity</th>
          <th>Price</th>
          <th>Time</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${templateData.purchases.map(purchase => `
        <tr>
          <td>${purchase.number}</td>
          <td>${purchase.employeeName}</td>
          <td>${purchase.planName}</td>
          <td>${purchase.countries}</td>
          <td>${purchase.dataAmount}</td>
          <td>${purchase.validity}</td>
          <td class="price">$${purchase.price}</td>
          <td>${purchase.purchaseTime}</td>
          <td>${purchase.status}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="footer">
      <p>This is an automated summary of eSIM purchases made on ${templateData.summaryDate}.</p>
      <p>For questions or support, please contact our team.</p>
      <p>&copy; ${templateData.year} Simtree. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    const msg = {
      to: recipientEmail,
      from: verifiedSenderEmail,
      subject: `Daily eSIM Purchase Summary - ${company.name} (${summaryDate.toLocaleDateString()})`,
      html,
    };

    const [response] = await sgMail.send(msg);
    console.log(`[Email] Daily eSIM summary email sent successfully to ${recipientEmail} with status: ${response?.statusCode}`);
    return true;
  } catch (error) {
    console.error('[Email] Error sending daily eSIM summary email:', error);
    return false;
  }
}

// Test if email service is working
export async function testEmailService(): Promise<boolean> {
  try {
    // Just check if SendGrid API key is available
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SendGrid API key is not available');
      return false;
    }
    
    // Additional check for template directory
    try {
      await fs.access(TEMPLATE_DIR);
      console.log(`Template directory exists at ${TEMPLATE_DIR}`);
    } catch (error) {
      console.error(`Template directory not found at ${TEMPLATE_DIR}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error testing email service:', error);
    return false;
  }
}