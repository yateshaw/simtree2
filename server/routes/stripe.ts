import { Router } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { storage } from '../storage.js';
import { broadcastEvent } from '../sse.js';

// Authentication middleware
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

const router = Router();

// Initialize Stripe with proper error handling
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
let stripe: Stripe | null = null;

try {
  if (STRIPE_SECRET_KEY && STRIPE_SECRET_KEY.startsWith('sk_')) {
    stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
    });
    console.log('✅ Stripe initialized with API key');
  } else {
    console.log('⚠️  Stripe not configured - using demo mode');
  }
} catch (error) {
  console.error('❌ Failed to initialize Stripe:', error);
}

// Validation schemas
const createPaymentIntentSchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  currency: z.string().default('usd'),
  metadata: z.record(z.string()).optional(),
});

const confirmPaymentSchema = z.object({
  paymentIntentId: z.string().min(1, 'Payment intent ID is required'),
  amount: z.number().positive('Amount must be greater than 0'),
});

// Validation middleware
const validateRequest = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: result.error.errors
        });
      }
      req.body = result.data;
      next();
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data'
      });
    }
  };
};

// Create Payment Intent - Step 1 of PCI-compliant flow
router.post('/create-payment-intent', requireAuth, validateRequest(createPaymentIntentSchema), async (req: any, res: any) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured. Please contact support.'
      });
    }

    const { amount, currency, metadata } = req.body;
    const user = req.user;

    console.log(`Creating payment intent for user ${user.id}, amount: $${amount / 100}`);

    // Create Payment Intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Amount should already be in cents from frontend
      currency: currency,
      metadata: {
        userId: user.id.toString(),
        companyId: user.companyId.toString(),
        ...metadata
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log(`Payment intent created: ${paymentIntent.id}`);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment intent'
    });
  }
});

// Confirm Payment - Step 3 of PCI-compliant flow (after Stripe Elements confirmation)
router.post('/confirm-payment', requireAuth, async (req: any, res: any) => {
  // SECURITY: Log only non-sensitive payment confirmation info (no request body)
  console.log('[Payment] Processing payment confirmation for user:', req.user?.id);
  
  try {
    
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured. Please contact support.'
      });
    }

    const { paymentIntentId, amount } = req.body;
    
    if (!paymentIntentId || !amount) {
      console.log('Missing data - paymentIntentId:', !!paymentIntentId, 'amount:', !!amount);
      return res.status(400).json({
        success: false,
        error: 'Missing payment intent ID or card details'
      });
    }
    
    const user = req.user;

    console.log(`Confirming payment for user ${user.id}, payment intent: ${paymentIntentId}`);

    // Retrieve the payment intent from Stripe to verify it was successful
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        error: 'Payment was not successful. Please try again.'
      });
    }

    // Verify the payment belongs to the current user
    if (paymentIntent.metadata.userId !== user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized payment confirmation'
      });
    }

    // Get the user's company wallets
    const wallets = await storage.getWalletsByCompanyId(user.companyId);
    console.log('Available wallets:', wallets.map(w => ({ id: w.id, walletType: w.walletType, balance: w.balance })));
    const wallet = wallets.find(w => w.walletType === 'general');
    console.log('Found general wallet:', wallet ? { id: wallet.id, walletType: wallet.walletType, balance: wallet.balance } : 'NONE');
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Company wallet not found'
      });
    }

    // Create wallet transaction
    const transaction = await storage.createWalletTransaction({
      walletId: wallet.id,
      amount: amount.toString(),
      type: 'credit' as const,
      description: `Stripe payment - $${amount.toFixed(2)} wallet credit`,
      status: 'completed' as const,
      paymentMethod: 'stripe',
      stripePaymentIntentId: paymentIntentId
    });

    // Update wallet balance
    const newBalance = parseFloat(wallet.balance) + amount;
    await storage.updateWalletBalance(wallet.id, newBalance);

    console.log(`Payment confirmed and wallet updated. Transaction ID: ${transaction.id}`);

    // Create and send receipt email
    try {
      const { BillingService } = await import('../services/billing.service');
      const billingService = new BillingService();
      await billingService.createCreditReceipt(
        user.companyId,
        transaction.id,
        amount,
        'stripe',
        paymentIntentId
      );
      console.log(`[Payment] Receipt email sent for Stripe payment ${paymentIntentId}`);
    } catch (emailError) {
      console.error(`[Payment] Failed to send receipt email:`, emailError);
      // Don't fail the payment if email fails
    }

    // Broadcast the wallet update via SSE
    broadcastEvent('wallet-updated', {
      companyId: user.companyId,
      walletId: wallet.id,
      newBalance: newBalance,
      transaction: {
        id: transaction.id,
        amount: amount,
        type: 'credit',
        description: transaction.description
      }
    });

    res.json({
      success: true,
      message: 'Payment confirmed and wallet updated',
      transactionId: transaction.id,
      newBalance: newBalance
    });

  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm payment'
    });
  }
});

// Webhook endpoint for Stripe events (SECURITY: Signature verification required in production)
router.post('/webhook', async (req: any, res: any) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not configured' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // SECURITY: Require webhook signature verification in production
    if (!webhookSecret) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[Stripe Webhook] CRITICAL: STRIPE_WEBHOOK_SECRET must be set in production');
        return res.status(500).json({ error: 'Webhook configuration error' });
      }
      console.warn('[Stripe Webhook] WARNING: Signature verification disabled in development - do NOT use in production');
      // In development only, still require a signature header to prevent accidental abuse
      if (!sig) {
        return res.status(401).json({ error: 'Missing stripe-signature header' });
      }
    }

    let event;
    
    // Verify signature if secret is configured
    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    } else {
      // Development fallback - parse body directly (NOT SECURE)
      try {
        event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!event.type) {
          return res.status(400).json({ error: 'Invalid webhook payload' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }
    }

    console.log(`Received Stripe webhook: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`Payment succeeded: ${paymentIntent.id}`);
        // Additional processing if needed
        break;
      
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object as Stripe.PaymentIntent;
        console.log(`Payment failed: ${failedPayment.id}`);
        // Handle failed payment if needed
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get Stripe configuration status
router.get('/status', (req: any, res: any) => {
  const isConfigured = !!stripe;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  
  res.json({
    success: true,
    isConfigured,
    hasPublishableKey: !!publishableKey,
    keyType: publishableKey?.includes('test') ? 'test' : publishableKey?.includes('live') ? 'live' : 'unknown',
    demoMode: !isConfigured
  });
});

export default router;