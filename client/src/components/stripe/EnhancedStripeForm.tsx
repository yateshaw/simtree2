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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CreditCard, Calendar, Lock, DollarSign, Loader2, CheckCircle, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import AcceptedCards from './AcceptedCards';

// Initialize Stripe
const stripePromise = (() => {
  try {
    // Add console logging for debugging
    // Debug logging removed for security
    
    // Check if running in development mode and provide fallback if needed
    const stripeKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_51OfypyHfAx6nKqmYqUXeRH3k5rDxbQ4s3MFvxGC7nLRRVaB8Dhu0YzbUv7mKjvDpXRv8sMRlGNbAQHAJFnFvJg5v00JGFvV13O';
    
    return loadStripe(stripeKey);
  } catch (error) {
    console.error("Error loading Stripe:", error);
    return Promise.reject(error);
  }
})();

// Card input styles
const cardElementOptions = {
  style: {
    base: {
      color: '#32325d',
      fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
      fontSmoothing: 'antialiased',
      fontSize: '16px',
      '::placeholder': {
        color: '#aab7c4'
      }
    },
    invalid: {
      color: '#fa755a',
      iconColor: '#fa755a'
    }
  }
};

// Inner form component
const CheckoutForm = ({ 
  amount, 
  onSuccess, 
  onCancel 
}: { 
  amount: number;
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();
  const [isInternationalCard, setIsInternationalCard] = useState(false);
  const [manualCardTypeOverride, setManualCardTypeOverride] = useState(false);

  const createPaymentIntent = useMutation({
    mutationFn: async (amount: number) => {
      const response = await apiRequest('/api/wallet/stripe/create-payment-intent', {
        method: 'POST',
        body: JSON.stringify({ 
          amount,
          currency: "usd",
          description: "Wallet credit purchase" 
        })
      });
      return response;
    }
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!stripe || !elements) {
      setError('Stripe has not loaded yet. Please try again.');
      return;
    }
    
    try {
      setProcessing(true);
      setError(null);
      
      // Create a payment intent on the server
      const { clientSecret } = await createPaymentIntent.mutateAsync(amount);
      
      if (!clientSecret) {
        throw new Error('Failed to create payment intent');
      }
      
      // Get card elements
      const cardNumber = elements.getElement(CardNumberElement);
      
      if (!cardNumber) {
        throw new Error('Card elements not available');
      }
      
      // Confirm payment
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret, {
          payment_method: {
            card: cardNumber,
            billing_details: {
              // You can add billing details here if needed
            }
          }
        }
      );
      
      if (confirmError) {
        throw new Error(confirmError.message);
      }
      
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        toast({
          title: 'Payment Successful',
          description: `$${amount.toFixed(2)} has been added to your wallet.`,
          variant: 'default',
        });
        onSuccess(paymentIntent.id);
      } else {
        throw new Error('Payment failed with status: ' + (paymentIntent?.status || 'unknown'));
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'An error occurred during payment processing');
      toast({
        title: 'Payment Failed',
        description: err.message || 'There was a problem processing your payment',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-6">
        {/* Card Number Field */}
        <div>
          <Label htmlFor="card-number" className="flex items-center font-medium text-gray-700 mb-1.5">
            <CreditCard className="h-4 w-4 mr-1 text-primary" />
            Card Number
          </Label>
          <div id="card-number-container" className="p-4 border border-gray-200 rounded-md shadow-sm bg-white relative overflow-visible" style={{ zIndex: 1 }}>
            <CardNumberElement 
              id="card-number-element"
              options={{
                ...cardElementOptions,
                showIcon: true,
              }}
              onChange={(e) => {
                if (e.brand) {
                  const isInternational = e.brand === 'jcb' || e.brand === 'unionpay' || e.brand === 'diners';
                  if (!manualCardTypeOverride) {
                    setIsInternationalCard(isInternational);
                  }
                }
              }}
              className="stripe-element h-6"
            />
          </div>
        </div>

        {/* Expiry and CVC in 2 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="card-expiry" className="flex items-center font-medium text-gray-700 mb-1.5">
              <Calendar className="h-4 w-4 mr-1 text-primary" />
              Expiration Date
            </Label>
            <div id="card-expiry-container" className="p-4 border border-gray-200 rounded-md shadow-sm bg-white relative overflow-visible" style={{ zIndex: 1 }}>
              <CardExpiryElement 
                id="card-expiry-element" 
                options={cardElementOptions}
                className="stripe-element h-6"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="card-cvc" className="flex items-center font-medium text-gray-700 mb-1.5">
              <Lock className="h-4 w-4 mr-1 text-primary" />
              CVC
            </Label>
            <div id="card-cvc-container" className="p-4 border border-gray-200 rounded-md shadow-sm bg-white relative overflow-visible" style={{ zIndex: 1 }}>
              <CardCvcElement 
                id="card-cvc-element" 
                options={cardElementOptions}
                className="stripe-element h-6"
              />
            </div>
          </div>
        </div>

        {/* Card Type Override */}
        <div className="mt-2 mb-2 flex flex-col sm:flex-row sm:items-center">
          <Label htmlFor="card-type-override" className="mb-2 sm:mb-0 sm:mr-3 text-sm text-gray-700 font-medium">
            Card Type Override:
          </Label>
          <div className="grid grid-cols-2 sm:flex border border-gray-200 rounded-lg p-2 bg-gray-50 w-full sm:w-auto gap-2 sm:gap-0">
            <button 
              type="button"
              onClick={() => { 
                setIsInternationalCard(false);
                setManualCardTypeOverride(true);
              }} 
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${!isInternationalCard && manualCardTypeOverride ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
            >
              US Domestic
            </button>
            <button 
              type="button"
              onClick={() => { 
                setIsInternationalCard(true);
                setManualCardTypeOverride(true);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${isInternationalCard && manualCardTypeOverride ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
            >
              International
            </button>
          </div>
        </div>

        {/* Test Card Info */}
        <div className="space-y-2 mt-2">
          <p className="text-xs text-gray-500 font-medium">Test Card Numbers:</p>
          <ul className="text-xs text-gray-500 list-disc pl-4 space-y-1">
            <li><strong>US/Domestic card:</strong> 4242 4242 4242 4242</li>
            <li><strong>International card:</strong> Any Visa card except 4242 (e.g., 4000 0000 0000 0002)</li>
            <li><strong>Other card brands:</strong> JCB, UnionPay, and Diners Club are treated as international</li>
          </ul>
        </div>

        {/* Error messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

      </div>

      {/* Action buttons */}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-4 mt-6">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          disabled={processing}
          className="px-4 w-full sm:w-auto mt-3 sm:mt-0"
        >
          Cancel
        </Button>

        <Button 
          type="submit"
          disabled={processing || !stripe || !elements}
          className="bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white px-6 shadow-md w-full sm:w-auto"
        >
          {processing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-5 w-5" />
              Pay ${amount.toFixed(2)} USD
            </>
          )}
        </Button>
      </div>
      
      <AcceptedCards />
    </form>
  );
};

// Success state component
const SuccessState = ({ amount, paymentId }: { amount: number; paymentId: string }) => (
  <div className="text-center py-8">
    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
      <CheckCircle className="h-12 w-12 text-green-500" />
    </div>

    <h3 className="text-2xl font-bold mb-3 text-gray-800">Payment Successful!</h3>

    <div className="bg-gradient-to-r from-green-100 to-green-50 p-4 rounded-lg mb-4 inline-block">
      <p className="text-lg font-semibold text-green-800">
        ${amount.toFixed(2)} USD
      </p>
      <p className="text-sm text-green-700">
        has been added to your wallet
      </p>
    </div>

    <div className="mt-2">
      <p className="text-xs text-gray-500 mb-1">Transaction Details</p>
      <p className="text-xs font-mono bg-gray-100 p-2 rounded inline-block">
        {paymentId}
      </p>
    </div>
  </div>
);

// Main component
interface EnhancedStripeFormProps {
  defaultAmount?: number;
  onSuccess?: (transactionId: string) => void;
  onCancel?: () => void;
}

const EnhancedStripeForm: React.FC<EnhancedStripeFormProps> = ({
  defaultAmount = 100,
  onSuccess,
  onCancel = () => {}
}) => {
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [success, setSuccess] = useState<boolean>(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const stripeOptions = {
    appearance: {
      theme: 'stripe' as const,
    },
  };

  const handleSuccess = (paymentIntentId: string) => {
    setPaymentId(paymentIntentId);
    setSuccess(true);
    if (onSuccess) {
      onSuccess(paymentIntentId);
    }
  };

  if (success && paymentId) {
    return <SuccessState amount={amount} paymentId={paymentId} />;
  }

  return (
    <div className="w-full px-2 sm:px-0 pb-4">
      <Elements stripe={stripePromise} options={stripeOptions}>
        <div className="mb-6">
          <Label htmlFor="amount-input" className="flex items-center font-medium text-gray-700 mb-2">
            <DollarSign className="h-4 w-4 mr-1 text-primary" />
            Amount (USD)
          </Label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">$</span>
            </div>
            <Input
              id="amount-input"
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min="1"
              step="1"
              className="pl-7 pr-12 focus:ring-primary focus:border-primary block w-full h-12 text-lg"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">USD</span>
            </div>
          </div>
        </div>

        <CheckoutForm 
          amount={amount} 
          onSuccess={handleSuccess} 
          onCancel={onCancel} 
        />
      </Elements>
    </div>
  );
};

export default EnhancedStripeForm;