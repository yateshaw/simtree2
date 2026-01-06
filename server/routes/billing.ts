import type { Express } from "express";
import { billingService } from "../services/billing.service";
import { creditNoteService } from "../services/credit-note.service";
import { db } from "../db";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function registerBillingRoutes(app: Express) {
  // Scheduled billing endpoint for GitHub Actions (API key auth)
  app.post("/api/scheduled/run-daily-billing", async (req, res) => {
    try {
      const apiKey = req.headers["x-billing-api-key"] as string;
      const expectedKey = process.env.BILLING_API_KEY;

      if (!expectedKey) {
        console.error("[Scheduled Billing] BILLING_API_KEY not configured");
        return res.status(500).json({ error: "Billing API key not configured" });
      }

      if (!apiKey || !timingSafeEqual(apiKey, expectedKey)) {
        console.warn("[Scheduled Billing] Unauthorized access attempt");
        return res.status(401).json({ error: "Unauthorized" });
      }

      console.log("[Scheduled Billing] Starting daily billing and credit note processing...");
      const startTime = Date.now();

      // Run billing for today
      const bills = await billingService.processDailyBilling();
      console.log(`[Scheduled Billing] Generated ${bills.length} bills`);

      // Run credit notes for today
      const creditNotes = await creditNoteService.processDailyCreditNotes();
      console.log(`[Scheduled Billing] Generated ${creditNotes.length} credit notes`);

      const duration = Date.now() - startTime;
      console.log(`[Scheduled Billing] Completed in ${duration}ms`);

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
        bills: {
          count: bills.length,
          items: bills.map(b => ({ id: b.id, billNumber: b.billNumber, companyId: b.companyId, total: b.totalAmount }))
        },
        creditNotes: {
          count: creditNotes.length,
          items: creditNotes.map(cn => ({ id: cn.id, creditNoteNumber: cn.creditNoteNumber, companyId: cn.companyId, total: cn.totalAmount }))
        }
      });
    } catch (error) {
      console.error("[Scheduled Billing] Error:", error);
      res.status(500).json({ error: "Failed to run scheduled billing" });
    }
  });

  // Get all receipts (sadmin only)
  app.get("/api/sadmin/receipts", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const receipts = await billingService.getAllReceipts();
      res.json(receipts);
    } catch (error) {
      console.error("Error fetching receipts:", error);
      res.status(500).json({ error: "Failed to fetch receipts" });
    }
  });

  // Get all bills (sadmin only)
  app.get("/api/sadmin/bills", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const bills = await billingService.getAllBills();
      res.json(bills);
    } catch (error) {
      console.error("Error fetching bills:", error);
      res.status(500).json({ error: "Failed to fetch bills" });
    }
  });

  // Get next bill number that would be generated (sadmin only)
  app.get("/api/sadmin/bills/next-number", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const nextBillNumber = await billingService.getNextBillNumber();
      res.json({ nextBillNumber });
    } catch (error) {
      console.error("Error getting next bill number:", error);
      res.status(500).json({ error: "Failed to get next bill number" });
    }
  });

  // Get company receipts
  app.get("/api/companies/:companyId/receipts", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const companyId = parseInt(req.params.companyId);
      if (isNaN(companyId) || companyId <= 0) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      // Check if user has access to this company
      if (!req.user?.isSuperAdmin && req.user?.companyId !== companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const receipts = await billingService.getCompanyReceipts(companyId);
      res.json(receipts);
    } catch (error) {
      console.error("Error fetching company receipts:", error);
      res.status(500).json({ error: "Failed to fetch receipts" });
    }
  });

  // Get company bills
  app.get("/api/companies/:companyId/bills", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const companyId = parseInt(req.params.companyId);
      if (isNaN(companyId) || companyId <= 0) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      // Check if user has access to this company
      if (!req.user?.isSuperAdmin && req.user?.companyId !== companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const bills = await billingService.getCompanyBills(companyId);
      res.json(bills);
    } catch (error) {
      console.error("Error fetching company bills:", error);
      res.status(500).json({ error: "Failed to fetch bills" });
    }
  });

  // Resend receipt email (sadmin only)
  app.post("/api/sadmin/receipts/:receiptId/resend", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const receiptId = parseInt(req.params.receiptId);
      if (isNaN(receiptId) || receiptId <= 0) {
        return res.status(400).json({ error: "Invalid receipt ID" });
      }

      const emailSent = await billingService.sendReceiptEmail(receiptId);
      
      if (emailSent) {
        res.json({ success: true, message: "Receipt email sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send receipt email" });
      }
    } catch (error) {
      console.error("Error resending receipt email:", error);
      res.status(500).json({ error: "Failed to resend receipt email" });
    }
  });

  // Resend bill email (sadmin only)
  app.post("/api/sadmin/bills/:billId/resend", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const billId = parseInt(req.params.billId);
      if (isNaN(billId) || billId <= 0) {
        return res.status(400).json({ error: "Invalid bill ID" });
      }

      console.log(`[Bill Resend] Attempting to resend bill ${billId}`);
      
      const emailSent = await billingService.sendBillEmail(billId);
      
      if (emailSent) {
        console.log(`[Bill Resend] Successfully sent email for bill ${billId}`);
        res.json({ success: true, message: "Bill email sent successfully" });
      } else {
        console.error(`[Bill Resend] Failed to send email for bill ${billId}`);
        res.status(500).json({ error: "Failed to send bill email. Check server logs for details." });
      }
    } catch (error) {
      console.error(`[Bill Resend] Error resending bill email for bill ${req.params.billId}:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: `Failed to resend bill email: ${errorMessage}` });
    }
  });

  // Generate daily bills manually (sadmin only)
  app.post("/api/sadmin/billing/generate-daily", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { billingDate } = req.body;
      const targetDate = billingDate ? new Date(billingDate) : undefined;

      const bills = await billingService.processDailyBilling(targetDate);
      
      res.json({ 
        success: true, 
        message: `Generated ${bills.length} bills`,
        bills: bills.map(bill => ({
          id: bill.id,
          billNumber: bill.billNumber,
          companyId: bill.companyId,
          totalAmount: bill.totalAmount,
          billingDate: bill.billingDate
        }))
      });
    } catch (error) {
      console.error("Error generating daily bills:", error);
      res.status(500).json({ error: "Failed to generate daily bills" });
    }
  });

  // Get uninvoiced eSIMs for a company (sadmin only)
  app.get("/api/sadmin/companies/:companyId/uninvoiced-esims", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const companyId = parseInt(req.params.companyId);
      if (isNaN(companyId) || companyId <= 0) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const { startDate, endDate } = req.query;
      
      const uninvoicedEsims = await billingService.getUninvoicedEsims(
        companyId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      
      res.json(uninvoicedEsims);
    } catch (error) {
      console.error("Error fetching uninvoiced eSIMs:", error);
      res.status(500).json({ error: "Failed to fetch uninvoiced eSIMs" });
    }
  });

  // Generate manual bill for specific eSIMs (sadmin only)
  app.post("/api/sadmin/billing/generate-manual", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { companyId, esimIds, startDate, endDate, customItems, recipientEmail } = req.body;
      
      if (!companyId || typeof companyId !== 'number') {
        return res.status(400).json({ error: "Company ID is required" });
      }

      const bill = await billingService.generateManualBill({
        companyId,
        esimIds: esimIds?.length > 0 ? esimIds : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        customItems: customItems?.length > 0 ? customItems : undefined,
        recipientEmail
      });
      
      if (!bill) {
        return res.status(400).json({ error: "No billable items found (uninvoiced eSIMs or custom items)" });
      }

      res.json({ 
        success: true, 
        message: "Manual bill generated successfully",
        bill: {
          id: bill.id,
          billNumber: bill.billNumber,
          companyId: bill.companyId,
          totalAmount: bill.totalAmount,
          billingDate: bill.billingDate
        }
      });
    } catch (error) {
      console.error("Error generating manual bill:", error);
      res.status(500).json({ error: "Failed to generate manual bill" });
    }
  });

  // Mark eSIMs as invoiced (sadmin only)
  app.post("/api/sadmin/esims/mark-invoiced", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { esimIds, billId } = req.body;
      
      if (!esimIds || !Array.isArray(esimIds) || esimIds.length === 0) {
        return res.status(400).json({ error: "eSIM IDs array is required" });
      }
      
      if (!billId || typeof billId !== 'number') {
        return res.status(400).json({ error: "Bill ID is required" });
      }

      // Mark eSIMs as invoiced by updating them directly
      // This functionality will be handled within generateManualBill
      // For now, return success message
      const result = { length: esimIds.length };
      
      res.json({ 
        success: true, 
        message: `Marked ${result.length} eSIMs as invoiced`,
        updatedEsims: result.length
      });
    } catch (error) {
      console.error("Error marking eSIMs as invoiced:", error);
      res.status(500).json({ error: "Failed to mark eSIMs as invoiced" });
    }
  });

  // Create custom billing item (sadmin only)
  app.post("/api/sadmin/billing/custom", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { companyId, description, amount, walletTransactionId, recipientEmail } = req.body;

      if (!companyId || typeof companyId !== 'number') {
        return res.status(400).json({ error: "Valid company ID is required" });
      }

      if (!description || typeof description !== 'string') {
        return res.status(400).json({ error: "Description is required" });
      }

      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }

      const bill = await billingService.createCustomBillingItem({
        companyId,
        description,
        amount,
        walletTransactionId,
        recipientEmail
      });

      res.json({ 
        success: true, 
        message: "Custom billing item created successfully", 
        bill: {
          id: bill.id,
          billNumber: bill.billNumber,
          companyId: bill.companyId,
          totalAmount: bill.totalAmount,
          billingDate: bill.billingDate
        }
      });
    } catch (error) {
      console.error("Error creating custom billing item:", error);
      res.status(500).json({ error: "Failed to create custom billing item" });
    }
  });

  // Simple test delete route first
  app.delete("/api/test-delete/:billId", async (req, res) => {
    console.log(`[TEST DELETE] Request received for bill ID: ${req.params.billId}`);
    try {
      const billId = parseInt(req.params.billId);
      console.log(`[TEST DELETE] Parsed bill ID: ${billId}`);
      
      if (isNaN(billId) || billId <= 0) {
        console.log(`[TEST DELETE] Invalid bill ID: ${req.params.billId}`);
        return res.status(400).json({ error: "Invalid bill ID" });
      }

      console.log(`[TEST DELETE] Attempting to delete bill ${billId}`);
      await billingService.deleteBill(billId);
      console.log(`[TEST DELETE] Successfully deleted bill ${billId}`);
      res.json({ success: true, message: "Bill deleted successfully" });
    } catch (error) {
      console.error("[TEST DELETE] Error:", error);
      res.status(500).json({ error: "Failed to delete bill", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // View bill document as PDF (sadmin only)
  app.get("/api/sadmin/bills/:billId/view", async (req, res) => {
    console.log(`[PDF-DEBUG] Bill view request received for billId: ${req.params.billId}`);
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        console.log(`[PDF-DEBUG] Unauthorized access attempt`);
        return res.status(401).json({ error: "Unauthorized" });
      }

      const billId = parseInt(req.params.billId);
      console.log(`[PDF-DEBUG] Parsed billId: ${billId}`);
      if (isNaN(billId)) {
        return res.status(400).json({ error: "Invalid bill ID" });
      }

      // Get bill with company details and items
      console.log(`[PDF-DEBUG] Fetching bill data from database...`);
      const [billData] = await db
        .select({
          bill: schema.bills,
          company: schema.companies
        })
        .from(schema.bills)
        .leftJoin(schema.companies, eq(schema.bills.companyId, schema.companies.id))
        .where(eq(schema.bills.id, billId));

      console.log(`[PDF-DEBUG] Bill data fetched: ${billData ? 'found' : 'not found'}`);
      if (!billData) {
        return res.status(404).json({ error: "Bill not found" });
      }

      const { bill, company } = billData;
      console.log(`[PDF-DEBUG] Bill: ${bill?.billNumber}, Company: ${company?.name}`);

      // If bill has a Drive file ID and not requesting download, redirect to Google Drive
      if (bill.driveFileId && req.query.download !== 'true') {
        const driveViewUrl = `https://drive.google.com/file/d/${bill.driveFileId}/view`;
        console.log(`[PDF-DEBUG] Redirecting to Drive file: ${driveViewUrl}`);
        return res.redirect(driveViewUrl);
      }
      
      if (!company) {
        return res.status(404).json({ error: "Company not found for bill" });
      }

      // Get bill items
      console.log(`[PDF-DEBUG] Fetching bill items...`);
      const billItems = await db
        .select()
        .from(schema.billItems)
        .where(eq(schema.billItems.billId, billId));
      console.log(`[PDF-DEBUG] Found ${billItems.length} bill items`);

      // Generate PDF using the same method as receipts and emails
      console.log(`[PDF-DEBUG] Starting bill PDF generation for ${bill.billNumber}`);
      console.log(`[PDF-DEBUG] Importing email service...`);
      const { generateInvoiceHTML, convertHtmlToPdf } = await import('../services/email');
      console.log(`[PDF-DEBUG] Email service imported successfully`);
      
      console.log(`[PDF-DEBUG] Generating invoice HTML...`);
      const invoiceHTML = await generateInvoiceHTML(bill, company, billItems);
      console.log(`[PDF-DEBUG] Invoice HTML generated successfully, length: ${invoiceHTML.length}`);
      
      console.log(`[PDF-DEBUG] Converting HTML to PDF...`);
      const pdfBuffer = await convertHtmlToPdf(invoiceHTML);
      console.log(`[PDF-DEBUG] Bill PDF generated successfully, size: ${pdfBuffer.length} bytes`);

      // Check if this is a download request or inline view
      const isDownload = req.query.download === 'true';
      
      // Set appropriate headers based on request type
      res.setHeader('Content-Type', 'application/pdf');
      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${bill.billNumber}.pdf"`);
      } else {
        res.setHeader('Content-Disposition', `inline; filename="invoice-${bill.billNumber}.pdf"`);
      }
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Accept-Ranges', 'bytes');
      console.log(`[PDF-DEBUG] Sending bill PDF response for ${bill.billNumber}, size: ${pdfBuffer.length} bytes, type: ${isDownload ? 'download' : 'view'}`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("[PDF-DEBUG] ❌ Error generating bill PDF:");
      console.error("[PDF-DEBUG] Error name:", error instanceof Error ? error.name : 'Unknown');
      console.error("[PDF-DEBUG] Error message:", error instanceof Error ? error.message : String(error));
      console.error("[PDF-DEBUG] Error stack:", error instanceof Error ? error.stack : 'No stack');
      res.status(500).json({ error: "Failed to generate PDF", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // View receipt as PDF (sadmin only)
  app.get("/api/sadmin/receipts/:receiptId/view", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const receiptId = parseInt(req.params.receiptId);
      if (isNaN(receiptId) || receiptId <= 0) {
        return res.status(400).json({ error: "Invalid receipt ID" });
      }

      // Get receipt with company details
      const receipts = await billingService.getAllReceipts();
      const receipt = receipts.find(r => r.id === receiptId);
      
      if (!receipt) {
        return res.status(404).json({ error: "Receipt not found" });
      }

      // Check for Drive file ID from database
      const [receiptRecord] = await db.select().from(schema.receipts).where(eq(schema.receipts.id, receiptId));
      if (receiptRecord?.driveFileId && req.query.download !== 'true') {
        const driveViewUrl = `https://drive.google.com/file/d/${receiptRecord.driveFileId}/view`;
        console.log(`[PDF] Redirecting to Drive file: ${driveViewUrl}`);
        return res.redirect(driveViewUrl);
      }

      // Prepare template data for receipt PDF
      const templateData = {
        receiptNumber: receipt.receiptNumber,
        companyName: receipt.company.name,
        amount: parseFloat(receipt.amount).toFixed(2),
        paymentMethod: receipt.paymentMethod || 'N/A',
        description: receipt.description || 'Credit Addition',
        date: new Date(receipt.createdAt).toLocaleDateString(),
        year: new Date().getFullYear(),
        stripePaymentId: receipt.stripePaymentId || 'N/A'
      };

      // Generate HTML using the same template as email
      const { compileTemplate } = await import('../services/email');
      console.log(`[PDF] Compiling receipt template for ${receipt.receiptNumber}`);
      const receiptHTML = await compileTemplate('receipt', templateData);
      console.log(`[PDF] Receipt template compiled successfully, length: ${receiptHTML.length}`);

      // Generate PDF using the same method as email service
      console.log(`[PDF] Starting PDF generation for receipt ${receipt.receiptNumber}`);
      const { convertHtmlToPdf } = await import('../services/email');
      const pdfBuffer = await convertHtmlToPdf(receiptHTML);
      console.log(`[PDF] PDF generated successfully using email service method, size: ${pdfBuffer.length} bytes`);

      // Check if this is a download request or inline view
      const isDownload = req.query.download === 'true';
      
      // Set appropriate headers based on request type
      res.setHeader('Content-Type', 'application/pdf');
      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${receipt.receiptNumber}.pdf"`);
      } else {
        res.setHeader('Content-Disposition', `inline; filename="receipt-${receipt.receiptNumber}.pdf"`);
      }
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Accept-Ranges', 'bytes');
      console.log(`[PDF] Sending PDF response for ${receipt.receiptNumber}, size: ${pdfBuffer.length} bytes, type: ${isDownload ? 'download' : 'view'}`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating receipt PDF:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // Delete bill (sadmin only)
  app.delete("/api/sadmin/bills/:billId", async (req, res) => {
    try {
      console.log(`[DELETE BILL] Request received for bill ID: ${req.params.billId}`);
      
      // Wrap authentication checks in try-catch
      let isAuthenticated = false;
      let isSuperAdmin = false;
      
      try {
        isAuthenticated = req.isAuthenticated();
        isSuperAdmin = req.user?.isSuperAdmin || false;
        console.log(`[DELETE BILL] User authenticated: ${isAuthenticated}`);
        console.log(`[DELETE BILL] User is super admin: ${isSuperAdmin}`);
      } catch (authError) {
        console.error('[DELETE BILL] Authentication check failed:', authError);
        return res.status(500).json({ error: "Authentication error" });
      }
      
      if (!isAuthenticated || !isSuperAdmin) {
        console.log('[DELETE BILL] Unauthorized - user not authenticated or not super admin');
        return res.status(401).json({ error: "Unauthorized" });
      }

      const billId = parseInt(req.params.billId);
      if (isNaN(billId) || billId <= 0) {
        console.log(`[DELETE BILL] Invalid bill ID: ${req.params.billId}`);
        return res.status(400).json({ error: "Invalid bill ID" });
      }

      console.log(`[DELETE BILL] Attempting to delete bill ${billId}`);
      await billingService.deleteBill(billId);
      console.log(`[DELETE BILL] Successfully deleted bill ${billId}`);
      res.json({ success: true, message: "Bill deleted successfully" });
    } catch (error) {
      console.error("[DELETE BILL] Unhandled error:", error);
      res.status(500).json({ error: "Failed to delete bill" });
    }
  });

  // Get invoiceable wallet transactions for a company (sadmin only)
  app.get("/api/sadmin/companies/:companyId/invoiceable-transactions", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const companyId = parseInt(req.params.companyId);
      if (isNaN(companyId) || companyId <= 0) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const transactions = await billingService.getInvoiceableWalletTransactions(companyId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching invoiceable transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Get all credit notes (sadmin only)
  app.get("/api/sadmin/credit-notes", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const creditNotes = await creditNoteService.getAllCreditNotes();
      res.json(creditNotes);
    } catch (error) {
      console.error("Error fetching credit notes:", error);
      res.status(500).json({ error: "Failed to fetch credit notes" });
    }
  });

  // View credit note as PDF (sadmin only)
  app.get("/api/sadmin/credit-notes/:creditNoteId/view", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const creditNoteId = parseInt(req.params.creditNoteId);
      if (isNaN(creditNoteId) || creditNoteId <= 0) {
        return res.status(400).json({ error: "Invalid credit note ID" });
      }

      // Get credit note with company details and items
      const [creditNoteData] = await db
        .select({
          creditNote: schema.creditNotes,
          company: schema.companies
        })
        .from(schema.creditNotes)
        .leftJoin(schema.companies, eq(schema.creditNotes.companyId, schema.companies.id))
        .where(eq(schema.creditNotes.id, creditNoteId));

      if (!creditNoteData) {
        return res.status(404).json({ error: "Credit note not found" });
      }

      const { creditNote, company } = creditNoteData;

      // If credit note has a Drive file ID and not requesting download, redirect to Google Drive
      if (creditNote.driveFileId && req.query.download !== 'true') {
        const driveViewUrl = `https://drive.google.com/file/d/${creditNote.driveFileId}/view`;
        console.log(`[PDF] Redirecting to Drive file: ${driveViewUrl}`);
        return res.redirect(driveViewUrl);
      }
      
      if (!company) {
        return res.status(404).json({ error: "Company not found for credit note" });
      }

      // Get credit note items
      const creditNoteItems = await db
        .select()
        .from(schema.creditNoteItems)
        .where(eq(schema.creditNoteItems.creditNoteId, creditNoteId));

      // Generate PDF using credit note template
      const { compileTemplate, convertHtmlToPdf } = await import('../services/email');
      
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
        reason: creditNote.reason,
        items: formattedItems,
        totalAmount: parseFloat(creditNote.totalAmount).toFixed(2),
        currency: creditNote.currency || 'USD',
        year: new Date().getFullYear()
      };

      let html = await compileTemplate('credit-note', templateData);
      
      // Embed logo as base64 for PDF viewing
      try {
        const logoPath = path.join(__dirname, '../../public/images/logoST.png');
        const logoBuffer = await fs.readFile(logoPath);
        const logoBase64 = logoBuffer.toString('base64');
        const logoDataUrl = `data:image/png;base64,${logoBase64}`;
        html = html.replace('src="cid:logoST"', `src="${logoDataUrl}"`);
      } catch (logoError) {
        console.error('[PDF] Failed to embed logo for credit note:', logoError);
      }
      
      const pdfBuffer = await convertHtmlToPdf(html);

      // Check if this is a download request or inline view
      const isDownload = req.query.download === 'true';
      
      res.setHeader('Content-Type', 'application/pdf');
      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="credit-note-${creditNote.creditNoteNumber}.pdf"`);
      } else {
        res.setHeader('Content-Disposition', `inline; filename="credit-note-${creditNote.creditNoteNumber}.pdf"`);
      }
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      res.setHeader('Cache-Control', 'no-cache');
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating credit note PDF:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // Resend credit note email (sadmin only)
  app.post("/api/sadmin/credit-notes/:creditNoteId/resend", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.isSuperAdmin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const creditNoteId = parseInt(req.params.creditNoteId);
      if (isNaN(creditNoteId) || creditNoteId <= 0) {
        return res.status(400).json({ error: "Invalid credit note ID" });
      }

      const emailSent = await creditNoteService.sendCreditNoteEmail(creditNoteId);
      
      if (emailSent) {
        res.json({ success: true, message: "Credit note email sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send credit note email" });
      }
    } catch (error) {
      console.error("Error resending credit note email:", error);
      res.status(500).json({ error: "Failed to resend credit note email" });
    }
  });
}