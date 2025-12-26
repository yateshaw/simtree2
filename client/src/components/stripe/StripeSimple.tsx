import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

// Simpler approach - get the key directly from environment
const getStripeKey = () => {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 
              import.meta.env.VITE_STRIPE_PUBLIC_KEY;
  // Stripe key configured
  return key;
};

// Initialize Stripe once
let stripePromise: Promise<any> | null = null;
if (!stripePromise) {
  const key = getStripeKey();
  if (key) {
    stripePromise = loadStripe(key);
  }
}

// Separate card elements styling
const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      fontFamily: 'system-ui, sans-serif',
      '::placeholder': {
        color: '#aab7c4',
      },
    },
    invalid: {
      color: '#9e2146',
    },
  },
};

interface SimplePaymentFormProps {
  amount: number;
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}

const SimplePaymentForm: React.FC<SimplePaymentFormProps> = ({
  amount,
  onSuccess,
  onCancel
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState({
    cardNumber: false,
    cardExpiry: false,
    cardCvc: false
  });

  const processingFee = Math.round((amount * 0.029 + 0.3) * 100) / 100;
  const totalAmount = amount + processingFee;

  const isCardReady = cardComplete.cardNumber && cardComplete.cardExpiry && cardComplete.cardCvc;

  const handleCardChange = (elementType: 'cardNumber' | 'cardExpiry' | 'cardCvc') => (event: any) => {
    setCardComplete(prev => ({
      ...prev,
      [elementType]: event.complete
    }));
    setError(event.error ? event.error.message : null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !isCardReady) {
      setError('Please complete your card information.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Create Payment Intent
      const response = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          amount: Math.round(totalAmount * 100),
          currency: 'usd',
          metadata: {
            wallet_credit: 'true',
            credit_amount: amount.toString()
          }
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create payment');
      }

      // Confirm payment using CardNumberElement
      const cardElement = elements.getElement(CardNumberElement);
      const result = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: {
          card: cardElement!,
        }
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      // Confirm with backend
      const confirmResponse = await fetch('/api/stripe/confirm-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          paymentIntentId: result.paymentIntent.id,
          amount: amount
        }),
      });

      const confirmData = await confirmResponse.json();
      
      if (!confirmData.success) {
        throw new Error(confirmData.error || 'Failed to confirm payment');
      }

      toast({
        title: "Payment Successful",
        description: `$${amount.toFixed(2)} has been added to your wallet.`,
      });

      if (onSuccess) {
        onSuccess(result);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Payment failed';
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Add Credit to Wallet
        </CardTitle>
        <CardDescription>Add ${amount.toFixed(2)} to your company wallet</CardDescription>
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
          {stripe && elements ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Card Number</label>
                <div className="border rounded-md p-3 bg-white min-h-[50px]">
                  <CardNumberElement
                    options={cardElementOptions}
                    onChange={handleCardChange('cardNumber')}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Expiry Date</label>
                  <div className="border rounded-md p-3 bg-white min-h-[50px]">
                    <CardExpiryElement
                      options={cardElementOptions}
                      onChange={handleCardChange('cardExpiry')}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">CVC</label>
                  <div className="border rounded-md p-3 bg-white min-h-[50px]">
                    <CardCvcElement
                      options={cardElementOptions}
                      onChange={handleCardChange('cardCvc')}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-gray-500">Loading payment form...</span>
            </div>
          )}

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
              disabled={!stripe || isProcessing || !isCardReady}
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
      </CardContent>
    </Card>
  );
};

// Main wrapper component
const StripeSimplePayment: React.FC<SimplePaymentFormProps> = (props) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = getStripeKey();
    if (!key) {
      setError('Stripe key not configured');
      setLoading(false);
      return;
    }

    // Wait a moment for Stripe to initialize
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading Stripe...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!stripePromise) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to initialize Stripe</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <SimplePaymentForm {...props} />
    </Elements>
  );
};

export default StripeSimplePayment;