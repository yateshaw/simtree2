import React from "react";
import { useAuth } from "@/hooks/use-auth";
import SadminLayout from "@/components/layout/SadminLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function SystemStatusPage() {
  const { user } = useAuth();
  const isSadminUser = user?.username === 'sadmin' && user?.isSuperAdmin;
  
  // Only super admins can access maintenance page
  if (user && !user.isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[70vh]">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">You don't have permission to access this page.</p>
          <Link href="/admin">
            <Button variant="outline">Return to Dashboard</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const renderContent = () => (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:p-6 rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
            System Status
          </h1>
        </div>
        <Link href="/admin-maintenance">
          <Button variant="outline" className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Back to Maintenance
          </Button>
        </Link>
      </div>
      
      <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 pb-3">
          <CardTitle className="flex items-center gap-2 text-purple-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" x2="12" y1="16" y2="12"></line>
              <line x1="12" x2="12.01" y1="8" y2="8"></line>
            </svg>
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="text-sm font-medium mb-2">Application Version</h3>
              <p className="text-sm text-gray-600">1.0.0</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="text-sm font-medium mb-2">Environment</h3>
              <p className="text-sm text-gray-600">Production</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="text-sm font-medium mb-2">Last Maintenance</h3>
              <p className="text-sm text-gray-600">April 12, 2025</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return isSadminUser ? (
    <SadminLayout>
      {renderContent()}
    </SadminLayout>
  ) : (
    <DashboardLayout>
      {renderContent()}
    </DashboardLayout>
  );
}