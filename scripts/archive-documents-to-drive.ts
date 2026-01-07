import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from '../shared/schema';
import { eq } from 'drizzle-orm';
import { Readable } from 'stream';
import { driveService } from '../server/services/drive.service';
import path from 'path';
import { promises as fs } from 'fs';
import handlebars from 'handlebars';
import puppeteer from 'puppeteer';

// Use production database for archiving
const PROD_DATABASE_URL = process.env.PROD_DATABASE_URL;
if (!PROD_DATABASE_URL) {
  console.error('ERROR: PROD_DATABASE_URL environment variable is required');
  console.error('Set it to your production database connection string');
  process.exit(1);
}

console.log('[Archive] Connecting to PRODUCTION database...');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: PROD_DATABASE_URL });
const db = drizzle(pool, { schema });

const RECEIPTS_FOLDER_ID = process.env.RECEIPTS_DRIVE_FOLDER_ID;
const INVOICES_FOLDER_ID = process.env.INVOICES_DRIVE_FOLDER_ID;
const CREDIT_NOTES_FOLDER_ID = process.env.CREDIT_NOTES_DRIVE_FOLDER_ID;

const TEMPLATE_DIR = path.join(process.cwd(), 'server/templates/emails');
const LOGO_PATH = path.join(process.cwd(), 'public/images/logoST.png');

async function compileTemplate(templateName: string, data: any): Promise<string> {
  const templatePath = path.join(TEMPLATE_DIR, `${templateName}.handlebars`);
  const templateContent = await fs.readFile(templatePath, 'utf-8');
  const template = handlebars.compile(templateContent);
  return template(data);
}

async function findChromiumPath(): Promise<string | undefined> {
  const { execSync } = await import('child_process');
  const fsModule = await import('fs');
  
  const paths = [
    '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-130.0.6723.116/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ];
  
  // Try 'which chromium' first
  try {
    const chromiumPath = execSync('which chromium', { encoding: 'utf8' }).trim();
    if (chromiumPath && fsModule.existsSync(chromiumPath)) {
      console.log(`[PDF] Found Chromium at: ${chromiumPath}`);
      return chromiumPath;
    }
  } catch (e) {}
  
  // Check known paths
  for (const p of paths) {
    if (fsModule.existsSync(p)) {
      console.log(`[PDF] Found Chromium at: ${p}`);
      return p;
    }
  }
  
  return undefined;
}

async function convertHtmlToPdf(html: string): Promise<Buffer> {
  const executablePath = await findChromiumPath();
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

async function embedLogoInHtml(html: string): Promise<string> {
  try {
    const logoBuffer = await fs.readFile(LOGO_PATH);
    const logoBase64 = logoBuffer.toString('base64');
    const logoDataUrl = `data:image/png;base64,${logoBase64}`;
    return html.replace('src="cid:logoST"', `src="${logoDataUrl}"`);
  } catch (error) {
    console.error('[Archive] Failed to embed logo:', error);
    return html;
  }
}

async function uploadToDrive(pdfBuffer: Buffer, fileName: string, folderId: string): Promise<string | null> {
  try {
    const readableStream = new Readable();
    readableStream.push(pdfBuffer);
    readableStream.push(null);

    const result = await driveService.uploadFile({
      name: fileName,
      mimeType: 'application/pdf',
      readableStream,
      folderId
    });

    return result.fileId;
  } catch (error) {
    console.error(`[Archive] Failed to upload ${fileName}:`, error);
    return null;
  }
}

async function archiveReceipts() {
  if (!RECEIPTS_FOLDER_ID) {
    console.log('[Archive] RECEIPTS_DRIVE_FOLDER_ID not set, skipping receipts');
    return;
  }

  console.log('\n========== ARCHIVING RECEIPTS ==========');
  
  const receipts = await db.select({
    receipt: schema.receipts,
    company: schema.companies
  })
  .from(schema.receipts)
  .leftJoin(schema.companies, eq(schema.receipts.companyId, schema.companies.id));

  console.log(`[Archive] Found ${receipts.length} receipts to archive`);

  let success = 0, failed = 0;

  for (const { receipt, company } of receipts) {
    try {
      const templateData = {
        receiptNumber: receipt.receiptNumber,
        companyName: company?.name || 'Unknown',
        amount: parseFloat(receipt.amount).toFixed(2),
        paymentMethod: receipt.paymentMethod || 'N/A',
        paymentDate: new Date(receipt.createdAt!).toLocaleDateString(),
        description: receipt.description || 'Account Credit',
        currency: 'USD',
        year: new Date().getFullYear()
      };

      let html = await compileTemplate('receipt', templateData);
      html = await embedLogoInHtml(html);
      const pdfBuffer = await convertHtmlToPdf(html);

      const sanitizedCompanyName = (company?.name || 'Unknown').replace(/[^a-zA-Z0-9-_ ]/g, '');
      const parts = receipt.receiptNumber.split('-');
      const prefix = parts[0];
      // Get date from receipt createdAt instead of receipt number
      const receiptDate = new Date(receipt.createdAt!);
      const dateStr = `${receiptDate.getFullYear()}${String(receiptDate.getMonth() + 1).padStart(2, '0')}${String(receiptDate.getDate()).padStart(2, '0')}`;
      // Get sequence from receipt number (last part after prefix)
      const sequence = parts[parts.length - 1];
      const fileName = `${prefix}-${sanitizedCompanyName}-${dateStr}-${sequence}.pdf`;

      const fileId = await uploadToDrive(pdfBuffer, fileName, RECEIPTS_FOLDER_ID);
      if (fileId) {
        await db.update(schema.receipts)
          .set({ driveFileId: fileId })
          .where(eq(schema.receipts.id, receipt.id));
        console.log(`[Archive] ✓ Receipt ${receipt.receiptNumber} -> ${fileName}`);
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`[Archive] ✗ Receipt ${receipt.receiptNumber}:`, error);
      failed++;
    }
  }

  console.log(`[Archive] Receipts: ${success} success, ${failed} failed`);
}

async function migrateBillNumbers() {
  console.log('\n========== MIGRATING BILL NUMBERS ==========');
  
  const bills = await db.select().from(schema.bills).orderBy(schema.bills.id);
  let migrated = 0;
  let skipped = 0;

  // First, find all existing bill numbers to avoid conflicts
  const existingNumbers = new Set(bills.map(b => b.billNumber));

  for (const bill of bills) {
    // Check if bill number has old format (BILL-YYYYMMDD-XXXX)
    const oldFormatMatch = bill.billNumber.match(/^BILL-\d{8}-(\d+)$/);
    if (oldFormatMatch) {
      // Use the bill's database ID for a guaranteed unique number
      const newBillNumber = `BILL-${String(bill.id).padStart(4, '0')}`;
      
      // Check if this new number already exists
      if (existingNumbers.has(newBillNumber)) {
        console.log(`[Migrate] Skipping ${bill.billNumber} - ${newBillNumber} already exists`);
        skipped++;
        continue;
      }
      
      await db.update(schema.bills)
        .set({ billNumber: newBillNumber })
        .where(eq(schema.bills.id, bill.id));
      
      existingNumbers.add(newBillNumber);
      console.log(`[Migrate] ${bill.billNumber} -> ${newBillNumber}`);
      migrated++;
    } else {
      console.log(`[Migrate] Skipping ${bill.billNumber} - already in new format`);
      skipped++;
    }
  }

  console.log(`[Migrate] Migrated ${migrated} bill numbers, skipped ${skipped}`);
}

async function archiveInvoices() {
  if (!INVOICES_FOLDER_ID) {
    console.log('[Archive] INVOICES_DRIVE_FOLDER_ID not set, skipping invoices');
    return;
  }

  console.log('\n========== ARCHIVING INVOICES ==========');
  
  const bills = await db.select({
    bill: schema.bills,
    company: schema.companies
  })
  .from(schema.bills)
  .leftJoin(schema.companies, eq(schema.bills.companyId, schema.companies.id));

  console.log(`[Archive] Found ${bills.length} invoices to archive`);

  let success = 0, failed = 0;

  for (const { bill, company } of bills) {
    try {
      const billItems = await db.select()
        .from(schema.billItems)
        .where(eq(schema.billItems.billId, bill.id));

      // Filter out any legacy VAT line items
      const esimItems = billItems.filter(item => 
        !item.planName?.includes('VAT (5%)') && 
        !item.customDescription?.includes('5% VAT')
      );
      
      // Determine VAT based on company country (5% VAT for UAE companies)
      const isUAECompany = company?.country === 'UAE' || company?.country === 'United Arab Emirates';
      const vatRate = 0.05;
      
      const subtotal = esimItems.reduce((sum, item) => sum + parseFloat(item.totalAmount), 0);
      const vatTotal = isUAECompany ? subtotal * vatRate : 0;
      const grandTotal = subtotal + vatTotal;

      const formattedItems = esimItems.map((item) => {
        const itemTotal = parseFloat(item.totalAmount);
        const itemVat = isUAECompany ? itemTotal * vatRate : 0;
        
        return {
          planName: item.planName || item.customDescription || 'Unknown Plan',
          planDescription: item.planDescription || '',
          dataAmount: item.dataAmount ? `${parseFloat(item.dataAmount).toFixed(1)} GB` : '',
          validity: item.validity ? `${item.validity} days` : '',
          quantity: item.quantity,
          unitPrice: parseFloat(item.unitPrice).toFixed(2),
          totalAmount: itemTotal.toFixed(2),
          vatAmount: itemVat.toFixed(2),
          vatPercentage: isUAECompany ? '5%' : '0%'
        };
      });

      const billingDate = new Date(bill.billingDate);
      const dueDate = new Date(billingDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Build full address with country
      const fullAddress = company?.address 
        ? (company?.country ? `${company.address}, ${company.country}` : company.address)
        : '[Client Business Address]';
      
      const invoiceTemplateData = {
        billNumber: bill.billNumber,
        companyName: company?.name || 'Unknown',
        companyAddress: fullAddress,
        companyTrn: company?.taxNumber || 'Not provided',
        billingDate: billingDate.toLocaleDateString(),
        dueDate: dueDate.toLocaleDateString(),
        subtotalAmount: subtotal.toFixed(2),
        vatAmount: vatTotal.toFixed(2),
        totalAmount: grandTotal.toFixed(2),
        currency: bill.currency || 'USD',
        items: formattedItems,
        itemCount: formattedItems.length,
        hasVAT: isUAECompany,
        year: new Date().getFullYear()
      };

      let html = await compileTemplate('invoice-template', invoiceTemplateData);
      html = await embedLogoInHtml(html);
      const pdfBuffer = await convertHtmlToPdf(html);

      // Use bill's billingDate for the filename to match the date shown in the PDF
      const sanitizedCompanyName = (company?.name || 'Unknown').replace(/[^a-zA-Z0-9-_ ]/g, '');
      const dateStr = `${billingDate.getFullYear()}${String(billingDate.getMonth() + 1).padStart(2, '0')}${String(billingDate.getDate()).padStart(2, '0')}`;
      
      // Extract sequence from bill number (BILL-0001 -> 0001)
      const sequenceMatch = bill.billNumber.match(/BILL-(\d+)$/);
      const sequence = sequenceMatch ? sequenceMatch[1] : '0001';
      
      const fileName = `BILL-${sanitizedCompanyName}-${dateStr}-${sequence}.pdf`;

      const fileId = await uploadToDrive(pdfBuffer, fileName, INVOICES_FOLDER_ID);
      if (fileId) {
        await db.update(schema.bills)
          .set({ driveFileId: fileId })
          .where(eq(schema.bills.id, bill.id));
        console.log(`[Archive] ✓ Invoice ${bill.billNumber} -> ${fileName}`);
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`[Archive] ✗ Invoice ${bill.billNumber}:`, error);
      failed++;
    }
  }

  console.log(`[Archive] Invoices: ${success} success, ${failed} failed`);
}

async function archiveCreditNotes() {
  if (!CREDIT_NOTES_FOLDER_ID) {
    console.log('[Archive] CREDIT_NOTES_DRIVE_FOLDER_ID not set, skipping credit notes');
    return;
  }

  console.log('\n========== ARCHIVING CREDIT NOTES ==========');
  
  const creditNotes = await db.select({
    creditNote: schema.creditNotes,
    company: schema.companies
  })
  .from(schema.creditNotes)
  .leftJoin(schema.companies, eq(schema.creditNotes.companyId, schema.companies.id));

  console.log(`[Archive] Found ${creditNotes.length} credit notes to archive`);

  let success = 0, failed = 0;

  for (const { creditNote, company } of creditNotes) {
    try {
      const creditNoteItems = await db.select()
        .from(schema.creditNoteItems)
        .where(eq(schema.creditNoteItems.creditNoteId, creditNote.id));

      const formattedItems = creditNoteItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unitPrice).toFixed(2),
        totalAmount: parseFloat(item.totalAmount).toFixed(2)
      }));

      const templateData = {
        creditNoteNumber: creditNote.creditNoteNumber,
        companyName: company?.name || 'Unknown',
        companyAddress: company?.address || '[Client Business Address]',
        issueDate: new Date(creditNote.createdAt!).toLocaleDateString(),
        totalAmount: parseFloat(creditNote.totalAmount).toFixed(2),
        currency: 'USD',
        items: formattedItems,
        reason: creditNote.reason || 'eSIM Cancellation Refund',
        year: new Date().getFullYear()
      };

      let html = await compileTemplate('credit-note-simple', templateData);
      html = await embedLogoInHtml(html);
      const pdfBuffer = await convertHtmlToPdf(html);

      const sanitizedCompanyName = (company?.name || 'Unknown').replace(/[^a-zA-Z0-9-_ ]/g, '');
      const parts = creditNote.creditNoteNumber.split('-');
      const prefix = parts[0];
      const date = parts.length >= 3 ? parts[1] : '';
      const sequence = parts.length >= 3 ? parts[parts.length - 1] : parts[1] || '0001';
      const fileName = `${prefix}-${sanitizedCompanyName}-${date}-${sequence}.pdf`;

      const fileId = await uploadToDrive(pdfBuffer, fileName, CREDIT_NOTES_FOLDER_ID);
      if (fileId) {
        await db.update(schema.creditNotes)
          .set({ driveFileId: fileId })
          .where(eq(schema.creditNotes.id, creditNote.id));
        console.log(`[Archive] ✓ Credit Note ${creditNote.creditNoteNumber} -> ${fileName}`);
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`[Archive] ✗ Credit Note ${creditNote.creditNoteNumber}:`, error);
      failed++;
    }
  }

  console.log(`[Archive] Credit Notes: ${success} success, ${failed} failed`);
}

async function main() {
  console.log('========================================');
  console.log('  DOCUMENT ARCHIVE TO GOOGLE DRIVE');
  console.log('========================================');
  console.log(`Template Directory: ${TEMPLATE_DIR}`);
  console.log(`Receipts Folder: ${RECEIPTS_FOLDER_ID ? 'Configured' : 'NOT SET'}`);
  console.log(`Invoices Folder: ${INVOICES_FOLDER_ID ? 'Configured' : 'NOT SET'}`);
  console.log(`Credit Notes Folder: ${CREDIT_NOTES_FOLDER_ID ? 'Configured' : 'NOT SET'}`);

  try {
    // Step 1: Migrate bill numbers from old format (BILL-YYYYMMDD-XXXX) to new format (BILL-XXXX)
    await migrateBillNumbers();
    
    // Step 2: Archive all documents to Google Drive
    await archiveReceipts();
    await archiveInvoices();
    await archiveCreditNotes();

    console.log('\n========================================');
    console.log('  ARCHIVE COMPLETE');
    console.log('========================================');
  } catch (error) {
    console.error('[Archive] Fatal error:', error);
  } finally {
    process.exit(0);
  }
}

main();
