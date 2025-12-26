import { useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Define the form validation schema
const passwordResetSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' })
});

// Extract the type from the schema
type PasswordResetFormValues = z.infer<typeof passwordResetSchema>;

export default function VerifyReset() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  // Initialize react-hook-form with zod validation
  const form = useForm<PasswordResetFormValues>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      email: '',
    },
  });

  // Setup the mutation for password reset
  const resetMutation = useMutation({
    mutationFn: async (data: PasswordResetFormValues) => {
      return apiRequest('/api/auth/verify-reset', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    },
    onSuccess: (response) => {
      if (response.success) {
        setStatus('success');
        setMessage(response.message || 'Password reset email sent successfully!');
        
        // Redirect to login page after delay
        setTimeout(() => {
          setLocation('/auth?tab=login');
        }, 3000);
      } else {
        setStatus('error');
        setMessage(response.message || 'Password reset request failed.');
      }
    },
    onError: (error: any) => {
      setStatus('error');
      setMessage(error.response?.data?.message || error.message || 'Password reset request failed.');
      
      toast({
        variant: "destructive",
        title: "Reset Error",
        description: error.response?.data?.message || error.message || 'Failed to request password reset.'
      });
    }
  });

  // Form submission handler
  const onSubmit = (data: PasswordResetFormValues) => {
    setStatus('idle');
    setMessage('');
    resetMutation.mutate(data);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset Your Password</CardTitle>
          <CardDescription>
            Enter your email address and we'll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'success' && (
            <Alert className="mb-4 bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Email Sent</AlertTitle>
              <AlertDescription className="text-green-700">
                {message}
              </AlertDescription>
            </Alert>
          )}
          
          {status === 'error' && (
            <Alert className="mb-4 bg-red-50 border-red-200" variant="destructive">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800">Error</AlertTitle>
              <AlertDescription className="text-red-700">
                {message}
              </AlertDescription>
            </Alert>
          )}
          
          {status !== 'success' && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Enter your email address" {...field} />
                      </FormControl>
                      <FormDescription>
                        We'll send a password reset link to this email address
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending ? 'Sending Reset Link...' : 'Reset Password'}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => setLocation('/auth')}>
            Back to Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}