import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: number;
  username: string;
  role: string;
  email: string;
  companyId?: number;
}

interface AuthResponse {
  success: boolean;
  user: User;
}

interface RegisterData {
  username: string;
  password: string;
  companyName: string;
}

interface AuthContext {
  user: User | null;
  isLoading: boolean;
  needsCompleteProfile: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoggedIn: boolean;
  loginMutation: ReturnType<typeof useMutation<AuthResponse, Error, { username: string; password: string }>>;
  logoutMutation: ReturnType<typeof useMutation<void, Error, void>>;
  registerMutation: ReturnType<typeof useMutation<AuthResponse, Error, RegisterData>>;
}

const AuthContext = createContext<AuthContext | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const queryClient = useQueryClient();

  const { data, isLoading: queryIsLoading, refetch } = useQuery({
    queryKey: ["/api/auth/status"],
    queryFn: async () => {
      try {
        const response = await apiRequest<{ success: boolean; authenticated: boolean; user: User | null; needsCompleteProfile?: boolean }>("/api/auth/status");
        return response;
      } catch (error) {
        // Only log critical auth errors
        console.error("Auth check failed");
        return { success: false, authenticated: false, user: null };
      }
    },
    retry: false,
    refetchOnWindowFocus: false, // Disable refetch on window focus to improve performance
    refetchOnReconnect: false,    // Disable refetch on reconnect
    staleTime: 5 * 60 * 1000,     // Cache for 5 minutes
    gcTime: 10 * 60 * 1000        // Keep in garbage collection for 10 minutes
  });

  useEffect(() => {
    if (data) {
      setIsLoggedIn(data.authenticated);
      setUser(data.user);
      setIsInitialized(true);
    }
  }, [data]);

  // Keep loading state true until both query is done AND state is hydrated
  const isLoading = queryIsLoading || !isInitialized;

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const response = await apiRequest<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.success && data.user) {
        setUser(data.user);
        setIsLoggedIn(true);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/status"] });
      }
    },
    onError: (error) => {
      setUser(null);
      setIsLoggedIn(false);
      throw error;
    }
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const response = await apiRequest<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.success && data.user) {
        setUser(data.user);
        setIsLoggedIn(true);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/status"] });
      }
    },
    onError: (error) => {
      setUser(null);
      setIsLoggedIn(false);
      throw error;
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/auth/logout", {
        method: "POST",
      });
    },
    onSuccess: () => {
      // Clear state immediately
      setUser(null);
      setIsLoggedIn(false);
      // Set the cache directly instead of invalidating to avoid refetch delay
      queryClient.setQueryData(["/api/auth/status"], { 
        success: true, 
        authenticated: false, 
        user: null,
        needsCompleteProfile: false
      });
      // Clear all cached queries to ensure fresh data on next login
      queryClient.clear();
      // Navigate immediately to auth page
      window.location.href = '/auth';
    },
  });

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        needsCompleteProfile: data?.needsCompleteProfile || false,
        login,
        logout,
        isLoggedIn,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};