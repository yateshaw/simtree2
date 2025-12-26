import React, { useState } from 'react';
import SadminLayout from '@/components/layout/SadminLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit, Globe, Server, Check, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface ESIMProvider {
  id: number;
  name: string;
  apiKey: string;
  baseUrl: string;
  description: string;
  isActive: boolean;
  supportedCountries: string[];
  status: 'online' | 'offline' | 'warning';
  lastChecked: string;
}

export default function ESIMProvidersPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<ESIMProvider | null>(null);
  
  // Fetch eSIM providers
  const { data: providers, isLoading } = useQuery({
    queryKey: ['/api/admin/esim/providers'],
    queryFn: async () => {
      try {
        const result = await apiRequest('/api/admin/esim/providers');
        if (result.success) {
          return result.data;
        }
        // Return placeholder data if API is not implemented yet
        return [
          {
            id: 1,
            name: 'eSIM Access',
            apiKey: '********',
            baseUrl: 'https://api.esimaccess.com',
            description: 'Primary eSIM provider with global coverage',
            isActive: true,
            supportedCountries: ['us', 'gb', 'ca', 'au', 'eu'],
            status: 'online',
            lastChecked: new Date().toISOString()
          }
        ];
      } catch (error) {
        console.error("Error fetching eSIM providers:", error);
        toast({
          title: "Error",
          description: "Failed to load eSIM providers. Please try again.",
          variant: "destructive",
        });
        return [];
      }
    }
  });

  const handleEditProvider = (provider: ESIMProvider) => {
    setCurrentProvider(provider);
    setIsEditDialogOpen(true);
  };

  // Handle status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800">
            <Check className="mr-1 h-3 w-3" /> Online
          </Badge>
        );
      case 'offline':
        return (
          <Badge variant="destructive">
            <X className="mr-1 h-3 w-3" /> Offline
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
            Warning
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            Unknown
          </Badge>
        );
    }
  };

  // Format the last checked date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Format countries list for display
  const formatCountries = (countries: string[]) => {
    if (!countries || countries.length === 0) return 'None';
    return countries.map(c => c.toUpperCase()).join(', ');
  };

  return (
    <SadminLayout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">eSIM Providers</h1>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Provider
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Active Providers</CardTitle>
            <CardDescription>
              Manage eSIM service providers and API connections
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Supported Countries</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Checked</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providers && providers.length > 0 ? (
                      providers.map((provider: ESIMProvider) => (
                        <TableRow key={provider.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <Server className="mr-2 h-4 w-4 text-gray-400" />
                              {provider.name}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {provider.description}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {provider.baseUrl}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <Globe className="mr-2 h-4 w-4 text-gray-400" />
                              {formatCountries(provider.supportedCountries)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(provider.status)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatDate(provider.lastChecked)}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleEditProvider(provider)}
                            >
                              <Edit className="mr-1 h-4 w-4" /> Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                          No eSIM providers found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Add Provider Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add eSIM Provider</DialogTitle>
              <DialogDescription>
                Configure a new eSIM service provider
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="provider-name" className="text-right">
                  Provider Name
                </Label>
                <Input
                  id="provider-name"
                  placeholder="e.g. eSIM Access"
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="api-key" className="text-right">
                  API Key
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="Your API key"
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="base-url" className="text-right">
                  Base URL
                </Label>
                <Input
                  id="base-url"
                  placeholder="e.g. https://api.provider.com"
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right">
                  Description
                </Label>
                <Input
                  id="description"
                  placeholder="Brief description"
                  className="col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button>Save Provider</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Edit Provider Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Provider</DialogTitle>
              <DialogDescription>
                Update eSIM provider configuration
              </DialogDescription>
            </DialogHeader>
            {currentProvider && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-name" className="text-right">
                    Provider Name
                  </Label>
                  <Input
                    id="edit-name"
                    defaultValue={currentProvider.name}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-api-key" className="text-right">
                    API Key
                  </Label>
                  <Input
                    id="edit-api-key"
                    type="password"
                    defaultValue={currentProvider.apiKey}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-url" className="text-right">
                    Base URL
                  </Label>
                  <Input
                    id="edit-url"
                    defaultValue={currentProvider.baseUrl}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-description" className="text-right">
                    Description
                  </Label>
                  <Input
                    id="edit-description"
                    defaultValue={currentProvider.description}
                    className="col-span-3"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button>Update Provider</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SadminLayout>
  );
}