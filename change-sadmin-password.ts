import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users } from "@shared/schema";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import "dotenv/config";

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 32, "sha256").toString("hex");
  return salt + "." + hash;
}

async function changeSadminPassword() {
  try {
    console.log("[Security] Changing sadmin password for security...");
    
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    // Ensure database connection is working
    try {
      await pool.query('SELECT 1 as connection_test');
      console.log("[Security] Database connection verified");
    } catch (dbError) {
      console.error("[Security] Database connection failed:", dbError);
      return false;
    }
    
    const db = drizzle(pool);

    // Check if sadmin exists
    console.log("[Security] Checking for existing sadmin user...");
    const existingUser = await db.select().from(users)
      .where(eq(users.username, "sadmin"))
      .execute();
    
    if (!existingUser || existingUser.length === 0) {
      console.error("[Security] Sadmin user not found!");
      await pool.end();
      return false;
    }
    
    console.log("[Security] Found sadmin user with ID:", existingUser[0].id);
    
    // Change password to secure one
    const newPassword = "Sanmin$123!";
    const hashedPassword = await hashPassword(newPassword);
    
    await db.update(users)
      .set({ 
        password: hashedPassword,
        isAdmin: true,
        isSuperAdmin: true,
        isVerified: true 
      })
      .where(eq(users.username, "sadmin"))
      .execute();
    
    console.log("[Security] Sadmin password has been updated successfully");
    
    // Delete any existing sessions to force new login with new password
    try {
      await pool.query(`DELETE FROM session WHERE session::text LIKE '%sadmin%'`);
      console.log("[Security] Cleared existing sadmin sessions");
    } catch (sessionError) {
      console.error("[Security] Error clearing sessions:", sessionError);
      // Continue anyway, changing the password is more important
    }
    
    await pool.end();
    return true;
  } catch (error) {
    console.error("[Security] Error updating sadmin password:", error);
    return false;
  }
}

// Execute password change
changeSadminPassword().then((success) => {
  if (success) {
    console.log("[Security] Password change completed successfully");
    console.log("[Security] The sadmin account is now secured with a new password");
  } else {
    console.error("[Security] Password change failed");
  }
  process.exit(0);
});