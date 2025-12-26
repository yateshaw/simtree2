# Database Backup System Guide

## Overview
This platform implements a comprehensive three-tier automated backup system for the Neon PostgreSQL database with Google Drive integration.

## Backup Types

### 1. Daily Full Backup
- **Schedule**: 03:00 AM Buenos Aires time (America/Argentina/Buenos_Aires)
- **Scope**: Complete database dump (all tables and data)
- **Retention**: 14 backups (2 weeks)
- **Environment Variables Required**:
  - `GOOGLE_DRIVE_FOLDER_ID` - Google Drive folder for daily backups
  - `GOOGLE_SERVICE_ACCOUNT_JSON` - Service account credentials (JSON string)
  - `DATABASE_URL` - Neon PostgreSQL connection string
- **File**: `server/jobs/backup-db.job.ts`
- **Status**: Automatically runs in production mode

### 2. Hourly Incremental Backup
- **Schedule**: Every hour at minute 0 (0 * * * *)
- **Scope**: Critical tables only:
  - `wallets`
  - `wallet_transactions`
  - `purchased_esims`
- **Retention**: 48 backups (2 days)
- **Environment Variables Required**:
  - `HOURLY_DRIVE_FOLDER_ID` - Google Drive folder for hourly backups
  - `GOOGLE_SERVICE_ACCOUNT_JSON` - Service account credentials (JSON string)
  - `DATABASE_URL` - Neon PostgreSQL connection string
- **File**: `server/jobs/backup-hourly.job.ts`
- **Status**: Automatically runs in production mode

### 3. Schema-Only Backup
- **Schedule**: Manual trigger only
- **Scope**: Database structure only (no data)
- **Retention**: Permanent (no automatic deletion)
- **Environment Variables Required**:
  - `SCHEMA_DRIVE_FOLDER_ID` - Google Drive folder for schema backups
  - `GOOGLE_SERVICE_ACCOUNT_JSON` - Service account credentials (JSON string)
  - `DATABASE_URL` - Neon PostgreSQL connection string
- **File**: `scripts/backup-schema.ts`
- **Status**: Run manually when needed

## Setup Instructions

### 1. Google Drive Setup

#### Create Service Account
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "Service Account"
5. Fill in service account details and create
6. Click on the service account and go to "Keys" tab
7. Click "Add Key" > "Create New Key" > "JSON"
8. Download the JSON file

#### Create Google Drive Folders
1. Create three separate folders in Google Drive:
   - "Daily Backups" - for full daily backups
   - "Hourly Backups" - for incremental hourly backups
   - "Schema Backups" - for manual schema backups
2. Share each folder with the service account email (found in the JSON file)
3. Give the service account "Editor" permissions
4. Copy each folder ID from the URL (e.g., `https://drive.google.com/drive/folders/{FOLDER_ID}`)

### 2. Environment Variables

Add the following to your `.env` file or Replit Secrets:

```bash
# Google Drive Authentication
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'

# Google Drive Folder IDs
GOOGLE_DRIVE_FOLDER_ID='folder_id_for_daily_backups'
HOURLY_DRIVE_FOLDER_ID='folder_id_for_hourly_backups'
SCHEMA_DRIVE_FOLDER_ID='folder_id_for_schema_backups'

# Database Connection (should already be set)
DATABASE_URL='postgresql://...'

# Production Mode (required for automated backups)
NODE_ENV='production'
```

## Manual Backup Execution

### Daily Full Backup
```bash
# Not recommended - this is automated in production
# Only run manually for testing or emergency backups
```

### Hourly Incremental Backup
```bash
# Not recommended - this is automated in production
# Only run manually for testing or emergency backups
```

### Schema-Only Backup
```bash
# Run this command whenever you need a schema backup
npx tsx scripts/backup-schema.ts
```

## Backup Logs

All backup operations are logged to the `backups` table in the database with:
- Timestamp
- Filename
- File size
- Google Drive file ID
- Backup type ('daily', 'hourly', or 'schema')

## Email Notifications

All backup operations send email notifications to `yateshaw@gmail.com` with:
- Backup status (success/failure)
- Filename and size
- Timestamp
- Error details (if failed)

## Troubleshooting

### Backup Not Running
1. **Check NODE_ENV**: Automated backups only run in production mode
   ```bash
   echo $NODE_ENV
   # Should output: production
   ```

2. **Check Environment Variables**:
   ```bash
   # Verify all required variables are set
   env | grep -E "(GOOGLE_|DATABASE_URL|DRIVE_FOLDER)"
   ```

3. **Check Server Logs**:
   ```bash
   # Look for backup scheduler initialization messages
   grep -i "backup" /path/to/server/logs
   ```

### Backup Failing
1. **Check Google Drive Permissions**: Ensure service account has Editor access to all folders
2. **Check Database Connection**: Verify `DATABASE_URL` is correct
3. **Check Service Account JSON**: Ensure `GOOGLE_SERVICE_ACCOUNT_JSON` is valid
4. **Check Email Logs**: Review notification emails for error details

### Manual Testing
To test backup functionality without waiting for cron schedules:

1. Create a test script `scripts/test-backup.ts`:
```typescript
import { backupHourlyJob } from '../server/jobs/backup-hourly.job';

async function test() {
  console.log('Testing hourly backup...');
  const result = await backupHourlyJob.run();
  console.log('Result:', result);
  process.exit(result.success ? 0 : 1);
}

test();
```

2. Run the test:
```bash
npx tsx scripts/test-backup.ts
```

## Monitoring

### Check Backup History
```sql
-- View recent backups
SELECT * FROM backups ORDER BY created_at DESC LIMIT 20;

-- Count backups by type
SELECT type, COUNT(*) as count 
FROM backups 
GROUP BY type;

-- Check backup sizes
SELECT 
  type,
  AVG(file_size) as avg_size,
  MAX(file_size) as max_size
FROM backups
WHERE file_size IS NOT NULL
GROUP BY type;
```

### Google Drive Folder Management
- Daily backups: Maximum 14 files (older files auto-deleted)
- Hourly backups: Maximum 48 files (older files auto-deleted)
- Schema backups: No automatic deletion (permanent retention)

## Architecture Notes

### Cron Scheduling
- Both daily and hourly backups use `node-cron` with timezone support
- Timezone: `America/Argentina/Buenos_Aires`
- Delayed initialization: 90 seconds after server start (to avoid blocking startup)

### Error Handling
- All backups implement graceful error handling
- Failed backups send error notifications via email
- Database logging continues even if Drive upload fails
- Single-run semantics prevent overlapping backup operations

### File Naming
- Daily: `simtree-backup-YYYYMMDD-HHMMSS.sql.gz`
- Hourly: `simtree-hourly-backup-YYYYMMDD-HHMMSS.sql.gz`
- Schema: `simtree-schema-backup-YYYYMMDD-HHMMSS.sql.gz`

## Security Considerations

1. **Service Account Permissions**: Use principle of least privilege
2. **Backup Encryption**: Files are compressed with gzip (consider encryption for sensitive data)
3. **Access Logs**: Monitor Google Drive access logs for unauthorized access
4. **Retention Policies**: Balance retention needs with storage costs and compliance requirements
