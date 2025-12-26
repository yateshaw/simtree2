import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, Mail } from "lucide-react";
import { useState } from "react";

// Registration form schema with email and company name
const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  companyName: z.string().min(2, "Company name must be at least 2 characters")
});

export function RegisterForm() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  // Create form with email and company name fields
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      companyName: ""
    }
  });
  
  const registerMutation = useMutation({
    mutationFn: async (values: z.infer<typeof registerSchema>) => {
      const response = await api.post("/api/auth/register", values);
      return response.data;
    },
    onSuccess: (data, variables) => {
      setSubmittedEmail(variables.email);
      setIsSuccess(true);
      toast({
        title: "Registration initiated",
        description: "A verification email has been sent to your email address. Please check your inbox to verify your account and set up your password. If you don't see it, check your spam or junk folder.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Registration failed",
        description: error.response?.data?.error || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: z.infer<typeof registerSchema>) {
    registerMutation.mutate(values);
  }

  // Show success message after successful registration
  if (isSuccess) {
    return (
      <div className="w-full max-w-md mx-auto">
        <Card className="border-2 border-green-200 bg-green-50/50 shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="mb-6">
              <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Initiated</h2>
            </div>
            
            <div className="space-y-4 text-left">
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <div className="flex items-start space-x-3">
                  <Mail className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      A verification email has been sent to your email address:
                    </p>
                    <p className="text-sm text-green-700 font-mono bg-green-50 px-2 py-1 rounded break-all">
                      {submittedEmail}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 text-sm text-gray-600 leading-relaxed">
              <p>Please check your inbox to verify your account and set up your password.</p>
              <p className="mt-2 text-xs text-gray-500">If you don't see the email, please check your spam or junk folder.</p>
            </div>

            <div className="mt-8 pt-6 border-t border-green-200">
              <Button 
                onClick={() => {
                  setIsSuccess(false);
                  form.reset();
                }}
                variant="outline"
                className="w-full border-green-300 text-green-700 hover:bg-green-50"
              >
                Register Another Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card className="border shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Register for an Account</CardTitle>
            <CardDescription>
              Enter your email to get started. After verification, you'll set your password and company profile.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="Enter your company name" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      The name of your business or organization.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Enter your email address" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      We'll send a verification link to this email to continue the registration process.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full mt-6 bg-[#1d857c] hover:bg-[#1d857c]/90"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending verification...
                  </>
                ) : (
                  'Continue with Registration'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}