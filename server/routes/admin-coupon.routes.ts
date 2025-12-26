import { Router } from 'express';
import { requireAdmin } from '../auth';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export function setupAdminCouponRoutes(app: Router) {
  // Apply coupon to add funds to a company wallet
  app.post('/api/admin/apply-coupon', requireAdmin, async (req, res) => {
    try {
      // Log the request for debugging
      console.log('Admin coupon endpoint called with body:', req.body);
      
      const { companyId, couponCode } = req.body;
      
      if (!companyId || !couponCode) {
        console.log('Missing required fields:', { companyId, couponCode });
        return res.status(400).json({ 
          success: false, 
          error: 'Company ID and coupon code are required' 
        });
      }
      
      // For this simple implementation, use a fixed amount
      const amount = 20;
      console.log(`Adding funds: $${amount} to company ${companyId} with coupon ${couponCode}`);
      
      // Find the company's general wallet
      const wallets = await db.select().from(schema.wallets)
        .where(and(
          eq(schema.wallets.companyId, companyId),
          eq(schema.wallets.walletType, 'general')
        ));
      
      if (!wallets.length) {
        console.log(`No wallet found for company ${companyId}`);
        return res.status(404).json({ 
          success: false, 
          error: 'Company wallet not found' 
        });
      }
      
      const wallet = wallets[0];
      console.log('Found wallet:', wallet);
      
      // Get company name for better transaction descriptions
      const companies = await db.select().from(schema.companies)
        .where(eq(schema.companies.id, companyId))
        .limit(1);
      const companyName = companies.length > 0 ? companies[0].name : `Company ${companyId}`;
      
      // Add a transaction for the coupon redemption to the COMPANY wallet (not SimTree's)
      const transaction = await db.insert(schema.walletTransactions).values({
        walletId: wallet.id,
        amount: amount.toString(),
        type: 'credit',
        description: `${companyName}: Credit from coupon ${couponCode}`,
        status: 'completed',
        paymentMethod: 'coupon',
        createdAt: new Date(),
      }).returning();
      
      console.log('Created transaction:', transaction[0]);
      
      // Update the wallet balance
      const newBalance = Number(wallet.balance) + amount;
      await db.update(schema.wallets)
        .set({ 
          balance: newBalance.toString(),
          lastUpdated: new Date()
        })
        .where(eq(schema.wallets.id, wallet.id));
      
      console.log(`Updated wallet balance to ${newBalance}`);
      
      // Return success response
      return res.status(200).json({
        success: true,
        message: 'Coupon applied successfully',
        amount,
        transaction: transaction[0]
      });
    } catch (error: any) {
      console.error('Error applying coupon:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to apply coupon', 
        details: error.message 
      });
    }
  });
}