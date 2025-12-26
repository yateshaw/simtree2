import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { users, companies } from "@shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "./lib/password-security";

export async function initializeSadmin(pool: any) {
  try {
    console.log("[Server] Initializing sadmin user...");
    
    // Check if pool is valid
    if (!pool) {
      console.error("[Server] Database pool is not initialized! Cannot create sadmin.");
      return false;
    }
    
    // Ensure database connection is working
    try {
      await pool.query('SELECT 1 as connection_test');
      console.log("[Server] Database connection verified for sadmin initialization");
    } catch (dbError) {
      console.error("[Server] Database connection failed during sadmin initialization:", dbError);
      return false;
    }
    
    const db = drizzle(pool);

    // Step 1: Check if Simtree company exists, create if it doesn't
    console.log("[Server] Checking for Simtree company...");
    let simtreeCompany;
    try {
      simtreeCompany = await db.select().from(companies).where(eq(companies.name, "Simtree")).execute();
      console.log("[Server] Company check result:", simtreeCompany.length > 0 ? "Found Simtree company" : "No Simtree company found");
    } catch (companyCheckError) {
      console.error("[Server] Error checking for Simtree company:", companyCheckError);
      return false;
    }
    
    let companyId: number | null = null;
    
    if (!simtreeCompany || simtreeCompany.length === 0) {
      console.log("[Server] Simtree company does not exist, creating it...");
      
      try {
        const companyValues = {
          name: "Simtree",
          taxNumber: "SIMTREE-TAX-1234",
          address: "123 Corporate Drive",
          country: "Global",
          entityType: "Corporation",
          contactName: "System Administrator",
          contactPhone: "+1-555-SIMTREE",
          contactEmail: "superadmin@esimplatform.com",
          verified: true,
          active: true,
          website: "https://simtree.global",
          industry: "Telecommunications",
          description: "System administrator company"
        };
        
        console.log("[Server] Creating Simtree company with values:", companyValues);
        const [newCompany] = await db.insert(companies)
          .values(companyValues)
          .returning();
          
        console.log("[Server] Simtree company created successfully:", newCompany);
        companyId = newCompany.id;
      } catch (companyCreateError) {
        console.error("[Server] Failed to create Simtree company:", companyCreateError);
        // Try to continue with user creation even if company creation fails
      }
    } else {
      console.log("[Server] Simtree company already exists:", simtreeCompany[0]);
      companyId = simtreeCompany[0].id;
    }

    // Step 2: Check if sadmin already exists
    console.log("[Server] Checking for existing sadmin user...");
    let existingUser;
    try {
      existingUser = await db.select().from(users).where(eq(users.username, "sadmin")).execute();
      console.log("[Server] User check result:", existingUser.length > 0 ? "Found sadmin user" : "No sadmin user found");
    } catch (userCheckError) {
      console.error("[Server] Error checking for sadmin user:", userCheckError);
      return false;
    }
    
    const sadminEmail = "superadmin@esimplatform.com";
    
    try {
      if (existingUser && existingUser.length > 0) {
        console.log("[Server] Super admin user already exists, ensuring correct configuration...");
        
        // First check if email is null and needs to be fixed
        const needsEmailFix = !existingUser[0].email;
        if (needsEmailFix) {
          console.log("[Server] ⚠️ Detected null email for sadmin user, will be fixed");
        }
        
        // Update sadmin user including company association to ensure proper setup
        const sadminPassword = process.env.SADMIN_PASSWORD;
        if (!sadminPassword) {
          console.error("[Server] SECURITY ERROR: SADMIN_PASSWORD environment variable not set");
          return false;
        }
        const hashedPassword = await hashPassword(sadminPassword);
        
        const updateValues = { 
          email: sadminEmail, // Always set email to ensure it's not null
          password: hashedPassword,
          isAdmin: true,
          isSuperAdmin: true,
          isVerified: true,
          companyId: null // Super admin should not be associated with any company
        };
        
        console.log("[Server] Updating sadmin user with values:", {
          ...updateValues,
          password: "[REDACTED]"
        });
        
        const [updatedUser] = await db.update(users)
          .set(updateValues)
          .where(eq(users.username, "sadmin"))
          .returning();
          
        console.log("[Server] Super admin updated successfully:", {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          isAdmin: updatedUser.isAdmin,
          isSuperAdmin: updatedUser.isSuperAdmin,
          companyId: updatedUser.companyId
        });
        
        // Double-check the email was set properly
        if (needsEmailFix) {
          // Check direct with SQL to be absolutely certain
          const emailCheckResult = await pool.query('SELECT email FROM users WHERE username = $1', ['sadmin']);
          console.log("[Server] Email check result after update:", emailCheckResult.rows[0]);
          
          if (!emailCheckResult.rows[0].email) {
            console.error("[Server] ⚠️ Failed to set email for sadmin user despite update");
            // Last resort - direct SQL update
            await pool.query('UPDATE users SET email = $1 WHERE username = $2', [sadminEmail, 'sadmin']);
            console.log("[Server] Attempted direct SQL update for sadmin email");
          }
        }
      } else {
        console.log("[Server] Creating new super admin user (sadmin)...");
        
        // Create new sadmin user associated with Simtree company
        const sadminPassword = process.env.SADMIN_PASSWORD;
        if (!sadminPassword) {
          console.error("[Server] SECURITY ERROR: SADMIN_PASSWORD environment variable not set");
          return false;
        }
        const hashedPassword = await hashPassword(sadminPassword);
        
        const userValues = {
          username: "sadmin",
          email: sadminEmail,
          password: hashedPassword,
          isAdmin: true,
          isSuperAdmin: true,
          companyId: null, // Super admin should not be associated with any company
          isVerified: true,
          verificationToken: null,
          verificationTokenExpiry: null
        };
        
        console.log("[Server] Creating sadmin user with values:", {
          ...userValues,
          password: "[REDACTED]"
        });
        
        const [newUser] = await db.insert(users)
          .values(userValues)
          .returning();
          
        console.log("[Server] Super admin user created successfully:", {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          isAdmin: newUser.isAdmin,
          isSuperAdmin: newUser.isSuperAdmin,
          companyId: newUser.companyId
        });
      }
    } catch (userUpdateError) {
      console.error("[Server] Error updating/creating sadmin user:", userUpdateError);
      return false;
    }

    // Step 3: Validate sadmin user was created/updated correctly
    try {
      const validationCheck = await db.select().from(users).where(eq(users.username, "sadmin")).execute();
      if (validationCheck.length === 0) {
        console.error("[Server] ⚠️ Validation failed - sadmin user not found after initialization");
        return false;
      }
      
      const sadminUser = validationCheck[0];
      console.log("[Server] Final sadmin user state:", {
        id: sadminUser.id,
        username: sadminUser.username,
        email: sadminUser.email,
        isAdmin: sadminUser.isAdmin,
        isSuperAdmin: sadminUser.isSuperAdmin,
        companyId: sadminUser.companyId
      });
      
      if (!sadminUser.email) {
        console.error("[Server] ⚠️ Validation warning - sadmin email is still null after all attempts");
      }
      
      if (!sadminUser.isAdmin || !sadminUser.isSuperAdmin) {
        console.error("[Server] ⚠️ Validation warning - sadmin privilege flags not set correctly");
      }
    } catch (validationError) {
      console.error("[Server] Error during sadmin validation check:", validationError);
    }

    console.log("[Server] Sadmin initialization complete");
    return true;
  } catch (error) {
    console.error("[Server] Error initializing sadmin user:", error);
    return false;
  }
}