import Stripe from 'stripe';
import { Request } from 'express';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FRONTEND_URL, DEVELOPMENT_MODE, isStripeConfigured } from './env';

// Initialize Stripe with the secret key from environment variables (if available)
let stripe: Stripe | null = null;

try {
  if (STRIPE_SECRET_KEY) {
    stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16' as any,
    });
    console.log('Stripe initialized with API key');
  } else {
    console.warn('Stripe is not initialized due to missing API key');
  }
} catch (error) {
  console.error('Failed to initialize Stripe:', error);
}

// Interface for creating a checkout session
interface CreateCheckoutSessionParams {
  amount: number;
  metadata?: Record<string, string>;
  successUrl?: string;
  cancelUrl?: string;
}

// Interface for the checkout session result
interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

/**
 * Create a Stripe checkout session for adding funds to the wallet
 */
export const createCheckoutSession = async (
  amount: number,
  metadata: Record<string, string> = {},
  successUrl?: string,
  cancelUrl?: string
): Promise<CheckoutSessionResult> => {
  try {
    // Check if Stripe is initialized
    if (!stripe) {
      if (DEVELOPMENT_MODE) {
        console.warn('Stripe not initialized, returning mock checkout session for development');
        const mockSessionId = `mock_session_${Date.now()}`;
        return {
          sessionId: mockSessionId,
          url: `${successUrl || `${FRONTEND_URL}/wallet/payment-success?session_id=${mockSessionId}`}`,
        };
      } else {
        throw new Error('Stripe is not initialized');
      }
    }

    // The amount should be in cents for Stripe, so multiply by 100
    const amountInCents = Math.round(amount * 100);
    
    // Create the checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd', // Explicitly use USD as currency
            product_data: {
              name: 'Wallet Credit (USD)',
              description: 'Add credit to your eSIM management wallet in USD',
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl || `${FRONTEND_URL}/wallet/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${FRONTEND_URL}/wallet/payment-cancel`,
      metadata,
    });

    return {
      sessionId: session.id,
      url: session.url || '',
    };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw new Error('Failed to create checkout session');
  }
};

/**
 * Verify a checkout session by ID
 */
export const verifyCheckoutSession = async (sessionId: string): Promise<Stripe.Checkout.Session> => {
  try {
    // Check if Stripe is initialized
    if (!stripe) {
      if (DEVELOPMENT_MODE) {
        console.warn('Stripe not initialized, returning mock session for development');
        // Create a mock session response for development
        return {
          id: sessionId,
          object: 'checkout.session',
          payment_status: 'paid',
          amount_total: 1000, // $10.00
          status: 'complete',
          customer_details: { email: 'test@example.com' },
          metadata: {},
        } as unknown as Stripe.Checkout.Session;
      } else {
        throw new Error('Stripe is not initialized');
      }
    }
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session;
  } catch (error) {
    console.error('Error verifying checkout session:', error);
    throw new Error('Failed to verify checkout session');
  }
};

/**
 * Verify a Stripe payment and return payment information
 */
export const verifyStripePayment = async (sessionId: string): Promise<{
  success: boolean;
  paymentStatus: string;
  paymentIntentId?: string;
  amount?: number;
}> => {
  try {
    // Check if Stripe is initialized
    if (!stripe) {
      if (DEVELOPMENT_MODE) {
        console.warn('Stripe not initialized, returning mock payment for development');
        const mockPaymentIntentId = `pi_mock_${Date.now()}`;
        return {
          success: true,
          paymentStatus: 'succeeded',
          paymentIntentId: mockPaymentIntentId,
          amount: 10, // $10.00
        };
      } else {
        throw new Error('Stripe is not initialized');
      }
    }
    
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    // Check payment status
    const paymentIntent = session.payment_intent as Stripe.PaymentIntent;
    const paymentStatus = paymentIntent?.status || 'unknown';
    const success = paymentStatus === 'succeeded';

    return {
      success,
      paymentStatus,
      paymentIntentId: paymentIntent?.id,
      amount: session.amount_total ? session.amount_total / 100 : undefined, // Convert from cents
    };
  } catch (error) {
    console.error('Error verifying payment:', error);
    return {
      success: false,
      paymentStatus: 'error',
    };
  }
};

/**
 * Create a refund for a payment
 */
export const createStripeRefund = async (
  paymentIntentId: string,
  amount?: number
): Promise<Stripe.Refund> => {
  try {
    // Check if Stripe is initialized
    if (!stripe) {
      if (DEVELOPMENT_MODE) {
        console.warn('Stripe not initialized, returning mock refund for development');
        return {
          id: `re_mock_${Date.now()}`,
          object: 'refund',
          amount: amount ? Math.round(amount * 100) : 1000,
          status: 'succeeded',
          payment_intent: paymentIntentId,
        } as unknown as Stripe.Refund;
      } else {
        throw new Error('Stripe is not initialized');
      }
    }

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
    };

    // If amount is specified, add it to the refund parameters
    if (amount) {
      refundParams.amount = Math.round(amount * 100); // Convert to cents
    }

    const refund = await stripe.refunds.create(refundParams);
    return refund;
  } catch (error) {
    console.error('Error creating refund:', error);
    throw new Error('Failed to create refund');
  }
};

/**
 * Verify and construct Stripe webhook event
 */
export const constructEventFromPayload = async (
  payload: Buffer,
  signature: string
): Promise<Stripe.Event> => {
  try {
    // Check if Stripe is initialized
    if (!stripe) {
      if (DEVELOPMENT_MODE) {
        console.warn('Stripe not initialized, returning mock event for development');
        // Create a mock event
        return {
          id: `evt_mock_${Date.now()}`,
          object: 'event',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: `cs_mock_${Date.now()}`,
              object: 'checkout.session',
              payment_status: 'paid',
            }
          }
        } as unknown as Stripe.Event;
      } else {
        throw new Error('Stripe is not initialized');
      }
    }

    // SECURITY FIX: Enforce webhook signature verification in production
    if (!STRIPE_WEBHOOK_SECRET) {
      if (!DEVELOPMENT_MODE) {
        console.error('CRITICAL: STRIPE_WEBHOOK_SECRET must be set in production');
        throw new Error('Webhook signature verification is required in production');
      }
      console.warn('⚠️ DEVELOPMENT ONLY: STRIPE_WEBHOOK_SECRET not set, skipping signature verification');
      // Create a mock event from the payload (DEVELOPMENT ONLY)
      const payloadJson = JSON.parse(payload.toString());
      return payloadJson as unknown as Stripe.Event;
    }

    return stripe.webhooks.constructEvent(
      payload,
      signature,
      STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    throw new Error('Invalid signature');
  }
};

/**
 * Get raw body from request for Stripe webhook
 */
export const getRawBody = (req: Request): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    if (req.body instanceof Buffer) {
      return resolve(req.body);
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    
    req.on('error', (err) => {
      reject(err);
    });
  });
};

/**
 * @deprecated This function is disabled for PCI compliance
 * 
 * SECURITY: Direct card data handling violates PCI-DSS compliance.
 * All payments MUST use Stripe Elements on the frontend to tokenize card data.
 * 
 * Use createPaymentIntent() for server-side payment processing with tokenized payment methods.
 */
export const processCardPayment = async (
  _amount: number,
  _paymentMethod: {
    card: {
      number: string;
      exp_month: number;
      exp_year: number;
      cvc: string;
    }
  },
  _metadata: Record<string, string> = {}
): Promise<{
  success: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  amount?: number;
  error?: string;
}> => {
  // SECURITY FIX: This function is permanently disabled for PCI compliance
  // All card data must be tokenized on the frontend using Stripe Elements
  console.error('PCI VIOLATION ATTEMPT: processCardPayment is disabled for security reasons');
  return {
    success: false,
    error: 'Direct card processing is disabled for PCI compliance. Use Stripe Elements for payment tokenization.'
  };
};

export const processStripeWebhook = async (event: Stripe.Event): Promise<{
  success: boolean;
  sessionId?: string;
  paymentIntentId?: string;
  eventType: string;
  status?: string;
}> => {
  try {
    const eventType = event.type;
    
    // Handle different event types
    switch (eventType) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          success: true,
          sessionId: session.id,
          eventType,
          status: 'completed',
        };
      }
      
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        return {
          success: true,
          paymentIntentId: paymentIntent.id,
          eventType,
          status: 'succeeded',
        };
      }
      
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        return {
          success: false,
          paymentIntentId: paymentIntent.id,
          eventType,
          status: 'failed',
        };
      }
      
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        return {
          success: true,
          paymentIntentId: charge.payment_intent as string,
          eventType,
          status: 'refunded',
        };
      }
      
      default:
        return {
          success: false,
          eventType,
          status: 'unhandled',
        };
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return {
      success: false,
      eventType: event.type,
      status: 'error',
    };
  }
};