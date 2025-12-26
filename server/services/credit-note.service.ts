import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, gte, lt, desc, isNotNull, isNull } from "drizzle-orm";
import type { 
  CreditNote, 
  CreditNoteItem,
  InsertCreditNote, 
  InsertCreditNoteItem,
  Company,
  PurchasedEsim,
  EsimPlan
} from "@shared/schema";
import { sendCreditNoteEmail } from "./email";
import { companyCurrencyService } from "./company-currency.service";

export class CreditNoteService {
  
  private async generateCreditNoteNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const datePrefix = `CN-${year}${month}${day}-`;
    
    const todaysStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    const todaysCreditNotes = await db
      .select()
      .from(schema.creditNotes)
      .where(
        and(
          gte(schema.creditNotes.createdAt, todaysStart),
          lt(schema.creditNotes.createdAt, tomorrowStart)
        )
      )
      .orderBy(desc(schema.creditNotes.creditNoteNumber))
      .limit(1);
    
    let sequence = 1;
    if (todaysCreditNotes.length > 0) {
      const latestNumber = todaysCreditNotes[0].creditNoteNumber;
      const sequencePart = latestNumber.split('-').pop();
      if (sequencePart) {
        sequence = parseInt(sequencePart, 10) + 1;
      }
    }
    
    return `${datePrefix}${String(sequence).padStart(4, '0')}`;
  }

  async generateCreditNoteForCompany(companyId: number, creditDate: Date): Promise<CreditNote | null> {
    try {
      console.log(`[CreditNote] Generating credit note for company ${companyId} for date ${creditDate.toISOString().split('T')[0]}`);
      
      const [company] = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.id, companyId));
      
      if (!company) {
        throw new Error(`Company ${companyId} not found`);
      }
      
      const isUAECompany = company?.country === 'UAE' || company?.country === 'United Arab Emirates';
      const vatRate = 0.05;
      
      const startOfDay = new Date(creditDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(creditDate);
      endOfDay.setHours(23, 59, 59, 999);

      const cancelledEsims = await db
        .select({
          esim: schema.purchasedEsims,
          plan: schema.esimPlans,
          employee: schema.employees
        })
        .from(schema.purchasedEsims)
        .leftJoin(schema.esimPlans, eq(schema.purchasedEsims.planId, schema.esimPlans.id))
        .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
        .where(
          and(
            eq(schema.employees.companyId, companyId),
            eq(schema.purchasedEsims.status, 'cancelled'),
            isNotNull(schema.purchasedEsims.cancelledAt),
            gte(schema.purchasedEsims.cancelledAt, startOfDay),
            lt(schema.purchasedEsims.cancelledAt, endOfDay),
            isNull(schema.purchasedEsims.creditNoteId)
          )
        );

      if (cancelledEsims.length === 0) {
        console.log(`[CreditNote] No cancelled eSIMs found for company ${companyId} on ${creditDate.toISOString().split('T')[0]}`);
        return null;
      }

      console.log(`[CreditNote] Found ${cancelledEsims.length} cancelled eSIMs to credit for company ${companyId}`);

      let totalAmount = 0;
      let totalVAT = 0;
      const creditItems: Array<{
        esim: typeof schema.purchasedEsims.$inferSelect;
        plan: typeof schema.esimPlans.$inferSelect | null;
        employee: typeof schema.employees.$inferSelect | null;
        amount: number;
        vatAmount: number;
      }> = [];

      for (const { esim, plan, employee } of cancelledEsims) {
        if (!plan) continue;
        
        const sellingPrice = parseFloat(plan.sellingPrice);
        const vatAmount = isUAECompany ? sellingPrice * vatRate : 0;
        const totalWithVAT = sellingPrice + vatAmount;
        
        creditItems.push({
          esim,
          plan,
          employee,
          amount: sellingPrice,
          vatAmount
        });
        
        totalAmount += totalWithVAT;
        totalVAT += vatAmount;
      }

      const originalBillId = cancelledEsims[0]?.esim.billId || null;

      const creditNoteNumber = await this.generateCreditNoteNumber();
      const companyCurrency = await companyCurrencyService.getCurrencyForCompany(companyId);
      
      const creditNoteData: InsertCreditNote = {
        companyId,
        creditNoteNumber,
        originalBillId,
        creditDate: creditDate.toISOString().split('T')[0],
        totalAmount: totalAmount.toString(),
        currency: companyCurrency,
        reason: 'eSIM cancellation refund',
      };

      const [creditNote] = await db
        .insert(schema.creditNotes)
        .values(creditNoteData)
        .returning();

      const creditNoteItems: InsertCreditNoteItem[] = [];
      
      for (const item of creditItems) {
        creditNoteItems.push({
          creditNoteId: creditNote.id,
          purchasedEsimId: item.esim.id,
          esimPlanId: item.plan?.id,
          planName: item.plan?.name || 'Unknown Plan',
          planDescription: item.plan?.description || '',
          unitPrice: item.amount.toString(),
          quantity: 1,
          totalAmount: item.amount.toString(),
          countries: item.plan?.countries || [],
          dataAmount: item.plan?.data?.toString() || null,
          validity: item.plan?.validity,
        });
        
        if (isUAECompany && item.vatAmount > 0) {
          creditNoteItems.push({
            creditNoteId: creditNote.id,
            planName: `VAT Refund (5%) - ${item.plan?.name}`,
            planDescription: '5% Value Added Tax Refund',
            unitPrice: item.vatAmount.toString(),
            quantity: 1,
            totalAmount: item.vatAmount.toString(),
            itemType: 'custom',
            customDescription: `5% VAT refund on ${item.plan?.name}`,
            countries: [],
          });
        }

        await db
          .update(schema.purchasedEsims)
          .set({ creditNoteId: creditNote.id })
          .where(eq(schema.purchasedEsims.id, item.esim.id));
      }

      await db
        .insert(schema.creditNoteItems)
        .values(creditNoteItems);

      console.log(`[CreditNote] Created credit note ${creditNote.creditNoteNumber} with ${creditNoteItems.length} items for company ${companyId}`);

      return creditNote;
    } catch (error) {
      console.error('[CreditNote] Error generating credit note:', error);
      throw error;
    }
  }

  async sendCreditNoteEmail(creditNoteId: number): Promise<boolean> {
    try {
      console.log(`[CreditNote] Starting to send credit note email for ID: ${creditNoteId}`);
      
      const [creditNoteData] = await db
        .select({
          creditNote: schema.creditNotes,
          company: schema.companies
        })
        .from(schema.creditNotes)
        .leftJoin(schema.companies, eq(schema.creditNotes.companyId, schema.companies.id))
        .where(eq(schema.creditNotes.id, creditNoteId));

      if (!creditNoteData) {
        throw new Error(`Credit note ${creditNoteId} not found`);
      }

      const { creditNote, company } = creditNoteData;
      
      if (!company) {
        throw new Error(`Company not found for credit note ${creditNoteId}`);
      }

      if (!company.contactEmail) {
        throw new Error(`Company ${company.name} has no contact email configured`);
      }

      const creditNoteItems = await db
        .select()
        .from(schema.creditNoteItems)
        .where(eq(schema.creditNoteItems.creditNoteId, creditNoteId));

      const emailSent = await sendCreditNoteEmail(
        company.contactEmail,
        creditNote,
        company,
        creditNoteItems
      );

      if (emailSent) {
        await db
          .update(schema.creditNotes)
          .set({
            emailSent: true,
            emailSentAt: new Date()
          })
          .where(eq(schema.creditNotes.id, creditNoteId));
      }

      return emailSent;
    } catch (error) {
      console.error(`[CreditNote] Error sending credit note email:`, error);
      return false;
    }
  }

  async processDailyCreditNotes(creditDate?: Date): Promise<CreditNote[]> {
    const targetDate = creditDate || new Date();
    
    try {
      console.log(`[CreditNote] Processing daily credit notes for ${targetDate.toISOString().split('T')[0]}`);
      
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const companiesWithCancellations = await db
        .selectDistinct({
          companyId: schema.employees.companyId
        })
        .from(schema.purchasedEsims)
        .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
        .where(
          and(
            eq(schema.purchasedEsims.status, 'cancelled'),
            isNotNull(schema.purchasedEsims.cancelledAt),
            gte(schema.purchasedEsims.cancelledAt, startOfDay),
            lt(schema.purchasedEsims.cancelledAt, endOfDay),
            isNull(schema.purchasedEsims.creditNoteId)
          )
        );

      const generatedCreditNotes: CreditNote[] = [];

      for (const { companyId } of companiesWithCancellations) {
        if (!companyId) continue;

        const creditNote = await this.generateCreditNoteForCompany(companyId, targetDate);
        if (creditNote) {
          generatedCreditNotes.push(creditNote);
          await this.sendCreditNoteEmail(creditNote.id);
        }
      }

      if (generatedCreditNotes.length === 0) {
        console.log(`[CreditNote] No credit notes to generate for ${targetDate.toISOString().split('T')[0]}`);
      } else {
        console.log(`[CreditNote] Generated ${generatedCreditNotes.length} credit notes for ${targetDate.toISOString().split('T')[0]}`);
      }
      
      return generatedCreditNotes;
    } catch (error) {
      console.error('[CreditNote] Error processing daily credit notes:', error);
      throw error;
    }
  }

  async getCompanyCreditNotes(companyId: number): Promise<(CreditNote & { items: CreditNoteItem[] })[]> {
    const creditNotes = await db
      .select()
      .from(schema.creditNotes)
      .where(eq(schema.creditNotes.companyId, companyId))
      .orderBy(desc(schema.creditNotes.createdAt));

    const creditNotesWithItems = await Promise.all(
      creditNotes.map(async (creditNote) => {
        const items = await db
          .select()
          .from(schema.creditNoteItems)
          .where(eq(schema.creditNoteItems.creditNoteId, creditNote.id));
        
        return { ...creditNote, items };
      })
    );

    return creditNotesWithItems;
  }

  async getAllCreditNotes(): Promise<(CreditNote & { company: Company, items: CreditNoteItem[] })[]> {
    const creditNotes = await db
      .select({
        creditNote: schema.creditNotes,
        company: schema.companies
      })
      .from(schema.creditNotes)
      .leftJoin(schema.companies, eq(schema.creditNotes.companyId, schema.companies.id))
      .orderBy(desc(schema.creditNotes.createdAt));

    const creditNotesWithItems = await Promise.all(
      creditNotes.map(async (row) => {
        const items = await db
          .select()
          .from(schema.creditNoteItems)
          .where(eq(schema.creditNoteItems.creditNoteId, row.creditNote.id));
        
        return { ...row.creditNote, company: row.company!, items };
      })
    );

    return creditNotesWithItems;
  }
}

export const creditNoteService = new CreditNoteService();
