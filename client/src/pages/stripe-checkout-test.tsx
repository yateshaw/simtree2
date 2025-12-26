import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import CheckoutRedirectForm from '../components/stripe/CheckoutRedirectForm';

const StripeCheckoutTest: React.FC = () => {
  return (
    <div className="container mx-auto max-w-3xl py-4 px-2 min-h-screen">
      <Card className="shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Stripe Checkout Test</CardTitle>
          <CardDescription>
            Test the Stripe Checkout redirect flow for payment processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-md text-sm text-blue-700">
              <p className="font-medium mb-1">About Stripe Checkout:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Stripe Checkout uses a redirect to Stripe's hosted payment page</li>
                <li>All payment processing happens on Stripe's secure servers</li>
                <li>After payment, you'll be redirected back to our application</li>
                <li>This approach is recommended for reliability and security</li>
              </ul>
            </div>
            
            <div className="mt-8">
              <CheckoutRedirectForm 
                defaultAmount={50}
                onCancel={() => window.history.back()}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StripeCheckoutTest;