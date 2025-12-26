import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, CreditCard, CheckCircle, Info, AlertCircle, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import StripePaymentForm from '@/components/stripe/StripePaymentForm';
import StripeSimplePayment from '@/components/stripe/StripeSimple';

const StripeTestPage: React.FC = () => {
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [amount, setAmount] = useState(10);
  const [paymentResult, setPaymentResult] = useState<any>(null);

  // Check Stripe configuration status  
  const { data: stripeStatus, isLoading } = useQuery({
    queryKey: ['/api/stripe/status'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Type the stripeStatus data
  const status = stripeStatus || {};

  const handlePaymentSuccess = (result: { paymentIntentId: string; transactionId: number }) => {
    setPaymentResult(result);
    setShowPaymentForm(false);
    setAmount(10); // Reset amount
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading Stripe configuration...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
            <Shield className="h-8 w-8 text-green-600" />
            PCI-Compliant Stripe Integration
          </h1>
          <p className="text-gray-600">
            Secure payment processing using Stripe Elements - no card data touches your server
          </p>
        </div>

        {/* Payment Success Alert */}
        {paymentResult && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium text-green-800">Payment Successful!</p>
                <p className="text-sm text-green-700">
                  Payment ID: <code className="bg-green-100 px-1 rounded">{paymentResult.paymentIntentId}</code>
                </p>
                <p className="text-sm text-green-700">
                  Transaction ID: <code className="bg-green-100 px-1 rounded">{paymentResult.transactionId}</code>
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="test" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="test">Test Payment</TabsTrigger>
            <TabsTrigger value="status">System Status</TabsTrigger>
            <TabsTrigger value="guide">Integration Guide</TabsTrigger>
          </TabsList>

          {/* Test Payment Tab */}
          <TabsContent value="test" className="space-y-4">
            {!showPaymentForm ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Test Wallet Top-Up
                  </CardTitle>
                  <CardDescription>
                    Test the PCI-compliant payment flow with Stripe test cards
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (USD)</Label>
                    <Input
                      id="amount"
                      type="number"
                      min="1"
                      max="1000"
                      value={amount}
                      onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                      placeholder="Enter amount"
                    />
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-start space-x-3">
                      <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-blue-900">Test Card Information</p>
                        <div className="space-y-1 text-xs text-blue-700">
                          <p><strong>Success:</strong> 4242 4242 4242 4242</p>
                          <p><strong>Declined:</strong> 4000 0000 0000 0002</p>
                          <p><strong>Insufficient Funds:</strong> 4000 0000 0000 9995</p>
                          <p>Use any future expiry date and any 3-digit CVC</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button 
                    onClick={() => setShowPaymentForm(true)}
                    className="w-full"
                    disabled={amount <= 0}
                  >
                    Add ${amount.toFixed(2)} to Wallet
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <StripeSimplePayment
                amount={amount}
                onSuccess={handlePaymentSuccess}
                onCancel={() => setShowPaymentForm(false)}
              />
            )}
          </TabsContent>

          {/* System Status Tab */}
          <TabsContent value="status" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Stripe Configuration Status</CardTitle>
                <CardDescription>
                  Current status of your Stripe integration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 rounded-lg border">
                    <div className="flex items-center justify-center mb-2">
                      {status.isConfigured ? (
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      ) : (
                        <AlertCircle className="h-8 w-8 text-red-600" />
                      )}
                    </div>
                    <p className="font-medium">Backend</p>
                    <p className="text-sm text-gray-600">
                      {status.isConfigured ? 'Connected' : 'Not Connected'}
                    </p>
                  </div>

                  <div className="text-center p-4 rounded-lg border">
                    <div className="flex items-center justify-center mb-2">
                      {status.hasPublishableKey ? (
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      ) : (
                        <AlertCircle className="h-8 w-8 text-red-600" />
                      )}
                    </div>
                    <p className="font-medium">Frontend</p>
                    <p className="text-sm text-gray-600">
                      {status.hasPublishableKey ? 'Connected' : 'Not Connected'}
                    </p>
                  </div>

                  <div className="text-center p-4 rounded-lg border">
                    <div className="flex items-center justify-center mb-2">
                      <Zap className="h-8 w-8 text-blue-600" />
                    </div>
                    <p className="font-medium">Mode</p>
                    <Badge variant={status.keyType === 'test' ? 'secondary' : 'default'}>
                      {status.keyType || 'Unknown'}
                    </Badge>
                  </div>
                </div>

                {status.demoMode && (
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
          </TabsContent>

          {/* Integration Guide Tab */}
          <TabsContent value="guide" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>PCI-Compliant Integration Architecture</CardTitle>
                <CardDescription>
                  How this integration ensures security and compliance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-green-600 font-bold text-sm">1</span>
                    </div>
                    <div>
                      <h4 className="font-medium">Frontend creates Payment Intent</h4>
                      <p className="text-sm text-gray-600">
                        Your frontend calls <code>/api/stripe/create-payment-intent</code> with the amount. 
                        No card data is involved at this step.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-green-600 font-bold text-sm">2</span>
                    </div>
                    <div>
                      <h4 className="font-medium">Stripe Elements handles card data</h4>
                      <p className="text-sm text-gray-600">
                        Card information is collected and processed entirely by Stripe's secure servers. 
                        Your server never sees or handles raw card data.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-green-600 font-bold text-sm">3</span>
                    </div>
                    <div>
                      <h4 className="font-medium">Payment confirmation</h4>
                      <p className="text-sm text-gray-600">
                        Your frontend calls <code>/api/stripe/confirm-payment</code> with only the 
                        Payment Intent ID to verify success and update the wallet.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="flex items-start space-x-3">
                    <Shield className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-900">PCI Compliance Achieved</p>
                      <p className="text-sm text-green-700 mt-1">
                        This architecture ensures your application never processes, stores, or transmits 
                        sensitive card data, maintaining PCI DSS compliance automatically.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium">Test Card Numbers</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <p><strong>Successful payments:</strong></p>
                      <code className="block bg-gray-100 p-2 rounded">4242 4242 4242 4242</code>
                      <code className="block bg-gray-100 p-2 rounded">4000 0566 5566 5556</code>
                    </div>
                    <div className="space-y-2">
                      <p><strong>Failed payments:</strong></p>
                      <code className="block bg-gray-100 p-2 rounded">4000 0000 0000 0002</code>
                      <code className="block bg-gray-100 p-2 rounded">4000 0000 0000 9995</code>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default StripeTestPage;