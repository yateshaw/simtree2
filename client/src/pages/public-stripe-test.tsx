import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EnhancedStripeForm from '../components/stripe/EnhancedStripeForm';
import MinimalCardForm from '../components/stripe/MinimalCardForm';
import DirectStripeImplementation from '../components/stripe/DirectStripeImplementation';
import { Button } from '@/components/ui/button';

const PublicStripeTest: React.FC = () => {
  const [activeTab, setActiveTab] = useState("direct");
  
  return (
    <div className="container mx-auto max-w-3xl py-4 px-2 min-h-screen">
      <Card className="shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Stripe Payment Test</CardTitle>
          <CardDescription>
            Test the Stripe payment system with international card detection
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-md text-sm text-blue-700">
              <p className="font-medium mb-1">International Card Testing:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>For <strong>domestic US cards</strong>, use: 4242 4242 4242 4242</li>
                <li>For <strong>international cards</strong>, use brands like JCB, UnionPay, or Diners Club</li>
                <li>The system should detect card type and only show relevant fees</li>
              </ul>
            </div>
            
            <Tabs defaultValue="direct" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="direct">Direct Form</TabsTrigger>
                <TabsTrigger value="enhanced">Enhanced Form</TabsTrigger>
                <TabsTrigger value="minimal">Minimal Form</TabsTrigger>
              </TabsList>
              
              <TabsContent value="direct" className="mt-6">
                <div className="p-4 bg-green-50 border border-green-100 rounded-md mb-4 text-sm text-green-700">
                  This implementation uses the official Stripe Elements example code with minimal changes
                </div>
                <DirectStripeImplementation />
              </TabsContent>
              
              <TabsContent value="enhanced" className="mt-6">
                <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-md mb-4 text-sm text-yellow-700">
                  This implementation separates the card fields and uses advanced styling
                </div>
                <EnhancedStripeForm 
                  defaultAmount={100}
                  onSuccess={(id) => console.log('Payment successful:', id)}
                  onCancel={() => console.log('Payment cancelled')}
                />
              </TabsContent>
              
              <TabsContent value="minimal" className="mt-6">
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-md mb-4 text-sm text-blue-700">
                  This implementation uses a simplified single CardElement approach
                </div>
                <MinimalCardForm />
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center mt-6">
          <div className="bg-red-50 p-4 rounded-md w-full text-center text-red-600 border border-red-100">
            <p className="font-medium">Troubleshooting Stripe Elements</p>
            <p className="text-sm mt-1">
              If you can't type in the card fields, try the Direct Form implementation which uses the official Stripe example code
            </p>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default PublicStripeTest;