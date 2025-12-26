import { loadStripe, Stripe } from '@stripe/stripe-js';

// Stripe configuration - get from environment
const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Test mode fallback key for development/demo purposes
const TEST_MODE_KEY = 'pk_test_51234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12';

// Initialize Stripe
let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    // Use provided key or fallback to test mode
    const key = STRIPE_PUBLIC_KEY.startsWith('pk_') ? STRIPE_PUBLIC_KEY : TEST_MODE_KEY;
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

// Stripe configuration status
export const getStripeConfig = () => {
  const hasRealKey = STRIPE_PUBLIC_KEY && STRIPE_PUBLIC_KEY.startsWith('pk_');
  const isTestMode = !hasRealKey;
  
  return {
    isConfigured: hasRealKey,
    isTestMode,
    publicKey: hasRealKey ? STRIPE_PUBLIC_KEY : TEST_MODE_KEY,
    keyType: hasRealKey ? (STRIPE_PUBLIC_KEY.includes('test') ? 'test' : 'live') : 'demo'
  };
};

// Test card numbers for demo/testing
export const TEST_CARDS = {
  visa: '4242424242424242',
  visaDebit: '4000056655665556',
  mastercard: '5555555555554444',
  amex: '378282246310005',
  declined: '4000000000000002',
  requiresAuth: '4000002500003155'
};

// Card validation utilities
export const validateCardNumber = (number: string): boolean => {
  // Remove spaces and check basic format
  const cleanNumber = number.replace(/\s/g, '');
  return /^\d{13,19}$/.test(cleanNumber);
};

export const validateExpiry = (expiry: string): boolean => {
  // MM/YY format
  const pattern = /^(0[1-9]|1[0-2])\/\d{2}$/;
  if (!pattern.test(expiry)) return false;
  
  const [month, year] = expiry.split('/');
  const now = new Date();
  const expDate = new Date(2000 + parseInt(year), parseInt(month) - 1);
  
  return expDate > now;
};

export const validateCVC = (cvc: string): boolean => {
  return /^\d{3,4}$/.test(cvc);
};

// Format card number with spaces
export const formatCardNumber = (value: string): string => {
  const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  const matches = v.match(/\d{4,16}/g);
  const match = matches && matches[0] || '';
  const parts = [];
  for (let i = 0, len = match.length; i < len; i += 4) {
    parts.push(match.substring(i, i + 4));
  }
  if (parts.length) {
    return parts.join(' ');
  } else {
    return v;
  }
};

// Format expiry date
export const formatExpiry = (value: string): string => {
  const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  if (v.length >= 2) {
    return v.substring(0, 2) + '/' + v.substring(2, 4);
  }
  return v;
};

// Get card type from number
export const getCardType = (number: string): string => {
  const cleanNumber = number.replace(/\s/g, '');
  
  if (/^4/.test(cleanNumber)) return 'visa';
  if (/^5[1-5]/.test(cleanNumber)) return 'mastercard';
  if (/^3[47]/.test(cleanNumber)) return 'amex';
  if (/^6/.test(cleanNumber)) return 'discover';
  
  return 'unknown';
};

// Official Stripe international test card numbers
const INTERNATIONAL_TEST_CARDS = [
  // Argentina
  '4000000320000021',
  
  // Australia
  '4000000360000006',
  
  // Austria
  '4000000400000008',
  
  // Belgium
  '4000000560000004',
  
  // Brazil
  '4000000760000002',
  
  // Canada
  '4000001240000000',
  
  // Denmark
  '4000002080000001',
  
  // Finland
  '4000002460000001',
  
  // France
  '4000002500000003',
  
  // Germany
  '4000002760000016',
  
  // Hong Kong
  '4000003440000004',
  
  // Ireland
  '4000003720000005',
  
  // Italy
  '4000003800000008',
  
  // Japan
  '4000003920000003',
  
  // Mexico
  '4000004840000008',
  
  // Netherlands
  '4000005280000002',
  
  // New Zealand
  '4000005540000008',
  
  // Norway
  '4000005780000007',
  
  // Singapore
  '4000007020000003',
  
  // South Korea
  '4000004100000001',
  
  // Spain
  '4000007240000007',
  
  // Sweden
  '4000007520000008',
  
  // Switzerland
  '4000007560000009',
  
  // United Kingdom
  '4000008260000000',
  
  // Others
  '4000002500000003', // Additional France card
  '4000003800000008', // Additional Italy card
];

// Check if card is international based on Stripe test card numbers
export const isInternationalCard = (number: string): boolean => {
  const cleanNumber = number.replace(/\s/g, '');
  return INTERNATIONAL_TEST_CARDS.includes(cleanNumber);
};

// Payment intent creation
export const createPaymentIntent = async (amount: number): Promise<{
  clientSecret: string;
  paymentIntentId: string;
}> => {
  const response = await fetch('/api/stripe/create-payment-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ amount }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create payment intent: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to create payment intent');
  }

  return data;
};

// Confirm payment
export const confirmPayment = async (paymentIntentId: string): Promise<any> => {
  const response = await fetch('/api/stripe/confirm-payment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ paymentIntentId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to confirm payment: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to confirm payment');
  }

  return data;
};