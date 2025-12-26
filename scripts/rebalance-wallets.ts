/**
 * This script recalculates all wallet balances based on their transactions
 * to ensure data consistency after migrating wallet structure.
 */

import { db } from '../server/db';
import * as schema from '../shared/schema';
import { eq, and } from 'drizzle-orm';

async function rebalanceWallets() {
  console.log('Starting wallet balance recalculation...');
  
  try {
    // Get all wallets
    const wallets = await db.select().from(schema.wallets);
    console.log(`Found ${wallets.length} wallets to check`);
    
    let updatedCount = 0;
    
    for (const wallet of wallets) {
      // Get all completed transactions for this wallet
      const transactions = await db
        .select()
        .from(schema.walletTransactions)
        .where(and(
          eq(schema.walletTransactions.walletId, wallet.id),
          eq(schema.walletTransactions.status, 'completed')
        ));
        
      // Calculate balance based on transaction types
      let balance = 0;
      
      for (const transaction of transactions) {
        const amount = parseFloat(transaction.amount);
        
        if (transaction.type === 'credit') {
          balance += amount;
        } else if (transaction.type === 'debit') {
          balance -= amount;
        } else if (transaction.type === 'refund') {
          balance -= amount; // Refund is opposite of credit
        }
      }
      
      const formattedBalance = balance.toFixed(2);
      
      // Check if balance needs updating
      if (formattedBalance !== wallet.balance) {
        console.log(`Updating wallet ${wallet.id} (${wallet.walletType}) balance from ${wallet.balance} to ${formattedBalance}`);
        
        // Update wallet balance
        await db
          .update(schema.wallets)
          .set({
            balance: formattedBalance,
            lastUpdated: new Date()
          })
          .where(eq(schema.wallets.id, wallet.id));
          
        updatedCount++;
      } else {
        console.log(`Wallet ${wallet.id} (${wallet.walletType}) balance is already correct: ${wallet.balance}`);
      }
    }
    
    console.log(`Wallet balance recalculation complete. Updated ${updatedCount} of ${wallets.length} wallets.`);
  } catch (error) {
    console.error('Error recalculating wallet balances:', error);
  }
}

// Run the script
rebalanceWallets()
  .then(() => {
    console.log('Wallet rebalancing script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error running wallet rebalancing script:', error);
    process.exit(1);
  });