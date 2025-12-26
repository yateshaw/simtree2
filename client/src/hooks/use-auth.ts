import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import config from "@/lib/config";

interface User {
  id: number;
  username: string;
  email: string;
  role?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  companyId: number | null;
  isVerified: boolean;
  createdAt: Date;
}

interface AuthResponse {
  success: boolean;
  authenticated: boolean;
  user: User | null;
  needsCompleteProfile?: boolean; // Added to track if user needs to complete profile
  error?: string; // Added error property
}

interface LoginData {
  username: string;
  password: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  // Get environment information - we need to know if we're in production
  const isProduction = import.meta.env.MODE === 'production';
  
  // For sadmin emergency mode check - only in deployed production environment
  const emergencyMode = localStorage.getItem('sadmin_emergency_mode') === 'true';
  
  // Auth status query with special handling for sadmin in production
  const { data, isLoading } = useQuery<AuthResponse>({
    queryKey: ["/api/auth/status"],
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    gcTime: 0, // Don't cache auth status
    staleTime: 0, // Always refetch
    initialData: {
      success: true,
      authenticated: false,
      user: null
    },
    queryFn: async () => {
      // Special sadmin emergency mode for production environment
      if (isProduction && emergencyMode) {
        try {
          if (import.meta.env.DEV) { console.log("Using sadmin emergency mode for auth status check"); }
          const response = await fetch("/api/auth/status", {
            headers: {
              "X-Sadmin-Emergency-Check": "true"
            }
          });
          
          if (response.ok) {
            return response.json();
          }
        } catch (error) {
          console.error("Error in emergency mode auth check:", error);
        }
      }
      
      // Default auth status check
      const response = await fetch("/api/auth/status");
      return response.json();
    }
  });

  const loginMutation = useMutation({
    mutationFn: async (loginData: LoginData) => {
      if (import.meta.env.DEV) { console.log(`Attempting login for user: ${loginData.username}`); }
      
      // Simple standard authentication for all users including sadmin
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(loginData),
          headers: {
            "Content-Type": "application/json"
          }
        });
        
        // Check for HTML response (failure) and throw appropriate error
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
          console.error("Received HTML response instead of JSON");
          throw new Error("Login API returned HTML instead of JSON. API routing issue detected.");
        }
        
        if (!response.ok) {
          try {
            const errorData = await response.json();
            throw new Error(errorData.error || "Login failed");
          } catch (jsonError) {
            // If can't parse JSON, throw error with status
            throw new Error(`Login failed with status ${response.status}`);
          }
        }
        
        return await response.json();
      } catch (error) {
        console.error("Login error:", error);
        throw error;
      }
    },
    onSuccess: (data: AuthResponse) => {
      if (data.success && data.user) {
        // Log successful login for all users
        if (import.meta.env.DEV) { console.log("Login successful"); }
        
        // For sadmin users, ensure all properties are set correctly
        if (data.user.username === 'sadmin') {
          if (import.meta.env.DEV) { console.log("Sadmin login detected, verifying user data..."); }
          
          // Create a fixed sadmin user with all required properties
          const fixedSadminUser = {
            ...data.user,
            email: data.user.email || 'superadmin@esimplatform.com',
            isSuperAdmin: true,
            isAdmin: true,
            role: 'superadmin' as const
          };
          
          if (import.meta.env.DEV) { console.log("Enhanced sadmin user data:", fixedSadminUser); }
          
          // Directly set the user data with fixes to avoid flickering
          queryClient.setQueryData(["/api/auth/status"], {
            success: true,
            authenticated: true,
            user: fixedSadminUser,
            needsCompleteProfile: false
          });
          
          // Navigate to admin page without full page reload
          window.history.pushState({}, '', '/admin');
          
          return; // Skip the normal flow for sadmin
        }
        
        // For all other users, update auth status
        queryClient.setQueryData(["/api/auth/status"], {
          success: true,
          authenticated: true,
          user: data.user,
          needsCompleteProfile: data.needsCompleteProfile
        });
      } else {
        // Handle unsuccessful login
        console.error("Login unsuccessful:", data.error);
      }
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      // Handle login error
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Emit a global event to close all SSE connections before logout
      window.dispatchEvent(new CustomEvent('logout-starting'));
      
      // Small delay to ensure SSE connections have time to close
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await fetch("/api/auth/logout", {
        method: "POST"
      });
    },
    onSuccess: () => {
      // First clear all queries to prevent potential loops/conflicts
      queryClient.clear();
      
      // Then set the auth status to not authenticated
      queryClient.setQueryData(["/api/auth/status"], {
        success: true,
        authenticated: false,
        user: null
      });
      
      // Force refresh the page to ensure clean state
      window.location.href = config.getFullUrl("/auth");
    }
  });

  // Added simple logout function for direct use
  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return {
    user: data?.authenticated ? data.user : null,
    isLoading,
    needsCompleteProfile: data?.needsCompleteProfile || false,
    loginMutation,
    logoutMutation,
    logout,
  };
}