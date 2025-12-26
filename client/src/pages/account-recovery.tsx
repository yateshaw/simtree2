import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { useLocation } from "wouter";

// Define schemas
const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type EmailFormValues = z.infer<typeof emailSchema>;

export default function AccountRecoveryPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState<{ resend: boolean; delete: boolean }>({
    resend: false,
    delete: false,
  });

  // Create form for email
  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: "",
    },
  });

  const handleResendVerification = async (values: EmailFormValues) => {
    try {
      setLoading({ ...loading, resend: true });
      const response = await api.post("/api/maintenance/resend-verification", values);
      
      toast({
        title: "Verification Email Sent",
        description: "Check your inbox for the verification email and follow the instructions.",
      });
      
      emailForm.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to send verification email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading({ ...loading, resend: false });
    }
  };

  const handleDeleteUnverifiedAccount = async (values: EmailFormValues) => {
    try {
      // Display a confirmation dialog
      if (!window.confirm(
        "Are you sure you want to delete your unverified account? You'll need to register again, but it will allow you to use this email address for a new registration."
      )) {
        return;
      }
      
      setLoading({ ...loading, delete: true });
      const response = await api.post("/api/maintenance/delete-unverified-user", values);
      
      toast({
        title: "Account Deleted",
        description: "Your unverified account has been deleted. You can now register again with this email.",
      });
      
      emailForm.reset();
      // Redirect to register page after a short delay
      setTimeout(() => {
        setLocation("/auth?tab=register");
      }, 2000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to delete account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading({ ...loading, delete: false });
    }
  };

  return (
    <div className="container flex items-center justify-center min-h-screen py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Account Recovery</CardTitle>
          <CardDescription>
            Having trouble with your account? Use these tools to help recover access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="resend" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="resend">Resend Verification</TabsTrigger>
              <TabsTrigger value="delete">Delete Unverified Account</TabsTrigger>
            </TabsList>
            
            <TabsContent value="resend">
              <div className="space-y-4 pt-4">
                <div className="text-sm text-muted-foreground">
                  If you didn't receive your verification email or it expired, enter your email address below to receive a new one.
                </div>
                
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(handleResendVerification)} className="space-y-4">
                    <FormField
                      control={emailForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Enter your email address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button type="submit" className="w-full" disabled={loading.resend}>
                      {loading.resend ? "Sending..." : "Resend Verification Email"}
                    </Button>
                  </form>
                </Form>
              </div>
            </TabsContent>
            
            <TabsContent value="delete">
              <div className="space-y-4 pt-4">
                <div className="text-sm text-muted-foreground">
                  <p>If you're getting an "Email already exists" error when registering, but never completed verification, you can delete your unverified account here.</p>
                  <p className="mt-2 font-semibold text-amber-600">Warning: This can only be used for unverified accounts and the action cannot be undone.</p>
                </div>
                
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(handleDeleteUnverifiedAccount)} className="space-y-4">
                    <FormField
                      control={emailForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Enter your email address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button type="submit" variant="destructive" className="w-full" disabled={loading.delete}>
                      {loading.delete ? "Deleting..." : "Delete Unverified Account"}
                    </Button>
                  </form>
                </Form>
              </div>
            </TabsContent>
          </Tabs>
          
          <div className="mt-6 text-center">
            <Button variant="link" onClick={() => setLocation("/auth")}>
              Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}