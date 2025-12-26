import { useAuth } from "@/hooks/use-auth.tsx";
import { Loader2 } from "lucide-react";
import { Redirect, Route, useLocation } from "wouter";
import React, { useEffect } from "react"; // Import React for component typing

export function ProtectedRoute({
  path,
  component: Component,
  requireRole,
}: {
  path: string;
  component: React.ComponentType<any>;
  requireRole?: string | string[]; // Allow an array of roles or a single role
}) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  // Store the current path in sessionStorage whenever it changes
  // This helps maintain the same page after a refresh
  useEffect(() => {
    if (!isLoading && user && location) {
      sessionStorage.setItem('lastPath', location);
    }
  }, [location, isLoading, user]);

  return (
    <Route path={path}>
      {(params) => {
        if (isLoading) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          );
        }

        // If no user is logged in, redirect to auth page
        if (!user) {
          // Before redirecting, save the current path for potential redirect back after login
          if (location !== '/auth') {
            sessionStorage.setItem('redirectAfterLogin', location);
          }
          return <Redirect to="/auth" />;
        }

        // Check for role-based access if required
        if (requireRole) {
          // Handle both single role string and array of roles
          const allowedRoles = Array.isArray(requireRole) ? requireRole : [requireRole];
          
          // Special case for sadmin user (should have role=superadmin)
          if (user.username === 'sadmin' && allowedRoles.includes('superadmin')) {
            if (import.meta.env.DEV) { console.log("Allowing sadmin user access to protected superadmin route"); }
            // Continue rendering the component for sadmin
          } 
          // Handle regular role check - consider both role property and isAdmin/isSuperAdmin flags
          else if (
            !user.role || 
            !allowedRoles.includes(user.role)
          ) {
            if (import.meta.env.DEV) { console.log("Access denied - user role:", user.role, "required roles:", allowedRoles); }
            
            // Special handling for superadmin routes
            if (allowedRoles.includes('superadmin') && user.isSuperAdmin) {
              if (import.meta.env.DEV) { console.log("Allowing superadmin access based on flag"); }
              // Continue to component
            }
            // Special handling for admin routes
            else if (allowedRoles.includes('admin') && user.isAdmin) {
              if (import.meta.env.DEV) { console.log("Allowing admin access based on flag"); }
              // Continue to component
            }
            else {
              return <Redirect to="/" />;
            }
          }
        }

        return <Component {...params} />;
      }}
    </Route>
  );
}