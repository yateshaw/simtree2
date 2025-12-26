# eSIM Management Platform

A comprehensive B2B eSIM management platform for enterprise telecommunications provisioning.

## Overview

This platform provides a complete solution for companies to manage eSIM provisioning, executive assignments, and telecommunications tracking. It includes user management, company administration, wallet-based payments, and comprehensive reporting.

## Key Features

- 🔐 **Enterprise Authentication**: Secure login and role-based access control
- 🌐 **eSIM Provisioning**: Direct integration with eSIM provider APIs 
- 👥 **Executive Management**: Assign and track eSIMs for company executives
- 💰 **Wallet System**: Prepaid wallet for easy eSIM purchases
- 💳 **Stripe Integration**: Process payments securely
- 📊 **Usage Tracking**: Monitor data usage across all company eSIMs
- 📱 **Device Management**: Track device associations and status
- 📧 **Email Notifications**: Automated alerts and communications

## Technical Stack

- **Frontend**: React with TypeScript, TanStack Query, Shadcn/UI components
- **Backend**: Express.js API with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Express-session with Passport.js
- **Payments**: Stripe API integration
- **Email**: SendGrid integration
- **Monitoring**: Custom service health monitoring system

## Development

To start development:

```bash
npm run dev
```

This will start both the backend and frontend in development mode.

## Deployment

For deployment instructions, please see [DEPLOY.md](./DEPLOY.md)

## Environment Variables

All environment variables are centralized in a single `.env` file at the root of the project. A `.env.example` file is provided as a template.

### Core Environment Settings
- `NODE_ENV`: Development or production environment (development, production)
- `APP_URL`: Application base URL (for links, callbacks, etc.)
- `PORT`: Server port (defaults to 5000 in development, 80 in production)
- `DATABASE_URL`: PostgreSQL connection string

### Authentication & Security
- `SESSION_SECRET`: Secret for session management

### Stripe Integration
- `STRIPE_SECRET_KEY`: Stripe API secret key (server-side)
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook secret
- `VITE_STRIPE_PUBLIC_KEY`: Stripe public key (client-side)

### Email Configuration (SendGrid)
- `SENDGRID_API_KEY`: SendGrid API key
- `SENDER_EMAIL`: Email address used as sender

### eSIM Provider API
- `ESIM_ACCESS_CODE`: eSIM provider access code
- `ESIM_ACCESS_SECRET`: eSIM provider secret key

### Client-side Settings (Vite)
- `VITE_API_URL`: API URL for client connections (development)

### Environment Variables Verification
Run the following command to check if all required environment variables are properly set:

```bash
node scripts/check-env.js
```

## License

All rights reserved. This codebase is proprietary and intended for use only by authorized parties.