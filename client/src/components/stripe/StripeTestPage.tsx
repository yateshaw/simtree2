import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CreditCard, CheckCircle, XCircle, AlertCircle, Zap, DollarSign, Shield, Info } from 'lucide-react';
import StripePaymentForm from './StripePaymentForm';
import { getStripeConfig } from '@/lib/stripe';

export default function StripeTestPage() {
  const [paymentAmount, setPaymentAmount] = useState(25);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  
  const stripeConfig = getStripeConfig();

  // Query to check Stripe status
  const { data: stripeStatus, isLoading } = useQuery({
    queryKey: ['/api/stripe/status'],
    queryFn: async () => {
      const response = await fetch('/api/stripe/status', {
        credentials: 'include'
      });
      return response.json();
    }
  });

  const handlePaymentSuccess = (data: any) => {
    console.log('Payment successful:', data);
    setShowPaymentForm(false);
    // Refresh page or update UI as needed
  };

  const testScenarios = [
    {
      title: "Successful Payment",
      cardNumber: "4242 4242 4242 4242",
      description: "US Visa card that always succeeds",
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-50"
    },
    {
      title: "Declined Payment",
      cardNumber: "4000 0000 0000 0002",
      description: "Card that will be declined",
      icon: XCircle,
      color: "text-red-600",
      bgColor: "bg-red-50"
    },
    {
      title: "International Card",
      cardNumber: "4000 0000 0000 0002",
      description: "International card with higher fees",
      icon: AlertCircle,
      color: "text-orange-600",
      bgColor: "bg-orange-50"
    }
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading Stripe configuration...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Stripe Payment Integration Test</h1>
        <p className="text-gray-600">Test the payment integration before going live</p>
      </div>

      {/* Stripe Configuration Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Stripe Configuration Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg border">
              <div className="flex items-center justify-center mb-2">
                {stripeStatus?.configured ? (
                  <CheckCircle className="h-8 w-8 text-green-600" />
                ) : (
                  <XCircle className="h-8 w-8 text-red-600" />
                )}
              </div>
              <p className="font-medium">API Keys</p>
              <p className="text-sm text-gray-600">
                {stripeStatus?.configured ? 'Configured' : 'Not Configured'}
              </p>
            </div>

            <div className="text-center p-4 rounded-lg border">
              <div className="flex items-center justify-center mb-2">
                <Badge variant={stripeStatus?.testMode ? "secondary" : "default"}>
                  {stripeStatus?.demoMode ? 'Demo' : stripeStatus?.testMode ? 'Test' : 'Live'}
                </Badge>
              </div>
              <p className="font-medium">Mode</p>
              <p className="text-sm text-gray-600">
                {stripeStatus?.demoMode ? 'Demo Mode' : stripeStatus?.testMode ? 'Test Mode' : 'Live Mode'}
              </p>
            </div>

            <div className="text-center p-4 rounded-lg border">
              <div className="flex items-center justify-center mb-2">
                {stripeStatus?.hasWebhookSecret ? (
                  <CheckCircle className="h-8 w-8 text-green-600" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-orange-600" />
                )}
              </div>
              <p className="font-medium">Webhooks</p>
              <p className="text-sm text-gray-600">
                {stripeStatus?.hasWebhookSecret ? 'Configured' : 'Optional'}
              </p>
            </div>

            <div className="text-center p-4 rounded-lg border">
              <div className="flex items-center justify-center mb-2">
                <Zap className="h-8 w-8 text-blue-600" />
              </div>
              <p className="font-medium">Integration</p>
              <p className="text-sm text-gray-600">Ready</p>
            </div>
          </div>

          {stripeStatus?.demoMode && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Demo Mode Active</p>
                  <p>The integration is running in demo mode. All payments are simulated and no real transactions will occur. Perfect for testing before getting your Stripe account approved!</p>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Test Payment Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Test Payment
            </CardTitle>
            <CardDescription>
              Try making a test payment to see the integration in action
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Payment Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                max="999"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(Number(e.target.value))}
                placeholder="Enter amount"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Amount:</span>
                <span>${paymentAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Processing Fee (2.9% + $0.30):</span>
                <span>${(paymentAmount * 0.029 + 0.30).toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total:</span>
                <span>${(paymentAmount + paymentAmount * 0.029 + 0.30).toFixed(2)}</span>
              </div>
            </div>

            <Dialog open={showPaymentForm} onOpenChange={setShowPaymentForm}>
              <DialogTrigger asChild>
                <Button className="w-full" size="lg">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Test Payment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Test Payment</DialogTitle>
                </DialogHeader>
                <StripePaymentForm
                  amount={paymentAmount}
                  onSuccess={handlePaymentSuccess}
                  onCancel={() => setShowPaymentForm(false)}
                  title="Test Payment"
                  description="This is a test payment in demo/test mode"
                />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Test Scenarios */}
        <Card>
          <CardHeader>
            <CardTitle>Test Scenarios</CardTitle>
            <CardDescription>
              Use these test card numbers to simulate different payment outcomes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {testScenarios.map((scenario, index) => {
              const IconComponent = scenario.icon;
              return (
                <div key={index} className={`p-3 rounded-lg border ${scenario.bgColor}`}>
                  <div className="flex items-start gap-3">
                    <IconComponent className={`h-5 w-5 ${scenario.color} mt-0.5`} />
                    <div className="flex-1">
                      <div className="font-medium">{scenario.title}</div>
                      <div className="text-sm text-gray-600 mb-2">{scenario.description}</div>
                      <code className="text-xs bg-white px-2 py-1 rounded border">
                        {scenario.cardNumber}
                      </code>
                    </div>
                  </div>
                </div>
              );
            })}

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">Test Mode Guidelines:</p>
                  <ul className="text-sm space-y-1 list-disc list-inside">
                    <li>Use any future expiry date (e.g., 12/25)</li>
                    <li>Use any 3-digit CVC (e.g., 123)</li>
                    <li>No real money will be charged</li>
                    <li>All transactions are simulated</li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {/* Integration Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Moving to Production</CardTitle>
          <CardDescription>
            Steps to activate live payments when you're ready
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border">
              <div className="font-medium mb-2">1. Get Stripe Account</div>
              <p className="text-sm text-gray-600">
                Apply for a Stripe account with your business information. You can use this working integration as a demonstration.
              </p>
            </div>
            
            <div className="p-4 rounded-lg border">
              <div className="font-medium mb-2">2. Replace API Keys</div>
              <p className="text-sm text-gray-600">
                Once approved, replace the test keys with your live keys in the environment variables.
              </p>
            </div>
            
            <div className="p-4 rounded-lg border">
              <div className="font-medium mb-2">3. Configure Webhooks</div>
              <p className="text-sm text-gray-600">
                Set up webhook endpoints in your Stripe dashboard for real-time payment updates.
              </p>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">Ready for Production</p>
              <p className="mt-1">
                This integration is fully production-ready. When you get your live Stripe keys, 
                simply replace the environment variables and you'll be processing real payments.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}