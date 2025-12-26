import sgMail from '@sendgrid/mail';

const BACKUP_NOTIFICATION_EMAIL = 'yateshaw@gmail.com';
const fromEmail = process.env.SENDGRID_FROM_EMAIL 
  ? `Simtree Backup System <${process.env.SENDGRID_FROM_EMAIL}>` 
  : 'Simtree Backup System <hey@simtree.co>';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('[Backup Email Service] SendGrid API key configured successfully');
} else {
  console.warn('[Backup Email Service] SendGrid API key not configured - backup notifications will be skipped');
}

async function sendWithRetry(msg: any): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await sgMail.send(msg);
      console.log(`[Backup Email] Sent successfully on attempt ${attempt}/${MAX_RETRIES}`);
      return;
    } catch (error: any) {
      console.error(`[Backup Email] Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
      
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      
      const delay = RETRY_DELAYS[attempt - 1];
      console.log(`[Backup Email] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

interface BackupSuccessParams {
  filename: string;
  driveLink: string;
  size: number;
  timestamp: Date;
}

interface BackupErrorParams {
  error: string;
  stderr?: string;
}

export async function sendBackupSuccessEmail({
  filename,
  driveLink,
  size,
  timestamp,
}: BackupSuccessParams): Promise<void> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.warn('[Backup Email] SendGrid API key not configured, skipping email');
      return;
    }

    const sizeInMB = (size / 1024 / 1024).toFixed(2);
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 5px; }
          .content { background: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 5px; }
          .info-row { margin: 10px 0; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; }
          .button { background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Database Backup Successful</h1>
          </div>
          <div class="content">
            <p>The automated database backup has completed successfully.</p>
            
            <div class="info-row">
              <span class="label">Filename:</span>
              <span class="value">${filename}</span>
            </div>
            
            <div class="info-row">
              <span class="label">Size:</span>
              <span class="value">${sizeInMB} MB</span>
            </div>
            
            <div class="info-row">
              <span class="label">Timestamp:</span>
              <span class="value">${timestamp.toISOString()}</span>
            </div>
            
            <div class="info-row">
              <span class="label">Status:</span>
              <span class="value">Uploaded to Google Drive</span>
            </div>
            
            <a href="${driveLink}" class="button" target="_blank">View in Google Drive</a>
          </div>
          <div class="footer">
            <p>This is an automated notification from the Simtree Backup System.</p>
            <p>Backup retention: 14 days (older backups are automatically deleted)</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
✅ Database Backup Successful

The automated database backup has completed successfully.

Filename: ${filename}
Size: ${sizeInMB} MB
Timestamp: ${timestamp.toISOString()}
Status: Uploaded to Google Drive

View backup: ${driveLink}

This is an automated notification from the Simtree Backup System.
Backup retention: 14 days (older backups are automatically deleted)
    `.trim();

    const msg = {
      to: BACKUP_NOTIFICATION_EMAIL,
      from: fromEmail,
      subject: '✅ DB Backup Successful',
      text,
      html,
    };

    await sendWithRetry(msg);
    console.log(`[Backup Email] Success notification sent to ${BACKUP_NOTIFICATION_EMAIL}`);
  } catch (error) {
    console.error('[Backup Email] Failed to send success notification after all retries:', error);
  }
}

export async function sendBackupErrorEmail({
  error,
  stderr,
}: BackupErrorParams): Promise<void> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.warn('[Backup Email] SendGrid API key not configured, skipping email');
      return;
    }

    const errorDetails = stderr ? `${error}\n\nDetails:\n${stderr.slice(-500)}` : error;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 5px; }
          .content { background: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 5px; }
          .error-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; }
          pre { background: #f4f4f4; padding: 10px; overflow-x: auto; border-radius: 3px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>❌ Database Backup Failed</h1>
          </div>
          <div class="content">
            <p><strong>The automated database backup has failed.</strong></p>
            
            <div class="error-box">
              <h3>Error Details:</h3>
              <pre>${errorDetails.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>
            
            <p><strong>Action Required:</strong></p>
            <ul>
              <li>Check the application logs for more details</li>
              <li>Verify database connectivity</li>
              <li>Ensure Google Drive credentials are valid</li>
              <li>Check DRIVE_FOLDER_ID configuration</li>
            </ul>
          </div>
          <div class="footer">
            <p>This is an automated alert from the Simtree Backup System.</p>
            <p>Timestamp: ${new Date().toISOString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
❌ Database Backup Failed

The automated database backup has failed.

Error Details:
${errorDetails}

Action Required:
- Check the application logs for more details
- Verify database connectivity
- Ensure Google Drive credentials are valid
- Check DRIVE_FOLDER_ID configuration

Timestamp: ${new Date().toISOString()}

This is an automated alert from the Simtree Backup System.
    `.trim();

    const msg = {
      to: BACKUP_NOTIFICATION_EMAIL,
      from: fromEmail,
      subject: '❌ DB Backup Failed',
      text,
      html,
    };

    await sendWithRetry(msg);
    console.log(`[Backup Email] Error notification sent to ${BACKUP_NOTIFICATION_EMAIL}`);
  } catch (emailError) {
    console.error('[Backup Email] Failed to send error notification after all retries:', emailError);
  }
}
