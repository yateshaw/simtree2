import { Router } from 'express';
import { zodResolver } from '@hookform/resolvers/zod';
import { IStorage } from '../storage';
import * as schema from '@shared/schema';
import { sendCouponEmail } from '../services/email';

export function setupCouponRoutes(app: Router, storage: IStorage) {
  // Create a new coupon (admin only)
  app.post('/api/coupons', async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // Only admin users can create coupons
    const user = req.user;
    if (!user.isAdmin) {
      return res.status(403).json({ error: 'Only administrators can create coupons' });
    }
    
    try {
      let couponData = req.body;
      console.log("Received coupon data:", couponData);
      
      // Parse the expiresAt date string to a Date object if it exists
      if (couponData.expiresAt && typeof couponData.expiresAt === 'string') {
        try {
          couponData.expiresAt = new Date(couponData.expiresAt);
          console.log("Parsed expiresAt:", couponData.expiresAt);
        } catch (e) {
          console.error("Error parsing expiresAt date:", e);
          return res.status(400).json({ error: 'Invalid expiration date' });
        }
      }
      
      // Validate the coupon data
      const parsedData = schema.insertCouponSchema.safeParse(couponData);
      if (!parsedData.success) {
        console.error("Validation error:", parsedData.error);
        return res.status(400).json(parsedData.error);
      }
      
      // Add the current user as creator
      const couponToCreate = {
        ...parsedData.data,
        createdBy: user.id
      };
      
      // Create the coupon
      const coupon = await storage.createCoupon(couponToCreate);
      
      // If an email is provided, send the coupon by email
      if (coupon.recipientEmail) {
        console.log(`Attempting to send coupon email to ${coupon.recipientEmail}`);
        console.log(`Email configuration - SENDGRID_API_KEY exists: ${!!process.env.SENDGRID_API_KEY}`);
        console.log(`Email configuration - SENDGRID_FROM_EMAIL: ${process.env.SENDGRID_FROM_EMAIL || 'not set'}`);
        
        try {
          const emailSent = await sendCouponEmail(
            coupon.recipientEmail,
            `Simtree - You've received a $${parseFloat(coupon.amount.toString()).toFixed(2)} credit coupon!`,
            coupon.code,
            parseFloat(coupon.amount.toString()),
            coupon.expiresAt,
            coupon.description
          );
          
          if (emailSent) {
            console.log(`Coupon email sent successfully to ${coupon.recipientEmail}`);
          } else {
            console.error(`Failed to send coupon email to ${coupon.recipientEmail} - returned false`);
          }
        } catch (error) {
          console.error(`Error sending coupon email to ${coupon.recipientEmail}:`, error);
        }
      } else {
        console.log(`No recipient email provided for coupon ${coupon.code}, skipping email`);
      }
      
      res.status(201).json({ success: true, coupon });
    } catch (error) {
      console.error('Error creating coupon:', error);
      next(error);
    }
  });
  
  // Get all coupons (admin only)
  app.get('/api/coupons', async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // Only admin users can view all coupons
    const user = req.user;
    if (!user.isAdmin) {
      return res.status(403).json({ error: 'Only administrators can view all coupons' });
    }
    
    try {
      // Super admin sees all coupons, regular admin sees only their company's coupons
      let coupons;
      if (user.isSuperAdmin) {
        coupons = await storage.getAllCoupons();
      } else {
        coupons = await storage.getCompanyCoupons(user.companyId);
      }
      
      res.json(coupons);
    } catch (error) {
      console.error('Error fetching coupons:', error);
      next(error);
    }
  });
  
  // Redeem a coupon
  app.post('/api/coupons/redeem', async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { code } = req.body;
      
      // Validate the coupon code
      const parsedData = schema.redeemCouponSchema.safeParse({ code });
      if (!parsedData.success) {
        return res.status(400).json({ error: parsedData.error.message });
      }
      
      // Redeem the coupon
      const result = await storage.redeemCoupon(code, req.user.id);
      
      if (result.success) {
        // Send receipt email for coupon redemption
        try {
          const user = await storage.getUser(req.user.id);
          if (user && result.coupon) {
            const { BillingService } = await import('../services/billing.service');
            const billingService = new BillingService();
            
            // Find the transaction created during coupon redemption
            const recentTransactions = await storage.getWalletTransactions(result.wallet.id);
            const latestTransaction = recentTransactions.find(t => 
              t.description.includes(result.coupon.code) && t.type === 'credit'
            );
            
            if (latestTransaction) {
              await billingService.createCreditReceipt(
                user.companyId,
                latestTransaction.id,
                parseFloat(result.coupon.amount.toString()),
                'Coupon',
                undefined // No Stripe payment ID for coupons
              );
              console.log(`[Coupon] Receipt email sent for coupon redemption: ${code}`);
            }
          }
        } catch (emailError) {
          console.error(`[Coupon] Failed to send receipt email:`, emailError);
          // Don't fail the coupon redemption if email fails
        }

        res.json({
          success: true,
          wallet: result.wallet,
          message: `Successfully redeemed coupon for $${parseFloat(result.coupon.amount.toString()).toFixed(2)}`
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error redeeming coupon:', error);
      next(error);
    }
  });
  
  // Get coupon details by code (to verify before redemption)
  app.get('/api/coupons/verify/:code', async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { code } = req.params;
      
      // Get the coupon information
      const coupon = await storage.getCouponByCode(code);
      
      if (!coupon) {
        return res.status(404).json({ success: false, error: 'Coupon not found' });
      }
      
      // Check if the coupon is already used
      if (coupon.isUsed) {
        return res.status(400).json({ success: false, error: 'Coupon has already been used' });
      }
      
      // Check if the coupon has expired
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return res.status(400).json({ success: false, error: 'Coupon has expired' });
      }
      
      // Return limited coupon information (don't expose everything)
      res.json({
        success: true,
        coupon: {
          code: coupon.code,
          amount: coupon.amount,
          expiresAt: coupon.expiresAt
        }
      });
    } catch (error) {
      console.error('Error verifying coupon:', error);
      next(error);
    }
  });
  
  // Resend a coupon email
  app.post('/api/coupons/:id/resend', async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // Only admin users can resend coupons
    const user = req.user;
    if (!user.isAdmin) {
      return res.status(403).json({ error: 'Only administrators can resend coupons' });
    }
    
    try {
      const { id } = req.params;
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }
      
      // Get the coupon
      const coupon = await storage.getCoupon(parseInt(id));
      
      if (!coupon) {
        return res.status(404).json({ error: 'Coupon not found' });
      }
      
      // Check if the coupon is already used
      if (coupon.isUsed) {
        return res.status(400).json({ error: 'Cannot resend used coupons' });
      }
      
      // Send the coupon email
      const emailSent = await sendCouponEmail(
        email,
        `Simtree - You've received a $${parseFloat(coupon.amount.toString()).toFixed(2)} credit coupon!`,
        coupon.code,
        parseFloat(coupon.amount.toString()),
        coupon.expiresAt,
        coupon.description
      );
      
      if (emailSent) {
        // Update coupon with new recipient email if different
        if (email !== coupon.recipientEmail) {
          await storage.updateCoupon(coupon.id, { recipientEmail: email });
        }
        
        res.json({ success: true, message: `Coupon email sent to ${email}` });
      } else {
        res.status(500).json({ error: 'Failed to send coupon email' });
      }
    } catch (error) {
      console.error('Error resending coupon:', error);
      next(error);
    }
  });

  // Delete a coupon (admin only)
  app.delete('/api/coupons/:id', async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // Only admin users can delete coupons
    const user = req.user;
    if (!user.isAdmin) {
      return res.status(403).json({ error: 'Only administrators can delete coupons' });
    }
    
    try {
      const { id } = req.params;
      
      // Get the coupon first to check if it exists and isn't used
      const coupon = await storage.getCoupon(parseInt(id));
      
      if (!coupon) {
        return res.status(404).json({ error: 'Coupon not found' });
      }
      
      // Check if the coupon is already used
      if (coupon.isUsed) {
        return res.status(400).json({ error: 'Cannot delete a coupon that has already been used' });
      }
      
      // Delete the coupon
      await storage.deleteCoupon(parseInt(id));
      
      res.json({ success: true, message: 'Coupon deleted successfully' });
    } catch (error) {
      console.error('Error deleting coupon:', error);
      
      if (error.message === 'Cannot delete a coupon that has already been used') {
        return res.status(400).json({ error: error.message });
      }
      
      next(error);
    }
  });
}