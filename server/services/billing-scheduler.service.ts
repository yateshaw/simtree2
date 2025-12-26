import * as cron from 'node-cron';
import { billingService } from './billing.service';
import { creditNoteService } from './credit-note.service';
import { db } from '../db';
import { companies, purchasedEsims, employees } from '@shared/schema';
import { isNull, and, gte, lt, sql, eq, isNotNull } from 'drizzle-orm';

class BillingSchedulerService {
  private isInitialized = false;

  /**
   * Initialize the automatic billing scheduler
   * Runs daily at 11:59 PM to bill all new eSIMs purchased that day
   * Also processes credit notes for cancelled eSIMs
   */
  init() {
    if (this.isInitialized) {
      console.log('[Billing Scheduler] Already initialized');
      return;
    }

    // Schedule daily billing and credit notes at 11:59 PM
    cron.schedule('59 23 * * *', async () => {
      console.log('[Billing Scheduler] Starting daily automatic billing and credit notes...');
      await this.runDailyBilling();
      await this.runDailyCreditNotes();
    }, {
      timezone: 'UTC'
    });

    // For testing - also run at the start of each hour (can be removed in production)
    cron.schedule('0 * * * *', async () => {
      console.log('[Billing Scheduler] Hourly check - would bill new eSIMs in production');
      await this.runDailyBilling(true); // dryRun = true for testing
      await this.runDailyCreditNotes(true); // dryRun = true for testing
    }, {
      timezone: 'UTC'
    });

    this.isInitialized = true;
    console.log('[Billing Scheduler] ✅ Automatic billing and credit note scheduler initialized');
    console.log('[Billing Scheduler] Daily billing and credit notes will run at 11:59 PM UTC');
    console.log('[Billing Scheduler] Test runs will occur hourly (dry run mode)');
  }

  /**
   * Run daily billing process
   * @param dryRun - If true, only logs what would be billed without creating actual bills
   */
  async runDailyBilling(dryRun = false) {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      console.log(`[Billing Scheduler] ${dryRun ? 'DRY RUN: ' : ''}Processing eSIMs purchased on ${startOfDay.toISOString().split('T')[0]}`);

      // Get all companies that have uninvoiced eSIMs purchased today
      const companiesWithNewEsims = await db
        .select({
          companyId: companies.id,
          companyName: companies.name,
          contactEmail: companies.contactEmail,
          esimCount: sql<number>`count(${purchasedEsims.id})`,
        })
        .from(companies)
        .innerJoin(employees, eq(companies.id, employees.companyId))
        .innerJoin(purchasedEsims, eq(employees.id, purchasedEsims.employeeId))
        .where(
          and(
            isNull(purchasedEsims.invoicedAt), // Not yet invoiced
            gte(purchasedEsims.purchaseDate, new Date(startOfDay)),
            lt(purchasedEsims.purchaseDate, new Date(endOfDay))
          )
        )
        .groupBy(companies.id, companies.name, companies.contactEmail);

      if (companiesWithNewEsims.length === 0) {
        console.log('[Billing Scheduler] No new eSIMs to bill today');
        return;
      }

      console.log(`[Billing Scheduler] Found ${companiesWithNewEsims.length} companies with new eSIMs to bill`);

      let totalBills = 0;
      let totalEsims = 0;

      // Process each company
      for (const company of companiesWithNewEsims) {
        try {
          if (dryRun) {
            console.log(`[Billing Scheduler] DRY RUN: Would bill ${company.esimCount} eSIMs for ${company.companyName}`);
            totalBills++;
            totalEsims += company.esimCount;
            continue;
          }

          console.log(`[Billing Scheduler] Creating bill for ${company.companyName} (${company.esimCount} eSIMs)`);

          // Generate automatic bill for this company's today's eSIMs
          const bill = await billingService.generateManualBill({
            companyId: company.companyId,
            startDate: startOfDay,
            endDate: startOfDay,
            esimIds: [] // Will auto-select all uninvoiced eSIMs for the date range
          });

          if (bill) {
            totalBills++;
            totalEsims += company.esimCount;
            console.log(`[Billing Scheduler] ✅ Created bill ${bill.billNumber} for ${company.companyName}`);
          } else {
            console.error(`[Billing Scheduler] ❌ Failed to create bill for ${company.companyName} - no eSIMs to bill`);
          }

        } catch (error) {
          console.error(`[Billing Scheduler] ❌ Error processing company ${company.companyName}:`, error);
        }
      }

      const summary = dryRun ? 'DRY RUN SUMMARY' : 'BILLING SUMMARY';
      console.log(`[Billing Scheduler] ${summary}: ${dryRun ? 'Would create' : 'Created'} ${totalBills} bills for ${totalEsims} eSIMs`);

    } catch (error) {
      console.error('[Billing Scheduler] ❌ Error during daily billing:', error);
    }
  }

  /**
   * Run daily credit notes process
   * @param dryRun - If true, only logs what would be credited without creating actual credit notes
   */
  async runDailyCreditNotes(dryRun = false) {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      console.log(`[Credit Note Scheduler] ${dryRun ? 'DRY RUN: ' : ''}Processing cancelled eSIMs on ${startOfDay.toISOString().split('T')[0]}`);

      const companiesWithCancellations = await db
        .select({
          companyId: companies.id,
          companyName: companies.name,
          contactEmail: companies.contactEmail,
          cancelledCount: sql<number>`count(${purchasedEsims.id})`,
        })
        .from(companies)
        .innerJoin(employees, eq(companies.id, employees.companyId))
        .innerJoin(purchasedEsims, eq(employees.id, purchasedEsims.employeeId))
        .where(
          and(
            eq(purchasedEsims.status, 'cancelled'),
            isNotNull(purchasedEsims.cancelledAt),
            gte(purchasedEsims.cancelledAt, new Date(startOfDay)),
            lt(purchasedEsims.cancelledAt, new Date(endOfDay)),
            isNull(purchasedEsims.creditNoteId)
          )
        )
        .groupBy(companies.id, companies.name, companies.contactEmail);

      if (companiesWithCancellations.length === 0) {
        console.log('[Credit Note Scheduler] No cancelled eSIMs to credit today');
        return;
      }

      console.log(`[Credit Note Scheduler] Found ${companiesWithCancellations.length} companies with cancelled eSIMs`);

      let totalCreditNotes = 0;
      let totalCancelledEsims = 0;

      for (const company of companiesWithCancellations) {
        try {
          if (dryRun) {
            console.log(`[Credit Note Scheduler] DRY RUN: Would credit ${company.cancelledCount} cancelled eSIMs for ${company.companyName}`);
            totalCreditNotes++;
            totalCancelledEsims += company.cancelledCount;
            continue;
          }

          console.log(`[Credit Note Scheduler] Creating credit note for ${company.companyName} (${company.cancelledCount} cancelled eSIMs)`);

          const creditNote = await creditNoteService.generateCreditNoteForCompany(company.companyId, today);

          if (creditNote) {
            totalCreditNotes++;
            totalCancelledEsims += company.cancelledCount;
            console.log(`[Credit Note Scheduler] ✅ Created credit note ${creditNote.creditNoteNumber} for ${company.companyName}`);
            
            await creditNoteService.sendCreditNoteEmail(creditNote.id);
          } else {
            console.error(`[Credit Note Scheduler] ❌ Failed to create credit note for ${company.companyName}`);
          }

        } catch (error) {
          console.error(`[Credit Note Scheduler] ❌ Error processing company ${company.companyName}:`, error);
        }
      }

      const summary = dryRun ? 'DRY RUN SUMMARY' : 'CREDIT NOTE SUMMARY';
      console.log(`[Credit Note Scheduler] ${summary}: ${dryRun ? 'Would create' : 'Created'} ${totalCreditNotes} credit notes for ${totalCancelledEsims} cancelled eSIMs`);

    } catch (error) {
      console.error('[Credit Note Scheduler] ❌ Error during daily credit notes:', error);
    }
  }

  /**
   * Manually trigger billing for a specific date (for testing or catch-up)
   */
  async runBillingForDate(date: string, dryRun = false) {
    try {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);

      console.log(`[Billing Scheduler] ${dryRun ? 'DRY RUN: ' : ''}Manual billing for date: ${date}`);

      // Same logic as daily billing but for specific date
      const companiesWithEsims = await db
        .select({
          companyId: companies.id,
          companyName: companies.name,
          contactEmail: companies.contactEmail,
          esimCount: sql<number>`count(${purchasedEsims.id})`,
        })
        .from(companies)
        .innerJoin(employees, eq(companies.id, employees.companyId))
        .innerJoin(purchasedEsims, eq(employees.id, purchasedEsims.employeeId))
        .where(
          and(
            isNull(purchasedEsims.invoicedAt),
            gte(purchasedEsims.purchaseDate, new Date(startOfDay)),
            lt(purchasedEsims.purchaseDate, new Date(endOfDay))
          )
        )
        .groupBy(companies.id, companies.name, companies.contactEmail);

      for (const company of companiesWithEsims) {
        if (dryRun) {
          console.log(`[Billing Scheduler] DRY RUN: Would bill ${company.esimCount} eSIMs for ${company.companyName}`);
          continue;
        }

        const bill = await billingService.generateManualBill({
          companyId: company.companyId,
          startDate: targetDate,
          endDate: targetDate,
          esimIds: []
        });

        if (bill) {
          console.log(`[Billing Scheduler] ✅ Created bill ${bill.billNumber} for ${company.companyName}`);
        }
      }

      return { success: true, companiesProcessed: companiesWithEsims.length };

    } catch (error) {
      console.error(`[Billing Scheduler] ❌ Error during manual billing for ${date}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      nextRun: this.getNextRunTime(),
      timezone: 'UTC'
    };
  }

  private getNextRunTime() {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(23, 59, 0, 0);
    
    // If we've passed today's 11:59 PM, schedule for tomorrow
    if (now.getHours() >= 23 && now.getMinutes() >= 59) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return nextRun.toISOString();
  }
}

export const billingScheduler = new BillingSchedulerService();