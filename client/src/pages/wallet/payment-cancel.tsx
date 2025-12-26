import React from 'react';
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
import { AlertCircle } from 'lucide-react';

const PaymentCancelPage: React.FC = () => {
  const [, setLocation] = useLocation();

  const handleReturnToWallet = () => {
    setLocation('/wallet');
  };

  return (
    <Card className="w-full max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle className="text-center">Payment Canceled</CardTitle>
        <CardDescription className="text-center">
          Your payment process was canceled.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Payment Not Completed</AlertTitle>
          <AlertDescription>
            You have canceled the payment process. No funds have been charged.
          </AlertDescription>
        </Alert>
        
        <div className="text-center mt-4">
          <p>
            You can try again any time by returning to the wallet page and selecting "Add Credit".
          </p>
        </div>
      </CardContent>
      
      <CardFooter className="flex justify-center">
        <Button onClick={handleReturnToWallet}>
          Return to Wallet
        </Button>
      </CardFooter>
    </Card>
  );
};

export default PaymentCancelPage;