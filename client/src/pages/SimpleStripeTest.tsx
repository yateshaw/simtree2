import React from 'react';
import SimpleStripeForm from '@/components/stripe/SimpleStripeForm';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

export default function SimpleStripeTest() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSuccess = (transactionId: string) => {
    toast({
      title: 'Payment Complete',
      description: `Transaction ID: ${transactionId}`,
    });
    
    // Navigate to wallet page after 1.5 seconds
    setTimeout(() => {
      setLocation('/wallet');
    }, 1500);
  };

  const handleCancel = () => {
    toast({
      title: 'Payment Cancelled',
      description: 'You have cancelled the payment process.',
      variant: 'destructive',
    });
    setLocation('/wallet');
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6 text-center">Simple Stripe Payment</h1>
      <div className="max-w-md mx-auto">
        <SimpleStripeForm 
          onSuccess={handleSuccess} 
          onCancel={handleCancel}
          defaultAmount={10} 
        />
      </div>
    </div>
  );
}