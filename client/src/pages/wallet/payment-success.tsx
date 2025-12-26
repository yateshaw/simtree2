import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

const PaymentSuccessPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extract session ID from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const session = urlParams.get('session_id');
    setSessionId(session);
  }, []);

  // Verify payment status
  const { data, isLoading, isError } = useQuery({
    queryKey: ['/api/wallet/stripe/verify-payment', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID found');
      const response = await fetch(`/api/wallet/stripe/verify-payment/${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to verify payment');
      }
      return response.json();
    },
    enabled: !!sessionId,
    retry: 1
  });

  const handleReturnToWallet = () => {
    setLocation('/wallet');
  };

  // If payment failed
  if (isError || (data && !data.success)) {
    return (
      <Card className="w-full max-w-md mx-auto mt-8">
        <CardHeader>
          <CardTitle className="text-center">Payment Failed</CardTitle>
          <CardDescription className="text-center">
            There was an issue processing your payment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error || "Your payment couldn't be processed. Please try again."}
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={handleReturnToWallet}>Return to Wallet</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle className="text-center">Payment Successful</CardTitle>
        <CardDescription className="text-center">
          Your payment has been processed successfully.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
            <p>Verifying payment...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-medium mb-2">
              Funds Added to Your Wallet
            </h3>
            {data?.transaction && (
              <div className="text-center mt-4">
                <p className="mb-2">
                  <span className="font-semibold">Amount:</span>{' '}
                  ${parseFloat(data.transaction.amount).toFixed(2)} USD
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Transaction ID:</span>{' '}
                  {data.transaction.id}
                </p>
                <p>
                  <span className="font-semibold">Date:</span>{' '}
                  {new Date(data.transaction.createdAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-center">
        <Button onClick={handleReturnToWallet} disabled={isLoading}>
          Return to Wallet
        </Button>
      </CardFooter>
    </Card>
  );
};

export default PaymentSuccessPage;