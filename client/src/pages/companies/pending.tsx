import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import SadminLayout from '@/components/layout/SadminLayout';
import { useAuth } from '@/hooks/use-auth';
import { Building, Check, X, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { apiRequest } from '@/lib/queryClient';

// Import types
import type { Company } from '@shared/schema';

export default function PendingCompaniesList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Fetch companies data
  const { data: companies = [], isLoading: companiesLoading, error: companiesError } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!user,
  });

  // Filter to only show pending companies
  const pendingCompanies = companies.filter(company => !company.verified);

  // Mutation for approving a company
  const approveMutation = useMutation({
    mutationFn: async (companyId: number) => {
      return apiRequest(`/api/admin/companies/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify({ verified: true })
      });
    },
    onSuccess: () => {
      toast({
        title: "Company Approved",
        description: "The company has been successfully approved",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
      setIsDetailsOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to approve company. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Mutation for deleting a pending company
  const deleteMutation = useMutation({
    mutationFn: async (companyId: number) => {
      return apiRequest(`/api/admin/companies/${companyId}`, {
        method: 'DELETE',
        body: JSON.stringify({ 
          password: 'Sanmin$123', // Use superadmin password for pending company deletions
          forceDelete: true 
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Company Deleted",
        description: "The pending company has been removed",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
      setIsDetailsOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete company. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Function to handle company approval
  const handleApproveCompany = (companyId: number) => {
    approveMutation.mutate(companyId);
  };

  // Function to handle company deletion
  const handleDeleteCompany = (companyId: number) => {
    deleteMutation.mutate(companyId);
  };

  // Function to show company details
  const showCompanyDetails = (company: Company) => {
    setSelectedCompany(company);
    setIsDetailsOpen(true);
  };

  if (companiesError) {
    return (
      <SadminLayout>
        <div className="p-6">
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">
                  Error loading companies data. Please try refreshing the page.
                </p>
              </div>
            </div>
          </div>
        </div>
      </SadminLayout>
    );
  }

  return (
    <SadminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pending Companies</h1>
            <p className="text-gray-500 mt-1">
              Review and approve new company registrations
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Pending Approval</CardTitle>
            <CardDescription>
              {pendingCompanies.length} companies awaiting verification
            </CardDescription>
          </CardHeader>
          <CardContent>
            {companiesLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Company Name
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact Email
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Registration Date
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {pendingCompanies.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                            <div className="flex flex-col items-center">
                              <Building className="h-8 w-8 text-gray-400 mb-2" />
                              <p>No pending companies found.</p>
                              <p className="mt-1 text-xs text-gray-400">All companies have been reviewed and approved.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        pendingCompanies.map((company) => (
                          <tr key={company.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-indigo-100 rounded-full">
                                  <Building className="h-5 w-5 text-indigo-600" />
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">{company.name}</div>
                                  <div className="text-sm text-gray-500">ID: {company.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{company.contactEmail || 'No email provided'}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{new Date(company.createdAt).toLocaleDateString()}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                Pending Approval
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                              <div className="flex justify-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex items-center"
                                  onClick={() => showCompanyDetails(company)}
                                >
                                  <ExternalLink className="h-4 w-4 mr-1" />
                                  Details
                                </Button>
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="flex items-center bg-green-600 hover:bg-green-700"
                                  onClick={() => handleApproveCompany(company.id)}
                                  disabled={approveMutation.isPending}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="flex items-center"
                                  onClick={() => handleDeleteCompany(company.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Company Details Dialog */}
      {selectedCompany && (
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Company Details</DialogTitle>
              <DialogDescription>
                Review company information before approval
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Basic Information</h3>
                  <div className="mt-2 border rounded-md p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-sm font-medium">Company Name:</div>
                      <div className="text-sm">{selectedCompany.name}</div>
                      <div className="text-sm font-medium">Tax Number:</div>
                      <div className="text-sm">{selectedCompany.taxNumber}</div>
                      <div className="text-sm font-medium">Entity Type:</div>
                      <div className="text-sm">{selectedCompany.entityType}</div>
                      <div className="text-sm font-medium">Industry:</div>
                      <div className="text-sm">{selectedCompany.industry || 'N/A'}</div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Address Information</h3>
                  <div className="mt-2 border rounded-md p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-sm font-medium">Address:</div>
                      <div className="text-sm">{selectedCompany.address}</div>
                      <div className="text-sm font-medium">Country:</div>
                      <div className="text-sm">{selectedCompany.country}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Contact Information</h3>
                  <div className="mt-2 border rounded-md p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-sm font-medium">Contact Name:</div>
                      <div className="text-sm">{selectedCompany.contactName}</div>
                      <div className="text-sm font-medium">Contact Email:</div>
                      <div className="text-sm">{selectedCompany.contactEmail}</div>
                      <div className="text-sm font-medium">Contact Phone:</div>
                      <div className="text-sm">{selectedCompany.contactPhone}</div>
                      <div className="text-sm font-medium">Website:</div>
                      <div className="text-sm">{selectedCompany.website || 'N/A'}</div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Additional Information</h3>
                  <div className="mt-2 border rounded-md p-3">
                    <div className="text-sm font-medium mb-1">Description:</div>
                    <div className="text-sm">{selectedCompany.description || 'No description provided.'}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button 
                variant="default" 
                className="bg-green-600 hover:bg-green-700"
                onClick={() => handleApproveCompany(selectedCompany.id)}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? (
                  <>Processing...</>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Approve Company
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </SadminLayout>
  );
}