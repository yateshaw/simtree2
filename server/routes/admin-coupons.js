// Direct JS implementation to avoid any TypeScript compilation issues
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const schema = require('@shared/schema');
const { eq, and } = require('drizzle-orm');

// Apply coupon to add funds to a company wallet - ADMIN ONLY
router.post('/apply-coupon', async (req, res) => {
  try {
    // Security: Check authentication and admin privileges first
    if (!req.isAuthenticated()) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }
    
    if (!req.user?.isSuperAdmin && req.user?.role !== 'superadmin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Super admin access required' 
      });
    }
    
    const { companyId, couponCode } = req.body;
    
    // Enhanced input validation
    if (!companyId || !couponCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Company ID and coupon code are required' 
      });
    }
    
    // Security: Validate companyId is a positive integer
    const companyIdNum = parseInt(companyId);
    if (isNaN(companyIdNum) || companyIdNum <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid company ID format' 
      });
    }
    
    // Security: Validate coupon code format and length
    if (typeof couponCode !== 'string' || couponCode.length < 1 || couponCode.length > 50) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid coupon code format' 
      });
    }
    
    // For this simple implementation, use a fixed amount
    const amount = 20;
    console.log(`Adding funds: $${amount} to company ${companyId} with coupon ${couponCode}`);
    
    // Find the company's general wallet using validated companyId
    const wallets = await db.select().from(schema.wallets)
      .where(and(
        eq(schema.wallets.companyId, companyIdNum),
        eq(schema.wallets.walletType, 'general')
      ));
    
    if (!wallets.length) {
      return res.status(404).json({ 
        success: false, 
        error: 'Company wallet not found' 
      });
    }
    
    const wallet = wallets[0];
    console.log('Found wallet:', wallet);
    
    // Add a transaction for the coupon redemption
    const transaction = await db.insert(schema.walletTransactions).values({
      walletId: wallet.id,
      amount: amount.toString(),
      type: 'credit',
      description: `Simtree credit (coupon: ${couponCode})`,
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
  } catch (error) {
    console.error('Error applying coupon:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to apply coupon', 
      details: error.message 
    });
  }
});

module.exports = router;