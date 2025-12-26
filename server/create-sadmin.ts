import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { users, companies } from "@shared/schema";
import crypto from "crypto";
import { eq } from "drizzle-orm";

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 32, "sha256").toString("hex");
  return salt + "." + hash;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { 
      rejectUnauthorized: false // Required for Neon PostgreSQL over HTTPS
    }
  });
  const db = drizzle(pool);

  // Step 1: Check if Semtree company exists, create if it doesn't
  let semtreeCompany = await db.select().from(companies).where(eq(companies.name, "Semtree")).execute();
  let companyId: number | null = null;
  
  if (semtreeCompany.length === 0) {
    console.log("Semtree company does not exist, creating it...");
    
    const [newCompany] = await db.insert(companies)
      .values({
        name: "Semtree",
        taxNumber: "SEMTREE-TAX-1234",
        address: "123 Corporate Drive",
        country: "Global",
        entityType: "Corporation",
        contactName: "System Administrator",
        contactPhone: "+1-555-SEMTREE",
        contactEmail: "superadmin@esimplatform.com",
        verified: true,
        active: true,
        website: "https://semtree.global",
        industry: "Telecommunications",
        description: "System administrator company"
      })
      .returning();
      
    console.log("Semtree company created successfully:", newCompany);
    companyId = newCompany.id;
  } else {
    console.log("Semtree company already exists");
    companyId = semtreeCompany[0].id;
  }

  // Step 2: Check if sadmin already exists
  const existingUser = await db.select().from(users).where(sql`username = 'sadmin'`);
  
  if (existingUser.length > 0) {
    console.log("Super admin user (sadmin) already exists, updating...");
    
    // Update sadmin user including company association
    const hashedPassword = await hashPassword("sadmin123");
    await db.update(users)
      .set({ 
        password: hashedPassword,
        isAdmin: true,
        isSuperAdmin: true,
        isVerified: true,
        companyId: companyId // Associate with Semtree company
      })
      .where(sql`username = 'sadmin'`);
      
    console.log("Super admin updated successfully and associated with Semtree company");
  } else {
    console.log("Creating new super admin user (sadmin)...");
    
    // Create new sadmin user associated with Semtree company
    const hashedPassword = await hashPassword("sadmin123");
    const [newUser] = await db.insert(users)
      .values({
        username: "sadmin",
        email: "superadmin@esimplatform.com",
        password: hashedPassword,
        isAdmin: true,
        isSuperAdmin: true,
        companyId: companyId, // Associate with Semtree company
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null
      })
      .returning();
      
    console.log("Super admin user created successfully:", {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      companyId: newUser.companyId
    });
  }

  await pool.end();
}

main()
  .then(() => {
    console.log("Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });