import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { config } from '@/lib/config';

// Strong password schema with all required security measures
const passwordSchema = z.object({
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

interface SetPasswordProps {
  token?: string;
  userId?: string;
}

export default function SetPassword(props: SetPasswordProps) {
  const { toast } = useToast();
  const { loginMutation } = useAuth(); // Get login mutation from auth context
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const [token, setToken] = useState<string | null>(props.token || null);
  const [userId, setUserId] = useState<string | null>(props.userId || null);
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "success">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [hasCompanyId, setHasCompanyId] = useState<boolean | null>(null);

  // Extract token from URL - handle both path parameters and query parameters
  useEffect(() => {
    if (import.meta.env.DEV) { console.log("Current location:", location); }
    if (import.meta.env.DEV) { console.log("Props:", props); }
    
    // If we already have token and userId from props (path parameters), use them
    if (props.token && props.userId) {
      if (import.meta.env.DEV) { console.log("Using path parameters:", props.token, props.userId); }
      setToken(props.token);
      setUserId(props.userId);
      validateToken(props.token, props.userId);
      return;
    }
    
    // Try to extract from query string (backward compatibility)
    if (location.includes("?")) {
      try {
        const params = new URLSearchParams(location.split("?")[1]);
        if (import.meta.env.DEV) { console.log("URL params:", Object.fromEntries(params.entries())); }
        
        const tokenParam = params.get("token");
        const userIdParam = params.get("userId");
        
        if (import.meta.env.DEV) { console.log("Extracted token:", tokenParam); }
        if (import.meta.env.DEV) { console.log("Extracted userId:", userIdParam); }
        
        if (tokenParam && userIdParam) {
          setToken(tokenParam);
          setUserId(userIdParam);
          validateToken(tokenParam, userIdParam);
          return;
        }
      } catch (error) {
        console.error("Error processing URL parameters:", error);
      }
    }
    
    // If we reach here, we couldn't extract parameters from either path or query
    if (!token || !userId) {
      setStatus("invalid");
      setErrorMessage("Invalid password reset link. No parameters found. If you have the token and userId values, please enter them manually.");
    }
  }, [location, props.token, props.userId]);

  // Validate the token
  const validateToken = async (token: string, userId: string) => {
    try {
      if (import.meta.env.DEV) { console.log("Validating token:", token, "for userId:", userId); }
      const response = await api.get(`/api/auth/validate-reset-token?token=${token}&userId=${userId}`);
      if (import.meta.env.DEV) { console.log("Token validation response:", response.data); }
      
      if (response.data.valid) {
        setStatus("valid");
        // Store the user's email for automatic login later
        if (response.data.email) {
          setEmail(response.data.email);
        }
        
        // Check if this is a new user (no companyId) or an existing user (has companyId)
        // This helps us decide whether to redirect to profile completion or dashboard
        setHasCompanyId(response.data.companyId !== null);
        if (import.meta.env.DEV) { console.log("User has companyId:", response.data.companyId !== null); }
      } else {
        setStatus("invalid");
        setErrorMessage(response.data.message || "The password reset link is invalid or has expired.");
      }
    } catch (error: any) {
      console.error("Token validation error:", error);
      setStatus("invalid");
      setErrorMessage(error.response?.data?.message || "The password reset link is invalid or has expired.");
    }
  };

  // Create form with password fields
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: "",
      confirmPassword: ""
    }
  });

  // Set password mutation
  const setPasswordMutation = useMutation({
    mutationFn: async (values: { password: string }) => {
      const response = await api.post("/api/auth/set-password", {
        token,
        userId,
        password: values.password
      });
      return response.data;
    },
    onSuccess: (data) => {
      setStatus("success");
      toast({
        title: "Password set successfully",
        description: "Your password has been set. You will be automatically logged in.",
      });
      
      // Auto-login the user if we have their email
      if (email) {
        if (import.meta.env.DEV) { console.log("Auto-logging in user after password set with email:", email); }
        
        // Success message first
        toast({
          title: "Password set successfully",
          description: "You will be automatically logged in...",
        });

        // Attempt auto-login immediately
        if (import.meta.env.DEV) { console.log("Attempting auto-login with:", email); }
        
        loginMutation.mutate({
          username: email,
          password: form.getValues().password
        }, {
          onSuccess: (response) => {
            if (import.meta.env.DEV) { 
              console.log("Auto-login successful:", response); 
              console.log("needsCompleteProfile:", response.needsCompleteProfile);
              console.log("user.isSuperAdmin:", response.user?.isSuperAdmin);
            }
            
            // Always use the server's needsCompleteProfile flag for decision
            if (response.needsCompleteProfile) {
              console.log("Server says profile completion required - redirecting to /complete-profile");
              toast({
                title: "Welcome!",
                description: "Please complete your company profile to continue.",
              });
              // Redirect immediately
              window.location.href = config.getFullUrl("/complete-profile");
            } else {
              // Server says profile completion not needed
              console.log("Server says no profile completion needed - redirecting to dashboard");
              toast({
                title: "Welcome back!",
                description: "You have been logged in successfully.",
              });
              const targetUrl = response.user?.isSuperAdmin ? "/admin/dashboard" : "/dashboard";
              console.log("Redirecting to:", targetUrl);
              window.location.href = config.getFullUrl(targetUrl);
            }
          },
          onError: (error) => {
            console.error("Auto-login failed:", error);
            
            // Clear any existing auth state to ensure clean login
            localStorage.clear();
            sessionStorage.clear();
            
            toast({
              title: "Please log in manually",
              description: "Your password was set successfully. Use your email and new password to log in.",
              variant: "default",
            });
            
            // Redirect to login page after short delay for toast to be visible
            setTimeout(() => {
              setLocation("/auth");
            }, 500);
          }
        });
      } else {
        // Fall back to redirect to login if we don't have email
        toast({
          title: "Password set successfully",
          description: "Please log in with your email and new password.",
        });
        
        // Redirect quickly
        setTimeout(() => {
          setLocation("/auth?tab=login");
        }, 500);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to set password",
        description: error.response?.data?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: z.infer<typeof passwordSchema>) {
    setPasswordMutation.mutate({ password: values.password });
  }

  // Render loading state
  if (status === "loading") {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Set Your Password</CardTitle>
            <CardDescription>
              Validating your reset link...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Manual entry form for token and userId
  const ManualEntryForm = () => {
    const [manualToken, setManualToken] = useState("");
    const [manualUserId, setManualUserId] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleManualEntry = async () => {
      if (!manualToken || !manualUserId) {
        toast({
          title: "Missing Information",
          description: "Please enter both the token and user ID",
          variant: "destructive",
        });
        return;
      }

      setIsSubmitting(true);
      try {
        // Validate the token with the server
        await validateToken(manualToken, manualUserId);
        // Update the state values
        setToken(manualToken);
        setUserId(manualUserId);
      } catch (error) {
        console.error("Manual token validation error:", error);
        toast({
          title: "Validation Failed",
          description: "The token could not be validated. Please check your values.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="mt-6 border-t pt-6">
        <h3 className="text-lg font-medium mb-2">Enter Token Manually</h3>
        <p className="text-sm text-muted-foreground mb-4">
          If you have received a token and user ID in your email, you can enter them manually below:
        </p>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="manual-token">Token</Label>
            <Input 
              id="manual-token" 
              value={manualToken} 
              onChange={e => setManualToken(e.target.value)}
              placeholder="Enter the token from your email"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-userid">User ID</Label>
            <Input 
              id="manual-userid" 
              value={manualUserId} 
              onChange={e => setManualUserId(e.target.value)} 
              placeholder="Enter the user ID from your email"
            />
          </div>
          <Button 
            onClick={handleManualEntry} 
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating...
              </>
            ) : 'Validate and Proceed'}
          </Button>
        </div>
      </div>
    );
  };

  // Render invalid token state
  if (status === "invalid") {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>
              There was a problem with your password reset link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {errorMessage || "The link is invalid or has expired. Please request a new password reset link."}
              </AlertDescription>
            </Alert>
            
            <ManualEntryForm />

            <div className="mt-6">
              <Button 
                onClick={() => setLocation("/auth?tab=login")}
                variant="outline"
                className="w-full"
              >
                Return to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render success state
  if (status === "success") {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Password Set Successfully</CardTitle>
            <CardDescription>
              Your new password has been set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4 bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Success</AlertTitle>
              <AlertDescription className="text-green-700">
                {email 
                  ? (hasCompanyId 
                      ? "You are being automatically logged in and redirected to your dashboard."
                      : "You are being automatically logged in and redirected to complete your profile.")
                  : "You will be redirected to the login page shortly."}
              </AlertDescription>
            </Alert>
            <Button 
              onClick={() => email ? null : setLocation("/auth?tab=login")} 
              className="w-full"
              disabled={email ? true : false}
            >
              {email ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {email ? "Logging you in..." : "Go to Login"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render form for valid token
  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set Your Password</CardTitle>
          <CardDescription>
            Create a secure password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Create a secure password" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      Password must be at least 8 characters with uppercase letters, numbers and special characters.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Confirm your password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                className="w-full mt-6"
                disabled={setPasswordMutation.isPending}
              >
                {setPasswordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting password...
                  </>
                ) : (
                  'Set Password'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}