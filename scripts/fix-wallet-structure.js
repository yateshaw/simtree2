/**
 * This script fixes the wallet structure so that:
 * 1. Only SimTree has three wallet types (general, profit, provider)
 * 2. All other companies have only a "general" wallet with consolidated balance
 */

const { db } = require('../server/db');
const schema = require('../shared/schema');
const { eq, ne } = require('drizzle-orm');

async function fixWalletStructure() {
  console.log('Starting wallet structure fix...');
  
  try {
    // Find SimTree company ID
    const simtreeCompanies = await db.select()
      .from(schema.companies)
      .where(eq(schema.companies.name, 'SimTree'));
    
    if (!simtreeCompanies || simtreeCompanies.length === 0) {
      console.error('SimTree company not found!');
      return;
    }
    
    const simtreeCompany = simtreeCompanies[0];
    const simtreeCompanyId = simtreeCompany.id;
    console.log(`Found SimTree with ID: ${simtreeCompanyId}`);
    
    // Get all companies except SimTree
    const regularCompanies = await db.select()
      .from(schema.companies)
      .where(ne(schema.companies.id, simtreeCompanyId));
    
    console.log(`Found ${regularCompanies.length} regular companies to process`);
    
    // Process each regular company
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
          // First, update any wallet transactions to point to the general wallet
          await db.update(schema.walletTransactions)
            .set({ walletId: generalWallet.id })
            .where(eq(schema.walletTransactions.walletId, wallet.id));
          
          // Then delete the wallet
          await db.delete(schema.wallets)
            .where(eq(schema.wallets.id, wallet.id));
          
          console.log(`Deleted ${wallet.walletType} wallet (ID: ${wallet.id}) for company ${company.name}`);
        }
      }
    }
    
    // Next, we need to also fix the storage.getWallet function to always return the general wallet
    // This will happen in the next step
    
    console.log('\nWallet structure fix completed!');
    console.log('Only SimTree now has multiple wallet types. All other companies have a single general wallet.');
    
  } catch (error) {
    console.error('Error fixing wallet structure:', error);
  }
}

// Run the function
fixWalletStructure()
  .then(() => {
    console.log('Script execution completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script execution failed:', error);
    process.exit(1);
  });