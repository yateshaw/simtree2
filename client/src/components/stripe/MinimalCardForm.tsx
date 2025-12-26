import React from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Initialize Stripe with the public key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_51OfypyHfAx6nKqmYqUXeRH3k5rDxbQ4s3MFvxGC7nLRRVaB8Dhu0YzbUv7mKjvDpXRv8sMRlGNbAQHAJFnFvJg5v00JGFvV13O');

const CardForm = () => {
  const stripe = useStripe();
  const elements = useElements();

  // Very simplified handler
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (import.meta.env.DEV) { console.log('Form submitted'); }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Card details</label>
        <div className="p-4 border rounded-md bg-white" style={{ minHeight: '40px' }}>
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': {
                    color: '#aab7c4',
                  },
                },
                invalid: {
                  color: '#9e2146',
                },
              },
            }}
          />
        </div>
      </div>
      
      <Button 
        type="submit"
        disabled={!stripe || !elements}
        className="w-full"
      >
        Pay
      </Button>
    </form>
  );
};

// Main component
const MinimalCardForm = () => {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">Simple Card Test</CardTitle>
      </CardHeader>
      <CardContent>
        <Elements stripe={stripePromise}>
          <CardForm />
        </Elements>
      </CardContent>
    </Card>
  );
};

export default MinimalCardForm;