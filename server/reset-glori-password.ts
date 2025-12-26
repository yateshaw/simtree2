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
  const password = 'glori123'; // New simple password for Glori
  const hashedPassword = await hashPassword(password);

  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL!,
    ssl: { 
      rejectUnauthorized: false // Required for Neon PostgreSQL over HTTPS
    }
  });
  const db = drizzle(pool);

  await db.execute(sql`
    UPDATE users SET password = ${hashedPassword} WHERE username = 'glori';
  `);

  console.log("Password reset successfully for glori");
  await pool.end();
}

main().catch(console.error);