import { DatabaseStorage } from "../storage";

/**
 * Synchronizes wallet balances with transaction records.
 * This ensures all wallet balances accurately reflect their transaction histories.
 */
export async function syncWalletBalances(storage: DatabaseStorage): Promise<number> {
  try {
    console.log("[WalletSync] Starting wallet balance synchronization");
    
    // Get all wallets
    const wallets = await storage.getAllWallets();
    console.log(`[WalletSync] Found ${wallets.length} wallets to check`);
    
    // Get all transactions
    const allTransactions = await storage.getAllWalletTransactions();
    
    let updatedCount = 0;
    
    // Process each wallet
    for (const wallet of wallets) {
      try {
        // Get transactions for this wallet
        const walletTransactions = allTransactions.filter(tx => tx.walletId === wallet.id);
        
        if (walletTransactions.length === 0) {
          console.log(`[WalletSync] Wallet ${wallet.id} has no transactions, skipping`);
          continue;
        }
        
        // Calculate the correct balance from transactions
        const calculatedBalance = walletTransactions.reduce((sum, tx) => {
          const amount = parseFloat(tx.amount);
          return tx.type === 'credit' ? sum + amount : sum - Math.abs(amount);
        }, 0);
        
        // Get current balance
        const currentBalance = parseFloat(wallet.balance);
        
        // Check if the balance needs correction (using small epsilon to avoid floating point issues)
        if (Math.abs(currentBalance - calculatedBalance) > 0.001) {
          console.log(`[WalletSync] Wallet ${wallet.id} balance needs correction: ${currentBalance} → ${calculatedBalance}`);
          
          // Update the wallet balance
          await storage.updateWalletBalance(wallet.id, calculatedBalance);
          updatedCount++;
        } else {
          console.log(`[WalletSync] Wallet ${wallet.id} balance is correct (${currentBalance})`);
        }
      } catch (error) {
        console.error(`[WalletSync] Error processing wallet ${wallet.id}:`, error);
      }
    }
    
    console.log(`[WalletSync] Wallet synchronization complete. Updated ${updatedCount} wallets.`);
    return updatedCount;
  } catch (error) {
    console.error("[WalletSync] Error during wallet balance synchronization:", error);
    throw error;
  }
}