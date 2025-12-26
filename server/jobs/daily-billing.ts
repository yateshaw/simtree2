import cron from 'node-cron';
import { createBillForCompany } from '../services/billing.service';
import { storage } from '../storage';

/**
 * Daily billing job that generates bills for eSIM purchases
 * Runs every day at 1 AM UTC
 */
export class DailyBillingJob {
  private scheduled = false;

  /**
   * Initialize and start the daily billing job
   */
  async initialize(): Promise<void> {
    try {
      console.log('[BillingJob] Initializing daily billing job...');
      
      // Schedule daily billing at 1 AM UTC
      cron.schedule('0 1 * * *', async () => {
        console.log('[BillingJob] 🧾 Starting scheduled daily billing generation...');
        await this.generateDailyBills();
      });

      this.scheduled = true;
      console.log('[BillingJob] ✅ Daily billing job scheduled for 1:00 AM UTC');
      
      // Also run immediately on startup if needed (for development/testing)
      if (process.env.NODE_ENV === 'development') {
        console.log('[BillingJob] 🔧 Running initial billing check for development...');
        await this.generateDailyBills();
      }
      
    } catch (error) {
      console.error('[BillingJob] ❌ Failed to initialize daily billing job:', error);
      throw error;
    }
  }

  /**
   * Generate daily bills for all companies with eSIM purchases from yesterday
   */
  private async generateDailyBills(): Promise<void> {
    try {
      // Get yesterday's date range (UTC)
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0); // Start of yesterday
      
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setUTCHours(23, 59, 59, 999); // End of yesterday

      console.log(`[BillingJob] Generating bills for period: ${yesterday.toISOString()} to ${endOfYesterday.toISOString()}`);
      
      // Get all companies that made eSIM purchases yesterday
      const companiesWithPurchases = await storage.getCompaniesWithEsimPurchases(yesterday, endOfYesterday);
      
      if (companiesWithPurchases.length === 0) {
        console.log('[BillingJob] No companies with eSIM purchases found for yesterday');
        return;
      }

      console.log(`[BillingJob] Found ${companiesWithPurchases.length} companies with eSIM purchases`);
      
      // Generate bill for each company
      let successCount = 0;
      let errorCount = 0;
      
      for (const company of companiesWithPurchases) {
        try {
          console.log(`[BillingJob] Generating bill for company: ${company.name} (ID: ${company.id})`);
          
          // Get the primary admin user for this company to send the bill
          const adminUsers = await storage.getUsersByCompanyId(company.id);
          const primaryAdmin = adminUsers.find((user: any) => user.role === 'admin') || adminUsers[0];
          
          if (!primaryAdmin || !primaryAdmin.email) {
            console.error(`[BillingJob] No admin user with email found for company ${company.id}`);
            errorCount++;
            continue;
          }
          
          await createBillForCompany({
            companyId: company.id,
            startDate: yesterday,
            endDate: endOfYesterday,
            recipientEmail: primaryAdmin.email
          });
          
          // Send daily eSIM purchase summary email
          try {
            const { sendDailyEsimSummaryEmail } = await import('../services/email');
            
            // Get eSIM purchases for this company for yesterday
            const purchasesWithDetails = await storage.getCompanyEsimPurchasesWithDetails(
              company.id, 
              yesterday, 
              endOfYesterday
            );
            
            if (purchasesWithDetails && purchasesWithDetails.length > 0) {
              await sendDailyEsimSummaryEmail(
                primaryAdmin.email,
                company,
                purchasesWithDetails,
                yesterday
              );
              console.log(`[BillingJob] ✅ Daily eSIM summary email sent to ${company.name}`);
            } else {
              console.log(`[BillingJob] ℹ️  No eSIM purchases found for summary email for ${company.name}`);
            }
          } catch (emailError) {
            console.error(`[BillingJob] ❌ Error sending daily summary email for company ${company.id}:`, emailError);
            // Don't fail the billing job if email fails
          }
          
          successCount++;
          console.log(`[BillingJob] ✅ Bill and summary generated successfully for ${company.name}`);
          
        } catch (error) {
          console.error(`[BillingJob] ❌ Error generating bill for company ${company.id}:`, error);
          errorCount++;
        }
      }
      
      console.log(`[BillingJob] 📊 Daily billing complete - Success: ${successCount}, Errors: ${errorCount}`);
      
    } catch (error) {
      console.error('[BillingJob] ❌ Error during daily billing generation:', error);
    }
  }

  /**
   * Stop the billing job (for cleanup)
   */
  stop(): void {
    if (this.scheduled) {
      console.log('[BillingJob] 🛑 Daily billing job stopped');
      this.scheduled = false;
    }
  }
}

// Export singleton instance
export const dailyBillingJob = new DailyBillingJob();