import React from 'react';
import SadminLayout from '@/components/layout/SadminLayout';
import WalletManagement from '@/components/admin/WalletManagement';

export default function SimtreeWalletPage() {
  return (
    <SadminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Simtree Wallet</h1>
        </div>
        
        <div className="grid gap-4">
          <WalletManagement defaultTab="simtree" />
        </div>
      </div>
    </SadminLayout>
  );
}