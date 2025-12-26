// Import required modules
import { db } from './server/db.js';
import * as schema from './shared/schema.js';
import { eq, ne } from 'drizzle-orm';

/**
 * This script consolidates wallet balances for all companies except SimTree
 * into a single "general" wallet, and removes extra wallet types.
 */
async function consolidateWallets() {
  try {
    console.log('Starting wallet consolidation...');

    // 1. Find SimTree company ID
    const simtreeCompany = await db.query.companies.findFirst({
      where: eq(schema.companies.name, 'SimTree'),
    });

    if (!simtreeCompany) {
      console.error('SimTree company not found!');
      return;
    }

    const simtreeCompanyId = simtreeCompany.id;
    console.log(`Found SimTree with ID: ${simtreeCompanyId}`);

    // 2. Get all companies except SimTree
    const regularCompanies = await db.select()
      .from(schema.companies)
      .where(ne(schema.companies.id, simtreeCompanyId));

    console.log(`Found ${regularCompanies.length} regular companies to process`);

    // 3. Process each regular company
    for (const company of regularCompanies) {
      console.log(`\nProcessing company: ${company.name} (ID: ${company.id})`);

      // Get all wallets for this company
      const companyWallets = await db.select()
        .from(schema.wallets)
        .where(eq(schema.wallets.companyId, company.id));

      if (companyWallets.length === 0) {
        console.log(`No wallets found for company ${company.name}. Creating general wallet.`);
        await db.insert(schema.wallets)
          .values({
            companyId: company.id,
            balance: "0",
            lastUpdated: new Date(),
            walletType: "general",
          });
        continue;
      }

      console.log(`Found ${companyWallets.length} wallets for company ${company.name}`);

      // Find the general wallet
      let generalWallet = companyWallets.find(w => w.walletType === 'general');

      // If no general wallet exists, create one
      if (!generalWallet) {
        console.log(`No general wallet found for ${company.name}. Creating one.`);
        const [newWallet] = await db.insert(schema.wallets)
          .values({
            companyId: company.id,
            balance: "0",
            lastUpdated: new Date(),
            walletType: "general",
          })
          .returning();
        generalWallet = newWallet;
      }

      // Calculate the total balance across all wallet types
      let totalBalance = 0;
      for (const wallet of companyWallets) {
        const walletBalance = parseFloat(wallet.balance) || 0;
        console.log(`Wallet ${wallet.id} (${wallet.walletType}) has balance: $${walletBalance.toFixed(2)}`);
        totalBalance += walletBalance;
      }

      console.log(`Total balance across all wallets: $${totalBalance.toFixed(2)}`);

      // Update the general wallet with the total balance
      await db.update(schema.wallets)
        .set({
          balance: totalBalance.toString(),
          lastUpdated: new Date(),
        })
        .where(eq(schema.wallets.id, generalWallet.id));

      console.log(`Updated general wallet (ID: ${generalWallet.id}) with consolidated balance: $${totalBalance.toFixed(2)}`);

      // Delete all non-general wallets
      const nonGeneralWallets = companyWallets.filter(w => w.walletType !== 'general');

      if (nonGeneralWallets.length > 0) {
        for (const wallet of nonGeneralWallets) {
          // Move all transactions to the general wallet
          await db.update(schema.walletTransactions)
            .set({ walletId: generalWallet.id })
            .where(eq(schema.walletTransactions.walletId, wallet.id));

          console.log(`Moved transactions from ${wallet.walletType} wallet (ID: ${wallet.id}) to general wallet`);

          // Delete the wallet
          await db.delete(schema.wallets)
            .where(eq(schema.wallets.id, wallet.id));

          console.log(`Deleted ${wallet.walletType} wallet (ID: ${wallet.id}) for company ${company.name}`);
        }
      }
    }

    console.log('\nWallet consolidation complete!');
    console.log('Only SimTree now has multiple wallet types. All other companies have a single general wallet with their combined balance.');

  } catch (error) {
    console.error('Error consolidating wallets:', error);
  }
}

// Execute the function
consolidateWallets()
  .then(() => {
    console.log('Script completed successfully.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed with error:', error);
    process.exit(1);
  });