import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth.tsx";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";

const loginSchema = z.object({
  username: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

// Add custom interface to ensure we don't have LSP type errors
interface LoginResponse {
  success: boolean;
  user?: {
    id: number;
    username: string;
    role: string;
    email: string;
    companyId?: number;
  };
}

type LoginData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { loginMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginData) => {
    try {
      // Simple login attempt
      const result = await loginMutation.mutateAsync(data) as LoginResponse;
      if (!result.success) {
        toast({
          title: "Login failed",
          description: "Invalid credentials",
          variant: "destructive",
        });
        return;
      }
      
      // Successful login
      if (import.meta.env.DEV) { console.log("Login successful"); }
      setLocation('/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      
      toast({
        title: "Login failed",
        description: error?.response?.data?.error || error?.message || "Failed to connect to server",
        variant: "destructive",
      });
    }
  };

  const handleForgotPassword = () => {
    setLocation('/verify-reset');
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} type="text" placeholder="example@company.com" disabled={loginMutation.isPending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input 
                    type={showPassword ? "text" : "password"} 
                    {...field} 
                    disabled={loginMutation.isPending} 
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
              </FormControl>
              <div className="flex justify-end items-center w-full">
                <Button 
                  variant="link" 
                  className="px-0 font-normal text-xs text-muted-foreground hover:text-primary"
                  type="button"
                  onClick={handleForgotPassword}
                >
                  Forgot password?
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full bg-[#1d857c] hover:bg-[#1d857c]/90"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            "Connect"
          )}
        </Button>
      </form>
    </Form>
  );
}
