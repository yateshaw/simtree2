import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  CheckCircle2, 
  XCircle, 
  Building,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Trash2,
  AlertTriangle,
  Loader2
} from "lucide-react";
import CompanyDetailsDialog from "./CompanyDetailsDialog";
import { Dialog } from "@/components/ui/dialog";
import { format } from "date-fns";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export type ClientWithCompany = User & {
  company?: {
    id: number;
    name?: string;
    companyName?: string;
    taxNumber?: string;
    address?: string;
    country?: string;
    entityType?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    industry?: string;
    website?: string;
    verified?: boolean;
    description?: string;
    active?: boolean;
    lastActivityDate?: string | Date;
  };
  // Additional fields that may come from the backend
  companyId?: number;
  companyName?: string;
  companyTaxNumber?: string;
  companyAddress?: string;
  companyCountry?: string;
  companyEntityType?: string;
  companyContactName?: string;
  companyContactPhone?: string;
  companyContactEmail?: string;
  companyIndustry?: string;
  companyWebsite?: string;
};

export default function ClientsTable() {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<ClientWithCompany | null>(null);
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clients, isLoading, refetch } = useQuery<ClientWithCompany[]>({
    queryKey: ["/api/admin/clients"],
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 5 * 60 * 1000, // 5 minutes - use SSE for real-time updates
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ companyId, password }: { companyId: number, password: string }) => {
      const response = await fetch(`/api/admin/companies/${companyId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete company');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Company Deleted",
        description: "The company and associated data has been completely deleted.",
      });

      setIsConfirmOpen(false);
      setCompanyToDelete(null);
      setPassword("");
      setIsDeleting(false);

      // Clear all query caches to ensure fresh data is loaded from the server
      queryClient.clear();

      // Invalidate all related caches to completely refresh the UI after company deletion
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/esim/purchased"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });

      // Force immediate refetch of critical data
      refetch();

      // Force multiple refetches after delays to ensure the backend has processed the deletion fully
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["/api/admin/clients"] });
      }, 500);

      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["/api/admin/clients"] });
        refetch();
      }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete company. Please check your password and try again.",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  });

  const userDeleteMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: number, password: string }) => {
      if (import.meta.env.DEV) { console.log(`Attempting to delete user with ID: ${userId}`); }

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
      });

      if (import.meta.env.DEV) { console.log(`Delete user response status: ${response.status}`); }

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error deleting user:', errorData);
        throw new Error(errorData.error || 'Failed to delete user account');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account Deleted",
        description: "The user account has been completely deleted.",
      });

      setIsConfirmOpen(false);
      setCompanyToDelete(null);
      setPassword("");
      setIsDeleting(false);

      // Clear all query caches to ensure fresh data is loaded from the server
      queryClient.clear();

      // Invalidate all related caches to completely refresh the UI
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/esim/purchased"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });

      // Force immediate refetch of critical data
      refetch();

      // Force multiple refetches after delays to ensure the backend has processed the deletion fully
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["/api/admin/clients"] });
      }, 500);

      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["/api/admin/clients"] });
        refetch();
      }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete user account. Please check your password and try again.",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  });

  const handleDeleteClick = (client: ClientWithCompany) => {
    setCompanyToDelete(client);
    setIsConfirmOpen(true);
    setPassword("");
  };

  const handleConfirmDelete = () => {
    if (!companyToDelete || !password) return;

    setIsDeleting(true);

    if (companyToDelete.company) {
      // Delete company
      deleteMutation.mutate({ 
        companyId: companyToDelete.company.id, 
        password 
      });
    } else {
      // Delete user account
      userDeleteMutation.mutate({
        userId: companyToDelete.id,
        password
      });
    }
  };

  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithCompany | null>(null);

  const columns = [
    {
      key: "company",
      label: "Company",
      render: (client: ClientWithCompany) => {
        if (client.company) {
          return (
            <HoverCard>
              <HoverCardTrigger asChild>
                <Button variant="link" className="p-0 h-auto font-medium">
                  <Building className="h-4 w-4 mr-1" />
                  {client.company.companyName || client.company.name || "Unknown Company"}
                </Button>
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1">
                    <Building className="h-4 w-4" />
                    {client.company.companyName || client.company.name}
                  </h4>
                  <div className="text-xs space-y-1">
                    {(client.company.address || client.company.country) && (
                      <p className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {client.company.address}{client.company.country ? `, ${client.company.country}` : ''}
                      </p>
                    )}
                    {client.company.contactPhone && (
                      <p className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {client.company.contactPhone}
                      </p>
                    )}
                    {client.company.contactEmail && (
                      <p className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {client.company.contactEmail}
                      </p>
                    )}
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          );
        }
        return <span className="text-muted-foreground text-xs">No company data</span>;
      },
    },
    {
      key: "admin",
      label: "Admin Account",
      render: (client: ClientWithCompany) => (
        <div className="flex flex-col">
          <span className="font-medium">{client.username}</span>
          <span className="text-xs text-muted-foreground">{client.email}</span>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (client: ClientWithCompany) => (
        <div className="flex items-center gap-1">
          {client.company && client.company.verified ? (
            <Badge variant="secondary" className="gap-1 font-normal bg-green-100 text-green-800 hover:bg-green-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Verified
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1 font-normal">
              <XCircle className="h-3.5 w-3.5" />
              Unverified
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Registered",
      render: (client: ClientWithCompany) => (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {format(new Date(client.createdAt), "MMM d, yyyy")}
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (client: ClientWithCompany) => {
        // Check if this is the sadmin user or Semtree company
        const isSadminOrSemtree = 
          client.username === "sadmin" || 
          (client.company && client.company.name === "Semtree");

        return (
          <div className="flex items-center justify-end gap-2">
            {client.company && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedClient(client);
                    setShowDetailsDialog(true);
                  }}
                  className="h-8 px-2"
                >
                  Details
                </Button>

                {/* Do not show delete button for Semtree company or sadmin user */}
                {!isSadminOrSemtree && (
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleDeleteClick(client)}
                    className="h-8 px-2"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete Company
                  </Button>
                )}
              </>
            )}

            {/* Add delete button for all users without companies, except sadmin */}
            {!client.company && !isSadminOrSemtree && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => handleDeleteClick(client)}
                className="h-8 px-2"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Account
              </Button>
            )}
          </div>
        );
      }
    },
  ];

  if (isLoading) {
    return <div className="py-10 text-center text-muted-foreground">Loading company data...</div>;
  }

  // Custom Row Class Callback for the DataTable
  const getRowClassName = (client: ClientWithCompany) => {
    // Check if this is the admin of Semtree company (sadmin)
    const isSemtreeAdmin = 
      client.username === "sadmin" || 
      (client.company && client.company.name === "Semtree");

    // Return special styling for Semtree admin
    if (isSemtreeAdmin) {
      return "bg-green-100/80";
    }

    // Default row styling
    return "";
  };

  return (
    <div className="space-y-4">
      <DataTable
        data={clients || []}
        columns={columns}
        getRowClassName={getRowClassName}
      />
      
      <CompanyDetailsDialog 
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        client={selectedClient}
      />

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {companyToDelete?.company ? 'Delete Company' : 'Delete Account'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div>
                {companyToDelete?.company ? (
                  // Company deletion content
                  <div className="space-y-3">
                    <span className="block">
                      You are about to permanently delete <strong>{companyToDelete?.company?.name || companyToDelete?.company?.companyName}</strong> and all associated data.
                    </span>
                    <div className="p-3 border border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 rounded-md">
                      <div className="flex items-center text-amber-600 dark:text-amber-500 font-medium">
                        <AlertTriangle className="h-5 w-5 mr-2" />
                        Warning
                      </div>
                      <span className="block text-sm mt-1 text-amber-700 dark:text-amber-400">
                        This will permanently delete:
                      </span>
                      <ul className="text-sm mt-2 list-disc list-inside text-amber-700 dark:text-amber-400 space-y-1">
                        <li>Company profile and admin account</li>
                        <li>All employee accounts</li>
                        <li>Wallet balance and transactions</li>
                        <li>All eSIM plans and history</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  // User account deletion content
                  <div className="space-y-3">
                    <span className="block">
                      You are about to permanently delete user account <strong>{companyToDelete?.username}</strong> (email: {companyToDelete?.email}).
                    </span>
                    <div className="p-3 border border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 rounded-md">
                      <div className="flex items-center text-amber-600 dark:text-amber-500 font-medium">
                        <AlertTriangle className="h-5 w-5 mr-2" />
                        Warning
                      </div>
                      <span className="block text-sm mt-1 text-amber-700 dark:text-amber-400">
                        This action cannot be undone.
                      </span>
                    </div>
                  </div>
                )}
                <div className="mt-4 space-y-3">
                  <span className="block text-sm font-medium">Enter your password to confirm deletion:</span>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!password || isDeleting}
            >
              {isDeleting ? (
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> 
                  <span>Deleting...</span>
                </div>
              ) : (
                companyToDelete?.company ? 'Delete Company' : 'Delete Account'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}