import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle, CreditCard, Shield } from 'lucide-react';
import AcceptedCards from './AcceptedCards';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!);

interface PaymentFormProps {
  amount: number;
  onSuccess?: (result: any) => void;
  onCancel: () => void;
  title?: string;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ amount, onSuccess, onCancel, title = "Complete Payment" }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cardComplete, setCardComplete] = useState({
    cardNumber: false,
    cardExpiry: false,
    cardCvc: false
  });

  // Fees are handled on the backend - user only pays the credit amount they want

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      setError('Stripe not loaded');
      return;
    }

    const cardNumberElement = elements.getElement(CardNumberElement);
    if (!cardNumberElement) {
      setError('Card element not found');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Step 1: Create payment intent on server (convert dollars to cents)
      const { clientSecret, paymentIntentId } = await apiRequest('/api/wallet/stripe/create-intent', {
        method: 'POST',
        body: JSON.stringify({ amount: Math.round(amount * 100), currency: 'usd' }),
        headers: { 'Content-Type': 'application/json' }
      });

      // Step 2: Confirm payment with Stripe
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardNumberElement,
        }
      });

      if (stripeError) {
        setError(stripeError.message || 'Payment failed');
        return;
      }

      // Step 3: Confirm payment success on server and update wallet
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        const confirmData = { paymentIntentId: paymentIntent.id };
        console.log('Confirming payment with data:', confirmData);
        await apiRequest('/api/wallet/stripe/confirm-payment', {
          method: 'POST',
          body: JSON.stringify(confirmData),
          headers: { 'Content-Type': 'application/json' }
        });

        setSuccess(true);
        toast({
          title: "Payment Successful!",
          description: `$${amount.toFixed(2)} has been added to your wallet.`,
        });

        // Refresh wallet data
        queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
        queryClient.invalidateQueries({ queryKey: ['/api/wallet/transactions'] });

        if (onSuccess) {
          onSuccess({ amount, paymentIntentId });
        }
      }
    } catch (err: any) {
      console.error('Payment failed:', err);
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (success) {
    return (
      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
        <CardContent className="p-6 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-emerald-800 mb-2">Payment Successful!</h3>
          <p className="text-emerald-700 mb-4">
            ${amount.toFixed(2)} has been added to your wallet.
          </p>
          <Button 
            onClick={onCancel}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Continue
          </Button>
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
        <Badge variant="secondary" className="w-fit">
          <Shield className="h-3 w-3 mr-1" />
          Stripe Elements
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment Summary */}
        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span>Item</span>
            <span>Total</span>
          </div>
          <div className="flex justify-between font-semibold text-base">
            <span>{amount.toFixed(0)} Credits</span>
            <span>${amount.toFixed(2)}</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Card Number</label>
              <div className="border rounded-md p-3 bg-white min-h-[50px]">
                <CardNumberElement
                  options={{
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
                  }}
                  onChange={(event) => setCardComplete(prev => ({ ...prev, cardNumber: event.complete }))}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Expiry Date</label>
                <div className="border rounded-md p-3 bg-white min-h-[50px]">
                  <CardExpiryElement
                    options={{
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
                    }}
                    onChange={(event) => setCardComplete(prev => ({ ...prev, cardExpiry: event.complete }))}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">CVC</label>
                <div className="border rounded-md p-3 bg-white min-h-[50px]">
                  <CardCvcElement
                    options={{
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
                    }}
                    onChange={(event) => setCardComplete(prev => ({ ...prev, cardCvc: event.complete }))}
                  />
                </div>
              </div>
            </div>
          </div>


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
              disabled={!stripe || isProcessing || !(cardComplete.cardNumber && cardComplete.cardExpiry && cardComplete.cardCvc)}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isProcessing ? 'Processing...' : `Pay $${amount.toFixed(2)}`}
            </Button>
          </div>
        </form>

        <AcceptedCards />
      </CardContent>
    </Card>
  );
};

interface StripeElementsFormProps {
  amount: number;
  onSuccess?: (result: any) => void;
  onCancel: () => void;
  title?: string;
}

const StripeElementsForm: React.FC<StripeElementsFormProps> = (props) => {
  return (
    <Elements 
      stripe={stripePromise}
      options={{
        locale: 'en',
        appearance: {
          theme: 'stripe'
        }
      }}
    >
      <PaymentForm {...props} />
    </Elements>
  );
};

export default StripeElementsForm;