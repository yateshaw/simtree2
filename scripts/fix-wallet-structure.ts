/**
 * This script fixes the wallet structure in the database according to the new
 * design specifications:
 * 
 * 1. SimTree (company ID 1) should have all three wallet types: general, profit, provider
 * 2. Client companies should only have a general wallet
 * 3. Properly migrate any existing transactions to the new structure
 */

import { db } from '../server/db';
import * as schema from '../shared/schema';
import { eq, ne, and, or, isNull } from 'drizzle-orm';

async function fixWalletStructure() {
  console.log('Starting wallet structure fix...');
  
  try {
    // 1. Identify client companies (not SimTree)
    const companies = await db.select().from(schema.companies);
    const simtreeCompanyId = 1; // SimTree company ID is always 1
    const clientCompanyIds = companies
      .filter(company => company.id !== simtreeCompanyId)
      .map(company => company.id);
      
    console.log(`Found ${clientCompanyIds.length} client companies to process`);
    
    // 2. Find all wallets for client companies
    const clientWallets = await db
      .select()
      .from(schema.wallets)
      .where(and(
        ne(schema.wallets.companyId, simtreeCompanyId),
        or(
          eq(schema.wallets.walletType, 'profit'),
          eq(schema.wallets.walletType, 'provider')
        )
      ));
      
    console.log(`Found ${clientWallets.length} profit/provider wallets for client companies`);
    
    if (clientWallets.length === 0) {
      console.log('No improper wallets found for client companies - nothing to fix');
    } else {
      // 3. For each client wallet of type profit/provider, find transactions and migrate them
      let totalMigratedTransactions = 0;
      
      // First ensure SimTree has all necessary wallet types
      const simtreeWallets = await db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.companyId, simtreeCompanyId));
        
      const simtreeWalletTypes = simtreeWallets.map(w => w.walletType);
      
      // Create any missing SimTree wallets
      const missingWalletTypes = ['general', 'profit', 'provider'].filter(
        type => !simtreeWalletTypes.includes(type as schema.WalletType)
      );
      
      for (const walletType of missingWalletTypes) {
        console.log(`Creating missing ${walletType} wallet for SimTree`);
        await db
          .insert(schema.wallets)
          .values({
            companyId: simtreeCompanyId,
            balance: '0.00',
            lastUpdated: new Date(),
            walletType: walletType as schema.WalletType,
          });
      }
      
      // Get updated SimTree wallets
      const updatedSimtreeWallets = await db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.companyId, simtreeCompanyId));
        
      const simtreeGeneralWallet = updatedSimtreeWallets.find(w => w.walletType === 'general');
      const simtreeProfitWallet = updatedSimtreeWallets.find(w => w.walletType === 'profit');
      const simtreeProviderWallet = updatedSimtreeWallets.find(w => w.walletType === 'provider');
      
      if (!simtreeGeneralWallet || !simtreeProfitWallet || !simtreeProviderWallet) {
        throw new Error('Failed to create or find necessary SimTree wallets');
      }
      
      // Process each client company's improper wallets
      for (const clientWallet of clientWallets) {
        console.log(`Processing ${clientWallet.walletType} wallet ID ${clientWallet.id} for company ${clientWallet.companyId}`);
        
        // Find general wallet for this client company
        const clientGeneralWallets = await db
          .select()
          .from(schema.wallets)
          .where(and(
            eq(schema.wallets.companyId, clientWallet.companyId),
            eq(schema.wallets.walletType, 'general')
          ));
          
        let clientGeneralWallet = clientGeneralWallets[0]; 
          
        if (!clientGeneralWallet) {
          console.warn(`No general wallet found for company ${clientWallet.companyId}, creating one`);
          const [newGeneralWallet] = await db
            .insert(schema.wallets)
            .values({
              companyId: clientWallet.companyId,
              balance: '0.00',
              lastUpdated: new Date(),
              walletType: 'general',
            })
            .returning();
            
          clientGeneralWallet = newGeneralWallet;
        }
        
        // Find transactions for this wallet
        const transactions = await db
          .select()
          .from(schema.walletTransactions)
          .where(eq(schema.walletTransactions.walletId, clientWallet.id));
          
        console.log(`Found ${transactions.length} transactions to migrate from wallet ${clientWallet.id}`);
        
        // For each transaction, create a new one in the SimTree wallet
        for (const transaction of transactions) {
          // Skip already migrated transactions
          if (transaction.status === 'migrated') {
            console.log(`Transaction ${transaction.id} already migrated, skipping`);
            continue;
          }
          
          // Determine which SimTree wallet should receive this transaction
          let targetSimtreeWallet = null;
          if (clientWallet.walletType === 'profit') {
            targetSimtreeWallet = simtreeProfitWallet;
          } else if (clientWallet.walletType === 'provider') {
            targetSimtreeWallet = simtreeProviderWallet;
          }
          
          if (!targetSimtreeWallet) {
            console.error(`No matching SimTree wallet found for type ${clientWallet.walletType}`);
            continue;
          }
          
          // Insert new transaction in SimTree wallet
          const [newTransaction] = await db
            .insert(schema.walletTransactions)
            .values({
              walletId: targetSimtreeWallet.id,
              amount: transaction.amount,
              type: transaction.type,
              description: `[Migrated] ${transaction.description}`,
              stripePaymentId: transaction.stripePaymentId,
              stripeSessionId: transaction.stripeSessionId,
              stripePaymentIntentId: transaction.stripePaymentIntentId,
              status: transaction.status,
              paymentMethod: transaction.paymentMethod,
              createdAt: transaction.createdAt,
              relatedTransactionId: transaction.relatedTransactionId,
              esimPlanId: transaction.esimPlanId,
              esimOrderId: transaction.esimOrderId
            })
            .returning();
            
          // Mark original transaction as migrated
          await db
            .update(schema.walletTransactions)
            .set({
              status: 'migrated',
              description: `[Migrated to SimTree] ${transaction.description}`
            })
            .where(eq(schema.walletTransactions.id, transaction.id));
            
          totalMigratedTransactions++;
        }
        
        // Update SimTree wallet balances based on transactions  
        if (clientWallet.walletType === 'profit') {
          await recalculateWalletBalance(simtreeProfitWallet.id);
        } else if (clientWallet.walletType === 'provider') {
          await recalculateWalletBalance(simtreeProviderWallet.id);
        }
        
        console.log(`Migrated all transactions from wallet ${clientWallet.id}, updating wallet status`);
        
        // Mark the client wallet as deprecated
        await db
          .update(schema.wallets)
          .set({
            balance: '0.00',
            lastUpdated: new Date()
          })
          .where(eq(schema.wallets.id, clientWallet.id));
      }
      
      console.log(`Migration complete: ${totalMigratedTransactions} transactions migrated`);
    }
    
    console.log('Wallet structure fix completed successfully!');
  } catch (error) {
    console.error('Error fixing wallet structure:', error);
  }
}

async function recalculateWalletBalance(walletId: number) {
  // Get all completed transactions for this wallet
  const transactions = await db
    .select()
    .from(schema.walletTransactions)
    .where(and(
      eq(schema.walletTransactions.walletId, walletId),
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
  
  // Update wallet balance
  await db
    .update(schema.wallets)
    .set({
      balance: balance.toFixed(2),
      lastUpdated: new Date()
    })
    .where(eq(schema.wallets.id, walletId));
    
  console.log(`Recalculated balance for wallet ${walletId}: ${balance.toFixed(2)}`);
}

// Run the script
fixWalletStructure()
  .then(() => {
    console.log('Wallet structure fix script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error running wallet structure fix script:', error);
    process.exit(1);
  });