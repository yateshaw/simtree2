# eSIM Management Platform

## Overview
This platform is a comprehensive B2B eSIM management solution for enterprise telecommunications provisioning. It enables companies to manage eSIM provisioning, executive assignments, and telecommunications tracking via a secure web application. The business vision is to provide a robust, scalable, and user-friendly platform that streamlines eSIM operations for enterprises, tapping into the growing market for flexible and globally connected mobile solutions.

## User Preferences
Preferred communication style: Simple, everyday language.

### Data Usage Display Units
- Use GB as the default unit for data usage display
- Only switch to MB when the plan limit is less than 1GB
- Format: "Used/Limit Unit Percentage" (e.g., "0.00/1.50GB 0%" or "0/100MB 0%")

## System Architecture
The application employs a full-stack monorepo architecture with shared types.

### Frontend
- **Technology**: React with TypeScript.
- **UI/UX**: Utilizes Radix UI primitives and Shadcn/UI for modern components.
- **Styling**: Tailwind CSS with custom theme configurations.
- **State Management**: TanStack Query for server state.
- **Build System**: Vite.
- **UI/UX Decisions**: Focus on a clean, professional interface with consistent design patterns, ensuring clarity for complex telecommunications data.

### Backend
- **Technology**: Express.js REST API with TypeScript.
- **Database Layer**: PostgreSQL with Drizzle ORM for type-safe operations.
- **Authentication**: Session-based using Express-session (Passport.js integration).
- **API Structure**: RESTful endpoints organized by feature domains.
- **Real-time Updates**: Transitioned from polling to Server-Sent Events (SSE) for real-time data updates (e.g., eSIM purchases, status changes, wallet updates).
- **Performance Optimizations (August 2025)**: Server startup optimized by deferring background jobs, eliminated React Suspense conflicts, reduced database overhead, and streamlined authentication for faster loading.

### Database Schema
Multi-tenant architecture supporting:
- **Companies**: Business entities.
- **Users**: Role-based access (admins, executives).
- **eSIM Plans**: Available telecommunications plans.
- **Purchased eSIMs**: Active assignments.
- **Wallets**: Financial tracking for platform owner (SimTree) and client companies.
- **Executives**: End-users receiving eSIMs.

### Wallet System
A sophisticated multi-wallet system with four types for the platform owner (SimTree):
- **General**: Records all transactions across the company
- **Profit**: Tracks profit margins from eSIM sales  
- **Provider**: Manages costs paid to eSIM providers (labeled as "eSIM Access Payments" in UI)
- **Stripe Fees**: Tracks Stripe payment processing fees (Added August 2025)

Client companies maintain a single general wallet for managing their eSIM purchases, refunds, and balance tracking.

#### Stripe Payment Processing (Updated August 2025)
- **User Interface**: All processing fees are completely hidden from users - they only see the credit amount they're purchasing
- **Backend Processing**: When admin users make Stripe payments, all fees are automatically:
  - Deducted from the profit wallet only (no longer split between profit and stripe_fees wallets)
  - International cards incur additional 1% fee, also deducted from profit wallet
  - Fee transactions are linked to main payment via relatedTransactionId for audit trails
- **Fee Calculation**: Standard Stripe rates (2.9% + $0.30) plus 1% for international cards, all absorbed by the platform and deducted from profit wallet
- **International Card Detection**: Fully automated server-side detection using Stripe's Payment Method API to retrieve card country data, ensuring accurate fee calculation regardless of frontend limitations

### Data Flow & Core Features
- **Authentication**: Session-based login.
- **Company Management**: Admins manage organizations and executives.
- **eSIM Provisioning**: Integration with eSIM provider APIs for real-time provisioning.
- **Usage Tracking**: Real-time monitoring of data usage.
- **Financial Transactions**: Wallet-based system for purchases and billing, including a secure Stripe payment integration.
- **Notifications**: Enhanced email notifications with comprehensive plan details.
- **Scalability/Performance**: Optimized for reduced compute usage by eliminating redundant polling and deferring non-essential startup operations.
- **URL Management**: Comprehensive system for consistent local and production URL handling.

## External Dependencies

### Core Services
- **Database**: PostgreSQL (Neon serverless).
- **Email Service**: SendGrid for transactional emails.
- **Payment Processing**: Stripe for subscription and payment management.
- **eSIM Provider**: eSIM Access API for telecommunications services.

### Development Tools
- **TypeScript**: For type safety.
- **Drizzle Kit**: For database migrations.
- **ESBuild**: For server-side bundling.
- **Vite**: For client-side development and building.

## Security Architecture (Updated August 2025)

### Authentication & Authorization
- **Session-based Authentication**: Express-session with Passport.js integration for secure user sessions
- **Role-based Access Control**: Three-tier system (company users, admins, super admins) with proper middleware enforcement
- **Password Security**: PBKDF2 with 100,000 iterations, random salt, and timing-safe comparison to prevent timing attacks
- **Super Admin Protection**: Environment-based password configuration (SADMIN_PASSWORD) with no hardcoded credentials

### Rate Limiting & DoS Protection
- **Global Rate Limiting**: 1,000 requests per 15 minutes per IP address to prevent abuse
- **Authentication Rate Limiting**: Strict 10 login attempts per 15 minutes per IP to prevent brute force attacks
- **Input Validation**: Comprehensive parameter validation for all database queries to prevent SQL injection

### Data Protection
- **Input Sanitization**: All user inputs validated with type checking and format validation
- **SQL Injection Prevention**: Parameterized queries with Drizzle ORM and input validation
- **Access Control**: Admin-only routes properly protected with authentication and authorization middleware
- **Error Handling**: Production-safe error responses that don't expose sensitive system information

### Logging & Monitoring Security
- **Sensitive Data Protection**: Removed all sensitive information (API keys, passwords, personal data) from logs
- **Debug Information**: Production-ready logging that maintains functionality without security risks
- **Audit Trail**: Transaction logging for financial operations with proper redaction of sensitive details

### API Security
- **Route Protection**: All admin routes require proper authentication and super admin privileges
- **Parameter Validation**: ID parameters validated as positive integers to prevent injection attacks
- **Webhook Security**: Debug webhook routes restricted to super admin access with input validation

## DB Usage Monitor (October 2025)

A proactive monitoring system that tracks Neon database resource usage and sends automated alerts when approaching free-tier limits.

### Features
- **Dual-Cron Scheduling**: 
  - Connections: Checked every 5 minutes
  - Storage: Checked every 1 hour
- **Automated Alerts**: Email notifications sent when usage reaches 90% threshold
- **Smart Throttling**: Maximum one alert per 24 hours per metric type to prevent alert fatigue
- **ConfigService Integration**: Throttle timestamps stored in `system_config` table for persistence

### Technical Implementation
- **SQL Queries**: Direct queries to `pg_stat_activity` and `pg_database_size()` for real-time metrics
- **Resource Safety**: Reuses existing Neon connection pool (no additional connections)
- **Email Service**: Leverages existing SendGrid integration via `sendEmail()` function
- **Error Handling**: Comprehensive try/catch blocks with detailed logging
- **Startup Behavior**: Deferred 60 seconds after server start to avoid blocking initialization

### Configuration (Environment Variables)
- `USAGE_MONITOR_ENABLED`: Enable/disable the monitor (default: true)
- `CONN_MONITOR_CRON`: Connection check schedule (default: "*/5 * * * *")
- `STORAGE_MONITOR_CRON`: Storage check schedule (default: "0 * * * *")
- `USAGE_THRESHOLD`: Alert threshold percentage (default: 0.9 for 90%)
- `NEON_FREE_TIER_BYTES`: Storage limit in bytes (default: 1073741824 = 1GB)
- `NEON_MAX_CONN`: Maximum connections limit (default: 3)
- `ALERT_EMAIL_TO`: Recipient email for alerts (default: yateshaw@gmail.com)

### Alert Email Contents
Each alert includes:
- Timestamp (UTC ISO format)
- Current usage vs. limit with percentage
- Alert threshold setting
- Next eligible alert time (lastSent + 24h)
- Actionable recommendations (data cleanup, query optimization, plan upgrade)

## Automated Database Backup System (November 2025)

A comprehensive three-tier backup system for disaster recovery and data protection with Google Drive integration.

### Backup Types

#### 1. Daily Full Backup
- **Schedule**: 03:00 AM Buenos Aires time (America/Argentina/Buenos_Aires)
- **Scope**: Complete database dump (all tables and data)
- **Retention**: 14 backups (2 weeks) with automatic cleanup
- **Implementation**: `server/jobs/backup-db.job.ts`
- **Status**: Production-only, automated via cron

#### 2. Hourly Incremental Backup
- **Schedule**: Every hour at minute 0 (0 * * * *)
- **Scope**: Critical tables only (wallets, wallet_transactions, purchased_esims)
- **Retention**: 48 backups (2 days) with automatic cleanup
- **Implementation**: `server/jobs/backup-hourly.job.ts`
- **Status**: Production-only, automated via cron

#### 3. Schema-Only Backup
- **Schedule**: Manual trigger only (`npx tsx scripts/backup-schema.ts`)
- **Scope**: Database structure without data
- **Retention**: Permanent (no automatic deletion)
- **Implementation**: `scripts/backup-schema.ts`
- **Status**: Manual execution for schema version control

### Technical Implementation
- **Backup Format**: PostgreSQL dump compressed with gzip
- **Storage**: Google Drive using service account authentication
- **Logging**: All backups logged to `backups` table with type, timestamp, size, and Drive file ID
- **Notifications**: Email alerts to yateshaw@gmail.com for all backup operations (success/failure)
- **Error Handling**: Graceful failure handling with detailed error logging and notifications
- **Single-Run Semantics**: Prevents overlapping backup operations via `isRunning` flag

### Configuration (Environment Variables)
- `GOOGLE_SERVICE_ACCOUNT_JSON`: Service account credentials for Google Drive API
- `GOOGLE_DRIVE_FOLDER_ID`: Folder ID for daily backups
- `HOURLY_DRIVE_FOLDER_ID`: Folder ID for hourly backups
- `SCHEMA_DRIVE_FOLDER_ID`: Folder ID for schema backups
- `DATABASE_URL`: Neon PostgreSQL connection string
- `NODE_ENV=production`: Required for automated cron scheduling

### Database Schema Changes
- Added `type` column to `backups` table (DEFAULT 'daily')
- Values: 'daily', 'hourly', 'schema'
- Enables tracking and filtering by backup type

### Architecture Notes
- **Delayed Initialization**: 90-second delay after server start to avoid blocking startup
- **Timezone Support**: All cron jobs use Buenos Aires timezone (America/Argentina/Buenos_Aires)
- **Retention Management**: Enhanced `driveService.manageRetention()` accepts optional `folderId` parameter for multi-folder management
- **Production Guard**: Backup schedulers only activate when `NODE_ENV === 'production'`

### File Naming Convention
- Daily: `simtree-backup-YYYYMMDD-HHMMSS.sql.gz`
- Hourly: `simtree-hourly-backup-YYYYMMDD-HHMMSS.sql.gz`
- Schema: `simtree-schema-backup-YYYYMMDD-HHMMSS.sql.gz`

## Billing PDF Storage (January 2026)

Permanent storage of billing documents (receipts, invoices, credit notes) to Google Drive shared unit "Simtree billing".

### Document Types & Timing

| Document Type | When Generated | Storage Timing |
|---------------|----------------|----------------|
| Receipts | Immediately on credit addition | Stored immediately |
| Invoices | End of day (daily billing job) | Stored when email sent |
| Credit Notes | End of day (daily credit note job) | Stored when email sent |

### Google Drive Folder Structure
- **Shared Unit**: Simtree billing
- **RECEIPTS folder**: Stores receipt PDFs
- **INVOICES folder**: Stores invoice PDFs
- **CREDIT NOTES folder**: Stores credit note PDFs

### Configuration (Environment Variables)
- `RECEIPTS_DRIVE_FOLDER_ID`: Folder ID for receipts
- `INVOICES_DRIVE_FOLDER_ID`: Folder ID for invoices
- `CREDIT_NOTES_DRIVE_FOLDER_ID`: Folder ID for credit notes
- `GOOGLE_SERVICE_ACCOUNT_JSON`: Service account credentials (shared with backup system)
- `PROD_DATABASE_URL`: Production database URL (used for production detection)

### Production-Only Behavior
PDFs are only stored when `DATABASE_URL` matches `PROD_DATABASE_URL`, ensuring development data is not uploaded to Google Drive.

### File Naming Convention
- Receipts: `RCP-{companyName}-{date}-{sequence}.pdf` (e.g., `RCP-AcmeCorp-20260106-0001.pdf`)
- Invoices: `BILL-{companyName}-{date}-{sequence}.pdf` (e.g., `BILL-AcmeCorp-20260106-0001.pdf`)
- Credit Notes: `CN-{companyName}-{date}-{sequence}.pdf` (e.g., `CN-AcmeCorp-20260106-0001.pdf`)

### Technical Implementation
- **Service**: `server/services/pdf-storage.service.ts`
- **Integration**: Calls from `server/services/email.ts` after PDF generation
- **Storage**: Uses existing `driveService` with `supportsAllDrives` for Shared Drive access