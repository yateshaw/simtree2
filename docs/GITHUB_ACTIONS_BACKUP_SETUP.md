# GitHub Actions Database Backup Setup

This guide explains how to configure automated database backups via GitHub Actions.

## Overview

The backup system uses GitHub Actions to trigger database backups on a schedule. When triggered, GitHub Actions calls a secure webhook endpoint in your application, which initiates the backup process:

1. **pg_dump** exports the database
2. **gzip** compresses the backup (level 9)
3. **Google Drive API** uploads the backup
4. **Email notification** is sent via SendGrid
5. **Retention management** removes old backups

## Required GitHub Secrets

Configure these secrets in your GitHub repository (Settings → Secrets and variables → Actions):

### 1. APP_URL
Your application's production URL (without trailing slash).

```
https://your-app.replit.app
```

### 2. BACKUP_WEBHOOK_SECRET
A secure random string for authenticating webhook requests. Generate one with:

```bash
openssl rand -hex 32
```

Example: `a1b2c3d4e5f6789...`

**Important**: This same secret must be set in your Replit app's environment variables.

## Required Replit Environment Variables

In your Replit app (Secrets tab), ensure these are configured:

| Variable | Description |
|----------|-------------|
| `BACKUP_WEBHOOK_SECRET` | Must match the GitHub secret exactly |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud Service Account credentials (JSON) |
| `GOOGLE_DRIVE_FOLDER_ID` | Google Drive folder ID for daily backups |
| `HOURLY_DRIVE_FOLDER_ID` | Google Drive folder ID for incremental backups |
| `SENDGRID_API_KEY` | SendGrid API key for email notifications |
| `SENDGRID_FROM_EMAIL` | Sender email address for notifications |

## Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable the **Google Drive API**
4. Create a **Service Account**:
   - Go to IAM & Admin → Service Accounts
   - Create Service Account
   - Download JSON credentials
5. Copy the entire JSON content into `GOOGLE_SERVICE_ACCOUNT_JSON`
6. Create folders in Google Drive for backups
7. Share each folder with the service account email (found in JSON as `client_email`)
   - Give "Editor" access
8. Get folder IDs from the URL (after `/folders/`)

## Backup Schedule

The GitHub Actions workflow runs:

- **Daily Full Backup**: 06:00 UTC (03:00 AM Buenos Aires)
- **Manual Triggers**: Via GitHub Actions UI (workflow_dispatch)

### Manual Backup

1. Go to your GitHub repository
2. Click "Actions" tab
3. Select "Database Backup to Google Drive"
4. Click "Run workflow"
5. Choose backup type (daily or hourly/incremental)

## Retention Policy

| Backup Type | Retention |
|-------------|-----------|
| Daily (full) | 14 backups (~2 weeks) |
| Hourly (incremental) | 48 backups (~8 days) |

Older backups are automatically deleted to manage storage.

## API Endpoints

### Trigger Backup
```
POST /api/webhooks/github-backup
Header: X-GitHub-Backup-Secret: <your-secret>
Body: { "type": "daily" | "hourly", "triggered_by": "github_actions" }
```

### Check Status
```
GET /api/webhooks/github-backup/status
Header: X-GitHub-Backup-Secret: <your-secret>
```

### Backup History
```
GET /api/webhooks/github-backup/history?limit=10
Header: X-GitHub-Backup-Secret: <your-secret>
```

## Troubleshooting

### Backup not running
1. Check GitHub Actions logs for errors
2. Verify `APP_URL` is correct and accessible
3. Confirm `BACKUP_WEBHOOK_SECRET` matches in both GitHub and Replit

### Upload fails
1. Verify Google Drive API is enabled
2. Check service account has folder access
3. Confirm folder IDs are correct

### No email notifications
1. Verify `SENDGRID_API_KEY` is valid
2. Check sender email is verified in SendGrid
3. Review application logs for email errors

## Security Notes

- The webhook secret is transmitted via HTTP header, not URL
- All requests require valid secret authentication
- Backups are compressed and streamed directly to Google Drive
- No temporary files are stored locally
