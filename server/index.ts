// Load dotenv as early as possible
import dotenv from "dotenv";
// Load environment variables from .env file
dotenv.config();

import express from "express";
import { registerRoutes } from "./routes";
import { setupVite } from "./vite";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { setupAuth } from "./auth";
import { pool, testDatabaseConnection, db } from "./db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { initializeMonitoring } from "./init-monitoring";
// Commenting out problematic imports temporarily to fix startup
// import { webhookReliability } from './services/webhook-reliability';
// import { intelligentSafetyNets } from './services/intelligent-safety-nets';
// Re-enabled eSIM sync as backup for missed webhooks
import { syncEsimStatuses } from "./cron/esim-status-sync";
// import { syncWalletBalances } from "./cron/wallet-balance-sync";
// import { syncRevokedEsims } from "./cron/enhanced-revocation-sync";
import { processAutoRenewals } from "./cron/auto-renewal-job";
import { DatabaseStorage } from "./storage";
import { MemStorage } from "./mem-storage";
import { initializeSadmin } from "./init-sadmin";
import { connectClient } from "./sse";
import { SERVER_CONFIG } from "./config";
import { startInactivityChecker } from "./jobs/inactivity-checker";
import { dailyBillingJob } from "./jobs/daily-billing";
import { billingScheduler } from "./services/billing-scheduler.service";
import { startDbUsageMonitor } from "./monitor/dbUsageMonitor";
// Backup jobs removed - now handled by GitHub Actions (runs independently of app)
import { esimAccessService } from "./services/esim-access";
import cron from "node-cron";
import csrf from "csurf";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = (message: string) => console.log(`[Server] ${message}`);

async function startServer() {
  // SECURITY FIX: Validate required environment variables based on environment
  // STRICT: No fallbacks - requires explicit PROD_DATABASE_URL or DEV_DATABASE_URL
  const isProduction = process.env.NODE_ENV === 'production';
  
  log(`Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  
  if (isProduction) {
    if (!process.env.PROD_DATABASE_URL) {
      console.error(`[Server] ❌ FATAL: PROD_DATABASE_URL not set in production`);
      console.error(`[Server] Available env vars: PROD_DATABASE_URL=${!!process.env.PROD_DATABASE_URL}, DATABASE_URL=${!!process.env.DATABASE_URL}`);
      console.error(`[Server] Go to Deployments → Settings → Secrets and ensure PROD_DATABASE_URL is synced`);
      process.exit(1);
    }
    log("PROD_DATABASE_URL validated");
  } else {
    if (!process.env.DEV_DATABASE_URL) {
      console.error(`[Server] ❌ FATAL: DEV_DATABASE_URL not set in development`);
      console.error(`[Server] Set DEV_DATABASE_URL in Replit Secrets`);
      process.exit(1);
    }
    log("DEV_DATABASE_URL validated");
  }
  
  // Validate other required environment variables in production
  if (isProduction) {
    const requiredEnvVars = [
      'SESSION_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'SENDGRID_API_KEY'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      const errorMsg = `FATAL: Missing required environment variables in production: ${missingVars.join(', ')}`;
      console.error(`[Server] ${errorMsg}`);
      throw new Error(errorMsg); // Throw instead of process.exit for clean shutdown
    }
    
    log("Production environment validated - all required variables present");
  }
  
  try {

    const app = express();
    const httpServer = createServer(app);
    
    // Trust proxy for accurate IP detection behind reverse proxy (Replit, load balancers)
    app.set('trust proxy', 1);

    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Security: Global rate limiting
    const globalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5000, // Reasonable limit - increased from 1000 for normal usage
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use(globalLimiter);

    // Security: Rate limiting for authentication endpoints (increased for development)
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50, // Increased limit for development and testing
      message: 'Too many authentication attempts, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use('/api/auth', authLimiter);

    // Security headers are now configured through Helmet middleware in routes.ts
    // This prevents conflicts and centralizes security header management

    // We'll set up Vite later, after API routes are registered so they take precedence

    // Secure logging middleware - only logs request metadata, not sensitive response data
    app.use((req, res, next) => {
      const start = Date.now();
      const path = req.path;

      res.on("finish", () => {
        const duration = Date.now() - start;
        
        // Log only essential request metadata, never response bodies
        const logData = {
          method: req.method,
          path: path,
          status: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent')?.substring(0, 100) // Truncate user agent
        };
        
        // Only log detailed info for errors or in development
        if (res.statusCode >= 400) {
          log(`ERROR: ${req.method} ${path} ${res.statusCode} in ${duration}ms from ${req.ip}`);
        } else if (process.env.NODE_ENV === 'development') {
          log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
        }
        
        // Never log response bodies to prevent PII/credential exposure
      });

      next();
    });

    // Database connection check and initialization
    let useMemoryStorage = false;
    try {
      log("Testing database connection...");
      
      // Streamlined database connection with faster retry
      let retries = 2; // Reduce from 3 to 2 retries
      let connected = false;
      
      while (retries > 0 && !connected) {
        try {
          // Use the testDatabaseConnection function to verify and log database info
          const connectionSuccess = await testDatabaseConnection();
          if (!connectionSuccess) {
            throw new Error('Database connection test failed');
          }
          connected = true;
          log("Database connection successful");
        } catch (retryError) {
          retries--;
          if (retries > 0) {
            log(`Database connection failed, retrying... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Reduce from 2000ms to 1000ms
          } else {
            throw retryError;
          }
        }
      }

      // Defer sadmin initialization to avoid blocking startup
      if (!useMemoryStorage) {
        setTimeout(async () => {
          try {
            log("Initializing sadmin user...");
            await initializeSadmin(pool);
            log("Sadmin initialization complete");
          } catch (sadminError) {
            console.error("Sadmin initialization failed:", sadminError);
            // Continue without failing - sadmin can be initialized later
          }
        }, 5000); // Defer by 5 seconds
      }
    } catch (error) {
      console.error("Database connection failed:", error);
      log("Falling back to in-memory storage for development purposes");
      useMemoryStorage = true;
    }

    // PUBLIC WEBHOOK ENDPOINTS - Must be registered BEFORE auth middleware AND before API header middleware
    // This allows eSIM Access to validate and send webhooks without authentication
    // Support ALL HTTP methods (GET, HEAD, OPTIONS, POST) for webhook validation
    
    const webhookValidationHandler = (req: any, res: any) => {
      log(`[eSIM Webhook] ${req.method} request - URL verification from ${req.ip}`);
      
      // Handle OPTIONS (CORS preflight)
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, RT-AccessCode, RT-Signature, RT-Timestamp, RT-RequestID');
        res.setHeader('Access-Control-Max-Age', '86400');
        return res.status(200).end();
      }
      
      // Handle HEAD (no body, just headers)
      if (req.method === 'HEAD') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Webhook-Status', 'active');
        return res.status(200).end();
      }
      
      // Handle GET - return JSON for better compatibility
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).json({ 
        success: true, 
        status: 'active',
        message: 'Webhook endpoint ready'
      });
    };
    
    // Register all methods for the webhook path
    app.all('/api/esim/webhook', (req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return webhookValidationHandler(req, res);
      }
      next();
    });
    
    // Set API response headers (but webhook is already handled above)
    app.use("/api", (req, res, next) => {
      // Skip setting JSON content type for webhook endpoint (already handled)
      if (req.path === '/esim/webhook') {
        return next();
      }
      res.setHeader("Content-Type", "application/json");
      next();
    });
    
    const webhookPostHandler = async (req: any, res: any) => {
      log(`[eSIM Webhook] POST request received: ${JSON.stringify(req.body)}`);
      
      // Handle CHECK_HEALTH validation from eSIM Access (sent when saving webhook URL)
      if (req.body?.notifyType === 'CHECK_HEALTH') {
        log('[eSIM Webhook] CHECK_HEALTH validation received - responding with success');
        return res.status(200).json({ 
          success: true,
          message: 'Webhook endpoint validated successfully'
        });
      }
      
      // Handle empty or test requests
      if (!req.body || Object.keys(req.body).length === 0 || req.body.test === true) {
        log('[eSIM Webhook] Empty/test request received');
        return res.status(200).json({ 
          success: true,
          message: 'Webhook endpoint ready'
        });
      }
      
      try {
        // Extract data from the webhook payload according to eSIM Access documentation
        const notifyType = req.body.notifyType;
        const content = req.body.content || {};
        const orderNo = content.orderNo;
        const esimStatus = content.esimStatus;
        const smdpStatus = content.smdpStatus;
        const iccid = content.iccid;
        
        log(`[eSIM Webhook] Processing: notifyType=${notifyType}, orderNo=${orderNo}, esimStatus=${esimStatus}, smdpStatus=${smdpStatus}`);
        
        if (!orderNo) {
          log(`[eSIM Webhook] Missing orderNo in webhook payload`);
          return res.status(200).json({ success: true, message: 'Acknowledged (no orderNo)' });
        }
        
        // Find the matching eSIM in our database
        const [esim] = await db
          .select()
          .from(schema.purchasedEsims)
          .where(eq(schema.purchasedEsims.orderId, orderNo));
        
        if (!esim) {
          log(`[eSIM Webhook] No eSIM found with orderId: ${orderNo}`);
          // Still return 200 to acknowledge receipt
          return res.status(200).json({ success: true, message: 'eSIM not found in our system' });
        }
        
        // Determine new status based on notifyType and status values
        let newStatus = esim.status;
        
        // Handle different notification types according to eSIM Access docs
        switch (notifyType) {
          case 'ORDER_STATUS':
            // GOT_RESOURCE means eSIM is ready
            if (content.orderStatus === 'GOT_RESOURCE') {
              log(`[eSIM Webhook] eSIM ${esim.id} is ready (GOT_RESOURCE)`);
            }
            break;
            
          case 'SMDP_EVENT':
            // Real-time eSIM profile lifecycle events
            if (['ENABLED', 'INSTALLATION', 'DOWNLOAD'].includes(smdpStatus)) {
              newStatus = 'activated';
            }
            break;
            
          case 'ESIM_STATUS':
            // eSIM lifecycle changes
            if (esimStatus === 'IN_USE') {
              newStatus = 'activated';
            } else if (['USED_UP', 'USED_EXPIRED', 'UNUSED_EXPIRED'].includes(esimStatus)) {
              newStatus = 'expired';
            } else if (['CANCEL', 'REVOKED'].includes(esimStatus)) {
              newStatus = 'cancelled';
            }
            break;
            
          case 'DATA_USAGE':
            // Data usage notifications - just log for now
            log(`[eSIM Webhook] Data usage update for ${esim.id}: ${content.orderUsage}/${content.totalVolume} bytes`);
            break;
            
          case 'VALIDITY_USAGE':
            // Validity running out
            log(`[eSIM Webhook] Validity warning for ${esim.id}: ${content.remain} ${content.durationUnit} remaining`);
            break;
        }
        
        // Update status if changed
        if (newStatus !== esim.status) {
          log(`[eSIM Webhook] Updating eSIM ${esim.id} from '${esim.status}' to '${newStatus}'`);
          
          await db
            .update(schema.purchasedEsims)
            .set({
              status: newStatus,
              activationDate: newStatus === 'activated' ? new Date() : esim.activationDate,
              metadata: {
                ...(typeof esim.metadata === 'object' ? esim.metadata : {}),
                syncedAt: new Date().toISOString(),
                lastNotifyType: notifyType,
                providerEsimStatus: esimStatus,
                providerSmdpStatus: smdpStatus,
                previousStatus: esim.status,
                viaWebhook: true,
              },
            })
            .where(eq(schema.purchasedEsims.id, esim.id));
          
          log(`[eSIM Webhook] Successfully updated eSIM ${esim.id} to '${newStatus}'`);
        } else {
          log(`[eSIM Webhook] No status change needed for eSIM ${esim.id} (current: ${esim.status})`);
        }
        
        return res.status(200).json({ success: true });
      } catch (error) {
        console.error("[eSIM Webhook] Error processing webhook:", error);
        // Still return 200 to prevent retries
        return res.status(200).json({ success: true, error: 'Internal processing error' });
      }
    };
    
    // Register POST handler for the webhook path
    app.post('/api/esim/webhook', webhookPostHandler);
    
    log("Public eSIM webhook endpoints registered (no auth required)");

    // Setup Authentication
    log("Setting up authentication...");
    await setupAuth(app);
    log("Authentication setup complete");

    // Setup CSRF Protection (session-based, no cookie-parser needed)
    log("Setting up CSRF protection...");
    const csrfProtection = csrf();

    // Apply CSRF protection to most routes, but exempt webhooks and health checks
    app.use((req, res, next) => {
      // Skip CSRF for webhooks and scheduled tasks (they come from external services)
      if (req.path.startsWith('/api/webhooks') || 
          req.path.startsWith('/webhook') ||
          req.path.startsWith('/api/esim/webhook') ||
          req.path.startsWith('/api/esim-webhook') ||
          req.path.startsWith('/api/stripe/webhook') ||
          req.path.startsWith('/api/scheduled/') ||
          req.path === '/health' ||
          req.path === '/events' ||
          req.path.startsWith('/usage/') ||
          req.path.startsWith('/activate-ios') ||
          req.path.startsWith('/test-ios')) {
        return next();
      }
      
      // Apply CSRF protection for GET /api/csrf-token and all state-changing requests
      if (req.path === '/api/csrf-token' || req.method !== 'GET') {
        return csrfProtection(req, res, next);
      }
      
      // Skip CSRF for other GET requests
      next();
    });

    // CSRF token endpoint
    app.get('/api/csrf-token', (req, res) => {
      res.json({ csrfToken: req.csrfToken() });
    });

    // CSRF error handler
    app.use((err: any, req: any, res: any, next: any) => {
      if (err.code === 'EBADCSRFTOKEN') {
        res.status(403).json({
          success: false,
          message: 'Invalid CSRF token. Please refresh the page and try again.',
          error: 'CSRF_INVALID'
        });
      } else {
        next(err);
      }
    });

    log("CSRF protection configured");

    // Register API routes
    log("Registering API routes...");
    registerRoutes(app);

    // Admin coupon routes will be registered in the main routes.ts file
    log("Admin coupon routes will be handled in the main routes file");

    log("All routes registered");

    // Serve static files from public directory (for logos, images, etc.)
    app.use(express.static(path.join(__dirname, "../public")));

    // Main SSE endpoint is now registered in routes.ts
    // This endpoint remains here for backward compatibility
    app.get("/events", (req, res) => {
      log("New SSE connection established through /events endpoint");
      connectClient(req, res);
    });

    // Initialize monitoring
    log("Initializing connection monitoring service...");
    initializeMonitoring();
    log("Connection monitoring initialized");

    // Initialize appropriate storage implementation based on database availability
    const storage = useMemoryStorage ? new MemStorage() : new DatabaseStorage();
    log(
      useMemoryStorage
        ? "Using in-memory storage"
        : "Using PostgreSQL database storage",
    );

    // Make storage instance available globally (needed for auth.ts and routes.ts)
    // @ts-ignore
    global.appStorage = storage;

    // Server startup - bind to port 5000 first for workflow compatibility
    const PORT = Number(process.env.PORT) || 5000;
    const HOST = '0.0.0.0';

    // Health check endpoint for Autoscale - moved to /health to avoid conflicts
    app.get("/health", (req, res) => {
      res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
      });
    });

    const serverPromise = new Promise((resolve, reject) => {
      httpServer.once("error", (error: any) => {
        console.error("Server error:", error);
        reject(error);
      });

      httpServer.listen(PORT, HOST, () => {
        log(`Server running on ${HOST}:${PORT}`);
        log("eSIM status updates: webhooks (real-time) + sync job (every 30 min backup)");
        resolve(httpServer);
        
        // Defer all background jobs until after server is fully ready
        setTimeout(() => {
          log("Initializing background jobs...");
          
          // Sync eSIM plans from eSIM Access API on startup (works in both dev and production)
          if (!useMemoryStorage) {
            log("Starting eSIM plans sync from provider...");
            esimAccessService.syncPlansWithDatabase(storage)
              .then((result) => {
                log(`eSIM plans sync complete - Total: ${result.total}, Synced: ${result.synced}, Failed: ${result.failed}`);
              })
              .catch((error) => {
                console.error("Error syncing eSIM plans:", error);
              });
            
            // Schedule daily plan sync at 04:00 AM (after backups)
            cron.schedule('0 4 * * *', async () => {
              log("Starting scheduled eSIM plans sync...");
              try {
                const result = await esimAccessService.syncPlansWithDatabase(storage);
                log(`Scheduled eSIM plans sync complete - Total: ${result.total}, Synced: ${result.synced}, Failed: ${result.failed}`);
              } catch (error) {
                console.error("Error during scheduled eSIM plans sync:", error);
              }
            }, {
              timezone: 'America/Argentina/Buenos_Aires'
            });
            log("eSIM plans daily sync scheduled for 04:00 AM Buenos Aires time");
            
            // Schedule eSIM status sync to catch missed webhooks (every 30 minutes)
            cron.schedule('*/30 * * * *', async () => {
              log("[Sync] Starting scheduled eSIM status sync (backup for missed webhooks)...");
              try {
                const updatedCount = await syncEsimStatuses(storage);
                if (updatedCount > 0) {
                  log(`[Sync] eSIM status sync complete - updated ${updatedCount} eSIMs`);
                } else {
                  log("[Sync] eSIM status sync complete - no updates needed");
                }
              } catch (error) {
                console.error("[Sync] Error during scheduled eSIM status sync:", error);
              }
            });
            log("[Sync] eSIM status sync scheduled every 30 minutes as backup for webhooks");
            
            // Run initial sync after 2 minutes to catch any stuck statuses
            setTimeout(async () => {
              log("[Sync] Running initial eSIM status sync...");
              try {
                const updatedCount = await syncEsimStatuses(storage);
                log(`[Sync] Initial eSIM status sync complete - updated ${updatedCount} eSIMs`);
              } catch (error) {
                console.error("[Sync] Error during initial eSIM status sync:", error);
              }
            }, 120000);
          }
          
          // Schedule auto-renewal job to run every 24 hours
          const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
          setInterval(() => {
            processAutoRenewals(storage)
              .then((renewedCount) => {
                log(`Scheduled auto-renewal job complete - renewed ${renewedCount} eSIMs`);
              })
              .catch((error) => {
                console.error("Error during scheduled auto-renewal job:", error);
              });
          }, TWENTY_FOUR_HOURS_MS);

          // Defer initial auto-renewal check even longer
          setTimeout(() => {
            processAutoRenewals(storage)
              .then((renewedCount) => {
                log(`Initial auto-renewal check complete - renewed ${renewedCount} eSIMs`);
              })
              .catch((error) => {
                console.error("Error during initial auto-renewal check:", error);
              });
          }, 300000); // 5 minute delay

          // Company inactivity checker (defer further)
          if (!useMemoryStorage) {
            setTimeout(() => {
              log("Starting company inactivity checker...");
              startInactivityChecker(24); // Check once per day
              log("Company inactivity checker started");
            }, 600000); // 10 minute delay
          }
          
          // Daily billing job with retry mechanism for reliability
          if (!useMemoryStorage) {
            const initDailyBillingWithRetry = async (attempt = 1, maxAttempts = 5) => {
              try {
                log(`[Billing] Starting daily billing job (attempt ${attempt}/${maxAttempts})...`);
                await dailyBillingJob.initialize();
                log("[Billing] ✅ Daily billing job started successfully");
              } catch (error) {
                console.error(`[Billing] Error starting daily billing job (attempt ${attempt}):`, error);
                if (attempt < maxAttempts) {
                  const retryDelay = Math.min(30000 * attempt, 120000); // Exponential backoff, max 2 min
                  log(`[Billing] Retrying daily billing job in ${retryDelay/1000}s...`);
                  setTimeout(() => initDailyBillingWithRetry(attempt + 1, maxAttempts), retryDelay);
                } else {
                  console.error("[Billing] ❌ Daily billing job failed after max retries");
                }
              }
            };
            setTimeout(() => initDailyBillingWithRetry(), 120000); // Initial 2 minute delay
          }
          
          // Automatic billing scheduler with retry mechanism for reliability
          if (!useMemoryStorage) {
            const initBillingSchedulerWithRetry = (attempt = 1, maxAttempts = 5) => {
              try {
                log(`[Billing] Initializing automatic billing scheduler (attempt ${attempt}/${maxAttempts})...`);
                billingScheduler.init();
                log("[Billing] ✅ Automatic billing scheduler initialized");
              } catch (error) {
                console.error(`[Billing] Error initializing billing scheduler (attempt ${attempt}):`, error);
                if (attempt < maxAttempts) {
                  const retryDelay = Math.min(30000 * attempt, 120000);
                  log(`[Billing] Retrying billing scheduler in ${retryDelay/1000}s...`);
                  setTimeout(() => initBillingSchedulerWithRetry(attempt + 1, maxAttempts), retryDelay);
                } else {
                  console.error("[Billing] ❌ Billing scheduler failed after max retries");
                }
              }
            };
            setTimeout(() => initBillingSchedulerWithRetry(), 150000); // Initial 2.5 minute delay
          }
          
          // Initialize exchange rate service
          if (!useMemoryStorage) {
            setTimeout(() => {
              log("Initializing exchange rate service...");
              import("./services/exchange-rate.service").then(({ exchangeRateService }) => {
                exchangeRateService.initialize()
                  .then(() => {
                    exchangeRateService.startPeriodicUpdates();
                    log("Exchange rate service initialized successfully");
                  })
                  .catch((error) => {
                    console.error("Error initializing exchange rate service:", error);
                  });
              });
            }, 45000); // 45 second delay
          }
          
          // DB Usage Monitor (sadmin-only, dual-cron, 24h throttle)
          if (!useMemoryStorage && process.env.USAGE_MONITOR_ENABLED === 'true') {
            setTimeout(() => {
              log("Initializing DB Usage Monitor...");
              startDbUsageMonitor();
              log(`DB Usage Monitor active (connections: ${process.env.CONN_MONITOR_CRON || '*/5 * * * *'}, storage: ${process.env.STORAGE_MONITOR_CRON || '0 * * * *'})`);
            }, 60000); // 60 second delay
          }
          
          // Database backups now handled by GitHub Actions (runs independently of app)
          // See: .github/workflows/database-backup.yml
          
          log("Background jobs scheduled");
        }, 30000); // Start jobs 30 seconds after server starts
      });
    });

    // Setup Vite middleware AFTER all API routes
    if (process.env.NODE_ENV !== "production") {
      log("Setting up Vite development server...");
      await setupVite(app, httpServer);
      log("Vite development server setup complete");
    }
    // Static files and catch-all routes for production
    else {
      console.log("[Server] Running in production mode");

      // Serve static files from the client build directory
      const clientPath = path.join(__dirname, "../client/dist");
      console.log("[Server] Serving static files from:", clientPath);
      app.use(express.static(clientPath));

      // Health check endpoint
      app.get("/health", (req, res) => {
        res.status(200).json({
          status: "healthy",
          timestamp: new Date().toISOString(),
        });
      });

      // SPA catch-all route - must be last
      app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "../client/dist/index.html"));
      });
    }

    return serverPromise;
  } catch (error) {
    console.error("Fatal error during server startup:", error);
    throw error;
  }
}

const serverInstance = startServer().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});

export default serverInstance;
