import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { companyCurrencyService } from '../services/company-currency.service';

dotenv.config();

const router = express.Router();

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

/**
 * Create a Stripe Checkout Session
 * This endpoint creates a checkout session and returns the URL to redirect the user to
 */
router.post('/create-checkout', async (req, res) => {
  try {
    const { amount, currency, successUrl, cancelUrl } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Convert amount to cents (Stripe requires amounts in cents)
    const stripeAmount = Math.round(parseFloat(amount) * 100);
    
    // Determine the currency to use - prefer provided currency, then company currency, then USD
    let sessionCurrency = currency;
    if (!sessionCurrency && req.user?.companyId) {
      sessionCurrency = await companyCurrencyService.getCurrencyForCompany(req.user.companyId);
    }
    sessionCurrency = sessionCurrency || 'usd';
    
    // Create a checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: sessionCurrency.toLowerCase(),
            product_data: {
              name: 'Wallet Credit',
              description: 'Add credit to your eSIM platform wallet',
            },
            unit_amount: stripeAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl || `${process.env.APP_URL}/wallet/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.APP_URL}/wallet/payment-cancel`,
      metadata: {
        type: 'wallet_credit',
        userId: req.user?.id?.toString() || '',
        companyId: req.user?.companyId?.toString() || '',
      },
    });

    // Return the session ID and URL
    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      error: error.message || 'Failed to create checkout session',
    });
  }
});

/**
 * Retrieve a Checkout Session
 * This endpoint is used to verify the status of a checkout session
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    res.json({ session });
  } catch (error: any) {
    console.error('Error retrieving session:', error);
    res.status(500).json({
      error: error.message || 'Failed to retrieve session',
    });
  }
});

export default router;