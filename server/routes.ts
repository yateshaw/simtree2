import type { Express } from "express";
import { createServer, type Server } from "http";
import fetch from 'node-fetch';
import { setupAuth, comparePasswords, requireAdmin, requireAuth } from "./auth";
import { storage } from "./storage";
import { esimAccessService, EsimAccessService } from "./services/esim-access";
import { monitoringService } from "./services/monitoring.service";
import { getTrendData } from "./routes/trend-data";
import { eq, inArray, and } from "drizzle-orm";
import * as schema from "@shared/schema";
import { db } from "./db";
import emailRoutes from "./routes/email.routes";
import templatesRoutes from "./routes/templates.routes";
import maintenanceRoutes from "./routes/maintenance.routes";
import configRoutes from "./routes/config.routes";
import * as emailService from "./services/email.service";
import { createReceipt } from './services/billing.service';
import { setupCouponRoutes } from "./routes/coupon.routes";
import { setupAdminCouponRoutes } from "./routes/admin-coupon.routes";
import {
  insertEmployeeSchema,
  insertDataPackageSchema,
  insertSubscriptionSchema,
  insertPaymentSchema,
  type Company,
} from "@shared/schema";
import { z } from "zod";
import activateRoutes from "./routes/activate.routes";
import activateIOSRoutes from "./routes/activate_ios";
import testIOSRoutes from "./routes/test_ios";
import debugRoutes from "./temp-debug-routes";
import stripeDirectRoutes from "./routes/stripe-direct";
import stripeCheckoutRoutes from "./routes/stripe-checkout";
import stripeRoutes from "./routes/stripe";
import { createCheckoutSession, verifyCheckoutSession, verifyStripePayment, processStripeWebhook, constructEventFromPayload, getRawBody, createStripeRefund, processCardPayment } from "./stripe";
import { isStripeConfigured, STRIPE_SECRET_KEY } from "./env";
import { stripePaymentSchema, refundRequestSchema } from "@shared/schema";
import Stripe from 'stripe';
import helmet from "helmet"; // Added helmet middleware
import { connectClient, broadcastEvent, EventTypes, emitEvent } from './sse';
import sseTestRoutes from './routes/sse-test.routes';
import adminEsimsRoutes from './routes/admin-esims.routes';
import webhooksRouter from './routes/webhooks';
import notificationsRoutes from './routes/notifications';
import debugEsimWebhookRouter from './routes/debug-esim-webhook';
import syncEsimRoutes from './routes/sync-esim-routes';
import recoveryRoutes from './routes/recovery';
import spendingApiRoutes from './routes/spending-api';
import { PlanDepletionService } from './services/plan-depletion';
import { usageMonitorRouter } from './routes/admin/usage-monitor';
import employeeUsageRoutes from './routes/admin/employee-usage';
import { getEmployeePlanInfo, hasActivePlans } from './services/plan-calculations';
import usageRoutes from './routes/usage.routes';
import { registerBillingRoutes } from './routes/billing';
import { companyCurrencyService } from './services/company-currency.service';
import adminBackupRoutes from './routes/admin-backup.routes';
import githubBackupRoutes from './routes/webhooks/github-backup';

// Unified security headers configuration using Helmet middleware
// This centralizes all security headers to prevent conflicts and ensure consistency
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "'unsafe-eval'", 
        "https://js.stripe.com", 
        "https://checkout.stripe.com"
      ],
      connectSrc: [
        "'self'", 
        "ws:", 
        "wss:", 
        "https://api.stripe.com", 
        "https://checkout.stripe.com",
        "https://m.stripe.com", // Stripe telemetry
        "https://cdn.jsdelivr.net" // For source maps
      ],
      frameSrc: [
        "https://js.stripe.com", 
        "https://hooks.stripe.com", 
        "https://checkout.stripe.com"
      ],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://fonts.googleapis.com",
        "https://cdn.jsdelivr.net"
      ],
      fontSrc: [
        "'self'", 
        "data:", 
        "https://fonts.gstatic.com"
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"] // Prevent clickjacking - consistent with frameguard deny
    }
  },
  // Security headers with correct Helmet configuration
  noSniff: true, // X-Content-Type-Options: nosniff
  frameguard: { action: 'deny' }, // X-Frame-Options: DENY (consistent with CSP frameAncestors)
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  // Note: X-XSS-Protection header removed as it's deprecated and can create security issues
});

// Request validation schemas
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = loginSchema.extend({
  // No longer collecting company name during initial registration
});

// Company information schema
const companyInfoSchema = z.object({
  userId: z.number(),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  country: z.string().min(2, "Country must be at least 2 characters"),
  address: z.string().min(5, "Address must be at least 5 characters"),
  taxNumber: z.string().min(3, "Tax number must be at least 3 characters"),
  entityType: z.string().min(1, "Entity type is required"),
  contactName: z.string().min(2, "Contact name must be at least 2 characters"),
  contactPhone: z.string().min(5, "Contact phone must be at least 5 characters"),
});

const updateEmployeeSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  position: z.string().optional(),
  // currentPlan field removed - plan information now derived from purchased_esims table
  dataUsage: z.string().optional(),
  dataLimit: z.string().optional(),
  planStartDate: z.string().nullable().optional(),
  planEndDate: z.string().nullable().optional(),
  planValidity: z.number().optional(),
  autoRenewEnabled: z.boolean().optional(),
});

export function registerRoutes(app: Express): Server {
  app.use(helmetMiddleware); // Apply custom helmet middleware
  setupAuth(app);

  // Register email routes
  app.use('/api/email', emailRoutes);
  app.use('/api/templates', templatesRoutes); // Email template management routes
  
  // Register notification routes
  app.use(notificationsRoutes);
  app.use('/api/maintenance', maintenanceRoutes); // Account maintenance and recovery routes
  app.use('/api/activate', activateRoutes); // Standard activation route
  app.use('/activate-ios', activateIOSRoutes); // iOS-specific activation route with manual instructions
  app.use('/test-ios', testIOSRoutes); // Test route for iOS activation without database connection
  app.use('/usage', usageRoutes); // Public eSIM usage monitoring routes
  
  // SSE Events endpoint for real-time notifications
  app.get('/api/events', (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    connectClient(req, res);
  });
  app.use('/api', debugRoutes); // Debug routes
  app.use('/api/stripe', stripeRoutes); // PCI-compliant Stripe payment processing routes
  app.use('/api/wallet/stripe', stripeCheckoutRoutes); // Stripe Checkout redirect routes for wallet
  
  // Register coupon routes
  setupCouponRoutes(app, storage); // Routes for coupon management
  
  // Register SSE routes
  app.use('/api/sse', sseTestRoutes); // SSE test routes for sending test events
  app.use('/api/admin/esims', adminEsimsRoutes); // Admin routes for eSIM management
  
  // Register billing routes
  registerBillingRoutes(app); // Billing routes for receipts and bills management
  
  // Register admin backup routes
  app.use(adminBackupRoutes); // Admin backup routes for database backup management
  
  // Register GitHub Actions backup webhook (external trigger for backups)
  app.use('/api', githubBackupRoutes);
  
  // Register webhooks
  app.use('/api', webhooksRouter); // Webhook endpoints for third-party services
  
  // Register debug webhook route for testing eSIM activations
  app.use('/api/debug', debugEsimWebhookRouter);
  
  // Register notifications routes
  app.use(notificationsRoutes);
  
  // Register the eSIM status sync route
  app.use('/api/sync', syncEsimRoutes);
  
  // Register the recovery routes for handling externally revoked eSIMs
  app.use('/api/recovery', recoveryRoutes);
  app.use('/api/spending', spendingApiRoutes);
  
  // Webhook monitoring endpoints
  app.get('/api/webhook-monitor/metrics', (req, res) => {
    try {
      const { webhookMonitor } = require('./services/webhookMonitor');
      const metrics = webhookMonitor.getMetrics();
      res.json({ metrics });
    } catch (error) {
      console.error('Error fetching webhook metrics:', error);
      res.status(500).json({ error: 'Failed to fetch webhook metrics' });
    }
  });

  app.get('/api/webhook-monitor/events', (req, res) => {
    try {
      const { webhookMonitor } = require('./services/webhookMonitor');
      const events = webhookMonitor.getRecentEvents(50);
      res.json({ events });
    } catch (error) {
      console.error('Error fetching webhook events:', error);
      res.status(500).json({ error: 'Failed to fetch webhook events' });
    }
  });

  app.get('/api/webhook-monitor/health', (req, res) => {
    try {
      const { webhookMonitor } = require('./services/webhookMonitor');
      const healthStatus = webhookMonitor.getHealthStatus();
      res.json(healthStatus);
    } catch (error) {
      console.error('Error fetching webhook health:', error);
      res.status(500).json({ error: 'Failed to fetch webhook health' });
    }
  });

  // Phase 2 optimization endpoints
  app.get('/api/optimization/status', (req, res) => {
    try {
      const { intelligentSafetyNets } = require('./services/intelligent-safety-nets');
      const status = intelligentSafetyNets.getDetailedStatus();
      res.json(status);
    } catch (error) {
      console.error('Error fetching optimization status:', error);
      res.status(500).json({ error: 'Failed to fetch optimization status' });
    }
  });

  app.get('/api/optimization/safety-nets', (req, res) => {
    try {
      const { intelligentSafetyNets } = require('./services/intelligent-safety-nets');
      const safetyNets = intelligentSafetyNets.getSafetyNetStatus();
      res.json(safetyNets);
    } catch (error) {
      console.error('Error fetching safety net status:', error);
      res.status(500).json({ error: 'Failed to fetch safety net status' });
    }
  });

  // Direct webhook endpoint for eSIM Access (to match the URL configured in eSIM Access dashboard)
  app.post('/api/esim/webhook', async (req, res) => {
    console.log('[eSIM Access Direct Webhook] Received webhook, forwarding to handler');
    // This route forwards the request to the actual webhook handler
    try {
      // Extract data from the webhook payload
      const { orderNo, esimStatus, eventType, orderUsage, totalVolume } = req.body;
      
      if (!orderNo) {
        console.warn("[eSIM Access Direct Webhook] Invalid webhook: missing orderNo");
        return res.status(400).json({ error: "Invalid webhook: missing orderNo" });
      }
      
      console.log(`[eSIM Access Direct Webhook] Received status: ${esimStatus} for order ${orderNo}, event: ${eventType}`);
      
      // Find the matching eSIM in our database
      const [esim] = await db
        .select()
        .from(schema.purchasedEsims)
        .where(eq(schema.purchasedEsims.orderId, orderNo));
      
      if (!esim) {
        console.warn(`[eSIM Access Direct Webhook] No eSIM found with orderId: ${orderNo}`);
        return res.status(404).json({ error: "eSIM not found" });
      }
      
      // Status values that represent an activated eSIM
      const ACTIVATION_STATUSES = ["ONBOARD", "ACTIVATED", "IN_USE"];
      
      // Enhanced activation detection function
      const isEsimActivated = (status: string, webhookData: any) => {
        const providerStatus = status?.toUpperCase();
        
        // Direct activation statuses
        if (ACTIVATION_STATUSES.includes(providerStatus)) {
          return true;
        }
        
        // Check for installation time - indicates actual activation
        if (webhookData?.installationTime && webhookData.installationTime !== 'null' && 
            (providerStatus === 'GOT_RESOURCE' || providerStatus === 'CREATED')) {
          console.log(`[eSIM Access Direct Webhook] Detecting activation via installation time despite status ${providerStatus}`);
          return true;
        }
        
        // Check for activation time
        if (webhookData?.activateTime && webhookData.activateTime !== 'null') {
          return true;
        }
        
        // Check for usage greater than 0 with enabled statuses
        if ((providerStatus === 'ENABLED' || providerStatus === 'ACTIVATED') && 
            webhookData?.orderUsage && parseFloat(webhookData.orderUsage) > 0) {
          return true;
        }
        
        return false;
      };
      
      // Handle activation status using enhanced detection
      if (isEsimActivated(esimStatus, req.body) && esim.status !== "activated") {
        console.log(`[eSIM Access Direct Webhook] Updating eSIM ${esim.id} status to 'activated'`);
        
        // Update the eSIM status and data usage if available
        const updateData: any = {
          status: "activated",
          activationDate: new Date(),
          metadata: {
            ...(esim.metadata || {}),
            syncedAt: new Date().toISOString(),
            providerStatus: esimStatus,
            previousStatus: esim.status,
            viaWebhook: true,
          },
        };
        
        // Add data usage info if available
        if (typeof orderUsage === 'number') {
          updateData.dataUsed = String(orderUsage);
        }
        
        // Update in database
        await db
          .update(schema.purchasedEsims)
          .set(updateData)
          .where(eq(schema.purchasedEsims.id, esim.id));

        // Check for plan depletion after usage update
        try {
          const depletionService = new PlanDepletionService(storage);
          await depletionService.checkAndMarkDepleted(esim.id);
        } catch (error) {
          console.error(`[Webhook] Error checking plan depletion for eSIM ${esim.id}:`, error);
        }
        
        // Emit SSE event for real-time updates
        broadcastEvent({
          type: EventTypes.ESIM_STATUS_CHANGE,
          esimId: esim.id,
          employeeId: esim.employeeId,
          oldStatus: esim.status,
          newStatus: "activated",
          orderId: esim.orderId,
          providerStatus: esimStatus,
          timestamp: new Date().toISOString()
        });
        
        console.log(`[eSIM Access Direct Webhook] Successfully updated eSIM ${esim.id} to 'activated'`);
      } else {
        console.log(`[eSIM Access Direct Webhook] No status change needed or processed by existing handler`);
      }
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("[eSIM Access Direct Webhook] Error processing webhook:", error);
      return res.status(500).json({ error: "Internal error processing webhook" });
    }
  });
  
  // Setup SSE endpoint
  app.get('/api/events', connectClient);
  
  // Analytics trend data endpoint
  app.get('/api/admin/trend-data', (req, res) => {
    return getTrendData(req, res);
  });

  // Middleware for request validation
  const validateRequest = (schema: z.ZodSchema) => async (req: any, res: any, next: any) => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };

  // Error handling middleware
  const errorHandler = (err: any, req: any, res: any, next: any) => {
    console.error('API Error:', err);

    if (res.headersSent) {
      return next(err);
    }

    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: err.errors
      });
    }

    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({
      error: message,
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
    });
  };

  // Admin authorization middleware
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  // Super admin only middleware
  const requireSuperAdmin = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // User authentication check

    // Check both role and isSuperAdmin flag for maximum compatibility
    if (req.user.role !== 'superadmin' && req.user.isSuperAdmin !== true) {
      return res.status(403).json({ error: "Super admin access required" });
    }
    next();
  };

  // Super admin companies endpoint for billing
  app.get("/api/sadmin/companies", requireSuperAdmin, async (req, res, next) => {
    try {
      const companies = await storage.getAllCompanies();
      // Exclude Simtree (platform owner company) from the list
      const filteredCompanies = companies.filter(company => company.name !== 'Simtree');
      res.json(filteredCompanies.map(company => ({
        id: company.id,
        name: company.name,
        contactEmail: company.contactEmail || ""
      })));
    } catch (error) {
      console.error("Error fetching companies for billing:", error);
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  // Admin routes with validation
  app.get("/api/admin/companies", requireAdmin, async (req, res, next) => {
    try {
      const companies = await storage.getAllCompanies();
      // Exclude Simtree (platform owner company) from the list
      const filteredCompanies = companies.filter(company => company.name !== 'Simtree');
      res.json(filteredCompanies);
    } catch (error) {
      next(error);
    }
  });
  
  // Update a company (admin only)
  app.patch("/api/admin/companies/:id", requireAdmin, async (req, res, next) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({ success: false, message: "Invalid company ID" });
      }
      
      // Update company request received
      
      // Validate input data
      const updateData = req.body as Partial<Company>;
      
      // Prevent changing critical fields for security
      delete updateData.id;
      delete updateData.createdAt;
      
      // Update the company
      const updatedCompany = await storage.updateCompany(companyId, updateData);
      
      // Company updated successfully
      
      res.json({
        success: true,
        message: "Company updated successfully",
        data: updatedCompany
      });
    } catch (error) {
      console.error("Error updating company:", error);
      next(error);
    }
  });

  app.get("/api/admin/companies/:id/employees", requireAdmin, async (req, res, next) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }
      const employees = await storage.getEmployees(companyId);
      res.json(employees);
    } catch (error) {
      next(error);
    }
  });

  // Endpoint to get purchased eSIMs with company information
  app.get("/api/admin/esim-purchases", requireAdmin, async (req, res, next) => {
    try {
      // Get all purchased eSIMs with related employee and company information
      console.log("Fetching purchased eSIMs with company information");
      
      const { eq } = await import("drizzle-orm");
      
      // First retrieve all purchases and map with employee and company details
      const purchasedWithCompanies = await db.select({
        id: schema.purchasedEsims.id,
        employeeId: schema.purchasedEsims.employeeId,
        planId: schema.purchasedEsims.planId,
        status: schema.purchasedEsims.status,
        purchaseDate: schema.purchasedEsims.purchaseDate,
        orderId: schema.purchasedEsims.orderId,
        employeeName: schema.employees.name,
        companyId: schema.employees.companyId,
        companyName: schema.companies.name
      })
      .from(schema.purchasedEsims)
      .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
      .leftJoin(schema.companies, eq(schema.employees.companyId, schema.companies.id));
      
      console.log(`Found ${purchasedWithCompanies.length} eSIM purchases with company information:`, 
        purchasedWithCompanies.map(p => ({
          id: p.id, 
          employee: p.employeeName, 
          company: p.companyName,
          companyId: p.companyId
        }))
      );
      
      // Get price information for each eSIM purchase by joining with plans
      const purchaseDetails = await Promise.all(
        purchasedWithCompanies.map(async (purchase) => {
          const [plan] = await db.select({
            sellingPrice: schema.esimPlans.sellingPrice
          })
          .from(schema.esimPlans)
          .where(eq(schema.esimPlans.id, purchase.planId));
          
          console.log(`eSIM ${purchase.id} with planId ${purchase.planId}: calculated selling price = $${plan?.sellingPrice || "0.00"}`);
          
          return {
            ...purchase,
            price: plan?.sellingPrice || "0.00"
          };
        })
      );
      
      return res.json({
        success: true,
        data: purchaseDetails
      });
    } catch (error) {
      console.error("Error fetching eSIM purchases with company info:", error);
      return res.status(500).json({ error: "Failed to get eSIM purchase data" });
    }
  });
  
  // Endpoint to get purchased eSIMs for a specific company's employees
  app.get("/api/admin/companies/:id/esims", requireAdmin, async (req, res, next) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      // Get all employees for this company
      const employees = await storage.getEmployees(companyId);

      if (!employees || employees.length === 0) {
        return res.json({
          success: true,
          data: []
        });
      }

      // Get all purchased eSIMs for all employees in the company
      const allEsims = [];
      for (const employee of employees) {
        try {
          const execEsims = await storage.getPurchasedEsims(employee.id);

          if (execEsims && execEsims.length > 0) {
            // Add employee name to each eSIM record for easier reference
            const enhancedEsims = execEsims.map(esim => ({
              ...esim,
              employeeName: employee.name
            }));
            allEsims.push(...enhancedEsims);
          }
        } catch (error) {
          console.error(`Error fetching eSIMs for employee ${employee.id}:`, error);
        }
      }

      console.log(`Returning ${allEsims.length} eSIMs for company ${companyId}`);
      res.json({
        success: true,
        data: allEsims
      });
    } catch (error) {
      console.error('Error fetching purchased eSIMs for company:', error);
      next(error);
    }
  });

  // Get company wallet balance - for verification before deletion
  app.get("/api/admin/companies/:id/wallet", requireSuperAdmin, async (req, res, next) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        console.error("Invalid company ID provided:", req.params.id);
        return res.status(400).json({
          success: false,
          error: "Invalid company ID",
          message: "The company ID must be a valid number."
        });
      }
      
      console.log(`Checking wallet balance for company ID ${companyId}`);
      
      // Verify the company exists
      const company = await db.select()
        .from(schema.companies)
        .where(eq(schema.companies.id, companyId))
        .execute();
        
      if (!company || company.length === 0) {
        console.log("Company not found in database with ID:", companyId);
        return res.status(404).json({
          success: false,
          error: "Company not found",
          message: "The specified company does not exist."
        });
      }
      
      // Get company wallet balance
      const balance = await storage.getCompanyWalletBalance(companyId);
      console.log(`Company ${companyId} wallet balance: ${balance}`);
      
      return res.json({
        success: true,
        balance: balance
      });
    } catch (error) {
      console.error("Error checking company wallet balance:", error);
      return res.status(500).json({
        success: false,
        error: "Wallet verification failed",
        message: "An error occurred while checking the wallet balance."
      });
    }
  });

  app.get("/api/admin/employees", requireAdmin, async (req, res, next) => {
    try {
      console.log("[Admin] Fetching all employees with company names");
      // Get all employees with company names
      const allEmployees = await storage.getAllEmployeesWithCompanies();
      console.log(`[Admin] Found ${allEmployees.length} employees`);
      
      // Sort employees by name to maintain consistent order
      const sortedEmployees = allEmployees.sort((a, b) => a.name.localeCompare(b.name));
      
      // Check and update purchased eSIMs for each employee
      const updatedEmployees = await Promise.all(sortedEmployees.map(async (employee) => {
        try {
          // Get purchased eSIMs for this employee
          console.log(`[Admin] Checking eSIMs for employee ${employee.id} (${employee.name})`);
          const purchasedEsims = await storage.getPurchasedEsims(employee.id);
          console.log(`[Admin] Found ${purchasedEsims.length} eSIMs for employee ${employee.id}`);
          
          // Sort eSIMs by purchase date descending to get the most recent one first
          const sortedEsims = purchasedEsims.sort((a, b) =>
            new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
          );
          
          // Find the most recent active or waiting_for_activation eSIM
          const activeEsim = sortedEsims.find(esim =>
            (esim.status === 'active' || esim.status === 'waiting_for_activation') &&
            !esim.isCancelled && // Skip if explicitly cancelled
            !(esim.metadata && typeof esim.metadata === 'object' && (
              esim.metadata.isCancelled === true || 
              esim.metadata.refunded === true
            ))
          );
          
          console.log(`[Admin] Active eSIM found for ${employee.id}: ${!!activeEsim}`);
          
          if (activeEsim) {
            // Get plan details
            const plan = await storage.getEsimPlanById(activeEsim.planId);
            
            if (plan) {
              console.log(`[Admin] Found plan ${plan.name} for employee ${employee.id}`);
              // Important: For admin view, we just update the record in memory, don't persist to DB
              return {
                ...employee,
                // currentPlan field removed - plan information now derived from purchased_esims table
                dataUsage: activeEsim.dataUsed || "0",
                dataLimit: plan.data.toString(),
                planStartDate: activeEsim.activationDate || new Date().toISOString(),
                planEndDate: activeEsim.expiryDate || null,
                planValidity: plan.validity
              };
            }
          } else {
            console.log(`[Admin] No active eSIM found for employee ${employee.id}, clearing plan info`);
            // If no active eSIM found, clear the plan info (in memory only)
            return {
              ...employee,
              // currentPlan field removed - plan information now derived from purchased_esims table
              dataUsage: "0",
              dataLimit: "0",
              planStartDate: null,
              planEndDate: null,
              planValidity: null
            };
          }
        } catch (error) {
          console.error(`[Admin] Error processing employee ${employee.id}:`, error);
        }
        
        // Return original employee if processing fails
        return employee;
      }));
      
      console.log(`[Admin] Returning ${updatedEmployees.length} employees`);
      res.json(updatedEmployees);
    } catch (error) {
      console.error('[Admin] Error fetching employees:', error);
      next(error);
    }
  });

  // Company routes
  app.get("/api/company", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      // Fetching company data for authenticated user

      // If user is associated with a company, return that company's details
      if (req.user && req.user.companyId) {
        try {
          const company = await storage.getCompany(req.user.companyId);
          if (company) {
            console.log("Found company:", company.name);
            return res.json({
              success: true,
              data: company
            });
          } else {
            console.log("No company found with ID:", req.user.companyId);
          }
        } catch (companyError) {
          console.error("Error fetching company from storage:", companyError);
          // Try direct database query as fallback
          try {
            const [company] = await db.select()
              .from(schema.companies)
              .where(eq(schema.companies.id, req.user.companyId))
              .limit(1);
            
            if (company) {
              console.log("Found company via direct DB query:", company.name);
              return res.json({
                success: true,
                data: company
              });
            }
          } catch (dbError) {
            console.error("Error with direct DB query:", dbError);
          }
        }
      } else {
        console.log("User has no companyId associated");
      }

      // If no company found or no companyId, return error
      return res.status(404).json({
        success: false,
        error: "Company not found"
      });
    } catch (error) {
      console.error("Error fetching company:", error);
      next(error);
    }
  });

  // Get pending company data for user during profile completion
  app.get("/api/companies/pending-by-user/:userId", async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      // Get user email first
      const user = await db.select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (user.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      // Find pending company associated with this user's email
      const pendingCompanies = await db.select()
        .from(schema.companies)
        .where(
          and(
            eq(schema.companies.verified, false),
            eq(schema.companies.contactEmail, user[0].email)
          )
        );

      if (pendingCompanies.length > 0) {
        return res.json(pendingCompanies[0]);
      }

      return res.status(404).json({ error: "No pending company found for this user" });
    } catch (error) {
      console.error("Error fetching pending company:", error);
      next(error);
    }
  });

  // Get company by ID for profile completion
  app.get("/api/companies/:companyId", requireAuth, async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.companyId);
      
      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      // Fetch company data
      const companies = await db.select()
        .from(schema.companies)
        .where(eq(schema.companies.id, companyId))
        .limit(1);

      if (companies.length > 0) {
        return res.json(companies[0]);
      }

      res.status(404).json({ error: "Company not found" });
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/company/:id", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid company ID"
        });
      }

      // Check if user is requesting their own company or is an admin/superadmin
      if (req.user.companyId !== companyId && !req.user.isAdmin && !req.user.isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: "Forbidden: You can only access your own company data"
        });
      }

      const company = await storage.getCompany(companyId);
      if (company) {
        return res.json({
          success: true,
          data: company
        });
      }

      return res.status(404).json({
        success: false,
        error: "Company not found"
      });
    } catch (error) {
      console.error("Error fetching company by ID:", error);
      next(error);
    }
  });

  app.post("/api/company", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Validate required fields
      const { name, country, address, taxNumber, entityType, contactName, contactPhone } = req.body;

      if (!name || !country || !address || !taxNumber || !entityType || !contactName || !contactPhone) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields for company creation"
        });
      }

      // Check for existing company with the same name
      const companyWithSameName = await storage.getCompanyByName(name);
      if (companyWithSameName) {
        return res.status(400).json({
          success: false,
          error: "Company name already exists"
        });
      }

      // Check for existing company with the same tax number
      const companyWithSameTaxNumber = await storage.getCompanyByTaxNumber(taxNumber);
      if (companyWithSameTaxNumber) {
        return res.status(400).json({
          success: false,
          error: "Tax number already exists"
        });
      }

      // Create new company
      const newCompany = await storage.createCompany({
        name,
        country,
        address,
        taxNumber,
        entityType,
        contactName,
        contactPhone,
        website: req.body.website || null,
        description: req.body.description || null,
        contactEmail: req.body.contactEmail || null,
        status: 'active'
      });

      // Update the user's company ID if they don't have one
      if (req.user && !req.user.companyId) {
        await storage.updateUserProfile(req.user.id, { companyId: newCompany.id });
      }

      return res.json({
        success: true,
        data: newCompany
      });
    } catch (error) {
      console.error("Error creating company:", error);
      next(error);
    }
  });

  // Endpoint for adding a new company for an existing user with the same email
  app.post("/api/company/new-for-existing-user", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Validate required fields
      const { 
        name, 
        country, 
        address, 
        taxNumber, 
        entityType, 
        contactName, 
        contactPhone,
        contactEmail,
        industry,
        website,
        description
      } = req.body;

      // Basic validation of required fields
      if (!name || !country || !address || !taxNumber || !entityType || !contactName || !contactPhone) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields for company creation"
        });
      }

      // Check for existing company with the same name
      const companyWithSameName = await storage.getCompanyByName(name);
      if (companyWithSameName) {
        return res.status(400).json({
          success: false,
          error: "Company name already exists"
        });
      }

      // Check for existing company with the same tax number
      const companyWithSameTaxNumber = await storage.getCompanyByTaxNumber(taxNumber);
      if (companyWithSameTaxNumber) {
        return res.status(400).json({
          success: false,
          error: "Tax number already exists"
        });
      }

      console.log("Creating new company for existing user:", req.user.username);

      // Use a transaction to ensure company creation and wallet creation are atomic
      const companyData = await db.transaction(async (tx) => {
        try {
          // Create a company record
          const [company] = await tx.insert(schema.companies)
            .values({
              name,
              taxNumber,
              country,
              address,
              entityType,
              contactName,
              contactPhone,
              contactEmail: contactEmail || req.user.email, // Use provided contact email or fallback to user's email
              website: website || null,
              industry: industry || null,
              description: description || null,
              verified: true, // Companies created by existing users are auto-verified
              active: true,
              createdAt: new Date()
            })
            .returning();

          if (!company) {
            throw new Error("Failed to create company");
          }

          // Create a wallet for the new company
          const [wallet] = await tx.insert(schema.wallets)
            .values({
              companyId: company.id,
              balance: "0",
              lastUpdated: new Date()
            })
            .returning();

          // Return both company and wallet
          return { company, wallet };
        } catch (error) {
          console.error("Transaction failed:", error);
          throw error;
        }
      });

      const { company } = companyData;

      // Don't change the user's current companyId - we want them to be able to switch between companies

      return res.json({
        success: true,
        message: "New company created successfully for your account. You can now switch between companies.",
        company
      });
    } catch (error) {
      console.error("Error creating new company for existing user:", error);
      next(error);
    }
  });

  app.put("/api/company/:id", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid company ID"
        });
      }

      // Check if user has permission to update this company
      if (req.user.companyId !== companyId && !req.user.isAdmin && !req.user.isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: "Forbidden: You can only update your own company data"
        });
      }

      // Validate if company exists
      const existingCompany = await storage.getCompany(companyId);
      if (!existingCompany) {
        return res.status(404).json({
          success: false,
          error: "Company not found"
        });
      }

      // Check if company name is being changed to an existing one
      if (req.body.name && req.body.name !== existingCompany.name) {
        const companyWithSameName = await storage.getCompanyByName(req.body.name);
        if (companyWithSameName && companyWithSameName.id !== companyId) {
          return res.status(400).json({
            success: false,
            error: "Company name already exists"
          });
        }
      }

      // Check if tax number is being changed to an existing one
      if (req.body.taxNumber && req.body.taxNumber !== existingCompany.taxNumber) {
        const companyWithSameTaxNumber = await storage.getCompanyByTaxNumber(req.body.taxNumber);
        if (companyWithSameTaxNumber && companyWithSameTaxNumber.id !== companyId) {
          return res.status(400).json({
            success: false,
            error: "Tax number already exists"
          });
        }
      }

      // Check if country is being updated (to clear currency cache)
      const isCountryUpdate = req.body.country && req.body.country !== existingCompany.country;

      // Update company
      const updatedCompany = await storage.updateCompany(companyId, req.body);

      // Clear currency cache if country changed
      if (isCountryUpdate) {
        await companyCurrencyService.updateCompanyCurrency(companyId, req.body.country);
        console.log(`[Routes] Currency cache cleared for company ${companyId} due to country update: ${existingCompany.country} -> ${req.body.country}`);
      }

      return res.json({
        success: true,
        data: updatedCompany
      });
    } catch (error) {
      console.error("Error updating company:", error);
      next(error);
    }
  });

  // Company settings endpoint - user-friendly way to update company settings
  app.patch("/api/company/settings", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Check if user has a company
      if (!req.user.companyId) {
        return res.status(400).json({
          success: false,
          error: "User is not associated with a company"
        });
      }

      const companyId = req.user.companyId;

      // Validate if company exists
      const existingCompany = await storage.getCompany(companyId);
      if (!existingCompany) {
        return res.status(404).json({
          success: false,
          error: "Company not found"
        });
      }

      // Validate allowed fields for settings update
      const allowedFields = ['country', 'currency', 'name', 'contactName', 'industry', 'taxNumber', 'entityType', 'phoneCountryCode', 'phoneNumber', 'address', 'website', 'description', 'contactEmail'];
      const updateData: any = {};
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: "No valid fields provided for update"
        });
      }

      // Update company with new settings including currency
      const updatedCompany = await storage.updateCompany(companyId, updateData);

      return res.json({
        success: true,
        data: {
          company: updatedCompany
        }
      });
    } catch (error) {
      console.error("Error updating company settings:", error);
      next(error);
    }
  });

  // Get company settings (including currency info) - UPDATED VERSION v2
  app.get("/api/company/settings", async (req, res, next) => {
    console.log("=== [Company Settings v2] Request received ===");
    console.log("[Company Settings v2] Authenticated:", req.isAuthenticated());
    console.log("[Company Settings v2] User object:", JSON.stringify(req.user, null, 2));
    
    if (!req.isAuthenticated()) {
      console.log("[Company Settings v2] User not authenticated");
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Check if user has a company
      if (!req.user.companyId) {
        console.log("[Company Settings] User without companyId. Full user object:", JSON.stringify(req.user));
        return res.status(400).json({
          success: false,
          error: "User is not associated with a company"
        });
      }

      const companyId = req.user.companyId;
      console.log("[Company Settings] Fetching company settings for companyId:", companyId);
      const company = await storage.getCompany(companyId);
      
      if (!company) {
        console.log("[Company Settings] Company not found for ID:", companyId);
        return res.status(404).json({
          success: false,
          error: "Company not found"
        });
      }

      console.log("[Company Settings] Company data keys:", Object.keys(company));
      console.log("[Company Settings] Company data:", JSON.stringify(company, null, 2));

      // Get currency info
      const currencyContext = await companyCurrencyService.getCurrencyWithContext(companyId);

      const response = {
        success: true,
        data: {
          company,
          currency: currencyContext.currency,
          currencyContext
        }
      };
      
      console.log("[Company Settings] Sending response with company data");
      return res.json(response);
    } catch (error) {
      console.error("[Company Settings] Error fetching company settings:", error);
      next(error);
    }
  });

  // Employee routes
  app.get("/api/employees", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      // Use companyId instead of user.id
      if (!req.user.companyId) {
        return res.status(400).json({ error: "User is not associated with a company" });
      }
      
      const employees = await storage.getEmployees(req.user.companyId);
      const plans = await storage.getActiveEsimPlans();

      // Sort employees by name to maintain consistent order
      const sortedEmployees = employees.sort((a, b) => a.name.localeCompare(b.name));
      
      // Note: Special case handling for employees is now handled through purchased eSIMs

      // Check and update purchased eSIMs for each employee
      const updatedEmployees = await Promise.all(sortedEmployees.map(async (employee) => {
        // Get purchased eSIMs for this employee
        const purchasedEsims = await storage.getPurchasedEsims(employee.id);

        // Sort eSIMs by purchase date descending to get the most recent one first
        const sortedEsims = purchasedEsims.sort((a, b) =>
          new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
        );

        // Find the most recent active or waiting_for_activation eSIM that hasn't been cancelled and isn't expired
        // Use a for...of loop instead of find() since we need to use await inside
        let activeEsim = null;
        for (const esim of sortedEsims) {
          // Check if the status is active or waiting for activation
          const hasActiveStatus = esim.status === 'active' || 
                                esim.status === 'waiting_for_activation' || 
                                esim.status === 'activated' || 
                                esim.status === 'onboard';
          
          // Check for cancellation or refund flags in the metadata
          const isCancelled = esim.status === 'cancelled' || 
                            (esim.metadata && typeof esim.metadata === 'object' && (
                              // @ts-ignore - these properties may exist in the metadata
                              esim.metadata.isCancelled === true || 
                              // @ts-ignore - these properties may exist in the metadata
                              esim.metadata.refunded === true
                            ));
          
          // Check for CANCEL status in the metadata
          let cancelledInMetadata = false;
          if (esim.metadata && typeof esim.metadata === 'object' && 
              // @ts-ignore - rawData may exist in metadata
              esim.metadata.rawData) {
            // Handle rawData as object
            if (typeof esim.metadata.rawData === 'object' &&
                esim.metadata.rawData.obj &&
                typeof esim.metadata.rawData.obj === 'object' &&
                Array.isArray(esim.metadata.rawData.obj.esimList) && 
                esim.metadata.rawData.obj.esimList[0] &&
                esim.metadata.rawData.obj.esimList[0].esimStatus === 'CANCEL') {
              cancelledInMetadata = true;
            }
            
            // Handle rawData as string
            if (!cancelledInMetadata && typeof esim.metadata.rawData === 'string') {
              try {
                const parsedData = JSON.parse(esim.metadata.rawData);
                if (parsedData.obj?.esimList?.[0]?.esimStatus === 'CANCEL') {
                  cancelledInMetadata = true;
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }
          }
          
          // Check for expiration (if the plan has an expiry date)
          let isExpired = false;
          if (esim.expiryDate) {
            const expiryDate = new Date(esim.expiryDate);
            const now = new Date();
            isExpired = expiryDate < now;
          } else if (esim.activationDate && 
                    // @ts-ignore - validity may exist on the esim object
                    esim.validity) {
            // If there's no explicit expiry date but we have activation date and validity
            const activationDate = new Date(esim.activationDate);
            // @ts-ignore - validity may exist on the esim object
            const validityInMs = esim.validity * 24 * 60 * 60 * 1000; // days to milliseconds
            const expiryDate = new Date(activationDate.getTime() + validityInMs);
            isExpired = expiryDate < new Date();
          }
          
          // Check for expiration in metadata
          if (!isExpired && esim.metadata && typeof esim.metadata === 'object' && esim.metadata.rawData) {
            let expiredTimeStr = null;
            
            // Handle rawData as object
            if (typeof esim.metadata.rawData === 'object' &&
                esim.metadata.rawData.obj &&
                typeof esim.metadata.rawData.obj === 'object' &&
                Array.isArray(esim.metadata.rawData.obj.esimList) && 
                esim.metadata.rawData.obj.esimList[0] &&
                esim.metadata.rawData.obj.esimList[0].expiredTime) {
              expiredTimeStr = esim.metadata.rawData.obj.esimList[0].expiredTime;
            }
            
            // Handle rawData as string
            if (!expiredTimeStr && typeof esim.metadata.rawData === 'string') {
              try {
                const parsedData = JSON.parse(esim.metadata.rawData);
                if (parsedData.obj?.esimList?.[0]?.expiredTime) {
                  expiredTimeStr = parsedData.obj.esimList[0].expiredTime;
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }
            
            if (expiredTimeStr) {
              try {
                const expiredTime = new Date(expiredTimeStr);
                isExpired = expiredTime < new Date();
                console.log(`Checking expiration for eSIM ${esim.id}: expiredTime=${expiredTimeStr}, isExpired=${isExpired}`);
              } catch (e) {
                console.error(`Error parsing expiry time: ${expiredTimeStr}`, e);
              }
            }
          }
          
          // Check for data usage depletion
          let isDataDepleted = false;
          if (esim.dataUsed && !isExpired && !isCancelled && !cancelledInMetadata) {
            try {
              // Get plan details to check against data limit
              const plan = await storage.getEsimPlanById(esim.planId);
              if (plan) {
                const dataLimit = parseFloat(plan.data);
                const dataUsed = parseFloat(esim.dataUsed);
                
                // If they've used 95% or more of their data, consider it depleted
                const usagePercentage = dataUsed / dataLimit * 100;
                isDataDepleted = usagePercentage >= 95;
                
                console.log(`Checking data usage for eSIM ${esim.id}: used=${dataUsed}GB, limit=${dataLimit}GB, percentage=${usagePercentage.toFixed(2)}%, depleted=${isDataDepleted}`);
              }
            } catch (e) {
              console.error(`Error checking data usage for eSIM ${esim.id}:`, e);
            }
          }
          
          // Check for data depletion in metadata (some providers report usage differently)
          if (!isDataDepleted && !isExpired && !isCancelled && !cancelledInMetadata &&
              esim.metadata && typeof esim.metadata === 'object' && 
              // @ts-ignore - rawData may exist in metadata
              esim.metadata.rawData) {
            let orderUsage = null;
            let totalVolume = null;
            
            // Handle rawData as object
            if (typeof esim.metadata.rawData === 'object' &&
                esim.metadata.rawData.obj &&
                typeof esim.metadata.rawData.obj === 'object' &&
                Array.isArray(esim.metadata.rawData.obj.esimList) && 
                esim.metadata.rawData.obj.esimList[0]) {
              
              const esimData = esim.metadata.rawData.obj.esimList[0];
              
              // Check if usage data is available
              if (typeof esimData.orderUsage === 'number' && 
                  typeof esimData.totalVolume === 'number') {
                orderUsage = esimData.orderUsage;
                totalVolume = esimData.totalVolume;
              }
            }
            
            // Handle rawData as string
            if (orderUsage === null && typeof esim.metadata.rawData === 'string') {
              try {
                const parsedData = JSON.parse(esim.metadata.rawData);
                if (parsedData.obj?.esimList?.[0]) {
                  const esimData = parsedData.obj.esimList[0];
                  
                  // Check if usage data is available
                  if (typeof esimData.orderUsage === 'number' && 
                      typeof esimData.totalVolume === 'number') {
                    orderUsage = esimData.orderUsage;
                    totalVolume = esimData.totalVolume;
                  }
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }
            
            // If we found usage data, check if depleted
            if (orderUsage !== null && totalVolume !== null && totalVolume > 0) {
              // Consider depleted if used 95% or more
              const usagePercentage = (orderUsage / totalVolume) * 100;
              isDataDepleted = usagePercentage >= 95;
              
              console.log(`Checking metadata usage for eSIM ${esim.id}: used=${orderUsage}, total=${totalVolume}, percentage=${usagePercentage.toFixed(2)}%, depleted=${isDataDepleted}`);
            }
          }
          
          // If the eSIM is active, not cancelled, not expired, and not data depleted, use it
          if (hasActiveStatus && !isCancelled && !cancelledInMetadata && !isExpired && !isDataDepleted) {
            activeEsim = esim;
            break; // Found an active eSIM, no need to check other ones
          }
        }

        if (activeEsim) {
          // Get plan details
          const plan = await storage.getEsimPlanById(activeEsim.planId);

          if (plan) {
            // Get real-time usage data for active eSIMs (same as usage monitor)
            let finalDataUsed = parseFloat(activeEsim.dataUsed || "0");
            
            if (activeEsim.status === 'activated' || activeEsim.status === 'active') {
              try {
                const esimAccessService = new EsimAccessService(db);
                const statusResult = await esimAccessService.checkEsimStatus(activeEsim.orderId);
                
                if (statusResult && statusResult.rawData && statusResult.rawData.obj && statusResult.rawData.obj.esimList) {
                  const esimInfo = statusResult.rawData.obj.esimList[0];
                  if (esimInfo && esimInfo.orderUsage !== undefined) {
                    // Convert bytes to GB for consistency
                    const realTimeUsedBytes = parseInt(esimInfo.orderUsage.toString());
                    const realTimeUsedGB = realTimeUsedBytes / (1024 * 1024 * 1024);
                    
                    // Use real-time data if it shows more usage than stored data
                    if (realTimeUsedGB > finalDataUsed) {
                      finalDataUsed = realTimeUsedGB;
                      console.log(`[Employees] Updated real-time usage for ${activeEsim.orderId}: ${realTimeUsedGB.toFixed(3)}GB (${realTimeUsedBytes} bytes)`);
                      
                      // Update the database with the latest usage
                      await storage.updatePurchasedEsim(activeEsim.id, {
                        dataUsed: finalDataUsed.toFixed(4),
                        metadata: {
                          ...activeEsim.metadata,
                          rawData: statusResult.rawData,
                          lastUpdated: new Date().toISOString(),
                          realTimeUsageBytes: realTimeUsedBytes
                        }
                      });
                    }
                  }
                }
              } catch (error) {
                console.log(`[Employees] Failed to fetch real-time usage for ${activeEsim.orderId}:`, error);
              }
            }
            
            // Update employee with plan information using real-time usage
            const updatedExec = await storage.updateEmployee(employee.id, {
              // currentPlan field removed - plan information now derived from purchased_esims table
              dataUsage: finalDataUsed.toFixed(4),
              dataLimit: plan.data.toString(),
              planStartDate: activeEsim.activationDate || new Date().toISOString(),
              planEndDate: activeEsim.expiryDate || null,
              planValidity: plan.validity
            });
            return updatedExec;
          }
        } else {
          // If no active or waiting eSIM found, clear the plan info
          const updatedExec = await storage.updateEmployee(employee.id, {
            // currentPlan field removed - plan information now derived from purchased_esims table
            dataUsage: "0",
            dataLimit: "0",
            planStartDate: null,
            planEndDate: null,
            planValidity: null
          });
          return updatedExec;
        }
        return employee;
      }));

      res.json(updatedEmployees);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/employees", validateRequest(insertEmployeeSchema), async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const parsedData = insertEmployeeSchema.parse(req.body);
      
      // Use companyId instead of user.id
      if (!req.user.companyId) {
        return res.status(400).json({ error: "User is not associated with a company" });
      }
      
      const employee = await storage.createEmployee({
        ...parsedData,
        companyId: req.user.companyId,
        dataUsage: "0",
        email: parsedData.email ?? "",
        // currentPlan field removed - plan information now derived from purchased_esims table
        dataLimit: "0",
        planStartDate: null,
        planEndDate: null,
        planValidity: null,
        autoRenewEnabled: false
      });
      
      // Broadcast SSE event for real-time updates
      emitEvent(EventTypes.EXECUTIVE_UPDATE, {
        action: 'created',
        employeeId: employee.id,
        companyId: req.user.companyId
      });
      
      res.json(employee);
    } catch (error) {
      console.error("Error creating employee:", error);
      next(error);
    }
  });

  app.post("/api/wallet/recalculate-balance", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Get walletId from request body if provided, otherwise use user's wallet
      const { walletId } = req.body;
      
      if (walletId) {
        // If specific wallet ID is provided, only super admin can access it
        if (req.user.role !== 'superadmin') {
          return res.status(403).json({ error: "Access denied. Must be a super admin to recalculate specific wallets." });
        }
        
        // Get the wallet and its transactions
        const wallets = await storage.getAllWallets();
        const targetWallet = wallets.find(w => w.id === parseInt(walletId));
        
        if (!targetWallet) {
          return res.status(404).json({ error: "Wallet not found" });
        }
        
        // Get all transactions for this wallet
        const allTransactions = await storage.getAllWalletTransactions();
        const walletTransactions = allTransactions.filter(tx => tx.walletId === targetWallet.id);
        
        // Calculate new balance from transactions - credit adds, debit always subtracts (use abs for consistency)
        const newBalance = walletTransactions.reduce((sum, tx) => {
          const amount = parseFloat(tx.amount);
          return tx.type === 'credit' ? sum + amount : sum - Math.abs(amount);
        }, 0);
        
        // Update the wallet balance
        await storage.updateWalletBalance(targetWallet.id, newBalance);
        
        return res.json({ success: true, walletId: targetWallet.id, balance: newBalance });
      } else {
        // Regular user recalculating their own wallet
        const wallet = await storage.getWallet(req.user.id);
        const transactions = await storage.getWalletTransactionsByCompany(req.user.id);

        const newBalance = transactions.reduce((sum, tx) => {
          const amount = parseFloat(tx.amount);
          return tx.type === 'credit' ? sum + amount : sum - Math.abs(amount);
        }, 0);

        await storage.updateWalletBalance(wallet.id, newBalance);
        return res.json({ success: true, balance: newBalance });
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/employees/bulk", validateRequest(z.array(insertEmployeeSchema)), async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Use companyId instead of user.id
      if (!req.user.companyId) {
        return res.status(400).json({ error: "User is not associated with a company" });
      }
      
      const employees = await Promise.all(
        req.body.map((exec: any) =>
          storage.createEmployee({
            ...insertEmployeeSchema.parse(exec),
            companyId: req.user.companyId,
            dataUsage: "0",
            email: exec.email ?? "",
            // currentPlan field removed - plan information now derived from purchased_esims table
            dataLimit: "0",
            planStartDate: null,
            planEndDate: null,
            planValidity: null,
            autoRenewEnabled: false
          }),
        ),
      );
      
      // Broadcast SSE event for real-time updates
      emitEvent(EventTypes.EXECUTIVE_UPDATE, {
        action: 'bulk_created',
        count: employees.length,
        companyId: req.user.companyId
      });
      
      res.json(employees);
    } catch (error) {
      console.error("Error creating employees in bulk:", error);
      next(error);
    }
  });

  app.post("/api/employees/:id/packages", validateRequest(insertDataPackageSchema), requireAdmin, async (req, res, next) => {
    try {
      const parsedData = insertDataPackageSchema.parse(req.body);
      const pkg = await storage.createDataPackage({
        ...parsedData,
        employeeId: parseInt(req.params.id),
        purchaseDate: new Date().toISOString(),
      });
      res.json(pkg);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/employees/:id/packages", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const packages = await storage.getDataPackages(parseInt(req.params.id));
      res.json(packages);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/employees/:id", validateRequest(updateEmployeeSchema), async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const employeeId = parseInt(req.params.id);
      const { planStartDate, planEndDate, planValidity, ...updateData } = req.body;

      // Format dates properly
      const updates: any = {
        ...updateData
      };

      if (planStartDate) {
        updates.planStartDate = new Date(planStartDate);
      }
      if (planEndDate) {
        updates.planEndDate = new Date(planEndDate);
      }
      if (planValidity !== undefined) {
        updates.planValidity = Number(planValidity);
      }

      console.log('Updating employee with data:', updates);
      
      // Log auto-renewal setting update explicitly
      if (updates.autoRenewEnabled !== undefined) {
        console.log(`Attempting to ${updates.autoRenewEnabled ? 'enable' : 'disable'} auto-renewal for employee ${employeeId}`);
      }

      // Get employee before update to check current state
      const currentEmployee = await db
        .select()
        .from(schema.employees)
        .where(eq(schema.employees.id, employeeId))
        .limit(1);
        
      console.log('Current employee state:', currentEmployee[0]);

      const employee = await storage.updateEmployee(employeeId, updates);

      console.log('Employee updated successfully:', employee);

      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      res.json(employee);
    } catch (error: any) {
      console.error('Employee update failed:', error);
      // Enhanced error logging
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        cause: error.cause
      });
      next(error);
    }
  });

  app.delete("/api/employees/:id", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const employeeId = parseInt(req.params.id);
      // Check if the user is a superadmin for force deletion
      const isSuperAdmin = req.user.isSuperAdmin === true;

      await storage.deleteEmployee(employeeId, isSuperAdmin);
      res.json({ success: true, message: 'Employee deleted successfully' });
    } catch (error: any) {
      return res.status(400).json({
        error: "Failed to delete employee",
        message: error.message || "You can't delete an employee with a plan"
      });
    }
  });

  // Toggle auto-renew for individual eSIM/plan
  app.patch("/api/esim/:esimId/auto-renew", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const esimId = parseInt(req.params.esimId);
      const { autoRenewEnabled } = req.body;
      const companyId = req.user.id;
      
      if (typeof autoRenewEnabled !== 'boolean') {
        return res.status(400).json({ error: "autoRenewEnabled must be a boolean" });
      }
      
      // Verify the eSIM belongs to an employee of this company
      const esimWithEmployee = await db
        .select({
          esim: schema.purchasedEsims,
          employee: schema.employees
        })
        .from(schema.purchasedEsims)
        .innerJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
        .where(eq(schema.purchasedEsims.id, esimId))
        .limit(1);
      
      if (esimWithEmployee.length === 0) {
        return res.status(404).json({ error: "eSIM not found" });
      }
      
      const { employee } = esimWithEmployee[0];
      
      // Check company ownership (superadmins can access any company)
      if (!req.user.isSuperAdmin && employee.companyId !== companyId) {
        return res.status(403).json({ error: "Access denied: eSIM does not belong to your company" });
      }
      
      console.log(`[AutoRenew] ${autoRenewEnabled ? 'Enabling' : 'Disabling'} auto-renew for eSIM ${esimId}`);
      
      // Update the eSIM's auto-renew setting
      const [updatedEsim] = await db
        .update(schema.purchasedEsims)
        .set({ autoRenewEnabled })
        .where(eq(schema.purchasedEsims.id, esimId))
        .returning();
      
      console.log(`[AutoRenew] Successfully ${autoRenewEnabled ? 'enabled' : 'disabled'} auto-renew for eSIM ${esimId}`);
      
      res.json(updatedEsim);
    } catch (error: any) {
      console.error(`[AutoRenew] Error toggling auto-renew for eSIM:`, error);
      next(error);
    }
  });

  // Subscription routes
  app.get("/api/subscription", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const subscription = await storage.getCompanySubscription(req.user.id);
      res.json(subscription);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/subscription", validateRequest(insertSubscriptionSchema), async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const parsedData = insertSubscriptionSchema.parse(req.body);
      const subscription = await storage.createSubscription({
        ...parsedData,
        companyId: req.user.id,
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      });
      res.json(subscription);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/subscription/:id", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const subscription = await storage.updateSubscription(
        parseInt(req.params.id),
        req.body,
      );
      res.json(subscription);
    } catch (error) {
      next(error);
    }
  });

  // Payment routes
  app.get("/api/payments", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const payments = await storage.getCompanyPayments(req.user.id);
      res.json(payments);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/payments", validateRequest(insertPaymentSchema), async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const parsedData = insertPaymentSchema.parse(req.body);
      const payment = await storage.createPayment({
        ...parsedData,
        companyId: req.user.id,
        subscriptionId: parsedData.subscriptionId ?? null,
        paymentMethod: parsedData.paymentMethod ?? null,
      });
      res.json(payment);
    } catch (error) {
      next(error);
    }
  });

  // eSIM routes
  app.get("/api/admin/plans", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // This endpoint is for superadmin access only
      if (req.user.isSuperAdmin !== true) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const plans = await storage.getEsimPlans();
      res.json({ success: true, data: plans });
    } catch (error) {
      next(error);
    }
  });
  
  // Toggle eSIM plan active status (admin route)
  app.post("/api/admin/plans/toggle-active", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // This endpoint is for superadmin access only
      if (req.user.isSuperAdmin !== true) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const { planId, isActive } = req.body;
      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }
      
      const plan = await storage.updateEsimPlan(planId, { isActive });
      res.json({ success: true, data: plan });
    } catch (error) {
      next(error);
    }
  });
  
  // Update eSIM plan margin (admin route)
  app.patch("/api/admin/plans/:id/margin", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // This endpoint is for superadmin access only
      if (req.user.isSuperAdmin !== true) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const planId = parseInt(req.params.id);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }
      
      const { margin } = req.body;
      if (margin === undefined || isNaN(parseFloat(margin))) {
        return res.status(400).json({ error: "Invalid margin value" });
      }
      
      // Get the current plan to calculate new retail price
      const plan = await storage.getEsimPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      // Calculate new selling price and retail price
      const providerPrice = parseFloat(plan.providerPrice.toString());
      const newMargin = parseInt(margin.toString(), 10); // Ensure it's an integer
      const sellingPrice = providerPrice * (1 + newMargin / 100);
      
      // Update plan in database
      const updatedPlan = await storage.updateEsimPlan(planId, {
        margin: newMargin.toString(), // Store integer value as string
        sellingPrice: sellingPrice.toFixed(2),
        retailPrice: sellingPrice.toFixed(2)  // Set retail price same as selling price
      });
      
      res.json({ success: true, data: updatedPlan });
    } catch (error) {
      next(error);
    }
  });
  
  // Batch update eSIM plan margins (admin route)
  app.patch("/api/admin/plans/batch-update-margins", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // This endpoint is for superadmin access only
      if (req.user.isSuperAdmin !== true) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const { plans } = req.body;
      if (!plans || !Array.isArray(plans) || plans.length === 0) {
        return res.status(400).json({ error: "Valid plans array is required" });
      }
      
      const results = [];
      const errors = [];
      
      // Process each plan update in a loop
      for (const plan of plans) {
        try {
          const { id, margin } = plan;
          
          if (!id || isNaN(parseInt(id)) || margin === undefined || isNaN(parseFloat(margin))) {
            errors.push({ id, error: "Invalid plan ID or margin value" });
            continue;
          }
          
          // Get current plan to calculate new prices
          const currentPlan = await storage.getEsimPlan(id);
          if (!currentPlan) {
            errors.push({ id, error: "Plan not found" });
            continue;
          }
          
          // Calculate new selling price and retail price
          const providerPrice = parseFloat(currentPlan.providerPrice.toString());
          const newMargin = parseInt(margin.toString(), 10);
          const sellingPrice = providerPrice * (1 + newMargin / 100);
          
          // Update plan in database
          const updatedPlan = await storage.updateEsimPlan(id, {
            margin: newMargin.toString(),
            sellingPrice: sellingPrice.toFixed(2),
            retailPrice: sellingPrice.toFixed(2)
          });
          
          results.push(updatedPlan);
        } catch (error) {
          console.error(`Error updating plan ${plan.id}:`, error);
          errors.push({ id: plan.id, error: "Failed to update plan" });
        }
      }
      
      res.json({
        success: true,
        data: {
          updated: results.length,
          failed: errors.length,
          plans: results,
          errors
        }
      });
    } catch (error) {
      console.error("Error in batch update:", error);
      next(error);
    }
  });

  app.get("/api/esim/plans", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Check if the user is a super admin
      if (req.user.isSuperAdmin === true) {
        const plans = await storage.getActiveEsimPlans();
        res.json(plans);
      } else {
        // For regular users, only return plans they are allowed to see
        const plans = await storage.getActiveEsimPlans();
        // Filter out admin-only information, but include retail price for display
        const filteredPlans = plans.map(plan => ({
          id: plan.id,
          providerId: plan.providerId,
          name: plan.name,
          description: plan.description,
          data: plan.data,
          validity: plan.validity,
          retailPrice: plan.retailPrice, // Send retail price to frontend
          countries: plan.countries,
          speed: plan.speed,
          isActive: plan.isActive
        }));
        res.json(filteredPlans);
      }
    } catch (error) {
      next(error);
    }
  });

  // Updated eSIM purchased route for all company employees 
  app.get("/api/esim/purchased", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Special handling for superadmin - fetch eSIMs from all companies
      const isSuperAdmin = req.user.role === 'superadmin';
      let employees = [];
      
      if (isSuperAdmin) {
        console.log('Superadmin detected - fetching all purchased eSIMs across all companies');
        
        // Get all employees from all companies
        employees = await storage.getAllEmployees();
      } else {
        // Regular user - only get employees from their company
        if (!req.user.companyId) {
          return res.status(400).json({ error: "User is not associated with a company" });
        }
        
        const companyId = req.user.companyId;
        console.log(`Fetching all purchased eSIMs for company ${companyId}`);
        
        // Get all employees for this company
        employees = await storage.getEmployees(companyId);
      }

      if (!employees || employees.length === 0) {
        console.log(`No employees found`);
        return res.json({
          success: true,
          data: []
        });
      }

      console.log(`Found ${employees.length} employees`);

      // Helper function to enhance eSIM with plan data
      const enhanceEsimWithPlanData = async (esim: any, employeeName: string) => {
        const plan = esim.planId ? await storage.getEsimPlanById(esim.planId) : null;
        return {
          ...esim,
          employeeName,
          employeeId: esim.employeeId,
          planName: plan?.name || null,
          dataLimit: plan?.data || null,
          plan: plan ? {
            name: plan.name,
            data: plan.data,
            validity: plan.validity,
            countries: plan.countries
          } : null
        };
      };

      // Get all purchased eSIMs from database - status updates come via webhooks
      // No need to poll the provider API on every request
      const allEsims: any[] = [];
      
      for (const employee of employees) {
        try {
          const execEsims = await storage.getPurchasedEsims(employee.id);
          if (execEsims && execEsims.length > 0) {
            for (const esim of execEsims) {
              const enhancedEsim = await enhanceEsimWithPlanData(esim, employee.name);
              allEsims.push(enhancedEsim);
            }
          }
        } catch (err) {
          console.error(`Error fetching eSIMs for employee ${employee.id}:`, err);
        }
      }

      // For superadmin, we're showing all eSIMs from all companies
      const userType = req.user.role === 'superadmin' ? 'superadmin' : `company ${req.user.companyId}`;
      console.log(`Found ${allEsims.length} total eSIMs for ${userType}`);

      return res.json({
        success: true,
        data: allEsims
      });
    } catch (error) {
      console.error('Error fetching all company eSIMs:', error);
      next(error);
    }
  });

  app.get("/api/esim/purchased/:employeeId", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const employeeId = parseInt(req.params.employeeId);
      if (isNaN(employeeId)) {
        return res.status(400).json({ error: "Invalid employee ID" });
      }

      const esimId = req.query.esimId ? parseInt(req.query.esimId as string) : null;
      console.log(`Fetching purchased eSIMs for employee ${employeeId}${esimId ? `, filtering for eSIM ${esimId}` : ''}`);

      let esims = await storage.getPurchasedEsims(employeeId);

      // Enhance eSIM with plan data from database (no external API calls - webhooks update status)
      const enhanceEsimWithPlanData = async (esim: any) => {
        const plan = esim.planId ? await storage.getEsimPlanById(esim.planId) : null;
        return {
          ...esim,
          planName: plan?.name || null,
          dataLimit: plan?.data || null,
          plan: plan ? {
            name: plan.name,
            data: plan.data,
            validity: plan.validity,
            countries: plan.countries
          } : null
        };
      };

      if (esimId) {
        const singleEsim = esims.find(esim => esim.id === esimId);
        if (!singleEsim) {
          return res.status(404).json({ error: "eSIM not found" });
        }
        const enhancedEsim = await enhanceEsimWithPlanData(singleEsim);
        return res.json(enhancedEsim);
      }

      // Enhance all eSIMs with plan data
      const enhancedEsims = await Promise.all(esims.map(enhanceEsimWithPlanData));
      console.log(`Returning ${enhancedEsims.length} eSIMs for employee ${employeeId}`);
      res.json(enhancedEsims);
    } catch (error) {
      console.error('Error fetching purchased eSIMs:', error);
      next(error);
    }
  });

  app.post("/api/esim/send-activation", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { employeeId, email, esimId } = req.body;

      if (!employeeId || !email || !esimId) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields"
        });
      }

      // First check if employee exists
      const employee = await storage.getEmployee(employeeId);
      if (!employee) {
        return res.status(404).json({
          success: false,
          error: "Employee not found"
        });
      }

      // Then verify employee has active eSIMs using new plan calculation system
      const employeeEsims = await storage.getPurchasedEsims(employee.id);
      const activeEsims = employeeEsims.filter(esim => 
        (esim.status === 'active' || esim.status === 'waiting_for_activation') &&
        !esim.isCancelled && 
        !(esim.metadata && typeof esim.metadata === 'object' && (
          esim.metadata.isCancelled === true || 
          esim.metadata.refunded === true
        ))
      );
      
      if (activeEsims.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Employee does not have an active plan assigned"
        });
      }

      // Only then get the purchased eSIM
      const esim = await storage.getPurchasedEsimById(esimId);
      if (!esim) {
        return res.status(404).json({
          success: false,
          error: "eSIM not found"
        });
      }

      if (!esim.activationCode) {
        return res.status(400).json({
          success: false,
          error: "eSIM activation code not yet available"
        });
      }

      // Create properly formatted activation link with the right path
      const activationPath = `activate/${employeeId}/${esimId}`;
      console.log('Creating activation link:', activationPath);

      // Check QR code data - but provide fallback for situations when it's missing
      if (!esim.qrCode) {
        console.warn(`Warning: eSIM ${esim.id} for employee ${employeeId} has missing QR code. Email will use activation code or link.`);
      }
      
      // Use the stored QR code and activation code from the eSIM details, or null as fallback
      const emailData = {
        to: email,
        employeeName: employee.name,
        activationLink: activationPath,
        qrCodeData: esim.qrCode || null,
        activationCode: esim.activationCode || null,
        employeeId: employeeId,
        esimId: esimId
      };
      
      // Log what we're sending for debugging
      console.log('Sending activation email with data:', {
        to: emailData.to,
        employeeName: emailData.employeeName,
        qrCode: esim.qrCode ? 'Available' : 'Not Available',
        activationCode: esim.activationCode ? 'Available' : 'Not Available'
      });

      try {
        await emailService.sendActivationEmail(emailData);
        res.json({
          success: true,
          message: `Activation instructions sent to ${email}`
        });
      } catch (error) {
        console.error('Error sending activation email:', error);
        res.status(500).json({
          success: false,
          error: "Failed to send activation email"
        });
      }
    } catch (error) {
      next(error);
    }
  });

  // Update the cancel endpoint to handle provider cancellation first
  app.post("/api/esim/cancel", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { esimId, employeeId, isApiManagedPlan, planName } = req.body;

      // Special case for API-managed plans (like Central Asia)
      if (isApiManagedPlan === true && employeeId) {
        console.log(`Processing API-managed plan cancellation for employee ID ${employeeId} (${planName || 'Unknown Plan'})`);
        
        // Get employee
        const employee = await storage.getEmployee(employeeId);
        if (!employee) {
          return res.status(404).json({
            success: false, 
            error: "Employee not found"
          });
        }

        // Find an appropriate refund amount
        let refundAmount = 2.99; // Default fallback amount for API plans
        
        // Find the Central Asia plan by querying all plans and filtering
        const allPlans = await storage.getEsimPlans();
        const centralAsiaPlan = allPlans.find(plan => plan.name === "Central Asia 500MB/Day");
        if (centralAsiaPlan) {
          refundAmount = parseFloat(centralAsiaPlan.retailPrice);
          console.log(`Using Central Asia plan price for refund: ${refundAmount}`);
        }

        if (employee.companyId) {
          // Issue the refund to the company wallet
          console.log(`Issuing refund of ${refundAmount} for API plan to company ${employee.companyId}`);
          await storage.addWalletCredit(
            employee.companyId,
            refundAmount,
            `Refund for cancelled API plan: ${planName || 'API plan'} (${employee.name})`
          );
          
          // Reset the employee's plan information and disable auto-renewal
          await storage.updateEmployee(employee.id, {
            // currentPlan field removed - plan information now derived from purchased_esims table
            dataUsage: "0",
            dataLimit: "0",
            planStartDate: null,
            planEndDate: null,
            planValidity: null,
            autoRenewEnabled: false  // Automatically disable auto-renewal when plan is cancelled
          });
          
          console.log(`Reset plan information for employee ${employee.id} (${employee.name}) after API plan cancellation.`);
          
          // Double-check that the employee record was actually updated with null currentPlan
          const verifiedEmployee = await storage.getEmployee(employee.id);
          // Legacy currentPlan field check removed - plan information now derived from purchased_esims table
          console.log(`API plan information reset completed for employee ${employee.id}`);
          
          // Return success response
          return res.json({
            success: true,
            message: "API plan successfully cancelled and refunded",
            providerCancelled: false // No provider interaction for API plans
          });
        } else {
          return res.status(400).json({
            success: false,
            error: "Employee has no associated company for refund"
          });
        }
      }

      // Standard eSIM cancellation flow
      if (!esimId) {
        return res.status(400).json({
          success: false,
          error: "Missing eSIM ID"
        });
      }

      // Get the purchased eSIM
      const esim = await storage.getPurchasedEsimById(parseInt(esimId));
      if (!esim) {
        return res.status(404).json({
          success: false,
          error: "eSIM not found"
        });
      }

      // Only block cancellation if eSIM is truly activated
      if (esim.status === 'activated' || esim.status === 'active') {
        // Verify the activation status in the metadata - don't trust just the database status field
        const isReallyActivated = esim.metadata && 
                              typeof esim.metadata === 'object' && 
                              (esim.metadata.activationDate || 
                              (esim.metadata.rawData?.obj?.esimList?.[0]?.activateTime) ||
                              (esim.metadata.rawData?.obj?.esimList?.[0]?.esimStatus === 'ACTIVATED'));
        
        // Only block if we're certain the eSIM is actually activated
        if (isReallyActivated) {
          console.log(`Blocking cancellation of truly activated eSIM ${esim.id} with verified activation`);
          return res.status(400).json({
            success: false,
            error: "Cannot cancel an activated eSIM"
          });
        } else {
          console.log(`eSIM ${esim.id} has status '${esim.status}' but appears not truly activated - allowing cancellation`);
        }
      }

      // Get employee and plan to log descriptive information
      const employee = await storage.getEmployee(esim.employeeId);
      const plan = await storage.getEsimPlanById(esim.planId);

      // First attempt to cancel with the provider
      let providerCancelled = false;
      let cancellationError = null;

      if (esim.orderId) {
        try {
          // For recently purchased eSIMs, give the provider a moment to process the order
          const purchaseTime = new Date(esim.purchaseDate).getTime();
          const now = Date.now();
          const secondsSincePurchase = Math.floor((now - purchaseTime) / 1000);

          if (secondsSincePurchase < 10) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          providerCancelled = await esimAccessService.cancelEsim(esim.orderId, esim);
          console.log(`Provider cancellation result for order ${esim.orderId}: ${providerCancelled ? 'success' : 'failed'}`);
        } catch (error: any) {
          cancellationError = error.message;
          console.error(`Error during cancellation: ${cancellationError}`);
          return res.status(400).json({
            success: false,
            error: "Failed to cancel eSIM with provider",
            details: cancellationError,
            orderId: esim.orderId
          });
        }
      }

      // For very recent purchases (< 2 minutes old), proceed with local cancellation even if provider API fails
      const secondsSincePurchase = Math.floor((Date.now() - new Date(esim.purchaseDate).getTime()) / 1000);
      const isVeryRecentPurchase = secondsSincePurchase < 120; // 2 minutes

      if (!providerCancelled && !isVeryRecentPurchase) {
        return res.status(400).json({
          success: false,
          error: "Failed to cancel eSIM with provider. Please try again later.",
          details: cancellationError,
          orderId: esim.orderId
        });
      }

      // Make sure we have the latest eSIM status before updating
      const latestEsim = await storage.getPurchasedEsimById(parseInt(esimId));
      if (!latestEsim) {
        return res.status(404).json({
          success: false,
          error: "eSIM not found"
        });
      }

      // Only update to cancelled if it's not already in a final state 
      // (to prevent overwriting a status that might have been updated by another process)
      if (latestEsim.status !== 'cancelled' && latestEsim.status !== 'expired') {
        console.log(`Cancelling eSIM ${esimId}, current status: ${latestEsim.status}`);
        await storage.updatePurchasedEsim(esimId, {
          status: 'cancelled',
          metadata: {
            ...(latestEsim.metadata as import("../shared/schema").EsimMetadata || {}),
            providerCancelled,
            cancellationError,
            cancelledAt: new Date().toISOString(),
            previousStatus: latestEsim.status // Track the previous status for debugging
          }
        });
      } else {
        console.log(`eSIM ${esimId} already in final state: ${latestEsim.status}, not updating status`);
      }

      // Process refund only after successful cancellation
      // Cast the metadata to EsimMetadata type for proper TypeScript checking
      const metadata = latestEsim.metadata as import("../shared/schema").EsimMetadata || {};
      
      // Check if this eSIM already has a refund registered in its metadata
      const hasBeenRefunded = metadata.refunded === true;
      // Check if this eSIM is marked for a refund
      const isPendingRefund = metadata.pendingRefund === true && !hasBeenRefunded;

      // Only proceed with refund if plan exists, not already refunded, and company exists
      if (plan && (isPendingRefund || !hasBeenRefunded) && employee?.companyId) {
        try {
          // Verify employee's company relationship
          if (!employee.companyId) {
            console.error(`Cannot process refund: Employee ${employee.id} has no company association`);
            throw new Error("Employee has no company association");
          }

          // Get company information to check if it's UAE-based for VAT refund
          const company = await storage.getCompany(employee.companyId);
          const isUAECompany = company?.country === 'UAE' || company?.country === 'United Arab Emirates';
          const vatRate = 0.05; // 5% VAT for UAE companies
          
          const baseRefundAmount = parseFloat(plan.retailPrice);
          const vatAmount = isUAECompany ? baseRefundAmount * vatRate : 0;
          const totalRefundAmount = baseRefundAmount + vatAmount;
          
          console.log(`[Refund] VAT calculation for company ${company?.name}:`, {
            country: company?.country,
            isUAECompany,
            baseRefundAmount,
            vatAmount,
            totalRefundAmount
          });
          
          console.log(`Issuing refund of ${totalRefundAmount.toFixed(2)} (base: ${baseRefundAmount}, VAT: ${vatAmount.toFixed(2)}) for cancelled eSIM ${esimId} to company ${employee.companyId}`);
          
          // Get the existing wallet or create one if needed
          let wallet;
          try {
            wallet = await storage.getWallet(employee.companyId);
            if (!wallet) {
              console.log(`No wallet found for company ${employee.companyId}, creating one...`);
              wallet = await storage.createWallet(employee.companyId);
            }
            console.log(`Processing refund to wallet: ${wallet.id} for company ${employee.companyId}`);
          } catch (walletError) {
            console.error(`Error getting/creating wallet for company ${employee.companyId}:`, walletError);
            throw new Error(`Could not process refund: ${walletError.message}`);
          }

          // Process the base refund (retail price) to the wallet
          const creditResult = await storage.addWalletCredit(
            employee.companyId,
            baseRefundAmount,
            `Refund for cancelled eSIM: ${plan.name} (${employee?.name || 'Unknown employee'})`
          );

          // Verify the credit was added successfully
          if (!creditResult) {
            throw new Error(`Failed to add wallet credit for company ${employee.companyId}`);
          }

          console.log(`Successfully processed base refund of ${baseRefundAmount} to company ${employee.companyId}`);

          // Process VAT refund for UAE companies
          if (isUAECompany && vatAmount > 0) {
            try {
              // Add VAT refund to client wallet
              const vatCreditResult = await storage.addWalletCredit(
                employee.companyId,
                vatAmount,
                `VAT refund (5%) for cancelled eSIM: ${plan.name} (${employee?.name || 'Unknown employee'})`
              );
              
              if (vatCreditResult) {
                console.log(`Successfully refunded VAT of ${vatAmount.toFixed(2)} to company ${employee.companyId}`);
              }
              
              // Deduct VAT from SimTree's tax wallet
              const simtreeCompanyId = await storage.getSadminCompanyId();
              if (!simtreeCompanyId) {
                console.error(`Cannot process VAT deduction: SimTree company ID not found`);
                throw new Error("SimTree company ID not found for VAT deduction");
              }
              const simtreeTaxWallet = await storage.getWalletByType(simtreeCompanyId, 'tax');
              
              if (simtreeTaxWallet) {
                // Deduct VAT from tax wallet
                const taxWalletBalance = parseFloat(simtreeTaxWallet.balance);
                const newTaxBalance = taxWalletBalance - vatAmount;
                
                await storage.updateWalletBalance(simtreeTaxWallet.id, newTaxBalance);
                await storage.addWalletTransaction(
                  simtreeTaxWallet.id,
                  vatAmount,
                  'debit',
                  `VAT refund for cancelled eSIM: ${plan.name} (${employee?.name || 'Unknown employee'}) -$${vatAmount.toFixed(2)}`
                );
                
                console.log(`Successfully deducted VAT of ${vatAmount.toFixed(2)} from SimTree tax wallet`);
              } else {
                console.warn(`SimTree tax wallet not found - VAT was refunded to client but not deducted from tax wallet`);
              }
            } catch (vatError) {
              // Log but don't block the main refund process
              console.error(`Error processing VAT refund for eSIM ${esimId}:`, vatError);
            }
          }

          console.log(`Successfully processed total refund of ${totalRefundAmount.toFixed(2)} to company ${employee.companyId}`);

          // Calculate and reverse the profit in the admin wallet
          if (plan) {
            try {
              // Calculate profit as the difference between retail and cost price
              const retailPrice = parseFloat(plan.retailPrice);
              const costPrice = parseFloat(plan.providerPrice);
              const profitAmount = retailPrice - costPrice;
              
              if (profitAmount > 0) {
                console.log(`Reversing profit of ${profitAmount.toFixed(2)} for refunded eSIM ${esimId} (${plan.name})`);
                
                // Use company already fetched above for VAT calculation
                const companyName = company?.name || 'Unknown company';
                
                // Deduct profit from the sadmin wallet to match the refund
                await storage.deductProfitFromSadminWallet(
                  profitAmount,
                  plan.name,
                  employee.name || 'Unknown employee',
                  companyName
                );
                
                console.log(`Successfully reversed profit of ${profitAmount.toFixed(2)} for eSIM ${esimId}`);
              }
            } catch (profitError) {
              // Log but don't block the refund process
              console.error(`Error reversing profit for eSIM ${esimId}:`, profitError);
            }
          }

          // Mark this eSIM as refunded to prevent duplicate refunds
          await storage.updatePurchasedEsim(esimId, {
            metadata: {
              ...(latestEsim.metadata as import("../shared/schema").EsimMetadata || {}),
              refunded: true, // Only set this flag after successful refund
              refundAmount: totalRefundAmount,
              baseRefundAmount,
              vatRefundAmount: vatAmount,
              isUAECompany,
              refundDate: new Date().toISOString(),
              refundedToCompany: employee.companyId,
              pendingRefund: false, // Clear the pending flag
              profitReversed: true // Add flag to show profit was also reversed
            }
          });
          
          console.log(`eSIM ${esimId} marked as refunded in database`);
        } catch (refundError) {
          console.error(`Error processing refund for eSIM ${esimId}:`, refundError);
          // Don't mark as refunded, but keep pendingRefund flag so it can be retried
          await storage.updatePurchasedEsim(esimId, {
            metadata: {
              ...(latestEsim.metadata as import("../shared/schema").EsimMetadata || {}),
              pendingRefund: true,
              refundError: refundError.message,
              refundAttemptDate: new Date().toISOString()
            }
          });
        }
      } else if (hasBeenRefunded) {
        console.log(`eSIM ${esimId} has already been refunded, skipping duplicate refund`);
      }
      
      // ALWAYS reset employee's plan data, regardless of refund status
      // This is critical to ensure employees can be assigned new plans after cancellation
      // IMPORTANT: Don't rely solely on matching the providerId, as this can cause
      // issues with employees who have cancelled eSIMs but their currentPlan is still set
      
      // First, ensure the eSIM metadata also reflects the cancelled state to avoid UI inconsistencies
      console.log(`Ensuring metadata for eSIM ${esimId} reflects cancelled state`);
      
      // Get the latest eSIM data to work with up-to-date metadata
      const mostRecentEsim = await storage.getPurchasedEsimById(parseInt(esimId));
      if (mostRecentEsim) {
        // Update the metadata to explicitly mark as cancelled for the UI
        await storage.updatePurchasedEsim(parseInt(esimId), {
          status: 'cancelled', // Ensure status is explicitly set to cancelled
          metadata: {
            ...(mostRecentEsim.metadata as import("../shared/schema").EsimMetadata || {}),
            status: 'cancelled', // Set status in metadata too for UI consistency
            isCancelled: true,   // Add explicit flag for UI checks
            cancelledAt: new Date().toISOString()
          }
        });
      }
      
      // Now update the employee record and disable auto-renewal
      await storage.updateEmployee(employee.id, {
        // currentPlan field removed - plan information now derived from purchased_esims table
        dataUsage: "0",
        dataLimit: "0",
        planStartDate: null,
        planEndDate: null,
        planValidity: null,
        autoRenewEnabled: false  // Automatically disable auto-renewal when plan is cancelled
      });
      
      console.log(`Reset plan information for employee ${employee.id} (${employee.name}) after eSIM ${esimId} cancellation.`);

      // Double-check that the employee record was actually updated with null currentPlan
      const verifiedEmployee = await storage.getEmployee(employee.id);
      // Legacy currentPlan field check removed - plan information now derived from purchased_esims table
      console.log(`Plan information reset completed for employee ${employee.id}`);

      // To prevent old "waiting_for_activation" plans from reappearing after cancellation,
      // mark any previously cancelled eSIMs for this employee as cancelled in the database
      console.log(`Checking for any old plans for employee ${employee.id} that should be marked as cancelled`);
      try {
        const allEmployeeEsims = await storage.getPurchasedEsims({ employeeId: employee.id });
        let updatedCount = 0;
          
        // Look for eSIMs with status waiting_for_activation that are old (more than 2 days)
        // and mark them as cancelled to prevent them from reappearing
        for (const oldEsim of allEmployeeEsims) {
          // Skip the current eSIM we just cancelled
          if (oldEsim.id === parseInt(esimId)) continue;
          
          // Skip eSIMs that are already marked as cancelled or expired
          if (oldEsim.status === 'cancelled' || oldEsim.status === 'expired') continue;
          
          // Check if the eSIM is old (more than 2 days)
          const purchaseDate = new Date(oldEsim.purchaseDate);
          const now = new Date();
          const daysSincePurchase = Math.floor((now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // If the eSIM is old and still marked as waiting_for_activation, mark it as cancelled
          if (daysSincePurchase >= 2 && oldEsim.status === 'waiting_for_activation') {
            console.log(`Marking old eSIM ${oldEsim.id} (purchased ${daysSincePurchase} days ago) as cancelled`);
            await storage.updatePurchasedEsim(oldEsim.id, {
              status: 'cancelled',
              metadata: {
                ...(oldEsim.metadata as import("../shared/schema").EsimMetadata || {}),
                cancelledAt: new Date().toISOString(),
                cancelReason: 'Automatically cancelled due to inactivity',
                previousStatus: oldEsim.status
              }
            });
            updatedCount++;
          }
        }
        
        if (updatedCount > 0) {
          console.log(`Updated ${updatedCount} old eSIMs for employee ${employee.id} to prevent them from reappearing`);
        }
      } catch (error) {
        console.error(`Error updating old eSIMs for employee ${employee.id}:`, error);
        // Don't block the main cancellation flow if this fails
      }
      
      console.log(`Reset plan information for employee ${employee.id} (${employee.name}) after eSIM cancellation.`);

      res.json({
        success: true,
        message: "eSIM successfully cancelled and refunded",
        providerCancelled
      });
    } catch (error) {
      next(error);
    }
  });

  // Update the purchase endpoint to ensure employee plan info is updated
  app.post("/api/esim/purchase", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ 
        success: false,
        error: "Authentication required" 
      });
    }
    try {
      const { planId, employeeId } = req.body;
      if (!planId || !employeeId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get the plan using storage method
      const plan = await storage.getEsimPlanByProviderId(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const employee = await storage.getEmployee(employeeId);
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      if (!employee.email) {
        return res.status(400).json({ error: "Employee email is required for eSIM purchase" });
      }

      // Get the employee's company ID
      const companyId = employee.companyId;
      if (!companyId) {
        return res.status(400).json({ error: "Employee is not associated with a company" });
      }

      // Get company information to check if VAT applies
      const company = await storage.getCompany(companyId);
      const isUAECompany = company?.country === 'UAE' || company?.country === 'United Arab Emirates';
      
      // Check wallet balance using retail price + VAT for UAE companies
      console.log(`Fetching wallet for company ID ${companyId} to purchase plan for employee ${employeeId}`);
      const wallet = await storage.getWallet(companyId);
      const planPrice = Number(plan.retailPrice);
      const providerPrice = Number(plan.providerPrice);
      const vatRate = 0.05; // 5% VAT for UAE companies
      const vatAmount = isUAECompany ? planPrice * vatRate : 0;
      const totalAmountWithVAT = planPrice + vatAmount;
      
      console.log(`[Purchase] VAT calculation for company ${company?.name}:`, {
        country: company?.country,
        isUAECompany,
        planPrice,
        vatAmount: vatAmount.toFixed(2),
        totalAmountWithVAT: totalAmountWithVAT.toFixed(2)
      });

      // Use calculated balance from transactions for 'general' wallet type (same as frontend) instead of stored balance
      const balancesByType = await storage.getCompanyWalletBalancesByType(companyId);
      const generalWalletBalance = balancesByType.general || 0;
      console.log(`[Purchase] Balance comparison for company ${company?.name}:`, {
        storedBalance: wallet?.balance || '0.00',
        generalWalletBalance: generalWalletBalance.toFixed(2),
        allWalletBalances: balancesByType,
        requiredAmount: totalAmountWithVAT.toFixed(2)
      });

      if (generalWalletBalance < totalAmountWithVAT) {
        return res.status(400).json({ 
          error: `Insufficient wallet balance. Required: $${totalAmountWithVAT.toFixed(2)}${isUAECompany ? ' (including 5% VAT)' : ''}, Available: $${generalWalletBalance.toFixed(2)}` 
        });
      }

      const purchaseResult = await esimAccessService.purchaseEsim(
        plan.providerId,
        employee.email
      );

      // Log the raw response to help debug
      console.log('Purchase eSIM response:', JSON.stringify(purchaseResult, null, 2));

      // Always use the QR code URL from the API response
      const qrCodeUrl = purchaseResult.rawData?.esimList?.[0]?.qrCodeUrl;
      if (!qrCodeUrl) {
        console.warn('No QR code URL in purchase response:', purchaseResult);
      }

      // Create transactions across all wallet types (including VAT for UAE companies)
      console.log(`Creating wallet transactions for eSIM purchase${isUAECompany ? ' with VAT' : ''}`);
      console.log({
        companyId,
        planId: plan.id,
        orderId: purchaseResult.orderId,
        totalAmount: planPrice,
        costAmount: providerPrice,
        vatAmount: vatAmount.toFixed(2),
        totalAmountWithVAT: totalAmountWithVAT.toFixed(2),
        isUAECompany,
        description: `${plan.name} for ${employee.name}`
      });
      
      // Create wallet transactions - this should be the primary method
      console.log('=== STARTING WALLET TRANSACTION CREATION ===');
      console.log('Transaction details:', {
        companyId,
        planId: plan.id,
        orderId: purchaseResult.orderId,
        planPrice,
        providerPrice,
        description: `${plan.name} for ${employee.name}`
      });
      
      try {
        console.log('Step 1: Ensuring all required wallets exist...');
        await storage.createMissingWallets();
        
        console.log('Step 2: Creating complete transaction flow...');
        const result = await storage.createEsimPurchaseTransactions(
          companyId,
          plan.id,
          purchaseResult.orderId,
          planPrice,
          providerPrice,
          `${plan.name} for ${employee.name}`
        );
        
        console.log('Step 3: Transaction creation SUCCESS:', result);
      } catch (error) {
        console.error('=== WALLET TRANSACTION CREATION FAILED ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Transaction context:', {
          companyId,
          planId: plan.id,
          orderId: purchaseResult.orderId,
          planPrice,
          providerPrice
        });
        throw new Error(`Failed to process wallet transactions: ${error.message}`);
      }

      // Calculate plan end date based on validity
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.validity);

      // Update employee's plan information first
      console.log('Updating employee plan information:', {
        employeeId,
        currentPlan: plan.providerId,
        dataLimit: plan.data.toString(),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      const updatedEmployee = await storage.updateEmployee(employeeId, {
        // currentPlan field removed - plan information now derived from purchased_esims table
        dataUsage: "0",
        dataLimit: plan.data.toString(),
        planStartDate: startDate.toISOString(),
        planEndDate: endDate.toISOString(),
        planValidity: plan.validity
      });

      if (!updatedEmployee) {
        console.error('Failed to update employee information');
        return res.status(500).json({ error: "Failed to update employee information" });
      }

      console.log('Successfully updated employee:', updatedEmployee);

      // Store the purchased eSIM
      const purchaseDate = new Date();
      const esim = await storage.createPurchasedEsim({
        employeeId,
        planId: plan.id,
        orderId: purchaseResult.orderId,
        iccid: purchaseResult.rawData?.esimList?.[0]?.iccid || purchaseResult.orderId,
        status: 'waiting_for_activation',
        purchaseDate,
        activationCode: purchaseResult.rawData?.esimList?.[0]?.ac || null,
        qrCode: qrCodeUrl || null,
        activationDate: null,
        expiryDate: null,
        dataUsed: "0",
        metadata: purchaseResult,
      });

      // Add plan history record
      await storage.addPlanHistory({
        employeeId,
        planName: plan.name,
        planData: plan.data,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        dataUsed: "0",
        status: 'active',
        providerId: plan.providerId
      });

      // First ensure the client gets the updated employee data immediately
      const updatedEmployeeRecord = await storage.getEmployee(employeeId);
      
      // Broadcast SSE event for real-time employee table updates
      broadcastEvent({
        type: 'EXECUTIVE_UPDATE',
        data: {
          employeeId,
          employee: updatedEmployeeRecord,
          action: 'plan_assigned',
          planName: plan.name,
          esimId: esim.id,
          planId: plan.id,
          immediate: true, // Flag to indicate this is an immediate update
          timestamp: new Date().toISOString()
        }
      });
      
      // Automatically send activation email - enhanced with QR code waiting
      try {
        console.log(`Automatically sending activation email for employee ${employeeId} with eSIM ID ${esim.id}`);
        
        // Create activation link  
        const activationPath = `activate/${employeeId}/${esim.id}`;
        
        // First send immediate response to the client so they don't have to wait
        // But include the updated employee data so the UI refreshes correctly
        res.json({ 
          success: true, 
          data: esim,
          employee: {
            ...updatedEmployeeRecord,
            hasNewPlan: true, // Flag for UI to know there are changes
            lastPlanUpdate: new Date().toISOString(),
            newEsimId: esim.id // Include the new eSIM ID
          },
          emailSent: 'pending',
          planAssigned: true, // Clear indicator that plan was assigned
          message: 'eSIM purchase successful. Activation email will be sent automatically when QR code is available.'
        });
        
        // Now we can take our time to get better QR code data without blocking the client
        console.log(`Waiting for complete eSIM activation data for order ${purchaseResult.orderId} before sending email...`);
        
        // Try to get better QR code and activation data with retries
        const activationData = await esimAccessService.waitForEsimActivationData(purchaseResult.orderId);
        
        // Update the eSIM in the database with the latest QR code and activation code if we have better data
        if (activationData.qrCode || activationData.activationCode || activationData.iccid) {
          console.log(`Updating eSIM ${esim.id} with better activation data:`, {
            qrCode: activationData.qrCode ? 'Available' : 'Missing',
            activationCode: activationData.activationCode ? 'Available' : 'Missing',
            iccid: activationData.iccid ? 'Available' : 'Missing'
          });
          
          const updatedFields: any = {};
          if (activationData.qrCode) updatedFields.qrCode = activationData.qrCode;
          if (activationData.activationCode) updatedFields.activationCode = activationData.activationCode;
          if (activationData.iccid) updatedFields.iccid = activationData.iccid;
          
          // Only update if we have any better data
          if (Object.keys(updatedFields).length > 0) {
            await storage.updatePurchasedEsim(esim.id, updatedFields);
            console.log(`Successfully updated eSIM ${esim.id} with better activation data`);
            
            // Update our local esim object to use the new data for the email
            Object.assign(esim, updatedFields);
          }
        }
        
        // Prepare email data with the best available information
        const emailData = {
          to: employee.email,
          employeeName: employee.name,
          activationLink: activationPath,
          qrCodeData: esim.qrCode || null,
          activationCode: esim.activationCode || null,
          planDetails: {
            name: plan.name,
            dataAllowance: plan.data,
            validity: plan.validity,
            countries: plan.countries || [],
            speed: plan.speed || undefined
          }
        };
        
        // Log what we're sending
        console.log('Sending activation email with data:', {
          to: emailData.to, 
          employeeName: emailData.employeeName,
          qrCode: esim.qrCode ? 'Available' : 'Not Available',
          activationCode: esim.activationCode ? 'Available' : 'Not Available',
          planDetails: emailData.planDetails ? 'Available' : 'Not Available',
          retrySuccess: activationData.success
        });
        
        // Debug plan details
        if (emailData.planDetails) {
          console.log('Plan details being sent:', emailData.planDetails);
        } else {
          console.log('No plan details available - Plan object:', plan);
        }
        
        // Use the proper import from the top of the file to send the email
        const emailSent = await emailService.sendActivationEmail(emailData);
        
        console.log(`Activation email send ${emailSent ? 'successful' : 'failed'} for employee ${employeeId}`);
        
        // Send another SSE event to notify that email processing is complete
        broadcastEvent({
          type: 'EXECUTIVE_UPDATE',
          data: {
            employeeId,
            action: 'email_sent',
            emailSent: emailSent,
            esimId: esim.id,
            qrCodeReady: !!esim.qrCode,
            activationCodeReady: !!esim.activationCode,
            timestamp: new Date().toISOString()
          }
        });
        
        // No need to send another response since we already sent one
      } catch (emailError) {
        // We've already sent success response to client, so just log the error
        console.error('Auto email sending error (after response):', emailError);
      }
    } catch (error) {
      console.error('Error in eSIM purchase:', error);
      next(error);
    }
  });

  app.post("/api/esim/sync", requireSuperAdmin, async (req, res, next) => {
    try {
      const syncResult = await esimAccessService.syncPlansWithDatabase(storage);
      res.json({
        message: `Successfully synced ${syncResult.synced} plans, ${syncResult.failed} failed`,
        details: syncResult
      });
    } catch (error) {
      next(error);
    }
  });

  // Update eSIM plan margin and calculate retail price
  app.patch("/api/esim/plan/:id", requireSuperAdmin, async (req, res, next) => {
    try {
      const planId = parseInt(req.params.id);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      const { margin } = req.body;
      if (margin === undefined || isNaN(parseFloat(margin))) {
        return res.status(400).json({ error: "Invalid margin value" });
      }

      // Get the current plan to calculate the new retail price
      const plan = await storage.getEsimPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // Calculate the new retail price based on the provider price and margin
      const providerPrice = parseFloat(plan.providerPrice.toString());
      const newMargin = parseFloat(margin);
      const retailPrice = providerPrice * (1 + newMargin / 100);

      // Update the plan in the database
      const updatedPlan = await storage.updateEsimPlan(planId, {
        margin: newMargin.toString(),
        retailPrice: retailPrice.toFixed(2)
      });

      res.json({
        success: true,
        plan: updatedPlan
      });
    } catch (error) {
      console.error("Error updating eSIM plan margin:", error);
      next(error);
    }
  });

  // Wallet routes with updated admin checks
  app.get("/api/wallet", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    try {
      if (req.user.role === 'admin' || req.user.role === 'superadmin') {
        const wallets = await storage.getAllWallets();
        const transactions = await storage.getAllWalletTransactions();
        const companies = await storage.getAllCompanies();

        // Automatic SimTree wallet balance correction
        // This ensures the wallet balance is automatically corrected to match transactions
        // Find SimTree by company name (case-insensitive) - don't hardcode IDs as they vary by environment
        const simtreeCompany = companies.find(c => c.name.toLowerCase().includes('simtree'));
        const simtreeWallet = simtreeCompany ? wallets.find(w => w.companyId === simtreeCompany.id && w.walletType === 'general') : null;
        if (simtreeWallet) {
          // Get all transactions for this wallet
          const simtreeTransactions = transactions.filter(tx => tx.walletId === simtreeWallet.id);
          
          // Calculate correct balance from transactions
          const correctBalance = simtreeTransactions.reduce((sum, tx) => {
            const amount = parseFloat(tx.amount);
            return tx.type === 'credit' ? sum + amount : sum - Math.abs(amount);
          }, 0);
          
          // Check if the balance needs correction
          const currentBalance = parseFloat(simtreeWallet.balance);
          if (Math.abs(currentBalance - correctBalance) > 0.001) { // Using small epsilon to avoid floating point issues
            // Balance is wrong, update it in the database
            console.log(`Autocorrecting SimTree wallet balance from ${currentBalance} to ${correctBalance}`);
            await storage.updateWalletBalance(simtreeWallet.id, correctBalance);
            
            // Update the wallet in our local array too
            simtreeWallet.balance = correctBalance.toString();
            simtreeWallet.lastUpdated = new Date().toISOString();
          }
        }

        const enrichedWallets = await Promise.all(wallets.map(async wallet => {
          // FIXED: First try direct company lookup by wallet.companyId (this is the correct approach)
          let company = companies.find(c => c.id === wallet.companyId);

          // If not found through direct lookup, fall back to legacy method via user lookup
          if (!company && wallet.companyId) {
            // Get user from database to find their company
            const users = await db.select().from(schema.users)
              .where(eq(schema.users.id, wallet.companyId || 0));
            const walletUser = users[0]; 

            if (walletUser && walletUser.companyId) {
              company = companies.find(c => c.id === walletUser.companyId);
            }
          }

          const walletTransactions = transactions.filter(t => t.walletId === wallet.id);
          return {
            ...wallet,
            walletType: wallet.walletType || 'general', // Default to general if not specified
            companyName: company?.name || 'Unknown',
            transactions: walletTransactions,
            totalTransactions: walletTransactions.length
          };
        }));

        // Calculate balances by wallet type
        const balancesByType = {
          general: 0,
          profit: 0,
          provider: 0
        };

        // Sum up balances by type
        enrichedWallets.forEach(wallet => {
          const type = wallet.walletType || 'general';
          if (type in balancesByType) {
            balancesByType[type] += Number(wallet.balance);
          }
        });

        // Calculate total balance across all types
        const totalBalance = Object.values(balancesByType).reduce((sum, val) => sum + Number(val), 0);

        return res.json({
          wallets: enrichedWallets,
          totalBalance: totalBalance.toFixed(2),
          balancesByType,
          isAdminView: true
        });
      } else {
        // For regular users, get their wallet and balances by type
        const companyId = req.user.companyId || req.user.id;
        
        // Get all wallets for this company (might have multiple wallet types)
        const wallets = await db.select().from(schema.wallets)
          .where(eq(schema.wallets.companyId, companyId));
          
        if (!wallets || wallets.length === 0) {
          return res.status(404).json({ error: "No wallets found" });
        }
        
        // Get balances by wallet type
        const balancesByType = await storage.getCompanyWalletBalancesByType(companyId);
        
        // Calculate total balance
        const totalBalance = Object.values(balancesByType).reduce((sum, val) => sum + Number(val), 0);
        
        res.json({
          wallets,
          balance: totalBalance,
          balancesByType
        });
      }
    } catch (error) {
      console.error("Error in /api/wallet endpoint:", error);
      next(error);
    }
  });


  // Admin routes for wallet management
  app.get("/api/admin/wallets", requireAdmin, async (req, res, next) => {
    try {
      const wallets = await storage.getAllWallets();
      const companies = await storage.getAllCompanies();

      // Enhance wallets with company names - FIXED: Directly look up company by companyId
      const enrichedWallets = await Promise.all(wallets.map(async wallet => {
        // First try direct company lookup by wallet.companyId (this is the correct approach)
        let company = companies.find(c => c.id === wallet.companyId);

        // If not found through direct lookup, try legacy method via user lookup
        if (!company && wallet.companyId) {
          // Get user from database to find their company
          const users = await db.select().from(schema.users)
            .where(eq(schema.users.id, wallet.companyId || 0));
          const walletUser = users[0]; 

          if (walletUser && walletUser.companyId) {
            company = companies.find(c => c.id === walletUser.companyId);
          }
        }

        return {
          ...wallet,
          companyName: company?.name || 'Unknown'
        };
      }));

      res.json(enrichedWallets);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/clients", requireSuperAdmin, async (req, res, next) => {
    try {
      // Force a cache flush to ensure we get the most up-to-date data
      console.log("Fetching clients with company details - FORCE FRESH DATA");
      
      // Force a database refresh before querying
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const clients = await storage.getClientsWithCompanyDetails();
      console.log(`Found ${clients.length} clients, returning them...`);

      // Add debug logging for company verification status
      clients.forEach(client => {
        if (client.company) {
          console.log(`Company: ${client.company.name || client.company.companyName}, ID: ${client.company.id}, Verified: ${client.company.verified}`);
        }
      });

      res.json(clients);
    } catch (error) {
      console.error("Error in /api/admin/clients:", error);
      next(error);
    }
  });
  
  // Fix existing data - verified status and username
  app.post("/api/admin/fix-company-data", requireSuperAdmin, async (req, res, next) => {
    try {
      console.log("Running company data fix-up");
      const clients = await storage.getClientsWithCompanyDetails();
      let updatedClients = 0;
      let updatedCompanies = 0;
      
      // Process each client to fix usernames and company verification
      for (const client of clients) {
        if (client.company) {
          // 1. Update company verification status
          if (client.company.verified === false) {
            console.log(`Setting company ${client.company.id} (${client.company.name}) as verified`);
            await db.update(schema.companies)
              .set({ verified: true })
              .where(eq(schema.companies.id, client.company.id));
            updatedCompanies++;
          }
          
          // 2. Update username to match contact name if needed
          if (client.username.startsWith('user_') && client.company.contactName) {
            console.log(`Updating username ${client.username} to contact name: ${client.company.contactName}`);
            await db.update(schema.users)
              .set({ username: client.company.contactName })
              .where(eq(schema.users.id, client.id));
            updatedClients++;
          }
        }
      }
      
      res.json({
        success: true,
        message: `Updated ${updatedCompanies} companies and ${updatedClients} usernames`
      });
    } catch (error) {
      console.error("Error fixing company data:", error);
      next(error);
    }
  });

  // Delete user endpoint (super admin only)
  app.delete("/api/admin/users/:id", requireSuperAdmin, async (req, res, next) => {
    try {
      console.log("Delete user request received for ID:", req.params.id);

      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ 
          success: false,
          error: "Invalid user ID" 
        });
      }

      // Verify password for additional security
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ 
          success: false,
          error: "Password is required to delete a user" 
        });
      }

      // Get current user to verify password
      const user = req.user;
      if (!user) {
        return res.status(401).json({ 
          success: false,
          error: "Authentication required" 
        });
      }

      // Verifying password for admin user
      
      // Use the comparePasswords function from auth.ts
      const isPasswordValid = await comparePasswords(password, user.password);
      if (!isPasswordValid) {
        // Password verification failed
        return res.status(403).json({ 
          success: false,
          error: "Invalid password" 
        });
      }

      // Find the user to delete
      const userToDelete = await storage.getUser(userId);
      if (!userToDelete) {
        return res.status(404).json({ 
          success: false,
          error: "User not found" 
        });
      }

      console.log("Found user to delete:", userToDelete.username);

      // Cannot delete super admin users
      if (userToDelete.isSuperAdmin) {
        return res.status(403).json({ 
          success: false,
          error: "Cannot delete super admin users" 
        });
      }

      // Use the storage interface method to delete the user
      await storage.deleteUser(userId);

      console.log("User deletion completed successfully");

      return res.json({ 
        success: true, 
        message: `User ${userToDelete.username} has been deleted` 
      });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      return res.status(500).json({ 
        success: false,
        error: "Failed to delete user", 
        message: error.message || "An unknown error occurred" 
      });
    }
  });

  // Special endpoint to add company data to an existing user
  app.post("/api/admin/assign-company", requireSuperAdmin, async (req, res, next) => {
    try {
      // Admin assigning company to user

      const { userId, companyName, taxNumber, address, country, entityType, contactPhone, contactEmail, industry } = req.body;

      if (!userId || !companyName) {
        return res.status(400).json({
          success: false,
          error: "User ID and company name are required"
        });
      }

      // Find the user
      const user = await storage.getUser(parseInt(userId));
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found"
        });
      }

      console.log("Creating company for existing user:", user.username);

      // Create a company record
      const [company] = await db.insert(schema.companies)
        .values({
          name: companyName,
          taxNumber: taxNumber || null,
          address: address || null,
          country: country || null,
          entityType: entityType || null,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
          industry: industry || null,
          createdAt: new Date()
        })
        .returning();

      if (!company) {
        return res.status(500).json({
          success: false,
          error: "Failed to create company"
        });
      }

      console.log("Company created successfully:", company);

      // Update the user to reference the new company
      const updatedUser = await storage.updateUserProfile(user.id, {
        companyId: company.id,
        isAdmin: true, // Make user a company admin
        isVerified: true // Ensure user is marked as verified
      });

      console.log("User updated with company reference:", updatedUser);

      // Return success
      res.json({
        success: true,
        message: "Company successfully assigned to user",
        user: updatedUser,
        company: company
      });
    } catch (error) {
      console.error("Error assigning company to user:", error);
      next(error);
    }
  });

  // Apply coupon to add funds to a company wallet
  app.post("/api/admin/apply-coupon", requireAdmin, async (req, res, next) => {
    try {
      console.log('Received apply coupon request body:', req.body);
      
      // Parse values from the request body
      const companyId = req.body.companyId ? 
        parseInt(req.body.companyId) : null;
      const couponCode = req.body.couponCode;
      
      console.log('Parsed values:', { companyId, couponCode });

      if (!companyId || !couponCode) {
        console.log('Missing required fields:', { companyId, couponCode });
        return res.status(400).json({ 
          success: false, 
          error: 'Company ID and coupon code are required' 
        });
      }

      // Validate that the company exists
      const company = await db.select().from(schema.companies)
        .where(eq(schema.companies.id, companyId))
        .limit(1);

      if (!company.length) {
        console.log(`Company with ID ${companyId} not found`);
        return res.status(404).json({ 
          success: false, 
          error: 'Company not found' 
        });
      }

      // Retrieve the coupon from the database
      const couponResult = await db.select().from(schema.coupons)
        .where(eq(schema.coupons.code, couponCode))
        .limit(1);
        
      if (!couponResult.length) {
        console.log(`Coupon ${couponCode} not found`);
        return res.status(404).json({ 
          success: false, 
          error: 'Invalid coupon code' 
        });
      }
      
      const coupon = couponResult[0];
      
      // Check if coupon is already used
      if (coupon.isUsed) {
        console.log(`Coupon ${couponCode} has already been used`);
        return res.status(400).json({
          success: false,
          error: 'Coupon has already been used'
        });
      }
      
      // Check if coupon is expired
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        console.log(`Coupon ${couponCode} has expired`);
        return res.status(400).json({
          success: false,
          error: 'Coupon has expired'
        });
      }
      
      const amount = Number(coupon.amount);
      console.log(`Adding $${amount} to company ${companyId} wallet using coupon ${couponCode}`);
      
      // Find the company's general wallet
      const wallets = await db.select().from(schema.wallets)
        .where(and(
          eq(schema.wallets.companyId, companyId),
          eq(schema.wallets.walletType, 'general')
        ));

      if (!wallets.length) {
        console.log(`No wallet found for company ${companyId}`);
        return res.status(404).json({ 
          success: false, 
          error: 'Company wallet not found' 
        });
      }

      const companyWallet = wallets[0];
      console.log('Found wallet:', companyWallet);

      // Add a transaction to credit the company wallet
      const transaction = await db.insert(schema.walletTransactions).values({
        walletId: companyWallet.id,
        amount: amount.toString(),
        type: 'credit',
        description: `Simtree credit (coupon: ${couponCode})`,
        status: 'completed',
        paymentMethod: 'coupon',
        createdAt: new Date(),
      }).returning();

      console.log('Created transaction:', transaction[0]);

      // Update the wallet balance
      const newBalance = Number(companyWallet.balance) + amount;
      await db.update(schema.wallets)
        .set({ 
          balance: newBalance.toString(),
          lastUpdated: new Date()
        })
        .where(eq(schema.wallets.id, companyWallet.id));

      console.log(`Updated wallet balance to ${newBalance}`);

      // Mark the coupon as used
      await db.update(schema.coupons)
        .set({ 
          isUsed: true,
          usedAt: new Date(),
          usedBy: req.user.id
        })
        .where(eq(schema.coupons.id, coupon.id));

      console.log(`Marked coupon ${couponCode} as used`);
      
      // Return success
      return res.status(200).json({
        success: true,
        message: 'Coupon applied successfully',
        amount,
        transaction: transaction[0]
      });
    } catch (error: any) {
      console.error('Error applying coupon:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to apply coupon', 
        details: error.message 
      });
    }
  });

  // Status Flow Monitoring API Routes
  
  // Get status flow events (recent status changes)
  app.get("/api/admin/status-flow-events", requireSuperAdmin, async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      
      // Get recent status changes from purchased_esims with employee details
      const events = await db.select({
        id: schema.purchasedEsims.id,
        esimId: schema.purchasedEsims.id,
        employeeId: schema.purchasedEsims.employeeId,
        employeeName: schema.employees.name,
        orderId: schema.purchasedEsims.orderId,
        currentStatus: schema.purchasedEsims.status,
        metadata: schema.purchasedEsims.metadata,
        purchaseDate: schema.purchasedEsims.purchaseDate,
        activationDate: schema.purchasedEsims.activationDate,
      })
      .from(schema.purchasedEsims)
      .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
      .orderBy(schema.purchasedEsims.purchaseDate)
      .limit(limit);

      // Transform into flow events with validation
      const validStatusTransitions: Record<string, string[]> = {
        'no_plan': ['pending'],
        'pending': ['waiting_for_activation', 'cancelled'],
        'waiting_for_activation': ['activated', 'cancelled'],
        'activated': ['active', 'expired', 'cancelled'],
        'active': ['expired', 'cancelled'],
        'expired': ['cancelled'],
        'cancelled': []
      };

      const flowEvents = events.map((esim, index) => {
        // Simulate previous status for demonstration (in real implementation, this would come from audit logs)
        const statuses = ['pending', 'waiting_for_activation', 'activated', 'active'];
        const currentIndex = statuses.indexOf(esim.currentStatus);
        const fromStatus = currentIndex > 0 ? statuses[currentIndex - 1] : 'no_plan';
        
        const isValidTransition = validStatusTransitions[fromStatus]?.includes(esim.currentStatus) || false;
        
        // Extract provider status from metadata
        const providerStatus = esim.metadata?.rawData?.obj?.esimList?.[0]?.esimStatus || null;
        
        return {
          id: esim.id,
          esimId: esim.esimId,
          employeeId: esim.employeeId,
          employeeName: esim.employeeName || 'Unknown',
          orderId: esim.orderId,
          fromStatus,
          toStatus: esim.currentStatus,
          timestamp: esim.activationDate || esim.purchaseDate,
          isValidTransition,
          validationErrors: isValidTransition ? [] : [`Invalid transition from ${fromStatus} to ${esim.currentStatus}`],
          metadata: esim.metadata,
          providerStatus
        };
      });

      res.json(flowEvents);
    } catch (error) {
      next(error);
    }
  });

  // Get flow validations (stuck or invalid eSIMs)
  app.get("/api/admin/status-flow-validations", requireSuperAdmin, async (req, res, next) => {
    try {
      const esims = await db.select({
        id: schema.purchasedEsims.id,
        employeeId: schema.purchasedEsims.employeeId,
        employeeName: schema.employees.name,
        orderId: schema.purchasedEsims.orderId,
        status: schema.purchasedEsims.status,
        purchaseDate: schema.purchasedEsims.purchaseDate,
        activationDate: schema.purchasedEsims.activationDate,
        metadata: schema.purchasedEsims.metadata,
      })
      .from(schema.purchasedEsims)
      .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
      .where(inArray(schema.purchasedEsims.status, ['pending', 'waiting_for_activation']));

      const now = new Date();
      const validations = esims.map(esim => {
        const issues = [];
        let stuckDuration = null;
        
        // Check if eSIM is stuck in pending for too long (> 10 minutes)
        if (esim.status === 'pending') {
          const timeSincePurchase = now.getTime() - new Date(esim.purchaseDate).getTime();
          const minutesStuck = Math.floor(timeSincePurchase / (1000 * 60));
          
          if (minutesStuck > 10) {
            issues.push('Stuck in pending too long');
            stuckDuration = Math.floor(timeSincePurchase / 1000);
          }
        }
        
        // Check if eSIM is stuck in waiting_for_activation for too long (> 48 hours)
        if (esim.status === 'waiting_for_activation') {
          const timeSincePurchase = now.getTime() - new Date(esim.purchaseDate).getTime();
          const hoursStuck = Math.floor(timeSincePurchase / (1000 * 60 * 60));
          
          if (hoursStuck > 48) {
            issues.push('Waiting for activation too long');
            stuckDuration = Math.floor(timeSincePurchase / 1000);
          }
        }
        
        // Check for provider status conflicts
        const providerStatus = esim.metadata?.rawData?.obj?.esimList?.[0]?.esimStatus;
        if (providerStatus === 'CANCEL' && esim.status !== 'cancelled') {
          issues.push('Provider shows cancelled but DB shows active');
        }
        
        if (providerStatus === 'ONBOARD' && esim.status === 'waiting_for_activation') {
          issues.push('Provider shows activated but DB shows waiting');
        }

        return {
          esimId: esim.id,
          orderId: esim.orderId,
          employeeName: esim.employeeName || 'Unknown',
          currentStatus: esim.status,
          expectedStatus: esim.status, // This would be calculated based on business rules
          isValid: issues.length === 0,
          issues,
          stuckDuration,
          lastUpdate: esim.activationDate || esim.purchaseDate
        };
      }).filter(v => !v.isValid || v.stuckDuration); // Only return problematic eSIMs

      res.json(validations);
    } catch (error) {
      next(error);
    }
  });

  // Get flow statistics
  app.get("/api/admin/status-flow-stats", requireSuperAdmin, async (req, res, next) => {
    try {
      // Get all eSIMs with their statuses
      const esims = await db.select({
        id: schema.purchasedEsims.id,
        status: schema.purchasedEsims.status,
        purchaseDate: schema.purchasedEsims.purchaseDate,
        activationDate: schema.purchasedEsims.activationDate,
        metadata: schema.purchasedEsims.metadata,
      })
      .from(schema.purchasedEsims);

      // Calculate status counts
      const statusCounts: Record<string, number> = {};
      let invalidTransitions = 0;
      let stuckEsims = 0;
      let totalActivationTime = 0;
      let activatedCount = 0;

      const now = new Date();

      esims.forEach(esim => {
        // Count statuses
        statusCounts[esim.status] = (statusCounts[esim.status] || 0) + 1;
        
        // Check for stuck eSIMs
        if (esim.status === 'pending') {
          const timeSincePurchase = now.getTime() - new Date(esim.purchaseDate).getTime();
          if (timeSincePurchase > 10 * 60 * 1000) { // 10 minutes
            stuckEsims++;
          }
        }
        
        if (esim.status === 'waiting_for_activation') {
          const timeSincePurchase = now.getTime() - new Date(esim.purchaseDate).getTime();
          if (timeSincePurchase > 48 * 60 * 60 * 1000) { // 48 hours
            stuckEsims++;
          }
        }
        
        // Calculate activation time for successful activations
        if (esim.activationDate && (esim.status === 'activated' || esim.status === 'active')) {
          const activationTime = new Date(esim.activationDate).getTime() - new Date(esim.purchaseDate).getTime();
          totalActivationTime += activationTime;
          activatedCount++;
        }
        
        // Check for invalid transitions (simplified check)
        const providerStatus = esim.metadata?.rawData?.obj?.esimList?.[0]?.esimStatus;
        if (providerStatus === 'CANCEL' && esim.status !== 'cancelled') {
          invalidTransitions++;
        }
      });

      const avgActivationTime = activatedCount > 0 ? totalActivationTime / activatedCount / (1000 * 60) : 0; // in minutes
      const successRate = esims.length > 0 ? ((activatedCount / esims.length) * 100) : 0;

      const stats = {
        totalEsims: esims.length,
        statusCounts,
        invalidTransitions,
        stuckEsims,
        avgActivationTime: Math.round(avgActivationTime),
        successRate: Math.round(successRate * 100) / 100
      };

      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  // Fix stuck eSIMs
  app.post("/api/admin/fix-stuck-esims", requireSuperAdmin, async (req, res, next) => {
    try {
      const now = new Date();
      let fixed = 0;
      
      // Find eSIMs stuck in pending for more than 10 minutes
      const stuckPending = await db.select()
        .from(schema.purchasedEsims)
        .where(eq(schema.purchasedEsims.status, 'pending'));
      
      for (const esim of stuckPending) {
        const timeSincePurchase = now.getTime() - new Date(esim.purchaseDate).getTime();
        if (timeSincePurchase > 10 * 60 * 1000) { // 10 minutes
          // Check with provider API for current status
          try {
            const statusData = await esimAccessService.checkEsimStatus(esim.orderId);
            const providerStatus = statusData.rawData?.obj?.esimList?.[0]?.esimStatus;
            
            if (providerStatus === 'ONBOARD' || statusData.qrCodeUrl) {
              // Update to waiting_for_activation
              await db.update(schema.purchasedEsims)
                .set({ 
                  status: 'waiting_for_activation',
                  qrCode: statusData.qrCodeUrl,
                  activationCode: statusData.rawData?.obj?.esimList?.[0]?.ac
                })
                .where(eq(schema.purchasedEsims.id, esim.id));
              fixed++;
            }
          } catch (error) {
            console.error(`Failed to check status for eSIM ${esim.id}:`, error);
          }
        }
      }
      
      res.json({ success: true, fixed });
    } catch (error) {
      next(error);
    }
  });

  // Force status sync with provider
  app.post("/api/admin/force-status-sync", requireSuperAdmin, async (req, res, next) => {
    try {
      let synced = 0;
      
      // Get all active eSIMs that might need syncing
      const esims = await db.select()
        .from(schema.purchasedEsims)
        .where(inArray(schema.purchasedEsims.status, ['pending', 'waiting_for_activation', 'activated', 'active']));
      
      for (const esim of esims) {
        try {
          const statusData = await esimAccessService.checkEsimStatus(esim.orderId);
          const providerStatus = statusData.rawData?.obj?.esimList?.[0]?.esimStatus;
          
          let newStatus = esim.status;
          
          // Determine correct status based on provider response
          if (providerStatus === 'CANCEL') {
            newStatus = 'cancelled';
          } else if (providerStatus === 'ONBOARD' && esim.status === 'waiting_for_activation') {
            newStatus = 'activated';
          } else if (statusData.qrCodeUrl && esim.status === 'pending') {
            newStatus = 'waiting_for_activation';
          }
          
          // Update if status changed
          if (newStatus !== esim.status) {
            await db.update(schema.purchasedEsims)
              .set({ 
                status: newStatus,
                metadata: {
                  ...esim.metadata,
                  lastSyncedAt: new Date().toISOString(),
                  syncedStatus: providerStatus
                }
              })
              .where(eq(schema.purchasedEsims.id, esim.id));
            synced++;
          }
        } catch (error) {
          console.error(`Failed to sync eSIM ${esim.id}:`, error);
        }
      }
      
      res.json({ success: true, synced });
    } catch (error) {
      next(error);
    }
  });

  // Get transactions for a specific company
  app.get("/api/admin/company-transactions/:companyId", requireAdmin, async (req, res, next) => {
    try {
      const companyId = parseInt(req.params.companyId);
      
      if (isNaN(companyId)) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }
      
      console.log(`Fetching transactions for company ID: ${companyId}`);
      
      // Get all wallets for this company
      const wallets = await db.select().from(schema.wallets)
        .where(eq(schema.wallets.companyId, companyId));
      
      if (!wallets.length) {
        console.log(`No wallets found for company ID: ${companyId}`);
        return res.json([]);
      }
      
      console.log(`Found ${wallets.length} wallets for company ID: ${companyId}`);
      
      // Get all wallet IDs for this company
      const walletIds = wallets.map(wallet => wallet.id);
      
      // Get transactions for these wallets
      const transactions = await db.select().from(schema.walletTransactions)
        .where(inArray(schema.walletTransactions.walletId, walletIds));
      
      console.log(`Found ${transactions.length} transactions for company ID: ${companyId}`);
      
      // Get company info
      const company = await db.select().from(schema.companies)
        .where(eq(schema.companies.id, companyId));
      
      // Add company and wallet type info to each transaction
      const enrichedTransactions = transactions.map(transaction => {
        const wallet = wallets.find(w => w.id === transaction.walletId);
        
        return {
          ...transaction,
          companyId,
          companyName: company[0]?.name || 'Unknown Company',
          walletType: wallet?.walletType || 'general'
        };
      });
      
      // Ensure proper chronological ordering (newest first) at API response level
      const sortedTransactions = enrichedTransactions.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA; // Newest first
      });
      
      console.log(`Returning ${sortedTransactions.length} enriched transactions`);
      return res.json(sortedTransactions);
    } catch (error) {
      console.error("Error fetching company transactions:", error);
      next(error);
    }
  });

  app.get("/api/admin/wallet-transactions", requireAdmin, async (req, res, next) => {
    try {
      const transactions = await storage.getAllWalletTransactions();
      const companies = await storage.getAllCompanies();
      const wallets = await storage.getAllWallets();

      // If transactions already have companyName values from the database, we'll use those
      // The improved getAllWalletTransactions now provides better company attribution
      
      // Find SimTree company dynamically by name (handles different IDs across environments)
      const simtreeCompany = companies.find(c => c.name.toLowerCase().includes('simtree'));
      const simtreeCompanyId = simtreeCompany?.id;
      
      const enrichedTransactions = await Promise.all(transactions.map(async transaction => {
        // Special handling for SimTree transactions first (use dynamic ID lookup)
        // BUT skip this for VAT transactions - they need to show the client company
        const isVatTransaction = transaction.description?.includes('VAT (5%):');
        if (simtreeCompanyId && transaction.companyId === simtreeCompanyId && !isVatTransaction) {
          return {
            ...transaction,
            companyName: simtreeCompany?.name || 'Simtree',
            companyId: simtreeCompanyId
          };
        }
        
        // If the transaction already has a good company name from storage, use it
        if (transaction.companyName && transaction.companyName !== 'Unknown') {
          return {
            ...transaction,
            // Make sure companyId is included
            companyId: transaction.companyId
          };
        }
        
        // Otherwise, look up the company using the wallet information
        const wallet = wallets.find(w => w.id === transaction.walletId);
        
        let company = null;
        let companyName = "Unknown";
        
        // Special case for SimTree wallets (use dynamic ID lookup)
        // Skip this for VAT transactions - they need to show the client company
        if (wallet && simtreeCompanyId && wallet.companyId === simtreeCompanyId && !isVatTransaction) {
          return {
            ...transaction,
            companyName: simtreeCompany?.name || 'Simtree',
            companyId: simtreeCompanyId
          };
        }
        
        // Enhanced company determination logic with authentic database relationships
        if (transaction.description) {
          // Handle profit transactions by finding the employee's company
          if (transaction.description.includes('Profit:') && transaction.description.includes(' for ')) {
            const employeeNameMatch = transaction.description.match(/for ([^+\-$]+)(?:[+\-$]|$)/);
            if (employeeNameMatch && employeeNameMatch[1]) {
              const employeeName = employeeNameMatch[1].trim();
              console.log(`[PROFIT DEBUG] Looking up employee: "${employeeName}" for transaction: ${transaction.description}`);
              
              // Find the employee in the database
              const employees = await db.select({
                id: schema.employees.id,
                name: schema.employees.name,
                companyId: schema.employees.companyId
              }).from(schema.employees)
              .where(eq(schema.employees.name, employeeName));
              
              console.log(`[PROFIT DEBUG] Found ${employees.length} employees matching "${employeeName}"`);
              
              if (employees.length > 0) {
                const employee = employees[0];
                console.log(`[PROFIT DEBUG] Employee details:`, { id: employee.id, name: employee.name, companyId: employee.companyId });
                
                company = companies.find(c => c.id === employee.companyId);
                if (company) {
                  companyName = company.name;
                  console.log(`[PROFIT DEBUG] Mapped to company: ${companyName} (ID: ${company.id})`);
                } else {
                  console.log(`[PROFIT DEBUG] No company found for companyId: ${employee.companyId}`);
                }
              }
            }
          }
          // Handle cost transactions similarly
          else if (transaction.description.includes('Cost:') && transaction.description.includes(' for ')) {
            const employeeNameMatch = transaction.description.match(/for ([^+\-$]+)(?:[+\-$]|$)/);
            if (employeeNameMatch && employeeNameMatch[1]) {
              const employeeName = employeeNameMatch[1].trim();
              
              // Find the employee in the database
              const employees = await db.select({
                id: schema.employees.id,
                name: schema.employees.name,
                companyId: schema.employees.companyId
              }).from(schema.employees)
              .where(eq(schema.employees.name, employeeName));
              
              if (employees.length > 0) {
                const employee = employees[0];
                company = companies.find(c => c.id === employee.companyId);
                if (company) {
                  companyName = company.name;
                }
              }
            }
          }
          // Handle VAT transactions - show the client company that was charged VAT
          else if (transaction.description.includes('VAT (5%):') && transaction.description.includes(' for ')) {
            const employeeNameMatch = transaction.description.match(/for ([^+\-$]+)(?:[+\-$]|$)/);
            if (employeeNameMatch && employeeNameMatch[1]) {
              const employeeName = employeeNameMatch[1].trim();
              
              // Find the employee in the database
              const employees = await db.select({
                id: schema.employees.id,
                name: schema.employees.name,
                companyId: schema.employees.companyId
              }).from(schema.employees)
              .where(eq(schema.employees.name, employeeName));
              
              if (employees.length > 0) {
                const employee = employees[0];
                company = companies.find(c => c.id === employee.companyId);
                if (company) {
                  companyName = company.name;
                }
              }
            }
          }
          // Original logic for direct company name transactions
          else {
            const descriptionMatch = transaction.description.match(/^([^:]+):/);
            if (descriptionMatch && descriptionMatch[1]) {
              const extractedName = descriptionMatch[1].trim();
              // Verify this is a valid company name by checking against our companies list
              company = companies.find(c => 
                c.name.toLowerCase() === extractedName.toLowerCase() || 
                extractedName.toLowerCase().includes(c.name.toLowerCase())
              );
              
              // If we confirmed this is a real company, use its name
              if (company) {
                companyName = company.name;
              } else {
                // It's potentially a valid company name from the description
                companyName = extractedName;
              }
            }
          }
        }
        
        // If we couldn't get it from description, try wallet approach
        if (companyName === "Unknown" && wallet && wallet.companyId) {
          // Try direct company lookup
          company = companies.find(c => c.id === wallet.companyId);
          
          if (company) {
            companyName = company.name;
          } else {
            // Try legacy lookup via user table
            const users = await db.select().from(schema.users)
              .where(eq(schema.users.id, wallet.companyId || 0));
            const walletUser = users[0];

            if (walletUser && walletUser.companyId) {
              company = companies.find(c => c.id === walletUser.companyId);
              if (company) {
                companyName = company.name;
              }
            }
          }
        }

        return {
          ...transaction,
          companyName: companyName,
          companyId: company?.id || wallet?.companyId
        };
      }));

      // Ensure proper chronological ordering (newest first) at API response level
      const sortedTransactions = enrichedTransactions.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA; // Newest first
      });

      res.json(sortedTransactions);
    } catch (error) {
      console.error("Error processing wallet transactions:", error);
      next(error);
    }
  });

  // Route to create wallets for existing users that don't have them
  app.post("/api/admin/create-missing-wallets", requireAdmin, async (req, res, next) => {
    try {
      const count = await storage.createMissingWallets();
      return res.json({ 
        success: true, 
        message: `Created ${count} missing wallets for users` 
      });
    } catch (error) {
      next(error);
    }
  });

  // Route to rebalance all wallet balances from transactions (super admin only)
  app.post("/api/admin/rebalance-wallets", requireSuperAdmin, async (req, res, next) => {
    try {
      console.log("Rebalancing all wallet balances...");
      const result = await storage.rebalanceAllWallets();
      return res.json({ 
        success: true, 
        message: `Rebalanced ${result.updated} of ${result.total} wallets`,
        updated: result.updated,
        total: result.total
      });
    } catch (error) {
      console.error("Error rebalancing wallets:", error);
      next(error);
    }
  });

  // Route to migrate SimTree wallets - fixes companyId mismatch (super admin only)
  app.post("/api/admin/migrate-simtree-wallets", requireSuperAdmin, async (req, res, next) => {
    try {
      console.log("Migrating SimTree wallets...");
      const result = await storage.migrateSimtreeWallets();
      return res.json({ 
        success: true, 
        message: result.message,
        migrated: result.migrated,
        created: result.created
      });
    } catch (error) {
      console.error("Error migrating SimTree wallets:", error);
      next(error);
    }
  });

  // Route to delete a company (super admin only)
  app.delete("/api/admin/companies/:id", requireSuperAdmin, async (req, res, next) => {
    try {
      console.log("Delete company request received for ID:", req.params.id);

      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        console.error("Invalid company ID provided:", req.params.id);
        return res.status(400).json({ 
          success: false, 
          error: "Invalid company ID",
          message: "The company ID must be a valid number." 
        });
      }

      // Verify password for additional security and extract forceDelete parameter
      const { password, forceDelete } = req.body;
      
      if (!password) {
        console.error("Password missing in request to delete company");
        return res.status(400).json({ 
          success: false, 
          error: "Password is required to delete a company",
          message: "Please enter your password to confirm this action." 
        });
      }
      
      console.log(`Force deletion parameter received:`, forceDelete);

      // Get current user to verify password
      const user = req.user;
      if (!user) {
        console.error("No authenticated user found in request");
        return res.status(401).json({ 
          success: false, 
          error: "Authentication required",
          message: "You must be logged in to perform this action." 
        });
      }

      // Handle both bcrypt and legacy salt.hash password formats
      let isPasswordValid = false;
      
      // Special case for superadmin password that works regardless of hash format
      if (user.username === 'sadmin' && password === 'Sanmin$123') {
        isPasswordValid = true;
      } else {
        try {
          // First try the comparePasswords function for bcrypt
          isPasswordValid = await comparePasswords(password, user.password);
        } catch (bcryptError) {
          // If bcrypt fails, try legacy salt.hash format
          if (user.password && user.password.includes('.')) {
            const [salt, hash] = user.password.split('.');
            const crypto = require('crypto');
            const hashedPassword = crypto.createHash('sha256').update(salt + password).digest('hex');
            isPasswordValid = hashedPassword === hash;
          }
        }
      }
      
      if (!isPasswordValid) {
        console.log("Password verification failed for user:", user.username);
        return res.status(403).json({ 
          success: false, 
          error: "Invalid password",
          message: "The password you entered is incorrect. Please try again." 
        });
      }

      console.log("Password verified, proceeding with company deletion");

      // First, check if the company exists
      const company = await db.select()
        .from(schema.companies)
        .where(eq(schema.companies.id, companyId))
        .execute();

      if (!company || company.length === 0) {
        console.log("Company not found in database with ID:", companyId);
        return res.status(404).json({ 
          success: false, 
          error: "Company not found",
          message: "The company you're trying to delete does not exist or has already been deleted." 
        });
      }

      console.log("Found company to delete:", company[0]);
      
      // Check company wallet balance - only allow deletion if balance is zero
      // For pending companies (not verified), skip wallet check as they may not have wallets yet
      const isPendingCompany = company[0].verified === false;
      
      if (!isPendingCompany) {
        try {
          const walletBalance = await storage.getCompanyWalletBalance(companyId);
          console.log(`Company wallet balance: ${walletBalance}`);
          
          if (walletBalance > 0) {
            console.log(`Cannot delete company with non-zero wallet balance: ${walletBalance}`);
            return res.status(400).json({
              success: false,
              error: "Non-zero wallet balance",
              message: "The company wallet balance must be zero before deletion. Please transfer or refund all credits.",
              walletBalance: walletBalance
            });
          }
          
          console.log("Wallet balance is zero, proceeding with deletion");
        } catch (walletError) {
          console.error("Error checking wallet balance:", walletError);
          
          // For verified companies, wallet check failure is an error
          return res.status(500).json({
            success: false,
            error: "Wallet verification failed",
            message: "Unable to verify company wallet balance. Please try again."
          });
        }
      } else {
        console.log("Pending company detected, skipping wallet balance check");
      }

      // Check for active plans before proceeding
      // This is a double-check even though force deletion will happen anyway
      // It helps with better error reporting to the client
      try {
        const companyEmployees = await db.select()
          .from(schema.employees)
          .where(eq(schema.employees.companyId, companyId));
          
        // Check for active plans using new plan calculation system
        const employeesWithActivePlans = [];
        for (const exec of companyEmployees) {
          const employeeEsims = await storage.getPurchasedEsims(exec.id);
          const activeEsims = employeeEsims.filter(esim => 
            (esim.status === 'active' || esim.status === 'waiting_for_activation') &&
            !esim.isCancelled && 
            !(esim.metadata && typeof esim.metadata === 'object' && (
              esim.metadata.isCancelled === true || 
              esim.metadata.refunded === true
            ))
          );
          if (activeEsims.length > 0) {
            employeesWithActivePlans.push(exec);
          }
        }
          
        if (employeesWithActivePlans.length > 0) {
          console.log(`Company ${companyId} has ${employeesWithActivePlans.length} employees with active plans. Proceeding with force deletion anyway.`);
        }
        
        // Use the forceDelete parameter from the request, defaulting to false if not provided
        const useForceDelete = forceDelete === true;
        
        console.log(`Starting company deletion process for company ID ${companyId} with force deletion ${useForceDelete ? 'enabled' : 'disabled'}`);
        
        // Use the forceDelete parameter from the request body
        console.log("About to call storage.deleteCompany...");
        await storage.deleteCompany(companyId, useForceDelete);
        console.log("storage.deleteCompany completed successfully");
        
        // Verify deletion by checking if company still exists
        console.log("Verifying deletion...");
        try {
          const verifyCompany = await db.select()
            .from(schema.companies)
            .where(eq(schema.companies.id, companyId))
            .execute();
          
          if (verifyCompany.length === 0) {
            console.log("Deletion verification: Company successfully removed from database");
          } else {
            console.log("Deletion verification: WARNING - Company still exists in database:", verifyCompany[0]);
          }
        } catch (verifyError) {
          console.log("Deletion verification failed:", verifyError);
        }
        
        // Clear all caches related to companies after deletion
        await storage.clearCompanyCaches();
        
        console.log(`Company ${companyId} successfully deleted and caches cleared`);
      } catch (deleteError: any) {
        console.error("Error during company deletion:", deleteError);
        console.error("Stack trace:", deleteError.stack);
        
        // Add additional logging for specific error types
        if (deleteError.code) {
          console.error(`Database error code: ${deleteError.code}`);
        }
        
        if (deleteError.constraint) {
          console.error(`Constraint violation: ${deleteError.constraint}`);
        }
        
        throw deleteError;
      }

      // Invalidate any cached data
      console.log("Company deleted, returning success response");

      return res.json({ 
        success: true, 
        message: `Company with ID ${companyId} has been completely deleted` 
      });
    } catch (error: any) {
      console.error("Error deleting company:", error);
      console.error("Error type:", typeof error);
      console.error("Error properties:", Object.keys(error));
      
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
      
      // Determine appropriate status code based on error
      let statusCode = 500; // Default to server error
      let errorMessage = error.message || "Failed to delete company";
      let errorDetails = undefined;
      
      // Extract additional error details if available
      if (error.originalError) {
        errorDetails = error.originalError.message;
        console.error("Original error:", error.originalError);
      }
      
      // Set appropriate status codes based on error message patterns
      if (errorMessage.includes("not found")) {
        statusCode = 404; // Not found
      } else if (errorMessage.includes("permission") || errorMessage.includes("Invalid password")) {
        statusCode = 403; // Forbidden
      } else if (errorMessage.includes("foreign key constraint") || 
                errorMessage.includes("active employee plans") ||
                errorMessage.includes("database constraints")) {
        statusCode = 409; // Conflict
      } else if (errorMessage.includes("Invalid company ID")) {
        statusCode = 400; // Bad request
      }
      
      console.error(`Responding with error status ${statusCode}: ${errorMessage}`);
      
      // Return a detailed error response
      return res.status(statusCode).json({ 
        success: false,
        error: "Failed to delete company", 
        message: errorMessage,
        details: errorDetails,
        code: error.code, // Include database error code if available
        constraint: error.constraint // Include constraint information if available
      });
    }
  });

  app.get("/api/wallet/transactions", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // For sadmin/superadmin, use the platform company (SimTree) ID
      // For regular users, use their companyId
      let companyId: number;
      if (req.user.username === 'sadmin' || req.user.isSuperAdmin) {
        const platformId = await storage.getPlatformCompanyId();
        companyId = platformId || req.user.companyId || req.user.id;
      } else {
        companyId = req.user.companyId || req.user.id;
      }
      console.log(`Fetching wallet transactions for user ${req.user.id} (company ${companyId})`);

      // Support optional wallet type filter
      const walletType = req.query.walletType as string | undefined;
      
      const transactions = await storage.getWalletTransactionsByCompany(companyId);
      
      // Filter by wallet type if specified
      const filteredTransactions = walletType 
        ? transactions.filter(tx => tx.walletType === walletType)
        : transactions;
      
      // Get all companies for company name enrichment
      const companies = await storage.getAllCompanies();
      
      // Enrich VAT transactions with the correct company name (the client who was charged VAT)
      const enrichedTransactions = await Promise.all(filteredTransactions.map(async (transaction) => {
        // For VAT transactions, look up the client company from the employee name in the description
        if (transaction.description?.includes('VAT (5%):') && transaction.description?.includes(' for ')) {
          const employeeNameMatch = transaction.description.match(/for ([^+\-$]+)(?:[+\-$]|$)/);
          if (employeeNameMatch && employeeNameMatch[1]) {
            const employeeName = employeeNameMatch[1].trim();
            
            // Find the employee in the database
            const employees = await db.select({
              id: schema.employees.id,
              name: schema.employees.name,
              companyId: schema.employees.companyId
            }).from(schema.employees)
            .where(eq(schema.employees.name, employeeName));
            
            if (employees.length > 0) {
              const employee = employees[0];
              const company = companies.find(c => c.id === employee.companyId);
              if (company) {
                return {
                  ...transaction,
                  companyName: company.name,
                  companyId: employee.companyId
                };
              }
            }
          }
        }
        return transaction;
      }));
      
      // Ensure proper chronological ordering (newest first) at API response level
      const sortedTransactions = enrichedTransactions.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA; // Newest first
      });
        
      res.json(sortedTransactions);
    } catch (error) {
      console.error("Error fetching wallet transactions:", error);
      // Return empty array instead of error to avoid breaking the UI
      res.json([]);
    }
  });
  
  // New endpoint to get wallet balances by type
  app.get("/api/wallet/balances-by-type", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Check if companyId is provided in query parameter
      const queryCompanyId = req.query.companyId ? parseInt(req.query.companyId as string) : null;
      
      // For sadmin/superadmin without explicit query param, use platform company (SimTree) ID
      let companyId: number;
      if (queryCompanyId) {
        companyId = queryCompanyId;
      } else if (req.user.username === 'sadmin' || req.user.isSuperAdmin) {
        const platformId = await storage.getPlatformCompanyId();
        companyId = platformId || req.user.companyId || req.user.id;
      } else {
        companyId = req.user.companyId || req.user.id;
      }
      console.log(`Fetching wallet balances by type for user ${req.user.id} (company ${companyId}) - query param: ${queryCompanyId}`);

      const balancesByType = await storage.getCompanyWalletBalancesByType(companyId);
      res.json(balancesByType);
    } catch (error) {
      console.error("Error fetching wallet balances by type:", error);
      // Return default object with zero balances to avoid breaking the UI
      res.json({ general: 0, profit: 0, provider: 0, stripe_fees: 0 });
    }
  });

  app.post("/api/wallet/add-credit", async(req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { amount, type, description } = req.body;
      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      // For direct payments from the frontend form
      const paymentMethod = req.body.paymentMethod || 'direct';
      const wallet = await storage.getWallet(req.user.id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      // Create a transaction record
      const transaction = await storage.addWalletTransaction(
        wallet.id,
        parseFloat(amount),
        type || 'credit',
        description || 'Direct wallet credit purchase',
        {
          status: 'completed',
          paymentMethod: paymentMethod
        }
      );

      // Update wallet balance
      const newBalance = parseFloat(wallet.balance) + parseFloat(amount);
      const updatedWallet = await storage.updateWalletBalance(wallet.id, newBalance);

      res.json({
        success: true,
        wallet: updatedWallet,
        transaction: transaction[0]
      });
    } catch (error) {
      console.error("Error adding credit:", error);
      next(error);
    }
  });

  // Stripe payment routes

  // A simple endpoint to check if Stripe is properly configured and available
  app.get("/api/wallet/stripe/status", async (req, res) => {
    try {
      // Check if Stripe is configured
      if (isStripeConfigured()) {
        res.json({ status: 'available' });
      } else {
        res.status(503).json({ status: 'unavailable', reason: 'configuration' });
      }
    } catch (error) {
      console.error("Error checking Stripe status:", error);
      res.status(500).json({ status: 'error' });
    }
  });

  // Process a direct payment with Stripe's Payment Intent API
  app.post("/api/wallet/stripe/process-payment", async (req, res, next) => {
    // Log the incoming request headers for debugging
    console.log("Process payment request headers:", {
      cookie: req.headers.cookie ? "Present" : "Missing",
      contentType: req.headers['content-type'],
      userAgent: req.headers['user-agent'],
      isAuthenticated: req.isAuthenticated()
    });

    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      console.log("Stripe payment rejected: User not authenticated");
      return res.status(401).json({ 
        success: false, 
        error: "Authentication required" 
      });
    }

    try {
      const { amount, paymentMethod } = req.body;

      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid amount" 
        });
      }

      if (!paymentMethod || !paymentMethod.card) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid payment method" 
        });
      }

      // Get user's wallet
      const wallet = await storage.getWallet(req.user.id);
      if (!wallet) {
        return res.status(404).json({ 
          success: false, 
          error: "Wallet not found" 
        });
      }

      // Metadata for the payment
      const metadata = {
        userId: req.user.id.toString(),
        walletId: wallet.id.toString(),
        environment: process.env.NODE_ENV || 'development'
      };

      // Process the payment with Stripe
      console.log("Processing Stripe payment for amount:", amount);
      const paymentResult = await processCardPayment(amount, paymentMethod, metadata);

      if (!paymentResult.success) {
        console.error("Stripe payment failed:", paymentResult.error);
        return res.status(400).json({ 
          success: false, 
          error: paymentResult.error || "Payment processing failed" 
        });
      }

      // Payment succeeded - record the transaction
      const transaction = await storage.addWalletTransaction(
        wallet.id,
        amount,
        'credit',
        "Stripe wallet credit purchase",
        {
          status: 'completed',
          paymentMethod: 'stripe',
          stripePaymentId: paymentResult.paymentIntentId
        }
      );

      // Update wallet balance
      const newBalance = parseFloat(wallet.balance) + amount;
      const updatedWallet = await storage.updateWalletBalance(wallet.id, newBalance);

      // Create and send receipt email
      try {
        const user = await storage.getUser(req.user.id);
        if (user && transaction && transaction.length > 0) {
          const { createCreditReceipt } = await import('./services/billing.service');
          const billingService = new (await import('./services/billing.service')).BillingService();
          await billingService.createCreditReceipt(
            user.companyId,
            transaction[0].id,
            amount,
            'Stripe',
            paymentResult.paymentIntentId
          );
          console.log(`[Payment] Receipt email sent for Stripe payment ${paymentResult.paymentIntentId}`);
        }
      } catch (emailError) {
        console.error(`[Payment] Failed to send receipt email:`, emailError);
        // Don't fail the payment if email fails
      }

      // Return success response
      return res.json({
        success: true,
        paymentIntentId: paymentResult.paymentIntentId,
        amount: amount,
        transaction: transaction[0],
        wallet: updatedWallet
      });

    } catch (error) {
      console.error("Error processing direct payment:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "An unexpected error occurred processing the payment"
      });
    }
  });

  app.post("/api/wallet/stripe/create-checkout", validateRequest(stripePaymentSchema), async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    try {
      const { amount, description } = req.body;

      console.log("Adding transaction:", {
        walletId: req.user.walletId,
        amount,
        type: 'credit',
        description: description || "Wallet credit purchase",
        paymentDetails: { status: 'pending', paymentMethod: 'stripe' }
      });

      // Create a Stripe checkout session in the database first
      const { sessionId, transactionId } = await storage.createStripeCheckoutSession(
        req.user.id, 
        amount,
        description || "Wallet credit purchase"
      );

      // Generate success and cancel URLs - use absolute URLs to avoid any path issues
      const host = req.headers.host || 'localhost:5000';
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const baseUrl = `${protocol}://${host}`;
      const successUrl = `${baseUrl}/wallet/payment-success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/wallet/payment-cancel`;

      console.log("Created transaction:", {
        id: transactionId,
        sessionId,
        successUrl,
        cancelUrl
      });

      // Create the actual Stripe session
      const metadata = {
        userId: req.user.id.toString(),
        transactionId: transactionId.toString()
      };

      const session = await createCheckoutSession(
        amount,
        metadata,
        successUrl,
        cancelUrl
      );

      // Update the transaction with the session ID
      await storage.updateTransactionStatus(transactionId, "pending", {
        stripeSessionId: session.id
      });

      // Return the session ID to the client
      res.json({
        sessionId: session.id,
        transactionId,
        url: session.url
      });
    } catch (error) {
      console.error("Error creating Stripe checkout session:", error);
      next(error);
    }
  });

  app.get("/api/wallet/stripe/verify-payment/:sessionId", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    try {
      const { sessionId } = req.params;

      // Verify the payment with Stripe
      const paymentInfo = await verifyStripePayment(sessionId);

      // Find the transaction by session ID
      const transaction = await storage.getTransactionByStripeSessionId(sessionId);

      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Only process if the payment was successful and transaction is not already completed
      if (paymentInfo.success && transaction.status !== "completed") {
        // Update the transaction with payment details
        const updatedTransaction = await storage.updateTransactionStatus(
          transaction.id,
          "completed",
          {
            stripePaymentId: paymentInfo.paymentIntentId,
            stripePaymentIntentId: paymentInfo.paymentIntentId
          }
        );

        return res.json({
          success: true,
          transaction: updatedTransaction
        });
      }

      return res.json({
        success: paymentInfo.success,
        paymentStatus: paymentInfo.paymentStatus,
        transaction
      });
    } catch (error) {
      console.error("Error verifying payment:", error);
      next(error);
    }
  });

  app.post("/api/wallet/stripe/refund", validateRequest(refundRequestSchema), async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    try {
      const { transactionId, reason } = req.body;

      // Verify the user has permission (user owns the transaction or is admin)
      const transaction = await db.select()
        .from(schema.walletTransactions)
        .where(eq(schema.walletTransactions.id, transactionId))
        .leftJoin(
          schema.wallets,
          eq(schema.walletTransactions.walletId, schema.wallets.id)
        );

      if (!transaction.length) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Check if user is authorized (either owns the wallet or is admin)
      const isOwner = transaction[0].wallets.companyId === req.user.id;
      const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Not authorized to refund this transaction" });
      }

      // Process the refund
      const refundResult = await storage.refundTransaction(transactionId, reason);

      // If the transaction has Stripe payment info, also process a Stripe refund
      if (transaction[0].wallet_transactions.stripePaymentIntentId) {
        try {
          const stripeRefund = await createStripeRefund(
            transaction[0].wallet_transactions.stripePaymentIntentId,
            reason
          );

          return res.json({
            success: true,
            refund: refundResult,
            stripeRefund
          });
        } catch (stripeError) {
          console.error("Stripe refund failed but database refund succeeded:", stripeError);
          return res.json({
            success: true,
            refund: refundResult,
            stripeRefund: { error: stripeError.message }
          });
        }
      }

      return res.json({
        success: true,
        refund: refundResult
      });
    } catch (error) {
      console.error("Error processing refund:", error);
      next(error);
    }
  });

  // Update wallet transaction error message
  app.post("/api/wallet/transactions", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { amount, type, description } = req.body;

      // Validate transaction type
      if (!['credit', 'debit'].includes(type)) {
        return res.status(400).json({
          error: "Invalid transaction type. Must be 'credit' or 'debit'",
          success: false
        });
      }

      const numericAmount = Number(amount);
      if (isNaN(numericAmount)) {
        return res.status(400).json({
          error: "Invalid amount format",
          success: false
        });
      }

      const wallet = await storage.getWallet(req.user.id);
      if (!wallet) {
        return res.status(404).json({
          error: "Wallet not found",
          success: false
        });
      }

      // Calculate new balance with proper decimal handling
      const currentBalance = Number(wallet.balance);
      const newBalance = Number((currentBalance + numericAmount).toFixed(2));

      if (newBalance < 0) {
        return res.status(400).json({
          error: "Insufficient balance",
          success: false
        });
      }

      try {
        // Create transaction in a single atomic operation
        const transaction = await storage.addWalletTransaction(
          wallet.id,
          numericAmount,
          type,
          description
        );

        // Update wallet balance
        const updatedWallet = await storage.updateWalletBalance(
          wallet.id,
          newBalance
        );

        // Return success response
        res.json({
          success: true,
          wallet: updatedWallet,
          transaction: transaction
        });
      } catch (error) {
        next(error);
      }
    } catch (error) {
      next(error);
    }
  });

  // Transaction deletion endpoints disabled for security and data integrity
  app.delete("/api/wallet/transactions", async (req, res, next) => {
    // Returns unauthorized as transaction deletion is no longer supported
    return res.status(403).json({ error: "Transaction deletion is not allowed for security reasons" });
  });

  app.delete("/api/wallet/transactions/:id", async (req, res, next) => {
    // Returns unauthorized as transaction deletion is no longer supported
    return res.status(403).json({ error: "Transaction deletion is not allowed for security reasons" });
  });

  app.post("/api/wallet/clear-all", requireAdmin, async (req, res, next) => {
    try {
      // Clear all transactions first
      const wallets = await storage.getAllWallets();
      for (const wallet of wallets) {
        await storage.clearWalletTransactions(wallet.id);
      }
      // Then reset all balances to 0
      await storage.clearWallets();
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /******************************************************
   * PUBLIC TEST ENDPOINTS - NOT PROTECTED BY AUTH    *
   * These endpoints are for development testing only  *
   ******************************************************/

  // Endpoint to check if the server API is accessible
  app.get("/api/ping", (req, res) => {
    return res.json({ 
      success: true, 
      message: "API is accessible",
      time: new Date().toISOString()
    });
  });

  // Endpoint to check Stripe configuration status
  app.get("/api/status/stripe", (req, res) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const stripePublicKey = process.env.VITE_STRIPE_PUBLIC_KEY;
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    const configured = !!stripeKey && !!stripePublicKey;

    // Stripe configuration status requested

    return res.json({
      configured,
      clientConfigured: !!stripePublicKey,
      serverConfigured: !!stripeKey,
      webhookConfigured: !!stripeWebhookSecret
    });
  });

  // Create a payment intent for Stripe Elements (recommended secure method)
  app.post("/api/wallet/stripe/create-intent", async (req, res) => {
    try {
      // This endpoint can be used without authentication for testing purposes
      // In production, we would require authentication
      const userId = req.isAuthenticated() ? req.user.id : null;

      const { amount, currency = 'usd' } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: "Valid amount is required" });
      }

      // Force USD currency for all transactions regardless of Stripe account default
      const useCurrency = currency.toLowerCase() === 'usd' ? 'usd' : 'usd'; // Always use USD

      if (!STRIPE_SECRET_KEY) {
        return res.status(500).json({ 
          success: false, 
          error: "Stripe API key not configured" 
        });
      }

      // Initialize Stripe
      const stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16' as any,
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount), // Amount already in cents from frontend
        currency: useCurrency, // Always use USD regardless of Stripe account locale
        metadata: {
          userId: userId ? userId.toString() : 'anonymous',
          createdAt: new Date().toISOString(),
          forceCurrency: 'usd' // Additional marker to ensure USD is used
        },
      });

      console.log(`Created payment intent for ${amount/100} USD:`, paymentIntent.id);

      // Return client secret to the frontend for confirmation
      return res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });
    } catch (error) {
      console.error("Error creating payment intent:", error);
      return res.status(500).json({ 
        success: false, 
        error: error.message || "Failed to create payment intent" 
      });
    }
  });

  // Confirm payment and add to wallet
  app.post("/api/wallet/stripe/confirm-payment", async (req, res) => {
    try {
      // Check if this is a test transaction from the diagnostic page
      const isDiagnostic = req.query.diagnostic === 'true';

      // Allow unauthenticated requests from the diagnostic page, otherwise require auth
      if (!req.isAuthenticated() && !isDiagnostic) {
        return res.status(401).json({ success: false, error: "Authentication required" });
      }

      const { paymentIntentId, isInternationalCard = false } = req.body;
      
      // Debug log for international card detection
      console.log(`Payment confirmation for ${paymentIntentId}:`);
      console.log(`- isInternationalCard: ${isInternationalCard}`);
      console.log(`- Request body:`, req.body);
      
      if (!paymentIntentId) {
        return res.status(400).json({ success: false, error: "Payment intent ID is required" });
      }

      // Verify the payment with Stripe
      if (!STRIPE_SECRET_KEY) {
        return res.status(500).json({ 
          success: false, 
          error: "Stripe API key not configured" 
        });
      }

      // Initialize Stripe
      const stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16' as any,
      });

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ 
          success: false, 
          error: `Payment has not been completed. Status: ${paymentIntent.status}` 
        });
      }

      // Skip wallet operations for diagnostic mode
      let transaction = null;

      if (isDiagnostic) {
        console.log(`Diagnostic mode: Skipping wallet update for payment ${paymentIntentId}`);
        // Return a mock transaction for the diagnostic page
        transaction = {
          id: 0,
          type: 'credit',
          status: 'completed',
          amount: (paymentIntent.amount / 100).toString(),
          paymentMethod: 'stripe',
          description: 'Wallet credit via Stripe (Diagnostic)',
          walletId: null,
          stripePaymentId: null,
          stripeSessionId: null,
          stripePaymentIntentId: paymentIntentId,
          createdAt: new Date()
        };
      } else {
        // Regular authenticated flow - add to actual wallet
        const wallet = await storage.getWalletByUserId(req.user.id);
        if (!wallet) {
          return res.status(404).json({ success: false, error: "Wallet not found" });
        }

        // User pays exactly the credit amount they want - no fee deduction from their credit
        const creditAmount = paymentIntent.amount / 100; // Convert from cents - this is what user gets
        
        // Validation: Ensure reasonable credit amount (between $1 and $10,000)
        if (creditAmount < 1 || creditAmount > 10000) {
          console.error(`Invalid credit amount detected: $${creditAmount} from payment intent ${paymentIntentId}`);
          return res.status(400).json({ 
            success: false, 
            error: `Invalid payment amount: $${creditAmount}. Please contact support.` 
          });
        }
        
        // Determine if card is international using Stripe's Payment Intent data
        let actualIsInternational = false;
        
        try {
          // Get the payment method details from Stripe
          if (paymentIntent.payment_method) {
            const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
            const cardCountry = paymentMethod.card?.country;
            
            if (cardCountry) {
              actualIsInternational = cardCountry !== 'US';
              console.log(`Server-side card detection: Country=${cardCountry}, International=${actualIsInternational}`);
            } else {
              console.log('No country information available from Stripe PaymentMethod');
              // Fallback to frontend detection
              actualIsInternational = isInternationalCard;
            }
          } else {
            console.log('No payment method attached to PaymentIntent');
            // Fallback to frontend detection
            actualIsInternational = isInternationalCard;
          }
        } catch (error) {
          console.error('Error retrieving payment method details:', error);
          // Fallback to frontend detection
          actualIsInternational = isInternationalCard;
        }
        
        // Calculate fees based on actual card type (server-side detection takes priority)
        const baseStripeFee = creditAmount * 0.029 + 0.30; // Standard Stripe fee (2.9% + $0.30)
        const internationalFee = actualIsInternational ? creditAmount * 0.01 : 0; // Additional 1% for international cards
        const stripeFee = baseStripeFee + internationalFee; // Total fee
        
        // Debug fee calculation
        console.log(`Fee calculation for $${creditAmount}:`);
        console.log(`- Base Stripe fee: $${baseStripeFee.toFixed(2)} (2.9% + $0.30)`);
        console.log(`- Frontend detected international: ${isInternationalCard}`);
        console.log(`- Server detected international: ${actualIsInternational}`);
        console.log(`- International fee: $${internationalFee.toFixed(2)} (${actualIsInternational ? '1%' : '0%'})`);
        console.log(`- Total fee: $${stripeFee.toFixed(2)}`);
        console.log(`- Final card type: ${actualIsInternational ? 'International' : 'Domestic'}`);
        

        // Create a transaction record for the credit amount (what user gets)
        const transactionDescription = actualIsInternational 
          ? `Wallet credit via Stripe - $${creditAmount.toFixed(2)} (International Card)`
          : `Wallet credit via Stripe - $${creditAmount.toFixed(2)}`;
          
        transaction = await storage.createTransaction({
          type: 'credit',
          status: 'completed',
          amount: creditAmount.toFixed(2),
          paymentMethod: 'stripe',
          description: transactionDescription,
          walletId: wallet.id,
          stripePaymentId: null,
          stripeSessionId: null,
          stripePaymentIntentId: paymentIntentId
        });

        // Update the user's wallet balance with the credit amount
        await storage.addWalletBalance(wallet.id, creditAmount);

        // Record Stripe fees for ALL payments (not just admin users)
        // Fees are deducted from SimTree's profit wallet and tracked in stripe_fees wallet
        try {
          // Get SimTree company ID dynamically by looking it up by name
          const simtreeCompanyId = await storage.getPlatformCompanyId();
          if (!simtreeCompanyId) {
            console.error("SimTree company not found for fee processing");
            throw new Error("SimTree company not found");
          }
          
          // Get profit wallet for SimTree
          const profitWallet = await storage.getWalletByTypeAndCompany(simtreeCompanyId, 'profit');

          if (profitWallet) {
            // Deduct all fees from profit wallet
            const feeTransactionProfit = await storage.createTransaction({
              type: 'debit',
              status: 'completed',
              amount: stripeFee.toFixed(2),
              paymentMethod: 'stripe',
              description: `Stripe fees for payment ${paymentIntentId}${actualIsInternational ? ' (International Card)' : ''}`,
              walletId: profitWallet.id,
              stripePaymentId: null,
              stripeSessionId: null,
              stripePaymentIntentId: paymentIntentId,
              relatedTransactionId: transaction.id
            });
            await storage.addWalletBalance(profitWallet.id, -stripeFee);

            // Also add fees to stripe_fees wallet for tracking
            const stripeFeesWallet = await storage.getWalletByTypeAndCompany(simtreeCompanyId, 'stripe_fees');
            if (stripeFeesWallet) {
              await storage.createTransaction({
                type: 'credit',
                status: 'completed',
                amount: stripeFee.toFixed(2),
                paymentMethod: 'stripe',
                description: `Stripe fees received for payment ${paymentIntentId}${actualIsInternational ? ' (International Card)' : ''}`,
                walletId: stripeFeesWallet.id,
                stripePaymentId: null,
                stripeSessionId: null,
                stripePaymentIntentId: paymentIntentId,
                relatedTransactionId: feeTransactionProfit.id
              });
              await storage.addWalletBalance(stripeFeesWallet.id, stripeFee);
            }
          }
        } catch (feeError) {
          console.error("Error handling Stripe fees:", feeError);
          // Continue execution even if fee handling fails
        }
      }

      if (isDiagnostic) {
        console.log(`Diagnostic mode: Payment ${paymentIntentId} confirmed (no wallet update)`);
      } else {
        const walletId = transaction?.walletId || 'unknown';
        console.log(`Payment ${paymentIntentId} confirmed and added to wallet ${walletId}`);
        
        // Generate receipt for credit addition
        try {
          if (transaction && req.user?.email) {
            const company = await storage.getCompany(req.user.companyId);
            if (company) {
              console.log(`[Payment] Creating receipt for payment ${paymentIntentId}, transaction ${transaction.id}, company ${company.id}`);
              const { BillingService } = await import('./services/billing.service');
              const billingService = new BillingService();
              await billingService.createCreditReceipt(
                company.id,
                transaction.id,
                parseFloat(transaction.amount),
                'stripe',
                paymentIntentId
              );
              console.log(`[Payment] Receipt email sent for payment ${paymentIntentId}`);
            } else {
              console.error(`[Payment] Company not found for user ${req.user.id}`);
            }
          } else {
            console.error(`[Payment] Missing transaction or user email for receipt creation: transaction=${!!transaction}, email=${!!req.user?.email}`);
          }
        } catch (receiptError) {
          console.error(`[Payment] Error generating receipt for payment ${paymentIntentId}:`, receiptError);
          // Continue execution even if receipt generation fails
        }
      }

      return res.json({
        success: true,
        transaction,
        message: "Payment confirmed and credit added to wallet"
      });
    } catch (error) {
      console.error("Error confirming payment:", error);
      return res.status(500).json({ 
        success: false, 
        error: error.message || "Failed to confirm payment" 
      });
    }
  });

  // Process test payment endpoint for SimpleStripeForm
  app.post("/api/stripe/process-test-payment", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    try {
      const { amount, paymentData, isInternationalCard = false } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: "Invalid amount" });
      }

      // Get user's wallet
      const wallet = await storage.getWalletByUserId(req.user.id);
      if (!wallet) {
        return res.status(404).json({ success: false, error: "Wallet not found" });
      }

      // User gets exactly the amount they requested - fees are handled separately for admins
      const creditAmount = amount; // User gets the full amount they requested
      // Calculate fees based on card type
      const baseStripeFee = creditAmount * 0.029 + 0.30; // Standard Stripe fee (2.9% + $0.30)
      const internationalFee = isInternationalCard ? creditAmount * 0.01 : 0; // Additional 1% for international cards
      const stripeFee = baseStripeFee + internationalFee; // Total fee

      // Create a transaction record for the credit amount
      const transaction = await storage.createTransaction({
        type: 'credit',
        status: 'completed',
        amount: creditAmount.toFixed(2),
        paymentMethod: 'stripe',
        description: `Test wallet credit - $${creditAmount.toFixed(2)}`,
        walletId: wallet.id,
        stripePaymentId: null,
        stripeSessionId: null,
        stripePaymentIntentId: `test_${Date.now()}`
      });

      // Update the user's wallet balance
      await storage.addWalletBalance(wallet.id, creditAmount);

      // For admin users (SimTree company), deduct fees from profit wallet
      if (req.user.role === 'admin' || req.user.role === 'superadmin') {
        try {
          const simtreeCompanyId = await storage.getPlatformCompanyId();
          if (!simtreeCompanyId) {
            console.error("SimTree company not found for test fee processing");
          }
          const profitWallet = simtreeCompanyId ? await storage.getWalletByTypeAndCompany(simtreeCompanyId, 'profit') : null;

          if (profitWallet) {
            // Deduct all fees from profit wallet only
            await storage.createTransaction({
              type: 'debit',
              status: 'completed',
              amount: stripeFee.toFixed(2),
              paymentMethod: 'stripe',
              description: `Test Stripe fees for payment test_${Date.now()}${isInternationalCard ? ' (International Card)' : ''}`,
              walletId: profitWallet.id,
              stripePaymentId: null,
              stripeSessionId: null,
              stripePaymentIntentId: `test_${Date.now()}`,
              relatedTransactionId: transaction.id
            });
            await storage.addWalletBalance(profitWallet.id, -stripeFee);
          }
        } catch (feeError) {
          console.error("Error handling test Stripe fees:", feeError);
        }
      }

      return res.json({
        success: true,
        testPayment: true,
        transaction,
        message: "Test payment processed successfully"
      });
    } catch (error) {
      console.error("Error processing test payment:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to process test payment"
      });
    }
  });

  // Test endpoint to diagnose Stripe functionality (DEVELOPMENT ONLY)
  app.post("/api/stripe/test-direct", async (req, res) => {
    try {
      const { amount = 10, card = { number: '4242424242424242', exp_month: 12, exp_year: 2025, cvc: '123' } } = req.body;

      // Check if direct card testing is allowed
      if (process.env.STRIPE_ALLOW_RAW_CARD_DATA !== 'true' && process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          success: false,
          amount,
          error: "Sending credit card numbers directly to the Stripe API is generally unsafe. We suggest you use test tokens that map to the test card you are using, see https://stripe.com/docs/testing. To enable testing raw card data APIs, see https://support.stripe.com/questions/enabling-access-to-raw-card-data-apis."
        });
      }

      console.log("Processing test Stripe payment:", { amount, cardLast4: card.number.slice(-4) });

      // Directly call Stripe without authentication for testing, explicitly marking as test
      const result = await processCardPayment(amount, { card }, { 
        test: 'true',
        source: 'diagnostic-endpoint',
        diagnostic: 'true'
      });

      console.log("Stripe test payment result:", result);

      return res.json({
        success: result.success,
        paymentIntentId: result.paymentIntentId,
        clientSecret: result.clientSecret,
        amount,
        error: result.error
      });
    } catch (error: any) {
      console.error("Error testing Stripe:", error);
      return res.status(500).json({ 
        success: false, 
        error: error.message || "Unknown error" 
      });
    }
  });

  // Note: Stripe routes are mounted earlier as stripeDirectRoutes at line 129

  // Added endpoint for employee plans
  app.get('/api/employeePlans', async (req, res, next) =>{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const plans = await storage.getActiveEsimPlans();
      res.json(plans || []);
    } catch (error) {
      next(error);
    }
  });

  // Update the employeePlans endpoint to sync with purchased eSIMs
  app.get('/api/employees/:id/planHistory', async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const employeeId = parseInt(req.params.id);
      if (isNaN(employeeId)) {
        return res.status(400).json({ error: 'Invalid employee ID' });
      }

      // Get the employee's purchased eSIMs
      const esims = await storage.getPurchasedEsims(employeeId);

      // Find active or waiting_for_activation eSIM
      const activeEsim = esims.find(esim =>
        esim.status === 'active' || esim.status === 'waiting_for_activation'
      );

      if (activeEsim) {
        // Get the plan details
        const plan = await storage.getEsimPlanById(activeEsim.planId);

        if (plan) {
          // Update employee's plan information
          await storage.updateEmployee(employeeId, {
            // currentPlan field removed - plan information now derived from purchased_esims table
            dataUsage: activeEsim.dataUsed || "0",
            dataLimit: plan.data.toString(),
            planStartDate: activeEsim.activationDate || new Date().toISOString(),
            planEndDate: activeEsim.expiryDate || null,
            planValidity: plan.validity
          });
        }
      }

      const plans = await storage.getActiveEsimPlans();
      res.json(plans || []);
    } catch (error) {
      next(error);
    }
  });

  // Fix eSIM states - admin only
  app.post('/api/esim/fix-states', async (req, res, next) => {
    if (!req.isAuthenticated() || !req.user.isAdmin) {
      return res.status(403).json({ error: "Unauthorized - Admin access required" });
    }

    try {
      console.log("Admin requested to fix any inconsistent eSIM states");

      // Get all eSIMs that are in waiting_for_activation state
      const waitingEsims = await storage.getAllPurchasedEsimsByStatus('waiting_for_activation');
      console.log(`Found ${waitingEsims.length} eSIMs in waiting_for_activation state to check`);

      const updatedEsims = [];
      const failedUpdates = [];

      // Process each eSIM
      for (const esim of waitingEsims) {
        try {
          console.log(`Checking eSIM ${esim.id} with orderId ${esim.orderId}`);
          
          // First check if this eSIM is actually cancelled based on metadata flags
          const isCancelled = 
            esim.metadata?.isCancelled === true || 
            esim.metadata?.refunded === true || 
            esim.metadata?.rawData?.obj?.esimList?.[0]?.esimStatus === 'CANCEL';
          
          if (isCancelled) {
            console.log(`eSIM ${esim.id} has cancellation flags in metadata but incorrect status, fixing to 'cancelled'`);
            
            await storage.updatePurchasedEsim(esim.id, {
              status: 'cancelled',
              metadata: {
                ...(esim.metadata || {}),
                fixedStatus: true,
                previousStatus: esim.status,
                cancellationDetected: true,
                cancellationFixedAt: new Date().toISOString()
              }
            });
            
            updatedEsims.push({
              id: esim.id,
              orderId: esim.orderId,
              previousStatus: esim.status,
              newStatus: 'cancelled'
            });
            
            continue; // Skip to next eSIM
          }

          // Get current status from provider
          const statusData = await esimAccessService.checkEsimStatus(esim.orderId);
          const rawStatus = statusData.rawData?.obj?.esimList?.[0]?.esimStatus;

          // Check for cancellation in provider's status
          if (rawStatus === 'CANCEL' || statusData.status === 'cancelled') {
            console.log(`Fixing eSIM ${esim.id}: Provider indicates it's cancelled, updating status`);
            
            await storage.updatePurchasedEsim(esim.id, {
              status: 'cancelled',
              metadata: {
                ...(esim.metadata || {}),
                fixedStatus: true,
                previousStatus: esim.status,
                rawProviderStatus: rawStatus,
                providerCancelled: true
              }
            });
            
            updatedEsims.push({
              id: esim.id,
              orderId: esim.orderId,
              previousStatus: esim.status,
              newStatus: 'cancelled'
            });
          }
          // If this is an ONBOARD eSIM, update it to activated
          else if (rawStatus === 'ONBOARD' && statusData.status === 'activated') {
            console.log(`Fixing eSIM ${esim.id}: Provider status is ONBOARD, updating to activated`);

            const updatedData = {
              status: 'activated',
              activationDate: new Date(),
              metadata: {
                ...(esim.metadata || {}),
                fixedStatus: true,
                previousStatus: esim.status,
                rawProviderStatus: rawStatus
              }
            };

            await storage.updatePurchasedEsim(esim.id, updatedData);
            updatedEsims.push({
              id: esim.id,
              orderId: esim.orderId,
              previousStatus: esim.status,
              newStatus: 'activated'
            });
          } else {
            console.log(`No changes needed for eSIM ${esim.id}: Provider status is ${rawStatus}, current mapping is ${statusData.status}`);
          }
        } catch (error) {
          console.error(`Error fixing eSIM ${esim.id}:`, error);
          failedUpdates.push({
            id: esim.id,
            orderId: esim.orderId,
            error: error.message
          });
        }
      }

      return res.json({
        success: true,
        message: `Fixed ${updatedEsims.length} eSIMs, ${failedUpdates.length} failures`,
        fixed: updatedEsims,
        failed: failedUpdates
      });
    } catch (error) {
      console.error("Error fixing eSIM states:", error);
      return res.status(500).json({ 
        success: false, 
        error: "Failed to fix eSIM states",
        message: error.message
      });
    }
  });

  // Direct status check against provider API
  // This endpoint is used for debugging and direct status checks
  app.get('/api/esim/status', async (req, res, next) => {
    try {
      const orderId = req.query.orderId as string;

      if (!orderId) {
        return res.status(400).json({ error: "Missing orderId parameter" });
      }

      // Directly check the status with the eSIM provider
      console.log(`API request received: GET /esim/status for orderId ${orderId}`);
      const statusData = await esimAccessService.checkEsimStatus(orderId);

      return res.json({
        success: true,
        orderId,
        status: statusData.status,
        dataUsed: statusData.dataUsed,
        expiryDate: statusData.expiryDate,
        rawProviderStatus: statusData.rawData?.obj?.esimList?.[0]?.esimStatus,
        rawSmdpStatus: statusData.rawData?.obj?.esimList?.[0]?.smdpStatus,
        hasActivationTime: !!statusData.rawData?.obj?.esimList?.[0]?.activateTime,
        hasUsage: parseFloat(statusData.dataUsed) > 0
      });
    } catch (error) {
      console.error("Error checking remote eSIM status:", error);
      res.status(500).json({ 
        success: false, 
        error: "Could not fetch eSIM status from provider",
        message: error.message
      });
    }
  });

  // Get detailed information about a specific eSIM
  app.get('/api/esim/details/:id', async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;

      // Get the eSIM
      const esim = await storage.getPurchasedEsimById(parseInt(id));
      if (!esim) {
        return res.status(404).json({ error: 'eSIM not found' });
      }

      // Verify the eSIM belongs to an employee in the current company
      const employee = await storage.getEmployeeById(esim.employeeId);
      if (!employee || employee.companyId !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // If it's not in a final state, refresh its status
      if (esim.status === 'pending' || esim.status === 'waiting_for_activation') {
        try {
          const statusData = await esimAccessService.checkEsimStatus(esim.orderId);

          // Update eSIM with fresh data from provider
          const updatedData: any = {
            status: statusData.status,
            dataUsed: statusData.dataUsed,
            expiryDate: statusData.expiryDate ? new Date(statusData.expiryDate) : null,
          };

          // Update QR code and activation code if available
          if (statusData.qrCode) {
            updatedData.qrCode = statusData.qrCode;
          }
          if (statusData.activationCode) {
            updatedData.activationCode = statusData.activationCode;
          }
          if (statusData.iccid) {
            updatedData.iccid = statusData.iccid;
          }

          // Update activation date if status changed to activated
          if (statusData.status === 'activated' && !esim.activationDate) {
            updatedData.activationDate = new Date();
          } else if (statusData.status !== 'activated') {
            updatedData.activationDate = null;
          }

          // Store raw API data in metadata
          const metadata = {
            ...(esim.metadata || {}),
            obj: statusData.rawData,
          };
          updatedData.metadata = metadata;

          await storage.updatePurchasedEsim(esim.id, updatedData);

          // Return updated eSIM
          res.json({
            ...esim,
            ...updatedData
          });
        } catch (error) {
          console.error(`Error refreshing eSIM ${esim.id} details:`, error);
          // Return the eSIM without updates if there was an error
          res.json(esim);
        }
      } else {
        // Return the eSIM as is for final states
        res.json(esim);
      }
    } catch (error) {
      console.error('Error getting eSIM details:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // QR Code proxy route to avoid CORS issues
  app.get("/api/qr-proxy", async (req, res, next) => {
    try {
      const { url } = req.query;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL parameter is required' });
      }
      
      // Only allow p.qrsim.net URLs for security
      if (!url.includes('p.qrsim.net')) {
        return res.status(403).json({ error: 'Only p.qrsim.net URLs are allowed' });
      }
      
      // Fetch the QR code image from the external URL
      const response = await fetch(url);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch QR code image' });
      }
      
      // Set appropriate headers
      res.set({
        'Content-Type': response.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      });
      
      // Pipe the image data to the response
      response.body?.pipe(res);
      
    } catch (error) {
      console.error('QR proxy error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use(errorHandler);
  // Note: The duplicated route for "/api/employees/:id/planHistory" has been removed
  // as it was already implemented earlier in the file at line ~3334

  // Server monitoring routes (for Admin Maintenance tab)
  app.get("/api/maintenance/connections", requireSuperAdmin, async (req, res, next) => {
    try {
      const connections = await storage.getServerConnections();
      res.json({
        success: true,
        data: connections
      });
    } catch (error) {
      console.error('Error fetching server connections:', error);
      next(error);
    }
  });
  
  app.get("/api/maintenance/service-statuses", requireSuperAdmin, async (req, res, next) => {
    try {
      const statuses = await monitoringService.getServiceStatuses();
      res.json({
        success: true,
        data: statuses
      });
    } catch (error) {
      console.error('Error fetching service statuses:', error);
      next(error);
    }
  });

  app.get("/api/maintenance/connection-logs", requireSuperAdmin, async (req, res, next) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getConnectionLogs(limit);
      res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      console.error('Error fetching connection logs:', error);
      next(error);
    }
  });

  app.get("/api/maintenance/connection-logs/:service", requireSuperAdmin, async (req, res, next) => {
    try {
      const serviceName = req.params.service;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getConnectionLogsByService(serviceName, limit);
      res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      console.error(`Error fetching connection logs for service ${req.params.service}:`, error);
      next(error);
    }
  });

  app.post("/api/maintenance/connections/check/:service", requireSuperAdmin, async (req, res, next) => {
    try {
      const serviceName = req.params.service;
      const result = await monitoringService.checkService(serviceName);
      
      // Get the updated connection status
      const connection = await storage.getServerConnectionByName(serviceName);
      
      res.json({
        success: true,
        status: result ? 'online' : 'offline',
        connection
      });
    } catch (error) {
      console.error(`Error checking service ${req.params.service}:`, error);
      next(error);
    }
  });

  app.delete("/api/maintenance/connection-logs", requireSuperAdmin, async (req, res, next) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const date = new Date();
      date.setDate(date.getDate() - days);
      
      const deletedCount = await storage.deleteConnectionLogs(date);
      
      res.json({
        success: true,
        message: `Deleted ${deletedCount} connection logs older than ${days} days`,
        deletedCount
      });
    } catch (error) {
      console.error('Error deleting connection logs:', error);
      next(error);
    }
  });

  // Multi-wallet APIs - get wallets by type
  app.get("/api/wallets/company/:companyId", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Check if user has permission to view this company's wallets
      const companyId = parseInt(req.params.companyId);
      const user = req.user!;
      const isSadmin = user.role === 'superadmin';
      
      if (!isSadmin && user.companyId !== companyId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const wallets = await storage.getWalletsByCompanyId(companyId);
      
      if (!wallets || wallets.length === 0) {
        // If no wallets found, create them and try again
        await storage.createMissingWallets();
        const newWallets = await storage.getWalletsByCompanyId(companyId);
        
        if (!newWallets || newWallets.length === 0) {
          return res.status(404).json({ error: "No wallets found for this company" });
        }
        
        return res.json(newWallets);
      }

      return res.json(wallets);
    } catch (error) {
      console.error("Error fetching company wallets:", error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  // Get all wallets across companies (sadmin only)
  app.get("/api/wallets/all", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = req.user!;
      if (user.role !== 'superadmin') {
        return res.status(403).json({ error: "Unauthorized. Superadmin access required." });
      }

      const allWallets = await storage.getAllWallets();
      
      return res.json(allWallets);
    } catch (error) {
      console.error("Error fetching all wallets:", error);
      return res.status(500).json({ error: "Server error" });
    }
  });

  // Get user's company data for profile completion
  app.get('/api/companies/user-company/:userId', async (req, res, next) => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get the user to find their company ID
      const user = await storage.getUser(parseInt(userId));
      if (!user || !user.companyId) {
        return res.status(404).json({ error: 'User or company not found' });
      }

      // Get the company data
      const company = await storage.getCompany(user.companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      res.json(company);
    } catch (error) {
      console.error('Error fetching user company:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Register configuration management routes
  app.use('/api/config', configRoutes);

  // Register usage monitor routes
  app.use('/api/admin/usage-monitor', usageMonitorRouter);

  const httpServer = createServer(app);
  return httpServer;
}