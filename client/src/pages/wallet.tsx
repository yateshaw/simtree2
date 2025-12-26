
import WalletManager from "@/components/company/WalletManager";
import AdminWalletManager from "@/components/admin/AdminWalletManager";
import WalletManagement from "@/components/admin/WalletManagement";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function WalletPage() {
  const { user } = useAuth();
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 space-y-6 sm:space-y-8 pb-24">
        <div className="overflow-y-auto">
          {user?.role === "superadmin" ? <WalletManagement /> : <WalletManager />}
        </div>
      </div>
    </DashboardLayout>
  );
}
