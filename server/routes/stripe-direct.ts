import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// Create a payment intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }
    
    // Create a PaymentIntent with the amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      // Store userId/companyId in metadata for reference
      metadata: {
        userId: req.user?.id?.toString() || '',
        companyId: req.user?.companyId?.toString() || '',
      },
    });
    
    // Send the client secret and paymentIntentId to the client
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error: any) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create payment intent'
    });
  }
});

// Confirm a payment with card details
router.post('/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId, card } = req.body;
    
    if (!paymentIntentId || !card) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing payment intent ID or card details' 
      });
    }
    
    // Retrieve the payment intent to get the amount
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const amount = (paymentIntent.amount / 100).toFixed(2); // Convert from cents to dollars
    
    // Confirm the PaymentIntent with the card details
    const confirmedPayment = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method_data: {
        type: 'card',
        card: {
          number: card.number,
          exp_month: card.exp_month,
          exp_year: card.exp_year,
          cvc: card.cvc,
        },
      },
    });
    
    // Check if the payment was successful
    if (confirmedPayment.status === 'succeeded') {
      // Check if user is logged in and has a company
      if (req.user && req.user.companyId) {
        try {
          // Credit the wallet
          const companyId = req.user.companyId;
          const wallets = await storage.getWalletsByCompanyId(companyId);
          
          if (wallets && wallets.length > 0) {
            const walletId = wallets[0].id;
            
            // Create a transaction record
            await storage.createWalletTransaction({
              walletId,
              amount,
              type: 'credit',
              description: 'Credit card payment',
              stripePaymentIntentId: paymentIntentId,
              paymentMethod: 'stripe'
            });
            
            // Update wallet balance
            await storage.addToWalletBalance(walletId, parseFloat(amount));
            
            console.log(`Credited wallet ${walletId} with $${amount}`);
            
            // Generate receipt for credit addition
            try {
              const { BillingService } = await import('../services/billing.service');
              const billingService = new BillingService();
              
              // Get the transaction that was just created to get its ID
              const recentTransactions = await storage.getWalletTransactions(walletId, 1);
              if (recentTransactions && recentTransactions.length > 0) {
                const transaction = recentTransactions[0];
                await billingService.createCreditReceipt(
                  companyId,
                  transaction.id,
                  parseFloat(amount),
                  'stripe',
                  paymentIntentId
                );
                console.log(`[Payment] Receipt email sent for Stripe payment ${paymentIntentId}`);
              } else {
                console.error(`[Payment] Could not find transaction for receipt generation`);
              }
            } catch (receiptError) {
              console.error(`[Payment] Error generating receipt for payment ${paymentIntentId}:`, receiptError);
              // Continue execution even if receipt generation fails
            }
          } else {
            console.error(`No wallet found for company ID ${companyId}`);
          }
        } catch (err) {
          console.error('Error updating wallet:', err);
          // Continue since the payment was successful, even if wallet update failed
        }
      }
      
      res.json({
        success: true,
        status: confirmedPayment.status,
        amount,
        id: confirmedPayment.id
      });
    } else {
      res.json({
        success: false,
        status: confirmedPayment.status,
        error: 'Payment not completed',
      });
    }
  } catch (error: any) {
    console.error('Error confirming payment:', error);
    
    // Handle specific Stripe errors
    let errorMessage = 'Payment failed';
    if (error.type === 'StripeCardError') {
      errorMessage = error.message || 'Your card was declined';
    }
    
    res.status(400).json({ 
      success: false, 
      error: errorMessage,
      stripeError: error.message
    });
  }
});

// Test endpoint for direct payment processing (bypasses client-side Stripe.js)
router.post('/test-direct', async (req, res) => {
  try {
    const { amount, card } = req.body;
    
    if (!amount || !card) {
      return res.status(400).json({ success: false, error: 'Missing amount or card details' });
    }
    
    // Create a PaymentMethod using the card details
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: card.number,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        cvc: card.cvc,
      },
    });
    
    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      payment_method: paymentMethod.id,
      confirm: true, // Confirm the payment immediately
      metadata: {
        userId: req.user?.id?.toString() || 'test-user',
        companyId: req.user?.companyId?.toString() || 'test-company',
      },
    });
    
    // If payment was successful, credit the wallet if user is logged in
    if (paymentIntent.status === 'succeeded' && req.user && req.user.companyId) {
      try {
        const companyId = req.user.companyId;
        const wallets = await storage.getWalletsByCompanyId(companyId);
        
        if (wallets && wallets.length > 0) {
          const walletId = wallets[0].id;
          
          // Create a transaction record
          await storage.createWalletTransaction({
            walletId,
            amount: amount.toString(),
            type: 'credit',
            description: 'Credit card payment (direct)',
            stripePaymentIntentId: paymentIntent.id,
            paymentMethod: 'stripe'
          });
          
          // Update wallet balance
          await storage.addToWalletBalance(walletId, amount);
          
          console.log(`Credited wallet ${walletId} with $${amount}`);
        }
      } catch (err) {
        console.error('Error updating wallet:', err);
      }
    }
    
    res.json({
      success: paymentIntent.status === 'succeeded',
      status: paymentIntent.status,
      paymentIntentId: paymentIntent.id,
      amount: amount,
    });
  } catch (error: any) {
    console.error('Error in direct payment test:', error);
    
    let errorMessage = 'Payment failed';
    if (error.type === 'StripeCardError') {
      errorMessage = error.message || 'Your card was declined';
    }
    
    res.status(400).json({ 
      success: false, 
      error: errorMessage,
      stripeError: error.message
    });
  }
});

export default router;