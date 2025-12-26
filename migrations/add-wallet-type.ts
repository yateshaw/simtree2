import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * This migration adds the wallet_type column to the wallets table
 * and updates related transaction tracking fields in the wallet_transactions table
 */
async function runMigration() {
  console.log("Starting migration to add wallet_type column...");

  try {
    // Add wallet_type column to wallets table if it doesn't exist
    await db.execute(sql`
      ALTER TABLE wallets 
      ADD COLUMN IF NOT EXISTS wallet_type TEXT NOT NULL DEFAULT 'general'
    `);
    console.log("Added wallet_type column to wallets table");

    // Add related_transaction_id column to wallet_transactions table if it doesn't exist
    await db.execute(sql`
      ALTER TABLE wallet_transactions 
      ADD COLUMN IF NOT EXISTS related_transaction_id INTEGER
    `);
    console.log("Added related_transaction_id column to wallet_transactions table");

    // Add esim_plan_id column to wallet_transactions table if it doesn't exist
    await db.execute(sql`
      ALTER TABLE wallet_transactions 
      ADD COLUMN IF NOT EXISTS esim_plan_id INTEGER REFERENCES esim_plans(id)
    `);
    console.log("Added esim_plan_id column to wallet_transactions table");

    // Add esim_order_id column to wallet_transactions table if it doesn't exist
    await db.execute(sql`
      ALTER TABLE wallet_transactions 
      ADD COLUMN IF NOT EXISTS esim_order_id TEXT
    `);
    console.log("Added esim_order_id column to wallet_transactions table");

    // Add provider_id column to wallets table if it doesn't exist
    await db.execute(sql`
      ALTER TABLE wallets
      ADD COLUMN IF NOT EXISTS provider_id TEXT
    `);
    console.log("Added provider_id column to wallets table");

    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

runMigration()
  .then(() => {
    console.log("Wallet type migration completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error running wallet type migration:", err);
    process.exit(1);
  });