import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function main() {
  const adminPass = await hashPassword('admin123');
  const sadminPass = await hashPassword('sadmin123');

  console.log('Admin hash:', adminPass);
  console.log('Sadmin hash:', sadminPass);

  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL!,
    ssl: { 
      rejectUnauthorized: false // Required for Neon PostgreSQL over HTTPS
    }
  });
  const db = drizzle(pool);

  // Update admin user
  await db.execute(sql`
    UPDATE users SET password = ${adminPass} WHERE username = 'admin';
  `);

  // Update sadmin user
  await db.execute(sql`
    UPDATE users SET password = ${sadminPass} WHERE username = 'sadmin';
  `);

  console.log("Password hashes updated successfully");

  await pool.end();
}

main().catch(console.error);