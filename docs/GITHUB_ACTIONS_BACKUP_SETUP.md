# GitHub Actions Database Backup Setup

This guide explains how to configure automated database backups via GitHub Actions. The backups run independently of your application server, so they work even when your server is off.

## Overview

GitHub Actions performs the backup directly:

1. **pg_dump** exports the database from GitHub's infrastructure
2. **gzip** compresses the backup (level 9)
3. **Google Drive API** uploads the backup
4. **Email notification** is sent via SendGrid
5. **Retention management** removes old backups

## Backup Schedule

| Type | Schedule | Retention |
|------|----------|-----------|
| Daily (full database) | 06:00 UTC (03:00 AM Buenos Aires) | 14 backups |
| Hourly (critical tables) | Every 4 hours | 48 backups |

Critical tables for hourly backup: `wallets`, `wallet_transactions`, `purchased_esims`

## Required GitHub Secrets

Configure these in your GitHub repository: **Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `PROD_DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Service Account JSON (entire content) | `{"type":"service_account",...}` |
| `GOOGLE_DRIVE_FOLDER_ID` | Daily backup folder ID | `1abc123...` |
| `HOURLY_DRIVE_FOLDER_ID` | Hourly backup folder ID | `1xyz456...` |
| `SENDGRID_API_KEY` | SendGrid API key | `SG.xxx...` |
| `SENDGRID_FROM_EMAIL` | Sender email | `backups@yourdomain.com` |
| `BACKUP_NOTIFICATION_EMAIL` | Where to send notifications | `admin@yourdomain.com` |

## Google Cloud Setup

### 1. Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Enable the **Google Drive API**:
   - Go to APIs & Services → Library
   - Search for "Google Drive API"
   - Click Enable

4. Create a Service Account:
   - Go to IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Name: `backup-service` (or any name)
   - Click Create and Continue
   - Skip optional permissions
   - Click Done

5. Create a key:
   - Click on the service account
   - Go to Keys tab
   - Add Key → Create new key → JSON
   - Download the JSON file

6. Copy the **entire JSON content** into the `GOOGLE_SERVICE_ACCOUNT_JSON` secret

### 2. Create Google Drive Folders

1. Create two folders in Google Drive:
   - `Database Backups - Daily`
   - `Database Backups - Hourly`

2. Share each folder with the service account:
   - Right-click folder → Share
   - Add the service account email (from the JSON `client_email` field)
   - Give "Editor" access

3. Get folder IDs:
   - Open each folder
   - Copy the ID from the URL: `drive.google.com/drive/folders/[FOLDER_ID]`

## Manual Backup

You can trigger a backup manually anytime:

1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **"Database Backup to Google Drive"**
4. Click **"Run workflow"**
5. Choose backup type (daily or hourly)
6. Click **"Run workflow"**

## Workflow File Location

The workflow is at: `.github/workflows/database-backup.yml`

## Troubleshooting

### Backup fails with "DATABASE_URL not configured"
- Verify `PROD_DATABASE_URL` is set in GitHub Secrets
- Check the connection string format is correct

### Google Drive upload fails
- Verify `GOOGLE_SERVICE_ACCOUNT_JSON` contains valid JSON
- Check the service account has Editor access to the folder
- Verify folder IDs are correct

### No email notifications
- Check `SENDGRID_API_KEY` is valid
- Verify sender email is verified in SendGrid
- Check `BACKUP_NOTIFICATION_EMAIL` is correct

### View workflow logs
1. Go to Actions tab in GitHub
2. Click on the failed run
3. Expand the failed step to see detailed logs

## Security Notes

- All secrets are encrypted by GitHub
- Database credentials never appear in logs (masked)
- Backups are compressed and uploaded directly to Google Drive
- Service account has minimal permissions (drive.file scope only)
