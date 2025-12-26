import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { AlertCircle, Loader2, CreditCard } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { config } from '@/lib/config';

interface SimpleStripePaymentFormProps {
  onSuccess?: (sessionId: string) => void;
  onCancel?: () => void;
  defaultAmount?: number;
  title?: string;
  description?: string;
}

// This is a simplified version that doesn't try to load stripe on the client side
// It just relies on the redirect URL provided by the server
const SimpleStripePaymentForm: React.FC<SimpleStripePaymentFormProps> = ({
  onSuccess,
  onCancel,
  defaultAmount = 100,
  title = "Add Credit to Your Wallet",
  description = "Enter the amount you want to add to your wallet. You'll be redirected to Stripe to complete the payment."
}) => {
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [error, setError] = useState<string | null>(null);

  // Create a Stripe checkout session
  const createCheckoutSession = useMutation({
    mutationFn: async (amount: number) => {
      // Direct API request to create checkout session
      return await apiRequest('/api/wallet/stripe/create-checkout', {
        method: 'POST',
        body: JSON.stringify({ 
          amount,
          currency: "usd",
          description: "Wallet credit purchase" 
        })
      });
    },
    onSuccess: async (data) => {
      if (import.meta.env.DEV) { console.log("Checkout session created:", data); }
      // All we need is the redirect URL
      if (data.url) {
        // This is the key part - just redirect to the provided URL
        window.location.href = data.url; // Stripe checkout URL is already absolute
      } else if (data.sessionId) {
        // Optional callback if there's a session ID
        onSuccess?.(data.sessionId);
      } else {
        setError('Unable to create payment session. Please try again.');
      }
    },
    onError: (error: any) => {
      console.error("Error creating payment session:", error);
      setError(error?.message || 'Failed to create payment session. Please try again.');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!amount || amount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }
    
    createCheckoutSession.mutate(amount);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      
      <form onSubmit={handleSubmit}>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="amount">Amount (USD)</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                placeholder="Enter amount"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                min="1"
                step="1"
                required
              />
            </div>
          </div>
        </CardContent>
        
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={onCancel} disabled={createCheckoutSession.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={createCheckoutSession.isPending}>
            {createCheckoutSession.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Proceed to Payment
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default SimpleStripePaymentForm;