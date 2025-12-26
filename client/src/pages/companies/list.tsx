import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import SadminLayout from '@/components/layout/SadminLayout';
import { useAuth } from '@/hooks/use-auth';
import { Building, Search, Filter, ExternalLink, Info, Globe, Users, Trash2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
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
import { CompanyDeleteDialog } from '@/components/admin/CompanyDeleteDialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// Import types
import type { Company, Employee } from '@shared/schema';

// Simple mapping of country codes to country names
const countryCodeMap: Record<string, string> = {
  'ar': 'Argentina',
  'us': 'United States',
  'ca': 'Canada',
  'mx': 'Mexico',
  'gb': 'United Kingdom',
  'br': 'Brazil',
  'de': 'Germany',
  'fr': 'France',
  'es': 'Spain',
  'it': 'Italy',
  'global': 'Global'
};

export default function CompaniesList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Company>>({});
  
  // Company deletion states
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isPasswordError, setIsPasswordError] = useState(false);
  const [isVerifyingWallet, setIsVerifyingWallet] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [hasWalletError, setHasWalletError] = useState(false);

  // Query client for mutations
  const queryClient = useQueryClient();

  // Fetch companies data
  const { data: companies, isLoading: companiesLoading, error: companiesError } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!user,
  });

  // Fetch employees count for each company
  const { data: employees, isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/admin/employees'],
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!user && !!companies,
  });

  // Calculate employees count per company
  const employeesCountByCompany = React.useMemo(() => {
    if (!employees) return {};
    
    return employees.reduce((acc, employee) => {
      acc[employee.companyId] = (acc[employee.companyId] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
  }, [employees]);

  // Show error toast if companies fetch fails
  useEffect(() => {
    if (companiesError) {
      toast({
        title: 'Error loading companies',
        description: 'Unable to load companies data. Please try again later.',
        variant: 'destructive',
      });
    }
  }, [companiesError, toast]);

  // Company update mutation
  const updateCompanyMutation = useMutation({
    mutationFn: async (updatedCompany: Partial<Company>) => {
      const response = await api.patch(`/api/admin/companies/${updatedCompany.id}`, updatedCompany);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Company updated",
        description: "Company information has been updated successfully",
        variant: "default",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
      
      // Update selected company with new data
      if (selectedCompany) {
        setSelectedCompany({
          ...selectedCompany,
          ...editForm
        });
      }
      
      setIsEditMode(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating company",
        description: error.message || "An error occurred while updating the company",
        variant: "destructive",
      });
    }
  });
  
  // Delete company mutation
  const deleteCompanyMutation = useMutation({
    mutationFn: async ({ companyId, password }: { companyId: number, password: string }) => {
      const response = await api.delete(`/api/admin/companies/${companyId}`, {
        data: { password }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/employees'] });
      setIsConfirmOpen(false);
      setCompanyToDelete(null);
      setAdminPassword('');
      setWalletBalance(null);
      toast({
        title: 'Company deleted',
        description: 'The company has been permanently deleted from the system.',
      });
    },
    onError: (error: any) => {
      console.error('Error deleting company:', error);
      if (error.response?.data?.message?.includes('password')) {
        setIsPasswordError(true);
      } else {
        toast({
          title: 'Deletion failed',
          description: error.response?.data?.message || 'There was an error deleting the company. Please try again.',
          variant: 'destructive',
        });
      }
    }
  });

  // Function to check company wallet balance
  const checkWalletBalance = async (companyId: number) => {
    setIsVerifyingWallet(true);
    setHasWalletError(false);
    
    try {
      const response = await api.get(`/api/admin/companies/${companyId}/wallet`);
      const balance = response.data.balance;
      setWalletBalance(balance);
      
      if (balance > 0) {
        toast({
          title: 'Wallet not empty',
          description: `The company wallet has ${balance.toFixed(2)} credits. Balance must be zero to delete.`,
          variant: 'destructive',
        });
      }
      
      return balance;
    } catch (error) {
      console.error('Error checking wallet balance:', error);
      setHasWalletError(true);
      toast({
        title: 'Balance check failed',
        description: 'Unable to verify company wallet balance. Please try again.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsVerifyingWallet(false);
    }
  };
  
  // Handle the company deletion process
  const handleDeleteCompany = async () => {
    if (!companyToDelete) return;
    
    // Check wallet balance first
    const balance = await checkWalletBalance(companyToDelete.id);
    
    // Only proceed if balance is 0
    if (balance === 0) {
      // Reset any previous password errors
      setIsPasswordError(false);
      
      // Execute the delete mutation with admin password
      deleteCompanyMutation.mutate({ 
        companyId: companyToDelete.id, 
        password: adminPassword 
      });
    }
  };

  // Open company details dialog
  const showCompanyDetails = (company: Company) => {
    setSelectedCompany(company);
    setIsDetailsOpen(true);
    // Reset edit mode when opening details
    setIsEditMode(false);
    setEditForm({});
  };
  
  // Start editing company
  const startEditingCompany = () => {
    if (selectedCompany) {
      setEditForm({...selectedCompany});
      setIsEditMode(true);
    }
  };
  
  // Handle form field changes
  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Save company updates
  const saveCompanyChanges = () => {
    if (selectedCompany && editForm) {
      updateCompanyMutation.mutate({
        id: selectedCompany.id,
        ...editForm
      });
    }
  };
  
  // Cancel editing
  const cancelEditing = () => {
    setIsEditMode(false);
    setEditForm({});
  };
  
  // Filter companies based on search term and status
  const filteredCompanies = React.useMemo(() => {
    if (!companies) return [];

    return companies.filter(company => {
      // Skip showing Simtree company (id = 1)
      if (company.id === 1) return false;
      
      // Apply text search
      const matchesSearch = searchTerm === '' || 
        company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (company.contactEmail && company.contactEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (company.industry && company.industry.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Apply status filter
      const matchesStatus = 
        statusFilter === 'all' || 
        (statusFilter === 'active' && company.active) || 
        (statusFilter === 'inactive' && !company.active);
      
      return matchesSearch && matchesStatus;
    });
  }, [companies, searchTerm, statusFilter]);

  // Display field value or fallback
  const displayValue = (value: string | null | undefined, fallback = 'N/A') => {
    return value || fallback;
  };

  // Get country name from code
  const getCountryName = (code: string | null | undefined) => {
    if (!code) return 'N/A';
    return countryCodeMap[code.toLowerCase()] || code;
  };

  return (
    <SadminLayout>
      <div className="container mx-auto py-6">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-2xl font-bold">Companies</CardTitle>
                  <CardDescription>
                    View and manage all companies in the platform
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-4 justify-between">
                  <div className="relative w-full sm:w-96">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                    <Input
                      type="search"
                      placeholder="Search companies..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-500" />
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">All Companies</SelectItem>
                          <SelectItem value="active">Active Only</SelectItem>
                          <SelectItem value="inactive">Inactive Only</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="text-sm text-gray-500">
                  Showing {filteredCompanies.length} companies
                </div>
                
                {companiesLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
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
                              #
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Company
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Country
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Industry
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Employees
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredCompanies.map((company, index) => (
                            <tr key={company.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">
                                  {index + 1}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10 rounded-md bg-blue-100 flex items-center justify-center text-blue-700">
                                    <Building className="h-5 w-5" />
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-medium text-gray-900">
                                      {company.name}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {company.contactEmail}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">
                                  {company.country 
                                    ? (countryCodeMap[company.country.toLowerCase()] || company.country) 
                                    : 'N/A'
                                  }
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{company.industry || 'N/A'}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Badge variant={company.active ? "default" : "destructive"} className={company.active ? "bg-green-100 text-green-800 hover:bg-green-200" : ""}>
                                  {company.active ? 'Active' : 'Inactive'}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {employeesLoading ? (
                                  <Skeleton className="h-4 w-8" />
                                ) : (
                                  employeesCountByCompany[company.id] || 0
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex space-x-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => showCompanyDetails(company)}
                                    className="flex items-center"
                                  >
                                    <Info className="h-4 w-4 mr-1" />
                                    View Details
                                  </Button>
                                  {/* Avoid deleting your own company (Simtree) */}
                                  {company.id !== 1 && (
                                    <Button 
                                      variant="destructive" 
                                      size="sm" 
                                      onClick={() => {
                                        setCompanyToDelete(company);
                                        setIsConfirmOpen(true);
                                      }}
                                      className="flex items-center"
                                    >
                                      <Trash2 className="h-4 w-4 mr-1" />
                                      Delete
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Company Details Dialog */}
        <Dialog open={isDetailsOpen} onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) {
            setIsEditMode(false);
            setEditForm({});
          }
        }}>
          <DialogContent className="max-w-2xl p-6">
            {selectedCompany && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Building className="h-5 w-5 text-blue-600 mr-2" />
                    <DialogTitle className="text-lg font-medium">Company Details</DialogTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditMode ? (
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={cancelEditing}
                        >
                          Cancel
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={saveCompanyChanges}
                          disabled={updateCompanyMutation.isPending}
                        >
                          {updateCompanyMutation.isPending ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={startEditingCompany}
                        className="flex items-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Edit
                      </Button>
                    )}
                    <DialogClose />
                  </div>
                </div>
                <DialogDescription className="text-gray-500 mt-1">
                  {isEditMode 
                    ? 'Edit company information below' 
                    : 'View detailed information about this company'
                  }
                </DialogDescription>
                
                <div className="mt-6">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">
                      {isEditMode ? (
                        <Input 
                          name="name"
                          value={editForm.name || ''}
                          onChange={handleEditFormChange}
                          className="font-semibold text-lg"
                        />
                      ) : (
                        selectedCompany.name
                      )}
                    </h2>
                    {selectedCompany.verified && (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Verified</Badge>
                    )}
                  </div>
                  
                  {/* Company Information */}
                  <div className="mt-6">
                    <h3 className="flex items-center text-blue-600 font-medium mb-4">
                      <Building className="h-4 w-4 mr-2" />
                      Company Information
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">COMPANY TYPE</p>
                        {isEditMode ? (
                          <Select 
                            name="entityType" 
                            value={editForm.entityType || ''} 
                            onValueChange={(value) => {
                              setEditForm(prev => ({...prev, entityType: value}));
                            }}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select company type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="corporation">Corporation</SelectItem>
                              <SelectItem value="llc">LLC</SelectItem>
                              <SelectItem value="partnership">Partnership</SelectItem>
                              <SelectItem value="sole_proprietorship">Sole Proprietorship</SelectItem>
                              <SelectItem value="nonprofit">Non-Profit</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="mt-1 capitalize">
                            {selectedCompany.entityType || 'N/A'}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">COUNTRY</p>
                        {isEditMode ? (
                          <Input 
                            name="country"
                            value={editForm.country || ''}
                            onChange={handleEditFormChange}
                            className="mt-1"
                          />
                        ) : (
                          <p className="mt-1">
                            {getCountryName(selectedCompany.country)}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">TAX ID</p>
                        {isEditMode ? (
                          <Input 
                            name="taxNumber"
                            value={editForm.taxNumber || ''}
                            onChange={handleEditFormChange}
                            className="mt-1"
                          />
                        ) : (
                          <p className="mt-1">
                            {selectedCompany.taxNumber || 'N/A'}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">INDUSTRY</p>
                        {isEditMode ? (
                          <Input 
                            name="industry"
                            value={editForm.industry || ''}
                            onChange={handleEditFormChange}
                            className="mt-1"
                          />
                        ) : (
                          <p className="mt-1">
                            {selectedCompany.industry || 'N/A'}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">ADDRESS</p>
                        {isEditMode ? (
                          <Input 
                            name="address"
                            value={editForm.address || ''}
                            onChange={handleEditFormChange}
                            className="mt-1"
                          />
                        ) : (
                          <p className="mt-1">
                            {selectedCompany.address || 'N/A'}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">WEBSITE</p>
                        {isEditMode ? (
                          <Input 
                            name="website"
                            value={editForm.website || ''}
                            onChange={handleEditFormChange}
                            className="mt-1"
                          />
                        ) : (
                          selectedCompany.website ? (
                            <a 
                              href={selectedCompany.website} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="mt-1 flex items-center text-blue-600 hover:underline"
                            >
                              <Globe className="w-3.5 h-3.5 mr-1" />
                              {selectedCompany.website}
                            </a>
                          ) : (
                            <p className="mt-1 flex items-center text-gray-500">
                              <Globe className="w-3.5 h-3.5 mr-1 text-gray-400" />
                              Not provided
                            </p>
                          )
                        )}
                      </div>
                      
                      <div className="md:col-span-2">
                        <p className="text-xs font-medium text-blue-600 uppercase">DESCRIPTION</p>
                        {isEditMode ? (
                          <Textarea 
                            name="description"
                            value={editForm.description || ''}
                            onChange={handleEditFormChange}
                            className="mt-1 min-h-24"
                          />
                        ) : (
                          <p className="mt-1 text-gray-700">
                            {selectedCompany.description || 'No description available'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Contact Information */}
                  <div className="mt-8">
                    <h3 className="flex items-center text-blue-600 font-medium mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 1 0-16 0"></path></svg>
                      Contact Information
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">CONTACT PERSON</p>
                        {isEditMode ? (
                          <Input 
                            name="contactName"
                            value={editForm.contactName || ''}
                            onChange={handleEditFormChange}
                            className="mt-1"
                          />
                        ) : (
                          <p className="mt-1 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 text-gray-400"><circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 1 0-16 0"></path></svg>
                            {selectedCompany.contactName || 'N/A'}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">CONTACT PHONE</p>
                        {isEditMode ? (
                          <Input 
                            name="contactPhone"
                            value={editForm.contactPhone || ''}
                            onChange={handleEditFormChange}
                            className="mt-1"
                          />
                        ) : (
                          <p className="mt-1 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 text-gray-400"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                            {selectedCompany.contactPhone || 'N/A'}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">CONTACT EMAIL</p>
                        {isEditMode ? (
                          <Input 
                            name="contactEmail"
                            value={editForm.contactEmail || ''}
                            onChange={handleEditFormChange}
                            className="mt-1"
                            type="email"
                          />
                        ) : (
                          <a 
                            href={`mailto:${selectedCompany.contactEmail}`} 
                            className="mt-1 flex items-center text-blue-600 hover:underline"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5H18c2.2 0 4 1.8 4 4v8Z"></path><polyline points="15,9 10,13 5,9"></polyline></svg>
                            {selectedCompany.contactEmail}
                          </a>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">STATUS</p>
                        {isEditMode ? (
                          <div className="mt-2">
                            <Label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editForm.active ?? selectedCompany.active}
                                onChange={(e) => {
                                  setEditForm(prev => ({
                                    ...prev, 
                                    active: e.target.checked
                                  }));
                                }}
                                className="w-4 h-4 rounded border-gray-300"
                              />
                              Active
                            </Label>
                          </div>
                        ) : (
                          <div>
                            <Badge 
                              variant={selectedCompany.active ? "default" : "destructive"} 
                              className={selectedCompany.active ? "mt-1 bg-green-100 text-green-800" : "mt-1"}
                            >
                              {selectedCompany.active ? 'Active' : 'Inactive'}
                            </Badge>
                            {!selectedCompany.active && (
                              <p className="text-xs text-gray-500 mt-1">
                                Auto-deactivated due to inactivity
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase">LAST ACTIVITY</p>
                        <p className="mt-1 text-sm">
                          {selectedCompany.lastActivityDate 
                            ? new Date(selectedCompany.lastActivityDate).toLocaleDateString() 
                            : 'No activity recorded'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Companies inactive for 2+ months are auto-deactivated
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Employees Count */}
                  <div className="mt-8 flex items-center">
                    <Users className="h-4 w-4 text-blue-600 mr-2" />
                    <span className="text-sm font-medium">
                      Company has {employeesCountByCompany[selectedCompany.id] || 0} employees
                    </span>
                  </div>
                  
                  {/* Actions Section with Delete Button (for superadmin only) */}
                  {user?.isSuperAdmin && selectedCompany?.id !== 1 && (
                    <div className="mt-8 border-t pt-6">
                      <h3 className="text-red-600 font-medium mb-3 flex items-center">
                        <AlertCircle className="mr-2 h-5 w-5" /> 
                        Danger Zone
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Permanently delete this company and all associated data. This action cannot be undone.
                      </p>
                      <Button
                        variant="destructive"
                        className="flex items-center gap-2"
                        onClick={() => {
                          setIsDetailsOpen(false); // Close details dialog
                          setCompanyToDelete(selectedCompany); // Set company to delete
                          setIsConfirmOpen(true); // Open confirmation dialog
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Company
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
      {/* Company Deletion Dialog using the new component */}
      <CompanyDeleteDialog
        company={companyToDelete}
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setCompanyToDelete(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
          queryClient.invalidateQueries({ queryKey: ['/api/admin/employees'] });
        }}
      />
    </SadminLayout>
  );
}