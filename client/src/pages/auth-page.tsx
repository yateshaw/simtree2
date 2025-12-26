import { useAuth } from "@/hooks/use-auth.tsx";
import { Redirect } from "wouter";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { RegisterForm } from "@/components/RegisterForm";
import { LoginForm } from "@/components/LoginForm";
import { useEffect } from "react";

export default function AuthPage() {
  const { user, isLoading } = useAuth();
  
  // Don't redirect while checking auth status
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If user is already authenticated, redirect based on role or to the last visited page
  if (user) {
    // Check if we have a redirect path stored from a previous page visit
    const redirectPath = sessionStorage.getItem('redirectAfterLogin');
    
    if (redirectPath) {
      // Clear the stored path to prevent future unwanted redirects
      sessionStorage.removeItem('redirectAfterLogin');
      return <Redirect to={redirectPath} />;
    }
    
    // Otherwise redirect based on role
    if (user.role === 'superadmin') {
      return <Redirect to="/admin" />;
    }
    
    // Check if there was a last visited path before the refresh
    const lastPath = sessionStorage.getItem('lastPath');
    if (lastPath && lastPath !== '/auth') {
      return <Redirect to={lastPath} />;
    }
    
    // Default fallback
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#e8f8ef]/20">
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md p-6 shadow-lg">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-8 flex items-center justify-center">
              <img 
                src="/images/logoST.png" 
                alt="SIMTREE Logo" 
                className="h-32 w-auto max-w-[400px] object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
          </div>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <LoginForm />
            </TabsContent>
            <TabsContent value="register">
              <RegisterForm />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
      <div className="hidden lg:block relative overflow-hidden">
        {/* Background Image */}
        <div 
          className="absolute inset-0" 
          style={{ 
            backgroundImage: `url("/business-traveler.webp")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* Overlay to ensure text readability */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1d857c]/80 to-[#1d857c]/70 z-10" />
        <div className="relative z-20 flex flex-col justify-center h-full px-12 text-white">
          <h1 className="text-4xl font-bold mb-2">SIMTREE</h1>
          <h2 className="text-2xl font-semibold mb-6">Where Global Connectivity Takes Root</h2>
          <p className="text-xl leading-relaxed">
            Sow the seeds of success with SIMTREE's corporate global eSIMs—delivering unbeatable prices, 
            total control, and a connectivity experience that grows on you.
          </p>
        </div>
      </div>
    </div>
  );
}