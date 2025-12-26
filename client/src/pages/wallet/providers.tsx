import React from 'react';
import SadminLayout from '@/components/layout/SadminLayout';
import WalletManagement from '@/components/admin/WalletManagement';

export default function ProviderWalletsPage() {
  return (
    <SadminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">eSIM Access Payments</h1>
        </div>
        
        <div className="grid gap-4">
          <WalletManagement defaultTab="provider" />
        </div>
      </div>
    </SadminLayout>
  );
}