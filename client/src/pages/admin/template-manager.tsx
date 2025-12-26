import React from "react";
import { useAuth } from "@/hooks/use-auth";
import SadminLayout from "@/components/layout/SadminLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail } from "lucide-react";
import { Link } from "wouter";
import TemplateManager from "@/components/admin/TemplateManager";

export default function TemplateManagerPage() {
  const { user } = useAuth();
  const isSadminUser = user?.username === 'sadmin' && user?.isSuperAdmin;
  
  // Only super admins can access template manager
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
            Template Manager
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
            <Mail size={20} />
            Advanced Template Management
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 p-0 overflow-hidden">
          <div className="p-6">
            <TemplateManager />
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