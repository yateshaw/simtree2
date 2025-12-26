import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import axios from 'axios';
import { config } from '@/lib/config';

interface CheckoutRedirectFormProps {
  defaultAmount?: number;
  onCancel?: () => void;
}

const CheckoutRedirectForm: React.FC<CheckoutRedirectFormProps> = ({ 
  defaultAmount = 10,
  onCancel 
}) => {
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { toast } = useToast();

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setAmount(isNaN(value) ? 0 : value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a positive amount",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Create checkout session via the API
      const response = await axios.post('/api/wallet/stripe/create-checkout', {
        amount,
        currency: 'usd',
        successUrl: config.getFullUrl('/wallet/payment-success'),
        cancelUrl: config.getFullUrl('/wallet/payment-cancel'),
      });

      // Redirect to Stripe Checkout
      if (response.data.url) {
        window.location.href = response.data.url; // Stripe checkout URL is already absolute
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: "Payment failed",
        description: "Could not initialize payment process. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USD)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={handleAmountChange}
                disabled={isLoading}
                className="text-lg"
              />
            </div>
            
            <div className="flex flex-col space-y-2 mt-4">
              <Button type="submit" disabled={isLoading || amount <= 0}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Pay $${amount.toFixed(2)}`
                )}
              </Button>
              
              {onCancel && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onCancel}
                  disabled={isLoading}
                  className="mt-2"
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default CheckoutRedirectForm;