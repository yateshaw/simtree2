import React, { useState } from 'react';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import type { StripeCardElementChangeEvent, PaymentMethod, StripeError } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';
import AcceptedCards from './AcceptedCards';

// Make sure to call loadStripe outside of a component's render to avoid
// recreating the Stripe object on every render.
// This is your test publishable API key.
const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_51OfypyHfAx6nKqmYqUXeRH3k5rDxbQ4s3MFvxGC7nLRRVaB8Dhu0YzbUv7mKjvDpXRv8sMRlGNbAQHAJFnFvJg5v00JGFvV13O'
);

const CARD_ELEMENT_OPTIONS = {
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
  },
  hidePostalCode: true
};

function CardForm() {
  const [error, setError] = useState<StripeError | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js has not loaded yet. Make sure to disable
      // form submission until Stripe.js has loaded.
      return;
    }

    if (error) {
      const cardElement = elements.getElement(CardElement);
      if (cardElement) {
        cardElement.focus();
      }
      return;
    }

    if (cardComplete) {
      setProcessing(true);
    }

    // Use card Element to tokenize payment details
    try {
      const cardElement = elements.getElement(CardElement);
      
      if (!cardElement) {
        console.error('Card element not found');
        return;
      }
      
      const payload = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (payload.error) {
        setError(payload.error);
        setProcessing(false);
        return;
      }

      if (payload.paymentMethod) {
        // Payment method created successfully
        setPaymentMethod(payload.paymentMethod);
      }
      setProcessing(false);
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err);
      setProcessing(false);
    }
  };

  const handleCardChange = (event: StripeCardElementChangeEvent) => {
    setError(event.error || null);
    setCardComplete(event.complete);
  };

  return paymentMethod ? (
    <div className="p-6 border rounded-md bg-green-50 text-center">
      <div className="text-xl font-bold text-green-700 mb-2" role="alert">
        Payment successful
      </div>
      <div className="text-green-600 mt-2">
        Thanks for trying Stripe Elements. No money was charged, but we
        generated a PaymentMethod: <span className="font-mono text-sm bg-white px-2 py-1 rounded">{paymentMethod.id}</span>
      </div>
    </div>
  ) : (
    <form onSubmit={handleSubmit}>
      <div className="mb-6">
        <div className="p-4 border rounded-md bg-white mb-4" style={{ minHeight: '40px' }}>
          <CardElement
            options={CARD_ELEMENT_OPTIONS}
            onChange={handleCardChange}
          />
        </div>
      </div>
      
      {error && (
        <div className="text-red-500 mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          {error.message}
        </div>
      )}
      
      <Button
        type="submit"
        disabled={processing || !stripe}
        className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white"
      >
        {processing ? "Processing..." : "Pay"}
      </Button>
      
      <AcceptedCards />
    </form>
  );
}

const DirectStripeImplementation = () => {
  return (
    <div className="AppWrapper">
      <Elements stripe={stripePromise}>
        <CardForm />
      </Elements>
    </div>
  );
};

export default DirectStripeImplementation;