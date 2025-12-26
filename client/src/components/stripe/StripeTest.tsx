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
import { AlertCircle, Loader2, CreditCard, CheckCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

interface StripeTestProps {
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
}

// A diagnostic tool for Stripe API testing
const StripeTest: React.FC<StripeTestProps> = ({
  onSuccess,
  onError
}) => {
  const [amount, setAmount] = useState<number>(10);
  const [cardNumber, setCardNumber] = useState<string>('4242424242424242');
  const [expMonth, setExpMonth] = useState<number>(12);
  const [expYear, setExpYear] = useState<number>(2025);
  const [cvc, setCvc] = useState<string>('123');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch('/api/stripe/test-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount,
          card: {
            number: cardNumber,
            exp_month: expMonth,
            exp_year: expYear,
            cvc
          }
        })
      });
      
      const data = await response.json();
      setResult(data);
      
      if (data.success) {
        toast({
          title: "Test successful",
          description: `Stripe payment processed successfully with ID: ${data.paymentIntentId}`,
          variant: "default",
        });
        onSuccess?.(data);
      } else {
        setError(data.error || "Unknown error");
        onError?.(data);
      }
    } catch (err: any) {
      setError(err.message || "Failed to communicate with server");
      onError?.(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Stripe API Test Tool</CardTitle>
        <CardDescription>
          This diagnostic tool tests Stripe integration directly, bypassing authentication requirements.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {result?.success && (
          <Alert variant="default" className="mb-4 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>
              <div>Payment ID: {result.paymentIntentId}</div>
              <div>Amount: ${result.amount}</div>
            </AlertDescription>
          </Alert>
        )}
        
        <div className="grid w-full items-center gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="amount">Amount (USD)</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min="1"
              disabled={loading}
            />
          </div>
          
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="cardNumber">Card Number</Label>
            <Input
              id="cardNumber"
              name="cardNumber"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value.replace(/\s/g, ''))}
              disabled={loading}
            />
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="expMonth">Exp Month</Label>
              <Input
                id="expMonth"
                name="expMonth"
                type="number"
                value={expMonth}
                onChange={(e) => setExpMonth(Number(e.target.value))}
                min="1"
                max="12"
                disabled={loading}
              />
            </div>
            
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="expYear">Exp Year</Label>
              <Input
                id="expYear"
                name="expYear"
                type="number"
                value={expYear}
                onChange={(e) => setExpYear(Number(e.target.value))}
                min="2023"
                disabled={loading}
              />
            </div>
            
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="cvc">CVC</Label>
              <Input
                id="cvc"
                name="cvc"
                value={cvc}
                onChange={(e) => setCvc(e.target.value)}
                maxLength={4}
                disabled={loading}
              />
            </div>
          </div>
        </div>
      </CardContent>
      
      <CardFooter>
        <Button 
          onClick={runTest} 
          disabled={loading} 
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Test Stripe Integration
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default StripeTest;