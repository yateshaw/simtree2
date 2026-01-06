import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, gte, lt, desc, sql, isNull, inArray, lte, ne } from "drizzle-orm";
import type { 
  Receipt, 
  Bill, 
  BillItem, 
  InsertReceipt, 
  InsertBill, 
  InsertBillItem,
  Company,
  WalletTransaction,
  PurchasedEsim,
  EsimPlan
} from "@shared/schema";
import { sendReceiptEmail, sendBillEmail } from "./email";
import { companyCurrencyService } from "./company-currency.service";
import { exchangeRateService } from "./exchange-rate.service";
import { formatCurrency } from "@shared/utils/currency";

export class BillingService {
  
  /**
   * Generate a unique receipt number
   */
  private async generateReceiptNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Find the latest receipt for today
    const latestReceipt = await db
      .select()
      .from(schema.receipts)
      .where(
        gte(schema.receipts.createdAt, new Date(today.getFullYear(), today.getMonth(), today.getDate()))
      )
      .orderBy(desc(schema.receipts.id))
      .limit(1);
    
    const sequence = latestReceipt.length > 0 ? latestReceipt[0].id + 1 : 1;
    return `RCP-${year}${month}${day}-${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Generate a unique bill number
   * Format: BILL-0001 (sequential, no date in the number)
   */
  private async generateBillNumber(): Promise<string> {
    // Find the latest bill globally to get the next sequence number
    const latestBill = await db
      .select()
      .from(schema.bills)
      .orderBy(desc(schema.bills.id))
      .limit(1);
    
    const sequence = latestBill.length > 0 ? latestBill[0].id + 1 : 1;
    return `BILL-${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Get the next bill number that would be generated
   */
  async getNextBillNumber(): Promise<string> {
    // Find the latest bill globally to get the next sequence number
    const latestBill = await db
      .select()
      .from(schema.bills)
      .orderBy(desc(schema.bills.id))
      .limit(1);
    
    const sequence = latestBill.length > 0 ? latestBill[0].id + 1 : 1;
    return `BILL-${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Create a receipt for credit addition and send email
   */
  async createCreditReceipt(
    companyId: number,
    transactionId: number,
    amount: number,
    paymentMethod: string,
    stripePaymentId?: string
  ): Promise<Receipt> {
    try {
      console.log(`[Billing] Creating credit receipt for company ${companyId}, amount: $${amount}`);
      
      const receiptNumber = await this.generateReceiptNumber();
      
      const receiptData: InsertReceipt = {
        companyId,
        receiptNumber,
        type: 'credit_addition',
        amount: amount.toString(),
        description: `Credit added to account - ${paymentMethod}`,
        paymentMethod,
        stripePaymentId,
        transactionId,
      };

      const [receipt] = await db
        .insert(schema.receipts)
        .values(receiptData)
        .returning();

      console.log(`[Billing] Created receipt ${receipt.receiptNumber} for company ${companyId}`);

      // Send receipt email immediately
      await this.sendReceiptEmail(receipt.id);

      return receipt;
    } catch (error) {
      console.error('[Billing] Error creating credit receipt:', error);
      throw error;
    }
  }

  /**
   * Send receipt email to company
   */
  async sendReceiptEmail(receiptId: number): Promise<boolean> {
    try {
      // Get receipt with company details
      const [receiptData] = await db
        .select({
          receipt: schema.receipts,
          company: schema.companies,
          transaction: schema.walletTransactions
        })
        .from(schema.receipts)
        .leftJoin(schema.companies, eq(schema.receipts.companyId, schema.companies.id))
        .leftJoin(schema.walletTransactions, eq(schema.receipts.transactionId, schema.walletTransactions.id))
        .where(eq(schema.receipts.id, receiptId));

      if (!receiptData) {
        throw new Error(`Receipt ${receiptId} not found`);
      }

      const { receipt, company, transaction } = receiptData;
      
      if (!company) {
        throw new Error(`Company not found for receipt ${receiptId}`);
      }

      // Send email using the email service
      const emailSent = await sendReceiptEmail(
        company.contactEmail!,
        receipt,
        company,
        transaction
      );

      if (emailSent) {
        // Mark email as sent
        await db
          .update(schema.receipts)
          .set({
            emailSent: true,
            emailSentAt: new Date()
          })
          .where(eq(schema.receipts.id, receiptId));
      }

      return emailSent;
    } catch (error) {
      console.error('[Billing] Error sending receipt email:', error);
      console.error('[Billing] Full error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        receiptId
      });
      return false;
    }
  }

  /**
   * Generate daily bill for eSIM purchases with grouping
   */
  async generateDailyBill(companyId: number, billingDate: Date): Promise<Bill | null> {
    try {
      console.log(`[Billing] Generating daily bill for company ${companyId} for date ${billingDate.toISOString().split('T')[0]}`);
      
      // Get company information to check if VAT applies
      const [company] = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.id, companyId));
      
      const isUAECompany = company?.country === 'UAE' || company?.country === 'United Arab Emirates';
      const vatRate = 0.05; // 5% VAT for UAE companies
      
      console.log(`[Billing] Company VAT status:`, {
        companyName: company?.name,
        country: company?.country,
        isUAECompany,
        vatRate: isUAECompany ? '5%' : '0%'
      });
      
      // Get all eSIM purchases for the company on the billing date
      const startOfDay = new Date(billingDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(billingDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get ALL eSIM purchases for the day with plan details (including cancelled ones for proper audit trail)
      const purchases = await db
        .select({
          purchase: schema.purchasedEsims,
          plan: schema.esimPlans,
          employee: schema.employees
        })
        .from(schema.purchasedEsims)
        .leftJoin(schema.esimPlans, eq(schema.purchasedEsims.planId, schema.esimPlans.id))
        .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
        .where(
          and(
            eq(schema.employees.companyId, companyId),
            gte(schema.purchasedEsims.purchaseDate, startOfDay),
            lt(schema.purchasedEsims.purchaseDate, endOfDay)
          )
        );

      if (purchases.length === 0) {
        console.log(`[Billing] No purchases found for company ${companyId} on ${billingDate.toISOString().split('T')[0]}`);
        return null;
      }

      // Group purchases by plan (same place, GB, days)
      const groupedPurchases = new Map<string, {
        plan: any;
        quantity: number;
        unitPrice: number;
        totalAmount: number;
        vatAmount?: number; // VAT amount for UAE companies
        totalWithVAT?: number; // Total including VAT
      }>();

      for (const purchase of purchases) {
        if (!purchase.plan) continue;
        
        const plan = purchase.plan;
        const key = `${plan.name}-${plan.data}-${plan.validity}-${plan.countries?.join(',')}`;
        
        const sellingPrice = parseFloat(plan.sellingPrice);
        const vatAmount = isUAECompany ? sellingPrice * vatRate : 0;
        const totalWithVAT = sellingPrice + vatAmount;
        
        if (groupedPurchases.has(key)) {
          const existing = groupedPurchases.get(key)!;
          existing.quantity += 1;
          existing.totalAmount += sellingPrice;
          if (isUAECompany) {
            existing.vatAmount = (existing.vatAmount || 0) + vatAmount;
            existing.totalWithVAT = (existing.totalWithVAT || 0) + totalWithVAT;
          }
        } else {
          groupedPurchases.set(key, {
            plan,
            quantity: 1,
            unitPrice: sellingPrice,
            totalAmount: sellingPrice,
            vatAmount: isUAECompany ? vatAmount : undefined,
            totalWithVAT: isUAECompany ? totalWithVAT : undefined
          });
        }
      }

      // Calculate total bill amount (including VAT for UAE companies)
      const totalAmount = Array.from(groupedPurchases.values())
        .reduce((sum, group) => sum + (group.totalWithVAT || group.totalAmount), 0);
      
      // Calculate VAT totals for UAE companies
      const totalVAT = isUAECompany ? Array.from(groupedPurchases.values())
        .reduce((sum, group) => sum + (group.vatAmount || 0), 0) : 0;
      
      console.log(`[Billing] Bill totals:`, {
        subtotal: totalAmount - totalVAT,
        vatAmount: totalVAT,
        total: totalAmount,
        isUAECompany
      });

      // Create the bill
      const billNumber = await this.generateBillNumber();
      
      // Get company currency
      const companyCurrency = await companyCurrencyService.getCurrencyForCompany(companyId);
      
      const billData: InsertBill = {
        companyId,
        billNumber,
        billingDate: billingDate.toISOString().split('T')[0],
        totalAmount: totalAmount.toString(),
        currency: companyCurrency,
      };

      const [bill] = await db
        .insert(schema.bills)
        .values(billData)
        .returning();

      // Create bill items (only eSIM items - VAT is calculated at display time, not stored as separate items)
      const billItems: InsertBillItem[] = [];
      
      Array.from(groupedPurchases.entries()).forEach(([key, group]) => {
        // Add eSIM plan item (VAT will be calculated when generating the invoice PDF)
        billItems.push({
          billId: bill.id,
          esimPlanId: group.plan.id,
          planName: group.plan.name,
          planDescription: group.plan.description || '',
          unitPrice: group.unitPrice.toString(),
          quantity: group.quantity,
          totalAmount: group.totalAmount.toString(),
          countries: group.plan.countries || [],
          dataAmount: group.plan.data,
          validity: group.plan.validity
        });
      });

      await db
        .insert(schema.billItems)
        .values(billItems);

      console.log(`[Billing] Created bill ${bill.billNumber} with ${billItems.length} items for company ${companyId}`);

      // Send bill email immediately
      await this.sendBillEmail(bill.id);

      return bill;
    } catch (error) {
      console.error('[Billing] Error generating daily bill:', error);
      throw error;
    }
  }

  /**
   * Send bill email to company
   */
  async sendBillEmail(billId: number): Promise<boolean> {
    try {
      console.log(`[Billing] Starting to send bill email for bill ID: ${billId}`);
      
      // Get bill with company details and items
      const [billData] = await db
        .select({
          bill: schema.bills,
          company: schema.companies
        })
        .from(schema.bills)
        .leftJoin(schema.companies, eq(schema.bills.companyId, schema.companies.id))
        .where(eq(schema.bills.id, billId));

      if (!billData) {
        console.error(`[Billing] Bill ${billId} not found in database`);
        throw new Error(`Bill ${billId} not found`);
      }

      const { bill, company } = billData;
      console.log(`[Billing] Found bill: ${bill.billNumber} for company: ${company?.name || 'UNKNOWN'}`);
      
      if (!company) {
        console.error(`[Billing] Company not found for bill ${billId}`);
        throw new Error(`Company not found for bill ${billId}`);
      }

      if (!company.contactEmail) {
        console.error(`[Billing] Company ${company.name} (ID: ${company.id}) has no contact email`);
        throw new Error(`Company ${company.name} has no contact email configured`);
      }

      console.log(`[Billing] Sending email to: ${company.contactEmail}`);

      // Get bill items
      const billItems = await db
        .select()
        .from(schema.billItems)
        .where(eq(schema.billItems.billId, billId));

      console.log(`[Billing] Found ${billItems.length} bill items for bill ${bill.billNumber}`);

      // Send email using the email service
      const emailSent = await sendBillEmail(
        company.contactEmail,
        bill,
        company,
        billItems
      );

      if (emailSent) {
        console.log(`[Billing] Email sent successfully for bill ${bill.billNumber}, updating database`);
        // Mark email as sent
        await db
          .update(schema.bills)
          .set({
            emailSent: true,
            emailSentAt: new Date()
          })
          .where(eq(schema.bills.id, billId));
        console.log(`[Billing] Database updated for bill ${bill.billNumber}`);
      } else {
        console.error(`[Billing] Email service returned false for bill ${bill.billNumber}`);
      }

      return emailSent;
    } catch (error) {
      console.error(`[Billing] Error sending bill email for bill ${billId}:`, error);
      if (error instanceof Error) {
        console.error(`[Billing] Error message: ${error.message}`);
        console.error(`[Billing] Error stack: ${error.stack}`);
      }
      return false;
    }
  }

  /**
   * Get all receipts for a company
   */
  async getCompanyReceipts(companyId: number): Promise<Receipt[]> {
    return await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.companyId, companyId))
      .orderBy(desc(schema.receipts.createdAt));
  }

  /**
   * Get all bills for a company
   */
  async getCompanyBills(companyId: number): Promise<(Bill & { items: BillItem[] })[]> {
    const bills = await db
      .select()
      .from(schema.bills)
      .where(eq(schema.bills.companyId, companyId))
      .orderBy(desc(schema.bills.createdAt));

    // Get items for each bill
    const billsWithItems = await Promise.all(
      bills.map(async (bill) => {
        const items = await db
          .select()
          .from(schema.billItems)
          .where(eq(schema.billItems.billId, bill.id));
        
        return { ...bill, items };
      })
    );

    return billsWithItems;
  }

  /**
   * Get all receipts (for sadmin)
   */
  async getAllReceipts(): Promise<(Receipt & { company: Company })[]> {
    const receipts = await db
      .select({
        receipt: schema.receipts,
        company: schema.companies
      })
      .from(schema.receipts)
      .leftJoin(schema.companies, eq(schema.receipts.companyId, schema.companies.id))
      .orderBy(desc(schema.receipts.createdAt));

    return receipts.map(row => ({ ...row.receipt, company: row.company! }));
  }

  /**
   * Get all bills (for sadmin)
   */
  async getAllBills(): Promise<(Bill & { company: Company, items: BillItem[] })[]> {
    const bills = await db
      .select({
        bill: schema.bills,
        company: schema.companies
      })
      .from(schema.bills)
      .leftJoin(schema.companies, eq(schema.bills.companyId, schema.companies.id))
      .orderBy(desc(schema.bills.createdAt));

    // Get items for each bill
    const billsWithItems = await Promise.all(
      bills.map(async (row) => {
        const items = await db
          .select()
          .from(schema.billItems)
          .where(eq(schema.billItems.billId, row.bill.id));
        
        return { ...row.bill, company: row.company!, items };
      })
    );

    return billsWithItems;
  }

  /**
   * Process daily billing for all companies that had eSIM purchases
   */
  async processDailyBilling(billingDate?: Date): Promise<Bill[]> {
    const targetDate = billingDate || new Date();
    targetDate.setDate(targetDate.getDate() - 1); // Process previous day
    
    try {
      console.log(`[Billing] Processing daily billing for ${targetDate.toISOString().split('T')[0]}`);
      
      // Get all companies that had eSIM purchases on the target date
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Find companies with purchases on this date
      const companiesWithPurchases = await db
        .selectDistinct({
          companyId: schema.employees.companyId
        })
        .from(schema.purchasedEsims)
        .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
        .where(
          and(
            gte(schema.purchasedEsims.purchaseDate, startOfDay),
            lt(schema.purchasedEsims.purchaseDate, endOfDay)
          )
        );

      const generatedBills: Bill[] = [];

      for (const { companyId } of companiesWithPurchases) {
        if (!companyId) continue;
        
        // Check if bill already exists for this company and date
        const existingBill = await db
          .select()
          .from(schema.bills)
          .where(
            and(
              eq(schema.bills.companyId, companyId),
              eq(schema.bills.billingDate, targetDate.toISOString().split('T')[0])
            )
          )
          .limit(1);

        if (existingBill.length > 0) {
          console.log(`[Billing] Bill already exists for company ${companyId} on ${targetDate.toISOString().split('T')[0]}`);
          continue;
        }

        const bill = await this.generateDailyBill(companyId, targetDate);
        if (bill) {
          generatedBills.push(bill);
        }
      }

      if (generatedBills.length === 0) {
        console.log(`[Billing] No bills to generate for ${targetDate.toISOString().split('T')[0]} - no eSIM purchases found`);
      } else {
        console.log(`[Billing] Generated ${generatedBills.length} bills for ${targetDate.toISOString().split('T')[0]}`);
      }
      return generatedBills;
    } catch (error) {
      console.error('[Billing] Error processing daily billing:', error);
      throw error;
    }
  }
  /**
   * Get uninvoiced eSIMs for a company within a date range
   */
  async getUninvoicedEsims(companyId: number, startDate?: Date, endDate?: Date) {
    // Add date range filters - include ALL eSIMs for proper audit trail
    const conditions = [
      eq(schema.employees.companyId, companyId),
      isNull(schema.purchasedEsims.invoicedAt)
    ];
    
    if (startDate) {
      conditions.push(gte(schema.purchasedEsims.purchaseDate, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(schema.purchasedEsims.purchaseDate, endDate));
    }
    
    return await db
      .select({
        id: schema.purchasedEsims.id,
        orderId: schema.purchasedEsims.orderId,
        purchaseDate: schema.purchasedEsims.purchaseDate,
        employeeName: schema.employees.name,
        planName: schema.esimPlans.name,
        sellingPrice: schema.esimPlans.sellingPrice,
        dataAmount: schema.esimPlans.data,
        validity: schema.esimPlans.validity,
        status: schema.purchasedEsims.status,
        countries: schema.esimPlans.countries,
        invoicedAt: schema.purchasedEsims.invoicedAt,
        billId: schema.purchasedEsims.billId
      })
      .from(schema.purchasedEsims)
      .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
      .leftJoin(schema.esimPlans, eq(schema.purchasedEsims.planId, schema.esimPlans.id))
      .where(and(...conditions))
      .orderBy(schema.purchasedEsims.purchaseDate);
  }

  /**
   * Generate a manual bill for uninvoiced eSIMs
   */
  async generateManualBill(params: {
    companyId: number;
    startDate?: Date;
    endDate?: Date;
    esimIds?: number[]; // Specific eSIM IDs to include
    customItems?: Array<{description: string, amount: number}>; // Custom billing items
    recipientEmail?: string;
  }): Promise<Bill | null> {
    const { companyId, startDate, endDate, esimIds, customItems, recipientEmail } = params;

    try {
      // Get company details
      const [company] = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.id, companyId));

      if (!company) {
        throw new Error(`Company ${companyId} not found`);
      }

      // Get uninvoiced eSIMs
      let uninvoicedEsims: Array<{
        id: number;
        orderId: string | null;
        purchaseDate: Date;
        employeeName: string | null;
        planName: string | null;
        sellingPrice: string | null;
        dataAmount: string | null;
        validity: number | null;
        status: string | null;
        countries: string[] | null;
      }> = [];
      if (esimIds && esimIds.length > 0) {
        // Get specific eSIMs by IDs (must be uninvoiced)
        uninvoicedEsims = await db
          .select({
            id: schema.purchasedEsims.id,
            orderId: schema.purchasedEsims.orderId,
            purchaseDate: schema.purchasedEsims.purchaseDate,
            employeeName: schema.employees.name,
            planName: schema.esimPlans.name,
            sellingPrice: schema.esimPlans.sellingPrice,
            dataAmount: schema.esimPlans.data,
            validity: schema.esimPlans.validity,
            status: schema.purchasedEsims.status,
            countries: schema.esimPlans.countries
          })
          .from(schema.purchasedEsims)
          .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
          .leftJoin(schema.esimPlans, eq(schema.purchasedEsims.planId, schema.esimPlans.id))
          .where(
            and(
              inArray(schema.purchasedEsims.id, esimIds),
              eq(schema.employees.companyId, companyId),
              isNull(schema.purchasedEsims.invoicedAt)
            )
          );
      } else if (startDate || endDate) {
        // Get uninvoiced eSIMs by date range only if dates are provided
        uninvoicedEsims = await this.getUninvoicedEsims(companyId, startDate, endDate);
      } else {
        // No eSIMs selected and no date range = custom items only
        uninvoicedEsims = [];
      }

      // Check if we have any billable items
      if (uninvoicedEsims.length === 0 && (!customItems || customItems.length === 0)) {
        console.log(`[Billing] No uninvoiced eSIMs or custom items found for company ${companyId}`);
        return null;
      }

      // Calculate total amount from eSIMs
      const esimTotal = uninvoicedEsims.reduce((sum, esim) => {
        return sum + parseFloat(esim.sellingPrice || '0');
      }, 0);
      
      // Calculate total amount from custom items
      const customTotal = customItems ? customItems.reduce((sum, item) => {
        return sum + item.amount;
      }, 0) : 0;
      
      const totalAmount = esimTotal + customTotal;

      // Generate bill number using proper sequence
      const billNumber = await this.generateBillNumber();

      // Create the bill
      const [bill] = await db
        .insert(schema.bills)
        .values({
          billNumber,
          companyId,
          totalAmount: totalAmount.toFixed(2),
          billingDate: new Date().toISOString().split('T')[0],
          emailSent: false
        })
        .returning();

      // Create bill items for eSIMs
      const esimBillItems = uninvoicedEsims.map(esim => ({
        billId: bill.id,
        planName: esim.planName || 'Unknown Plan',
        planDescription: `eSIM Purchase for ${esim.employeeName}`,
        quantity: 1,
        unitPrice: esim.sellingPrice || '0',
        totalAmount: esim.sellingPrice || '0',
        itemType: 'esim' as const,
        customDescription: null
      }));
      
      // Create bill items for custom items
      const customBillItems = customItems ? customItems.map(item => ({
        billId: bill.id,
        planName: item.description,
        planDescription: item.description,
        quantity: 1,
        unitPrice: item.amount.toFixed(2),
        totalAmount: item.amount.toFixed(2),
        itemType: 'custom' as const,
        customDescription: item.description
      })) : [];
      
      const allBillItems = [...esimBillItems, ...customBillItems];
      
      if (allBillItems.length > 0) {
        await db.insert(schema.billItems).values(allBillItems);
      }

      // Mark eSIMs as invoiced and link to this bill
      const esimIdsToMark = uninvoicedEsims.map(esim => esim.id);
      await db
        .update(schema.purchasedEsims)
        .set({
          invoicedAt: new Date(),
          billId: bill.id
        })
        .where(inArray(schema.purchasedEsims.id, esimIdsToMark));
        
      // Record custom items as wallet transactions if any
      if (customItems && customItems.length > 0) {
        const [companyWallet] = await db
          .select()
          .from(schema.wallets)
          .where(
            and(
              eq(schema.wallets.companyId, companyId),
              eq(schema.wallets.walletType, 'general')
            )
          );
          
        if (companyWallet) {
          const customTransactions = customItems.map(item => ({
            walletId: companyWallet.id,
            type: 'debit' as const,
            amount: Math.abs(item.amount).toFixed(2), // Always store as positive amount for debit
            description: item.description,
            date: new Date().toISOString().split('T')[0],
            invoicedAt: new Date(),
            billId: bill.id
          }));
          
          await db.insert(schema.walletTransactions).values(customTransactions);
        }
      }

      console.log(`[Billing] Generated manual bill ${billNumber} for company ${companyId} with ${uninvoicedEsims.length} eSIMs and ${customItems?.length || 0} custom items, total: $${totalAmount.toFixed(2)}`);

      // Send email if recipient provided
      if (recipientEmail || company.contactEmail) {
        const emailAddress = recipientEmail || company.contactEmail!;
        console.log(`[Billing] Sending bill email to ${emailAddress}`);
        
        const emailSent = await sendBillEmail(
          emailAddress,
          bill,
          company,
          allBillItems.map(item => ({ ...item, id: 0 })) // Mock ID for email template
        );

        if (emailSent) {
          await db
            .update(schema.bills)
            .set({
              emailSent: true,
              emailSentAt: new Date()
            })
            .where(eq(schema.bills.id, bill.id));
        }
      }

      return bill;
    } catch (error) {
      console.error('[Billing] Error generating manual bill:', error);
      throw error;
    }
  }

  /**
   * Create a custom billing item that deducts from company wallet
   */
  async createCustomBillingItem(params: {
    companyId: number;
    description: string;
    amount: number;
    walletTransactionId?: number;
    recipientEmail?: string;
  }): Promise<Bill> {
    const { companyId, description, amount, walletTransactionId, recipientEmail } = params;

    try {
      console.log(`[Billing] Creating custom billing item for company ${companyId}: ${description} - $${amount}`);

      // Get company details
      const [company] = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.id, companyId));

      if (!company) {
        throw new Error(`Company ${companyId} not found`);
      }

      // Generate bill number using proper sequence
      const billNumber = await this.generateBillNumber();

      // Create the bill
      const [bill] = await db
        .insert(schema.bills)
        .values({
          billNumber,
          companyId,
          totalAmount: amount.toFixed(2),
          billingDate: new Date().toISOString().split('T')[0],
          emailSent: false
        })
        .returning();

      // Create custom bill item
      await db.insert(schema.billItems).values({
        billId: bill.id,
        planName: description,
        planDescription: description,
        quantity: 1,
        unitPrice: amount.toFixed(2),
        totalAmount: amount.toFixed(2),
        itemType: 'custom',
        customDescription: description,
        dataAmount: null,
        validity: null
      });

      // If this is linked to a wallet transaction, mark it as invoiced
      if (walletTransactionId) {
        await db
          .update(schema.walletTransactions)
          .set({
            invoicedAt: new Date(),
            billId: bill.id
          })
          .where(eq(schema.walletTransactions.id, walletTransactionId));
      }

      console.log(`[Billing] Created custom bill ${billNumber} for company ${companyId}, amount: $${amount.toFixed(2)}`);

      // Send email if recipient provided
      if (recipientEmail || company.contactEmail) {
        const emailAddress = recipientEmail || company.contactEmail!;
        console.log(`[Billing] Sending custom bill email to ${emailAddress}`);
        
        const billItems = [{
          id: 0,
          billId: bill.id,
          description,
          quantity: 1,
          unitPrice: amount.toFixed(2),
          totalPrice: amount.toFixed(2),
          esimOrderId: null
        }];
        
        const emailSent = await sendBillEmail(
          emailAddress,
          bill,
          company,
          billItems
        );

        if (emailSent) {
          await db
            .update(schema.bills)
            .set({
              emailSent: true,
              emailSentAt: new Date()
            })
            .where(eq(schema.bills.id, bill.id));
        }
      }

      return bill;
    } catch (error) {
      console.error('[Billing] Error creating custom billing item:', error);
      throw error;
    }
  }

  /**
   * Get wallet transactions that can be invoiced (deductions without bills)
   */
  async getInvoiceableWalletTransactions(companyId: number): Promise<any[]> {
    try {
      const transactions = await db
        .select({
          id: schema.walletTransactions.id,
          amount: schema.walletTransactions.amount,
          description: schema.walletTransactions.description,
          createdAt: schema.walletTransactions.createdAt,
          type: schema.walletTransactions.type
        })
        .from(schema.walletTransactions)
        .innerJoin(schema.wallets, eq(schema.walletTransactions.walletId, schema.wallets.id))
        .where(
          and(
            eq(schema.wallets.companyId, companyId),
            eq(schema.walletTransactions.type, 'deduction'),
            isNull(schema.walletTransactions.invoicedAt)
          )
        )
        .orderBy(schema.walletTransactions.createdAt);

      return transactions;
    } catch (error) {
      console.error('[Billing] Error getting invoiceable wallet transactions:', error);
      throw error;
    }
  }

  /**
   * Get uninvoiced eSIMs statistics for all companies
   */
  async getUninvoicedStatsForAllCompanies() {
    const stats = await db
      .select({
        companyId: schema.employees.companyId,
        companyName: schema.companies.name,
        uninvoicedCount: sql<number>`count(*)`,
        totalValue: sql<number>`sum(${schema.esimPlans.sellingPrice}::numeric)`
      })
      .from(schema.purchasedEsims)
      .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
      .leftJoin(schema.companies, eq(schema.employees.companyId, schema.companies.id))
      .leftJoin(schema.esimPlans, eq(schema.purchasedEsims.planId, schema.esimPlans.id))
      .where(isNull(schema.purchasedEsims.invoicedAt))
      .groupBy(schema.employees.companyId, schema.companies.name)
      .orderBy(sql`sum(${schema.esimPlans.sellingPrice}::numeric) desc`);

    return stats;
  }

  /**
   * Delete a bill and return eSIMs to uninvoiced state
   */
  async deleteBill(billId: number): Promise<void> {
    try {
      // First, get the bill to make sure it exists
      const [bill] = await db
        .select()
        .from(schema.bills)
        .where(eq(schema.bills.id, billId));

      if (!bill) {
        throw new Error(`Bill ${billId} not found`);
      }

      console.log(`[Billing] Deleting bill ${bill.billNumber} (ID: ${billId})`);

      // Reset invoicing status for all eSIMs that were in this bill
      const updatedEsims = await db
        .update(schema.purchasedEsims)
        .set({
          invoicedAt: null,
          billId: null
        })
        .where(eq(schema.purchasedEsims.billId, billId))
        .returning({ id: schema.purchasedEsims.id });

      console.log(`[Billing] Reset invoicing status for ${updatedEsims.length} eSIMs`);

      // Reset invoicing status for all wallet transactions that were in this bill
      const updatedTransactions = await db
        .update(schema.walletTransactions)
        .set({
          invoicedAt: null,
          billId: null
        })
        .where(eq(schema.walletTransactions.billId, billId))
        .returning({ id: schema.walletTransactions.id });

      console.log(`[Billing] Reset invoicing status for ${updatedTransactions.length} wallet transactions`);

      // Delete all bill items
      await db
        .delete(schema.billItems)
        .where(eq(schema.billItems.billId, billId));

      // Delete the bill
      await db
        .delete(schema.bills)
        .where(eq(schema.bills.id, billId));

      console.log(`[Billing] Successfully deleted bill ${bill.billNumber}`);
    } catch (error) {
      console.error(`Error deleting bill ${billId}:`, error);
      throw error;
    }
  }
}

export const billingService = new BillingService();

// Export convenience functions for easy importing
export const createReceipt = billingService.createCreditReceipt.bind(billingService);
export const createBillForCompany = async (params: {
  companyId: number;
  startDate: Date;
  endDate: Date;
  recipientEmail: string;
}) => {
  const bill = await billingService.generateDailyBill(params.companyId, params.startDate);
  if (bill) {
    console.log(`[Billing] Bill generated for company ${params.companyId}, sending to ${params.recipientEmail}`);
    // The email is already sent within generateDailyBill
  }
  return bill;
};