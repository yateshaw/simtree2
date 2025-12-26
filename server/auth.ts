import { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import crypto from "crypto";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { storage, IStorage } from "./storage";
import { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail } from "./services/email.service";
import { db, pool } from './db';
import * as schema from '@shared/schema';
import { and, eq, sql, or, ne } from 'drizzle-orm';
import { getBaseUrl } from './env';
import { verifyPassword } from './lib/password-security';
import { hashPassword as secureHashPassword } from './lib/password-security';

// Use global storage instance if available
declare global {
  var appStorage: IStorage | undefined;
}

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      email: string;
      password: string;
      isAdmin: boolean;
      isSuperAdmin: boolean;
      companyId: number | null;
      isVerified: boolean;
      verificationToken: string | null;
      verificationTokenExpiry: string | null;
      createdAt: Date;
      role?: 'company' | 'admin' | 'superadmin';
    }
  }
}

interface AuthError extends Error {
  status?: number;
}

// Removed the old hashPassword function as we're importing it from './lib/password-security'

export async function comparePasswords(supplied: string, stored: string) {
  // Use the new verifyPassword function from the password-security library
  return verifyPassword(stored, supplied);
}

// Helper function to get all companies associated with a user
export async function getUserCompanies(userId: number) {
  // First get the user to ensure they exist
  const user = await storage.getUser(userId);
  if (!user) {
    return [];
  }

  try {
    // Get all companies where this user is an admin
    const adminCompanies = await db.select()
      .from(schema.companies)
      .where(
        sql`${schema.companies.id} IN (
          SELECT ${schema.users.companyId} 
          FROM ${schema.users} 
          WHERE ${schema.users.id} = ${userId}
          AND ${schema.users.companyId} IS NOT NULL
        )`
      );
    
    return adminCompanies;
  } catch (error) {
    console.error("Error fetching user companies:", error);
    return [];
  }
}

// Middleware to require admin authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Authentication required' });
}

// Middleware to require admin role
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && (req.user.isAdmin || req.user.isSuperAdmin)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Admin access required' });
}

export async function setupAuth(app: Express) {
  console.log("[Server] Setting up authentication...");

  // Get the storage instance to use (either global or default)
  const storageToUse = global.appStorage || storage;
  
  // SECURITY FIX: Validate SESSION_SECRET in production - no fallback allowed
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === 'production') {
    console.error("[Auth] FATAL: SESSION_SECRET must be set in production environment");
    throw new Error("SESSION_SECRET environment variable is required in production");
  }
  
  if (!sessionSecret) {
    console.warn("[Auth] ⚠️ WARNING: SESSION_SECRET not set - using insecure fallback for development only");
  }
  
  // Session setup - use the session store from our storage implementation
  let sessionOptions: session.SessionOptions = {
    secret: sessionSecret || 'your-random-secret-key-dev-only',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      // SECURITY FIX: Force secure cookies in production
      secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
      httpOnly: true, // Prevent XSS attacks by making cookies inaccessible to JavaScript
      sameSite: 'strict', // Prevent CSRF attacks by blocking cross-site requests
    }
  };
  
  // Add store to session options if we have a storage implementation with a session store
  if (storageToUse.sessionStore) {
    sessionOptions.store = storageToUse.sessionStore;
  } else {
    // Fallback to PostgreSQL session store
    const PgSession = connectPgSimple(session);
    sessionOptions.store = new PgSession({
      pool: pool,
      tableName: 'session'
    });
  }

  // Configure session
  app.use(session(sessionOptions));

  // Initialize passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure passport
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // Authentication attempt
        let user;

        // Special case for sadmin - authenticate by username with enhanced logging and error handling
        if (username === 'sadmin') {
          console.log("[Passport] Processing sadmin authentication attempt");

          try {
            // Get sadmin from database
            user = await storage.getUserByUsername(username);

            // Check if this is the sadmin user with the secure password from environment
            const secureSadminPassword = process.env.SADMIN_PASSWORD;
            
            if (!secureSadminPassword) {
              console.error("[Passport] SECURITY WARNING: SADMIN_PASSWORD environment variable not set");
              return done(null, false, { message: "System configuration error" });
            }
            
            // SECURITY FIX: Use timing-safe password verification for sadmin
            // verifyPassword expects (storedHash, providedPassword) and handles both : and . separators
            let isSadminAuthenticated = false;
            
            if (user && user.password && user.password.length > 0) {
              // User has a stored password - verify against it
              // verifyPassword will handle format validation (supports both : and . separators)
              isSadminAuthenticated = await verifyPassword(user.password, password);
              if (isSadminAuthenticated) {
                console.log("[Passport] Sadmin authenticated via stored hash");
              }
            } else if (!user || !user.password || user.password === '') {
              // Initial setup only: no user or no hashed password yet
              // Allow env password for first-time setup, then require hash update
              if (password === secureSadminPassword) {
                isSadminAuthenticated = true;
                console.log("[Passport] Sadmin authenticated via env password (initial setup)");
              }
            }
            // SECURITY: Never allow env password fallback when a hash exists
            
            if (isSadminAuthenticated) {
              console.log("[Passport] Sadmin authenticated successfully");

              // SECURITY: If sadmin user not found, fail authentication
              // User creation should only happen through proper initialization scripts
              if (!user) {
                console.error("[Passport] SECURITY: Sadmin user not found in database");
                console.error("[Passport] Please run proper initialization script to create sadmin user");
                console.error("[Passport] Authentication failed - user creation not allowed in login flow");
                return done(null, false, { 
                  message: "System not properly initialized. Contact administrator." 
                });
              }

              // Critical: Fix null email issue for sadmin user if it exists
              if (!user.email) {
                console.log("[Passport] ⚠️ Detected null email for sadmin, fixing in-memory");
                user.email = 'superadmin@esimplatform.com';

                // Try to fix it in the database too if possible
                try {
                  console.log("[Passport] Attempting to fix sadmin email in database");
                  await db.update(schema.users)
                    .set({ email: 'superadmin@esimplatform.com' })
                    .where(eq(schema.users.username, 'sadmin'));
                } catch (dbError) {
                  console.error("[Passport] Failed to update sadmin email in database:", dbError);
                  // Continue anyway, in-memory fix is applied
                }
              }

              // Ensure admin flags are properly set
              user.isAdmin = true;
              user.isSuperAdmin = true;

              return done(null, user);
            }
          } catch (sadminError) {
            console.error("[Passport] Error during sadmin authentication:", sadminError);
            // Just continue to normal authentication flow
          }
        } else {
          // For all other users, treat the provided username as an email
          // This creates a backward compatibility for existing accounts
          // First try to find the user by username
          user = await storage.getUserByUsername(username);

          // If not found by username, try by email
          if (!user) {
            user = await storage.getUserByEmail(username);
          }
        }

        if (!user) {
          console.log("[Passport] User not found:", username);
          return done(null, false, { message: "Invalid username or email" });
        }

        if (!user.password) {
          console.log("[Passport] User has no password:", username);
          return done(null, false, { message: "Invalid password" });
        }

        const match = await comparePasswords(password, user.password);

        if (!match) {
          console.log("[Passport] Password mismatch for user:", username);
          return done(null, false, { message: "Invalid password" });
        }

        if (!user.isVerified) {
          return done(null, false, { message: "Account not verified. Please check your email for verification link." });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => {
    if (!user || !("id" in user)) {
      return done(new Error("Invalid user"));
    }

    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      // User deserialization in progress
      const user = await storage.getUser(id);
      if (!user) {
        // User not found during deserialization
        return done(null, false);
      }

      // Special handling for sadmin user with null email
      if (user.username === 'sadmin' && !user.email) {
        console.log("[Passport] ⚠️ Found sadmin with null email during deserialization, fixing in-memory");
        user.email = 'superadmin@esimplatform.com';

        // Try to fix it in the database too if possible
        try {
          console.log("[Passport] Attempting to fix sadmin email in database during deserialization");
          await db.update(schema.users)
            .set({ email: 'superadmin@esimplatform.com' })
            .where(eq(schema.users.username, 'sadmin'));
        } catch (dbError) {
          console.error("[Passport] Failed to update sadmin email in database:", dbError);
          // Continue anyway, in-memory fix is applied
        }
      }

      // Get company associated with this user if any
      let role: 'company' | 'admin' | 'superadmin' | undefined = undefined;
      if (user.isSuperAdmin) {
        role = 'superadmin';
      } else if (user.isAdmin && user.companyId) {
        // Regular company admin
        role = 'admin';
      } else if (user.companyId) {
        // Regular company user
        role = 'company';
      }

      // Add role to the user object
      const userWithRole = { ...user, role };

      // User successfully deserialized
      done(null, userWithRole);
    } catch (error) {
      console.error("[Passport] Error during user deserialization:", error);
      done(error);
    }
  });

  // Authentication routes
  app.get("/api/auth/status", async (req: Request, res: Response) => {
    try {
      // Explicitly set content type to application/json
      res.setHeader("Content-Type", "application/json");

      // SECURITY: Log only non-sensitive authentication info (no session IDs)
      console.log("[Auth] Status check - isAuthenticated:", req.isAuthenticated(), 
        "User:", req.user ? `${(req.user as any).username} (ID: ${(req.user as any).id})` : "Not logged in"
      );

      // Normal authentication flow
      if (req.isAuthenticated() && req.user) {
        const { password, ...userWithoutPassword } = req.user as any;

        // Special handling for sadmin user
        if (userWithoutPassword.username === 'sadmin') {
          console.log("[Auth] Status check for sadmin user - ensuring superadmin permissions");

          // Force these values for sadmin
          userWithoutPassword.isSuperAdmin = true;
          userWithoutPassword.isAdmin = true;
          userWithoutPassword.role = 'superadmin';

          // Set email if missing
          if (!userWithoutPassword.email) {
            userWithoutPassword.email = 'superadmin@esimplatform.com';
          }

          // Sadmin (super admin) should NOT have a company - they are platform owners
          // with access to all companies. No company assignment needed.
          console.log("[Auth] Sadmin user authenticated - no company required (platform owner)");
        }

        // Check if user needs to complete profile (logged in but no company ID and not a superadmin)
        // Check if company profile needs completion
        let needsCompleteProfile = false;
        if (userWithoutPassword.companyId && !userWithoutPassword.isSuperAdmin && userWithoutPassword.isVerified) {
          try {
            const [company] = await db.select()
              .from(schema.companies)
              .where(eq(schema.companies.id, userWithoutPassword.companyId))
              .limit(1);
            
            console.log("[Auth] Company profile check for company ID:", userWithoutPassword.companyId, 
                       "Company found:", !!company, 
                       "Verified:", company?.verified, 
                       "Address:", company?.address);
            
            // Company needs profile completion if it's not verified or has placeholder data
            needsCompleteProfile = company && (!company.verified || company.address === "Pending completion");
            
            console.log("[Auth] Profile completion needed:", needsCompleteProfile);
          } catch (error) {
            console.error("[Auth] Error checking company profile status:", error);
            needsCompleteProfile = false;
          }
        }

        // Ensure user has a role set
        if (!userWithoutPassword.role) {
          if (userWithoutPassword.isSuperAdmin) {
            userWithoutPassword.role = 'superadmin';
          } else if (userWithoutPassword.isAdmin) {
            userWithoutPassword.role = 'admin';
          } else {
            userWithoutPassword.role = 'company';
          }
          console.log("[Auth] Assigned role in status endpoint:", userWithoutPassword.role);
        }

        console.log("[Auth] Returning authenticated user with role:", userWithoutPassword.role);

        res.json({
          success: true,
          authenticated: true,
          user: userWithoutPassword,
          needsCompleteProfile
        });
      } else {
        console.log("[Auth] Status check - user not authenticated");
        res.json({
          success: true,
          authenticated: req.isAuthenticated(),
          user: req.user || null
        });
      }
    } catch (error) {
      console.error("[Auth] Error in status endpoint:", error);
      res.status(500).json({
        success: false,
        authenticated: false,
        error: "Internal server error checking authentication status"
      });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response, next: NextFunction) => {
    console.log("[Auth] Login attempt for user:", req.body.username || "unknown");

    // Ensure content-type is always set to application/json
    res.setHeader("Content-Type", "application/json");

    // Regular authentication flow for non-emergency cases
    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) {
        console.error("[Auth] Login error:", err);
        return res.status(500).json({
          success: false,
          error: "Internal server error during authentication"
        });
      }

      if (!user) {
        console.log("[Auth] Login failed:", info.message || "Unknown reason");
        return res.status(401).json({
          success: false,
          error: info.message || "Authentication failed"
        });
      }

      // Special handling for sadmin user with null email
      if (user.username === 'sadmin' && !user.email) {
        console.log("[Auth] Detected sadmin login with null email, fixing...");
        // Fix the sadmin user's email directly for this session
        user.email = 'superadmin@esimplatform.com';
      }

      req.login(user, async (loginErr) => {
        if (loginErr) {
          console.error("[Auth] Session creation error:", loginErr);
          return res.status(500).json({
            success: false,
            error: "Failed to create session"
          });
        }

        try {
          // Safely extract user data
          const userWithoutPassword = { ...user };
          delete userWithoutPassword.password;

          // Special handling for sadmin user
          if (userWithoutPassword.username === 'sadmin') {
            console.log("[Auth] Login processing for sadmin user - ensuring superadmin permissions");

            // Force these values for sadmin
            userWithoutPassword.isSuperAdmin = true;
            userWithoutPassword.isAdmin = true;
            userWithoutPassword.role = 'superadmin';

            // Set email if missing
            if (!userWithoutPassword.email) {
              userWithoutPassword.email = 'superadmin@esimplatform.com';
            }

            // Sadmin (super admin) should NOT have a company - they are platform owners
            // with access to all companies. No company assignment needed.
            console.log("[Auth] Sadmin login successful - no company required (platform owner)");
          } 
          // Set role for normal users
          else {
            // Ensure user has a role set
            if (userWithoutPassword.isSuperAdmin) {
              userWithoutPassword.role = 'superadmin';
            } else if (userWithoutPassword.isAdmin) {
              userWithoutPassword.role = 'admin';
            } else {
              userWithoutPassword.role = 'company';
            }
          }

          // Check if user needs to complete profile 
          let needsCompleteProfile = false;
          
          // For non-superadmin users, always check profile completion status
          if (!userWithoutPassword.isSuperAdmin) {
            if (userWithoutPassword.companyId) {
              try {
                const [company] = await db.select()
                  .from(schema.companies)
                  .where(eq(schema.companies.id, userWithoutPassword.companyId))
                  .limit(1);
                
                console.log("[Auth] Company profile check for company ID:", userWithoutPassword.companyId, 
                           "Company found:", !!company, 
                           "Verified:", company?.verified, 
                           "Address:", company?.address);
                
                // Company needs profile completion if it's not verified or has placeholder data
                needsCompleteProfile = !company || !company.verified || company.address === "Pending completion";
                
                console.log("[Auth] Profile completion needed:", needsCompleteProfile);
              } catch (error) {
                console.error("[Auth] Error checking company profile status:", error);
                needsCompleteProfile = true; // Default to requiring completion on error
              }
            } else {
              // User has no company - definitely needs profile completion
              needsCompleteProfile = true;
              console.log("[Auth] User has no company - profile completion required");
            }
          }

          // Update company's last activity date and reactivate if necessary
          if (userWithoutPassword.companyId) {
            try {
              // First, check the company's active status
              const [company] = await db.select()
                .from(schema.companies)
                .where(eq(schema.companies.id, userWithoutPassword.companyId))
                .limit(1);
              
              if (company) {
                // Update last activity date
                await db.update(schema.companies)
                  .set({
                    lastActivityDate: new Date(),
                    // If company was inactive, reactivate it
                    active: true
                  })
                  .where(eq(schema.companies.id, userWithoutPassword.companyId));
                
                if (!company.active) {
                  console.log(`[Auth] Company ${company.name} (ID: ${company.id}) was inactive and has been reactivated due to user login`);
                } else {
                  console.log(`[Auth] Updated last activity date for company ${company.name} (ID: ${company.id})`);
                }
              }
            } catch (error) {
              console.error("[Auth] Error updating company activity:", error);
            }
          }

          console.log("[Auth] Login successful for user:", userWithoutPassword.username, 
                      "with role:", userWithoutPassword.role, 
                      "needsCompleteProfile:", needsCompleteProfile);

          return res.json({
            success: true,
            user: userWithoutPassword,
            needsCompleteProfile
          });
        } catch (responseError) {
          console.error("[Auth] Error preparing response:", responseError);
          return res.status(500).json({
            success: false, 
            error: "Error processing user data"
          });
        }
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    // Ensure content-type is always set to application/json
    res.setHeader("Content-Type", "application/json");

    req.logout((err) => {
      if (err) {
        console.error("Error during logout:", err);
      }
    });

    res.json({
      success: true
    });
  });

  // Registration endpoint - requires email and company name
  app.post("/api/auth/register", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Ensure content-type is always set to application/json
      res.setHeader("Content-Type", "application/json");

      const { email, companyName } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: "Email is required"
        });
      }

      if (!companyName) {
        return res.status(400).json({
          success: false,
          error: "Company name is required"
        });
      }

      // If a specific company ID is provided, check if the email already exists in that company
      const { companyId } = req.body;
      
      if (companyId) {
        const existingEmailInCompany = await storage.getUserByEmailAndCompany(email, companyId);
        if (existingEmailInCompany) {
          return res.status(400).json({
            success: false,
            error: "Email already exists in this company"
          });
        }
      }
      
      // NOTE: We no longer require company information at this stage.
      // Company information will be collected after email verification.
      
      // Email uniqueness within a company is enforced at the database level
      // with our composite unique constraint on (email, company_id)

      // Check if this company name is already registered (even in pending state)
      const existingCompany = await db.select()
        .from(schema.companies)
        .where(eq(schema.companies.name, companyName))
        .limit(1);

      if (existingCompany.length > 0) {
        return res.status(400).json({
          success: false,
          error: "A company with this name is already registered or pending approval."
        });
      }

      // Check if email is already registered anywhere in the system
      const existingUser = await db.select()
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);
        
      if (existingUser.length > 0) {
        return res.status(400).json({
          success: false,
          error: "This email address is already registered. Please use a different email or try logging in."
        });
      }

      // Create a pending company record (not verified yet)
      const [pendingCompany] = await db.insert(schema.companies)
        .values({
          name: companyName,
          contactEmail: email,
          verified: false,
          active: false, // Company starts as inactive until profile is completed
          // Set minimal required fields to avoid constraint issues
          country: "Pending",
          address: "Pending completion",
          description: "Company awaiting profile completion"
        })
        .returning();

      if (!pendingCompany) {
        return res.status(500).json({
          success: false,
          error: "Failed to create company record"
        });
      }

      // Generate a temporary username from the email
      const username = `user_${Math.random().toString(36).substring(2, 10)}`;

      // Generate a temporary password (will be set by user after verification)
      const temporaryPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await secureHashPassword(temporaryPassword);

      // Generate verification token and expiry
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Set token expiry to 24 hours from now
      const verificationTokenExpiry = new Date();
      verificationTokenExpiry.setHours(verificationTokenExpiry.getHours() + 24);

      // Create the user linked to the pending company
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        isVerified: false,
        isAdmin: false, // Will be set to true after completing profile
        companyId: pendingCompany.id, // Link to the pending company
        verificationToken,
        verificationTokenExpiry: verificationTokenExpiry.toISOString()
      });

      if (!user) {
        return res.status(500).json({
          success: false,
          error: "Failed to create user"
        });
      }

      // Send verification email with link to set password
      try {
        // Make sure we have a user id before creating the url
        if (!user || !user.id) {
          console.error("User object is missing or has no ID:", user);
          return res.status(500).json({
            success: false,
            error: "Failed to create user properly. Please try again."
          });
        }

        // Log the user object for debugging
        console.log("Created user:", user);

        // The verification URL now uses path parameters instead of query parameters
        // Path parameters are more reliable as they're less likely to be modified by email clients
        const baseUrl = getBaseUrl();
        const setPasswordUrl = `${baseUrl}/set-password/${verificationToken}/${user.id}`;
        console.log("Generated set password URL:", setPasswordUrl);

        const emailSent = await sendVerificationEmail(email, username, verificationToken, setPasswordUrl);
        console.log(`Verification email sent: ${emailSent}`);
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
        // Continue with registration even if email fails
      }

      // Return success without logging in - user must verify email and set password first
      res.json({
        success: true,
        message: "Registration initiated. Please check your email to verify your account and set your password.",
        requiresVerification: true
      });
    } catch (error) {
      console.error("Registration error:", error);
      next(error);
    }
  });

  // The old email verification endpoint was removed as it's no longer used
  // Modern verification flow now uses the set-password page with token and userId parameters

  // Company information update endpoint
  app.post("/api/auth/company-info", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("Company info submission received:", JSON.stringify(req.body, null, 2));

      const { 
        companyName,
        country, 
        address, 
        taxNumber, 
        entityType, 
        contactName, 
        phoneCountryCode,
        phoneNumber,
        contactPhone, 
        contactEmail,
        website,
        industry,
        description 
      } = req.body;

      // Use authenticated user from session
      const user = req.user as any;
      if (!user) {
        console.error("No authenticated user in company-info request");
        return res.status(401).json({
          success: false,
          error: "Authentication required"
        });
      }

      console.log("Found user for company creation:", { 
        userId: user.id, 
        username: user.username, 
        email: user.email, 
        companyId: user.companyId,
        isSuperAdmin: user.isSuperAdmin
      });

      // Check if company with the same name or tax number already exists
      // BUT exclude the user's own pending company (from pre-registration)
      console.log("Checking for existing companies with name or tax number:", { companyName, taxNumber, userCompanyId: user.companyId });
      
      let existingCompanies;
      if (taxNumber) {
        existingCompanies = await db.select()
          .from(schema.companies)
          .where(
            and(
              or(
                eq(schema.companies.name, companyName),
                eq(schema.companies.taxNumber, taxNumber)
              ),
              sql`${schema.companies.id} != ${user.companyId}`
            )
          );
      } else {
        existingCompanies = await db.select()
          .from(schema.companies)
          .where(
            and(
              eq(schema.companies.name, companyName),
              sql`${schema.companies.id} != ${user.companyId}`
            )
          );
      }

      if (existingCompanies.length > 0) {
        console.log("Company with the same name or tax number already exists (excluding user's own pending company):", existingCompanies);

        const duplicateName = existingCompanies.some(c => c.name === companyName);
        const duplicateTaxNumber = existingCompanies.some(c => c.taxNumber === taxNumber);

        let errorMessage = '';
        if (duplicateName && duplicateTaxNumber) {
          errorMessage = "A company with this name and tax number already exists";
        } else if (duplicateName) {
          errorMessage = "A company with this name already exists";
        } else if (duplicateTaxNumber) {
          errorMessage = "A company with this tax number already exists";
        }

        return res.status(400).json({
          success: false,
          error: errorMessage
        });
      }

      console.log("Creating company with name:", companyName);

      // Use a transaction to ensure company update, user update, and wallet are all created atomically
      const companyData = await db.transaction(async (tx) => {
        try {
          // Update the existing pending company record with complete information
          const [company] = await tx.update(schema.companies)
            .set({
              taxNumber,
              country,
              address,
              entityType,
              contactName,
              // Save both old and new phone number formats for compatibility
              contactPhone: phoneCountryCode && phoneNumber ? `${phoneCountryCode} ${phoneNumber}` : contactPhone,
              phoneCountryCode,
              phoneNumber,
              contactEmail,
              website,
              industry,
              description,
              verified: true, // Set the company as verified when completing profile
              active: true // Activate the company
            })
            .where(eq(schema.companies.id, user.companyId!))
            .returning();

          if (!company) {
            console.error("Failed to create company within transaction");
            throw new Error("Failed to create company");
          }

          console.log("Created company within transaction:", company);

          // Now update the user with the company ID and use contactName as the username
          const [updatedUser] = await tx.update(schema.users)
            .set({
              companyId: company.id,
              isAdmin: true, // First user is admin of the company
              username: contactName // Use the contact person's name instead of the generated username
            })
            .where(eq(schema.users.id, user.id))
            .returning();

          if (!updatedUser || updatedUser.companyId !== company.id) {
            console.error("Failed to update user with company ID within transaction");
            throw new Error("Failed to associate user with company");
          }

          // Create wallet directly within the transaction to ensure atomicity
          console.log("Creating wallet for company within transaction, company ID:", company.id);
          const [wallet] = await tx.insert(schema.wallets)
            .values({
              companyId: company.id,
              balance: "0",
              lastUpdated: new Date()
            })
            .returning();

          console.log("Created wallet successfully within transaction:", wallet.id);

          return { company, updatedUser, wallet };
        } catch (error) {
          console.error("Transaction failed:", error);
          throw error;
        }
      });

      const { company, updatedUser } = companyData;
      console.log("Transaction completed successfully - company, user, and wallet created");

      // Send welcome email with the updated username (which should now be the contact person's name)
      try {
        const sentWelcomeEmail = await sendWelcomeEmail(user.email, contactName);
        console.log("Welcome email sent:", sentWelcomeEmail);
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
        // Continue even if welcome email fails
      }

      res.json({
        success: true,
        message: "Company information saved successfully. You may now log in.",
        company
      });

    } catch (error) {
      console.error("Error saving company information:", error);
      next(error);
    }
  });

  app.post("/api/auth/verify-reset", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: "Email is required"
        });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found"
        });
      }

      // Generate a password reset token
      const resetToken = crypto.randomBytes(20).toString('hex');
      const resetTokenExpiry = new Date();
      resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // 1 hour expiry

      // Update user with reset token
      await db.update(schema.users)
        .set({
          verificationToken: resetToken,
          verificationTokenExpiry: resetTokenExpiry.toISOString()
        })
        .where(eq(schema.users.id, user.id));

      // Send email with reset link using path parameters instead of query parameters
      // Path parameters are more reliable as they're less likely to be modified by email clients
      const baseUrl = getBaseUrl();
      const resetLink = `${baseUrl}/set-password/${resetToken}/${user.id}`;

      // Log the reset link for debugging
      console.log("Generated password resetlink:", resetLink);

      // Send the email
      try {
        await sendPasswordResetEmail(user.email, user.username, resetLink);
        console.log("Password reset email sent to", user.email);
      } catch (emailSendError) {
        console.error("Failed to send password reset email:", emailSendError);
        // Continue even if email fails
      }

      res.json({
        success: true,
        message: "If an account exists with that email, a password reset link has been sent."
      });

    } catch (error) {
      next(error);
    }
  });

  // New endpoint to validate a reset token without actually resetting anything yet
  app.get("/api/auth/validate-reset-token", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, userId } = req.query;

      if (!token || !userId) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: "Token and userId are required"
        });
      }

      // Find user by ID
      const user = await storage.getUser(parseInt(userId as string));

      if (!user) {
        return res.status(404).json({
          success: false,
          valid: false,
          message: "User not found"
        });
      }

      // Verify the token matches
      if (user.verificationToken !== token) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: "Invalid token"
        });
      }

      // Check if token is expired
      if (user.verificationTokenExpiry) {
        const expiryDate = new Date(user.verificationTokenExpiry);
        if (expiryDate < new Date()) {
          return res.status(400).json({
            success: false,
            valid: false,
            message: "Token has expired. Please request a new verification email."
          });
        }
      }

      // Token is valid - also return the email for auto-login and companyId to determine if they need profile completion
      return res.status(200).json({
        success: true,
        valid: true,
        message: "Token is valid",
        email: user.email,
        companyId: user.companyId
      });

    } catch (error) {
      next(error);
    }
  });

  // New endpoint to set password after email verification
  app.post("/api/auth/set-password", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, userId, password } = req.body;

      if (!token || !userId || !password) {
        return res.status(400).json({
          success: false,
          message: "Token, userId, and password are required"
        });
      }

      // Find user by ID
      const user = await storage.getUser(parseInt(userId));

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      // Verify the token matches
      if (user.verificationToken !== token) {
        return res.status(400).json({
          success: false,
          message: "Invalid token"
        });
      }

      // Check if token is expired
      if (user.verificationTokenExpiry) {
        const expiryDate = new Date(user.verificationTokenExpiry);
        if (expiryDate < new Date()) {
          return res.status(400).json({
            success: false,
            message: "Token has expired. Please request a new verification email."
          });
        }
      }

      // Hash the new password
      const hashedPassword = await secureHashPassword(password);

      // Update the user record with the new password and mark as verified
      const [updatedUser] = await db.update(schema.users)
        .set({
          password: hashedPassword,
          isVerified: true,
          verificationToken: null,
          verificationTokenExpiry: null
        })
        .where(eq(schema.users.id, parseInt(userId)))
        .returning();

      if (!updatedUser) {
        return res.status(500).json({
          success: false,
          message: "Failed to update password"
        });
      }

      // Send welcome email
      try {
        const emailSent = await sendWelcomeEmail(user.email, user.username);
        console.log(`Welcome email sent: ${emailSent}`);
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
        // Continue even if welcome email fails
      }

      // For new users setting password, they always need to complete profile
      // This ensures they go through the company setup process
      let needsCompleteProfile = true;
      
      // Only skip profile completion for superadmin users
      if (updatedUser.isSuperAdmin) {
        needsCompleteProfile = false;
      } else if (updatedUser.companyId) {
        try {
          const [company] = await db.select()
            .from(schema.companies)
            .where(eq(schema.companies.id, updatedUser.companyId))
            .limit(1);
          
          console.log("[SetPassword] Company profile check for company ID:", updatedUser.companyId, 
                     "Company found:", !!company, 
                     "Verified:", company?.verified, 
                     "Address:", company?.address);
          
          // Only skip profile completion if company is fully verified with real data
          if (company && company.verified && company.address !== "Pending completion") {
            needsCompleteProfile = false;
          }
          
          console.log("[SetPassword] Profile completion needed:", needsCompleteProfile);
        } catch (error) {
          console.error("[SetPassword] Error checking company profile status:", error);
          needsCompleteProfile = true; // Default to requiring profile completion
        }
      }

      // Auto-login the user after successful password set
      console.log("[SetPassword] Auto-logging in user after password set");
      
      const loginResult = await new Promise<any>((resolve, reject) => {
        req.login(updatedUser, (err) => {
          if (err) {
            console.error("[SetPassword] Auto-login error:", err);
            reject(err);
          } else {
            console.log("[SetPassword] Auto-login successful for user:", updatedUser.username);
            resolve({ success: true, user: updatedUser });
          }
        });
      });

      const userResponse = {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
        isSuperAdmin: updatedUser.isSuperAdmin,
        companyId: updatedUser.companyId,
        isVerified: updatedUser.isVerified,
        role: updatedUser.isSuperAdmin ? 'superadmin' : updatedUser.isAdmin ? 'admin' : 'company'
      };

      console.log("[SetPassword] Returning success with needsCompleteProfile:", needsCompleteProfile);

      // Return success with auto-login and profile completion flag
      return res.status(200).json({
        success: true,
        message: "Password set successfully and logged in",
        user: userResponse,
        needsCompleteProfile
      });

    } catch (error) {
      next(error);
    }
  });

  app.use((err: AuthError, req: Request, res: Response, next: NextFunction) => {
    console.error("Auth error:", err);

    const status = err.status || 500;
    const message = err.message || "An unknown error occurred";

    res.status(status).json({
      success: false,
      error: message
    });
  });

  console.log("[Server] Authentication setup complete");
}