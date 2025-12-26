import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, gte } from 'drizzle-orm';
import { sendEmail as baseSendEmail } from './email.service';

interface EmailData {
  to: string | string[];
  subject: string;
  template: string;
  templateData: Record<string, any>;
  priority?: 'critical' | 'high' | 'normal' | 'low';
}

export class EmailRetryService {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s

  static async sendWithRetry(emailData: EmailData): Promise<boolean> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        await baseSendEmail(emailData);

        console.log(`[EmailRetry] Email sent successfully on attempt ${attempt}/${this.MAX_RETRIES}`);
        console.log(`[EmailRetry]   To: ${Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to}`);
        console.log(`[EmailRetry]   Subject: ${emailData.subject}`);

        return true;
      } catch (error: any) {
        console.error(`[EmailRetry] Email attempt ${attempt}/${this.MAX_RETRIES} failed:`, {
          to: emailData.to,
          subject: emailData.subject,
          error: error.message
        });

        if (attempt === this.MAX_RETRIES) {
          await this.logFailedEmail(emailData, error, attempt);

          if (emailData.priority === 'critical') {
            await this.sendFailureAlert(emailData, error);
          }

          return false;
        }

        const delay = this.RETRY_DELAYS[attempt - 1];
        console.log(`[EmailRetry]   Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    return false;
  }

  private static async logFailedEmail(
    emailData: EmailData,
    error: Error,
    attemptCount: number
  ): Promise<void> {
    try {
      await db.insert(schema.failedEmails).values({
        recipient: Array.isArray(emailData.to) ? emailData.to.join(',') : emailData.to,
        subject: emailData.subject,
        template: emailData.template,
        templateData: JSON.stringify(emailData.templateData),
        attemptCount,
        lastError: error.message,
        priority: emailData.priority || 'normal',
      });

      console.log('[EmailRetry] Failed email logged to database for manual review');
    } catch (dbError) {
      console.error('[EmailRetry] Failed to log email failure to database:', dbError);
    }
  }

  private static async sendFailureAlert(
    emailData: EmailData,
    error: Error
  ): Promise<void> {
    try {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SENDER_EMAIL;
      if (!adminEmail) {
        console.error('[EmailRetry] No admin email configured for failure alerts');
        return;
      }

      await baseSendEmail({
        to: adminEmail,
        subject: 'Critical Email Delivery Failure',
        template: 'email-failure-alert',
        templateData: {
          failedRecipient: emailData.to,
          failedSubject: emailData.subject,
          errorMessage: error.message,
          timestamp: new Date().toISOString()
        }
      });
    } catch (alertError) {
      console.error('[EmailRetry] Failed to send failure alert:', alertError);
    }
  }

  static async retryFailedEmails(maxAgeHours: number = 24): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours);

    const failed = await db
      .select()
      .from(schema.failedEmails)
      .where(
        and(
          gte(schema.failedEmails.createdAt, cutoffDate),
          eq(schema.failedEmails.retried, false)
        )
      )
      .limit(100);

    let successCount = 0;

    for (const email of failed) {
      const emailData: EmailData = {
        to: email.recipient,
        subject: email.subject,
        template: email.template,
        templateData: JSON.parse(email.templateData),
        priority: email.priority as any
      };

      const success = await this.sendWithRetry(emailData);

      if (success) {
        await db
          .update(schema.failedEmails)
          .set({ retried: true, retriedAt: new Date() })
          .where(eq(schema.failedEmails.id, email.id));

        successCount++;
      }
    }

    console.log(`[EmailRetry] Retried ${failed.length} failed emails, ${successCount} successful`);
    return successCount;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
