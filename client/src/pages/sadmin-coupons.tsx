import React from 'react';
import SadminLayout from "@/components/layout/SadminLayout";
import CouponManager from "@/components/admin/CouponManager";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, User } from "lucide-react";
import { useLocation } from "wouter";

// This is a special direct access page for sadmin to manage coupons
// Created specifically to overcome any authentication issues in production deployments

const SadminCouponsPage = () => {
  const [, setLocation] = useLocation();
  
  return (
    <SadminLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-amber-700">
              SADMIN COUPON MANAGEMENT
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setLocation('/admin')} className="flex items-center gap-2 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100">
              <User className="h-4 w-4" />
              Return to Dashboard
            </Button>
          </div>
        </div>

        {/* Coupon Management Card */}
        <Card className="shadow-lg border-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-50 pb-4">
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <Gift className="h-5 w-5" />
              Coupon Management
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <CouponManager />
          </CardContent>
        </Card>
      </div>
    </SadminLayout>
  );
};

export default SadminCouponsPage;