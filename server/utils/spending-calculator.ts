import { db } from '../db';
import { walletTransactions, companies } from '@shared/schema';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { broadcastEvent, EventTypes } from '../sse';

/**
 * Calculate current month spending from completed purchase transactions
 */
export async function calculateCurrentMonthSpending(): Promise<number> {
  try {
    console.log('[Spending] Starting calculation...');
    
    // Get current month boundaries
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    console.log(`[Spending] Month range: ${currentMonthStart.toISOString()} to ${currentMonthEnd.toISOString()}`);

    // Get all debit transactions from current month with wallet and company info
    const transactions = await db
      .select({
        amount: walletTransactions.amount,
        createdAt: walletTransactions.createdAt,
        description: walletTransactions.description,
        companyName: companies.name,
        walletType: schema.wallets.walletType
      })
      .from(walletTransactions)
      .innerJoin(schema.wallets, eq(walletTransactions.walletId, schema.wallets.id))
      .innerJoin(companies, eq(schema.wallets.companyId, companies.id))
      .where(
        and(
          eq(walletTransactions.status, 'completed'),
          eq(walletTransactions.type, 'debit')
        )
      );

    let totalSpending = 0;
    
    console.log(`[Spending] Found ${transactions.length} total debit transactions`);
    
    for (const tx of transactions) {
      const txDate = new Date(tx.createdAt);
      
      // Only include transactions from current month
      if (txDate >= currentMonthStart && txDate <= currentMonthEnd) {
        // Only count debit transactions from client companies (not SimTree internal transactions)
        if (tx.companyName && tx.companyName.toLowerCase() !== 'simtree') {
          // This is a customer purchase - count it toward spending
          const amount = Math.abs(parseFloat(tx.amount) || 0);
          totalSpending += amount;
          console.log(`[Spending] ✓ Customer purchase: ${tx.companyName} - $${amount.toFixed(2)} (${tx.description})`);
        }
      }
    }

    console.log(`[Spending] Final total: $${totalSpending.toFixed(2)}`);
    return totalSpending;
  } catch (error) {
    console.error('Error calculating spending:', error);
    return 0;
  }
}

/**
 * Broadcast spending update to all connected clients
 */
export async function broadcastSpendingUpdate(): Promise<void> {
  try {
    const currentSpending = await calculateCurrentMonthSpending();
    
    broadcastEvent({
      type: EventTypes.SPENDING_UPDATE,
      data: {
        totalSpending: currentSpending,
        timestamp: new Date().toISOString(),
        period: 'current_month'
      },
      timestamp: new Date().toISOString()
    });

    console.log(`[SSE] Broadcasting spending update: $${currentSpending.toFixed(2)}`);
    
    // Debug log for spending calculation
    console.log(`[Spending Debug] Calculated spending: $${currentSpending.toFixed(2)}`);
  } catch (error) {
    console.error('Error broadcasting spending update:', error);
  }
}