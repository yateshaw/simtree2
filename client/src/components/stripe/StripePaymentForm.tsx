import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import AcceptedCards from './AcceptedCards';

// Initialize Stripe - check multiple possible env var names
const getStripeKey = () => {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 
              import.meta.env.VITE_STRIPE_PUBLIC_KEY ||
              'pk_test_51OfypyHfAx6nKqmYqUXeRH3k5rDxbQ4s3MFvxGC7nLRRRVaB8Dhu0YzbUv7mKjvDpXRv8sMRlGNbAQHAJFnFvJg5v00JGFvV13O';
  
  // Stripe key configuration complete
  
  return key;
};

const stripePromise = loadStripe(getStripeKey());

// Card Element styling
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': {
        color: '#aab7c4',
      },
      fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
      fontSmoothing: 'antialiased',
    },
    invalid: {
      color: '#9e2146',
    },
  },
  hidePostalCode: true,
};

interface PaymentFormProps {
  amount: number;
  title?: string;
  description?: string;
  onSuccess?: (result: { paymentIntentId: string; transactionId: number }) => void;
  onCancel?: () => void;
}

// Internal payment form component that uses Stripe hooks
const PaymentForm: React.FC<PaymentFormProps> = ({
  amount,
  title = "Add Credit to Wallet",
  description = "Enter your card details to add credit",
  onSuccess,
  onCancel
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);

  // Debug Stripe loading
  useEffect(() => {
    console.log('Stripe Elements debug:', {
      stripe: !!stripe,
      elements: !!elements,
      stripeLoaded: stripe !== null,
      elementsLoaded: elements !== null
    });
  }, [stripe, elements]);

  // Calculate fees (2.9% + $0.30)
  const processingFee = Math.round((amount * 0.029 + 0.3) * 100) / 100;
  const totalAmount = amount + processingFee;

  const handleCardChange = (event: any) => {
    setCardComplete(event.complete);
    setError(event.error ? event.error.message : null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      setError('Stripe has not loaded yet. Please try again.');
      return;
    }

    if (!cardComplete) {
      setError('Please complete your card information.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Step 1: Create Payment Intent on backend
      const createResponse = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          amount: Math.round(totalAmount * 100), // Convert to cents
          currency: 'usd',
          metadata: {
            wallet_credit: 'true',
            credit_amount: amount.toString(),
            processing_fee: processingFee.toString()
          }
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create payment intent');
      }

      const createData = await createResponse.json();
      
      if (!createData.success) {
        throw new Error(createData.error || 'Failed to create payment intent');
      }

      // Step 2: Confirm payment with Stripe Elements
      const cardElement = elements.getElement(CardElement);
      
      const confirmResult = await stripe.confirmCardPayment(createData.clientSecret, {
        payment_method: {
          card: cardElement!,
          billing_details: {
            // Add any billing details here if needed
          },
        }
      });

      if (confirmResult.error) {
        throw new Error(confirmResult.error.message);
      }

      // Step 3: Confirm payment success with backend
      const confirmResponse = await fetch('/api/stripe/confirm-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          paymentIntentId: confirmResult.paymentIntent.id,
          amount: amount
        }),
      });

      if (!confirmResponse.ok) {
        throw new Error('Failed to confirm payment with server');
      }

      const confirmData = await confirmResponse.json();
      
      if (!confirmData.success) {
        throw new Error(confirmData.error || 'Failed to confirm payment');
      }

      // Success!
      setPaymentSucceeded(true);
      setPaymentResult({
        paymentIntentId: confirmResult.paymentIntent.id,
        transactionId: confirmData.transactionId
      });

      toast({
        title: "Payment Successful",
        description: `$${amount.toFixed(2)} has been added to your wallet.`,
      });

      if (onSuccess) {
        onSuccess({
          paymentIntentId: confirmResult.paymentIntent.id,
          transactionId: confirmData.transactionId
        });
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      
      toast({
        title: "Payment Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (paymentSucceeded) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-800">Payment Successful!</h3>
              <p className="text-sm text-gray-600 mt-2">
                ${amount.toFixed(2)} has been added to your wallet
              </p>
              {paymentResult && (
                <p className="text-xs text-gray-500 mt-1">
                  Payment ID: {paymentResult.paymentIntentId}
                </p>
              )}
            </div>
            <Button onClick={onCancel} variant="outline" className="w-full">
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <Badge variant="secondary" className="w-fit">
          <Shield className="h-3 w-3 mr-1" />
          Stripe Elements - PCI Compliant
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment Summary */}
        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span>Wallet Credit:</span>
            <span>${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Processing Fee (2.9% + $0.30):</span>
            <span>${processingFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-base border-t pt-2">
            <span>Total:</span>
            <span>${totalAmount.toFixed(2)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Card Details</label>
            <div className="border rounded-md p-3 bg-white min-h-[45px] flex items-center">
              {stripe && elements ? (
                <CardElement
                  options={CARD_ELEMENT_OPTIONS}
                  onChange={handleCardChange}
                />
              ) : (
                <div className="flex items-center space-x-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading card input...</span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}


          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isProcessing}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!stripe || isProcessing || !cardComplete}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Pay $${totalAmount.toFixed(2)}`
              )}
            </Button>
          </div>
        </form>

        <AcceptedCards />
      </CardContent>
    </Card>
  );
};

// Main component that wraps the form with Stripe Elements provider
const StripePaymentForm: React.FC<PaymentFormProps> = (props) => {
  const [stripeError, setStripeError] = useState<string | null>(null);

  useEffect(() => {
    const hasStripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || import.meta.env.VITE_STRIPE_PUBLIC_KEY;
    if (!hasStripeKey) {
      setStripeError('Stripe publishable key is not configured');
    }
  }, []);

  if (stripeError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{stripeError}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Elements stripe={stripePromise} key="stripe-elements">
      <PaymentForm {...props} />
    </Elements>
  );
};

export default StripePaymentForm;