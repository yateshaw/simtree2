import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Settings, Server, Building2, Plus, RefreshCw, Edit2, Save, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import SadminLayout from '@/components/layout/SadminLayout';

interface SystemConfig {
  id: number;
  key: string;
  value: string;
  category: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CompanyConfig {
  id: number;
  companyId: number;
  key: string;
  value: string;
  category: string;
  description?: string;
  isActive: boolean;
  companyName: string;
  createdAt: string;
  updatedAt: string;
}

interface Company {
  id: number;
  name: string;
}

export default function ConfigurationPage() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingSystemConfig, setEditingSystemConfig] = useState<number | null>(null);
  const [editingCompanyConfig, setEditingCompanyConfig] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{[key: number]: {value: string, description?: string}}>({});
  const [newSystemConfig, setNewSystemConfig] = useState({
    key: '',
    value: '',
    category: 'general',
    description: ''
  });
  const [newCompanyConfig, setNewCompanyConfig] = useState({
    companyId: '',
    key: '',
    value: '',
    category: 'general',
    description: ''
  });

  // Fetch system configurations
  const { data: systemConfigs = [], isLoading: systemLoading } = useQuery<SystemConfig[]>({
    queryKey: ['/api/config/system'],
    select: (data: any) => data?.data || []
  });

  // Fetch company configurations
  const { data: companyConfigs = [], isLoading: companyLoading } = useQuery<CompanyConfig[]>({
    queryKey: ['/api/config/company'],
    select: (data: any) => data?.data || []
  });

  // Fetch companies for selection
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
    select: (data: any) => Array.isArray(data) ? data : []
  });

  // Mutation for system config
  const systemConfigMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/config/system', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/config/system'] });
      setNewSystemConfig({ key: '', value: '', category: 'general', description: '' });
      toast({ title: 'Success', description: 'System configuration updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update system configuration', variant: 'destructive' });
    }
  });

  // Mutation for company config
  const companyConfigMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/config/company', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/config/company'] });
      setNewCompanyConfig({ companyId: '', key: '', value: '', category: 'general', description: '' });
      toast({ title: 'Success', description: 'Company configuration updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update company configuration', variant: 'destructive' });
    }
  });

  // Clear cache mutation
  const clearCacheMutation = useMutation({
    mutationFn: () => apiRequest('/api/config/clear-cache', { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Configuration cache cleared' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to clear cache', variant: 'destructive' });
    }
  });

  // Update system config mutation
  const updateSystemConfigMutation = useMutation({
    mutationFn: (data: { id: number; value: string; description?: string }) => 
      apiRequest(`/api/config/system/${data.id}`, { 
        method: 'PUT', 
        body: JSON.stringify({ value: data.value, description: data.description }),
        headers: { 'Content-Type': 'application/json' }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/config/system'] });
      setEditingSystemConfig(null);
      setEditValues({});
      toast({ title: 'Success', description: 'Configuration updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update configuration', variant: 'destructive' });
    }
  });

  // Update company config mutation
  const updateCompanyConfigMutation = useMutation({
    mutationFn: (data: { id: number; value: string; description?: string }) => 
      apiRequest(`/api/config/company/${data.id}`, { 
        method: 'PUT', 
        body: JSON.stringify({ value: data.value, description: data.description }),
        headers: { 'Content-Type': 'application/json' }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/config/company'] });
      setEditingCompanyConfig(null);
      setEditValues({});
      toast({ title: 'Success', description: 'Configuration updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update configuration', variant: 'destructive' });
    }
  });

  const categories = [
    'all',
    'general',
    'email',
    'server',
    'business',
    'security',
    'api',
    'ui'
  ];

  const filteredSystemConfigs = selectedCategory === 'all' 
    ? systemConfigs 
    : systemConfigs.filter(config => config.category === selectedCategory);

  const filteredCompanyConfigs = selectedCategory === 'all'
    ? companyConfigs
    : companyConfigs.filter(config => config.category === selectedCategory);

  const handleSystemConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSystemConfig.key || !newSystemConfig.value) {
      toast({ title: 'Error', description: 'Key and value are required', variant: 'destructive' });
      return;
    }
    systemConfigMutation.mutate(newSystemConfig);
  };

  const handleCompanyConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyConfig.companyId || !newCompanyConfig.key || !newCompanyConfig.value) {
      toast({ title: 'Error', description: 'Company, key and value are required', variant: 'destructive' });
      return;
    }
    companyConfigMutation.mutate({
      ...newCompanyConfig,
      companyId: parseInt(newCompanyConfig.companyId)
    });
  };

  const handleEditSystemConfig = (config: SystemConfig) => {
    setEditingSystemConfig(config.id);
    setEditValues({
      [config.id]: {
        value: config.value,
        description: config.description || ''
      }
    });
  };

  const handleEditCompanyConfig = (config: CompanyConfig) => {
    setEditingCompanyConfig(config.id);
    setEditValues({
      [config.id]: {
        value: config.value,
        description: config.description || ''
      }
    });
  };

  const handleSaveSystemConfig = (configId: number) => {
    const editData = editValues[configId];
    if (editData) {
      updateSystemConfigMutation.mutate({
        id: configId,
        value: editData.value,
        description: editData.description
      });
    }
  };

  const handleSaveCompanyConfig = (configId: number) => {
    const editData = editValues[configId];
    if (editData) {
      updateCompanyConfigMutation.mutate({
        id: configId,
        value: editData.value,
        description: editData.description
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingSystemConfig(null);
    setEditingCompanyConfig(null);
    setEditValues({});
  };

  return (
    <SadminLayout>
      <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">System Configuration</h1>
              <p className="mt-2 text-lg text-gray-600">
                Manage dynamic system and company-specific configurations
              </p>
            </div>
            <Button 
              onClick={() => clearCacheMutation.mutate()}
              disabled={clearCacheMutation.isPending}
              variant="outline"
              size="lg"
            >
              <RefreshCw className={`h-5 w-5 mr-2 ${clearCacheMutation.isPending ? 'animate-spin' : ''}`} />
              Clear Cache
            </Button>
          </div>

          {/* Overview Card */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <AlertCircle className="h-6 w-6 text-blue-600" />
                Configuration Overview
              </CardTitle>
              <CardDescription className="text-base">
                Dynamic configuration system allows runtime changes without code deployment.
                System configs apply globally, while company configs override for specific companies.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-6 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">{systemConfigs.length}</div>
                  <div className="text-sm font-medium text-gray-600 mt-1">System Configurations</div>
                </div>
                <div className="text-center p-6 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">{companyConfigs.length}</div>
                  <div className="text-sm font-medium text-gray-600 mt-1">Company Configurations</div>
                </div>
                <div className="text-center p-6 bg-purple-50 rounded-lg">
                  <div className="text-3xl font-bold text-purple-600">{companies.length}</div>
                  <div className="text-sm font-medium text-gray-600 mt-1">Managed Companies</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Category Filter */}
          <Card className="bg-white shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Label htmlFor="category-filter" className="text-base font-medium">Filter by Category:</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category === 'all' ? 'All Categories' : category.charAt(0).toUpperCase() + category.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Main Configuration Tabs */}
          <Tabs defaultValue="system" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 h-14">
              <TabsTrigger value="system" className="flex items-center gap-2 text-base">
                <Server className="h-5 w-5" />
                System Configuration
              </TabsTrigger>
              <TabsTrigger value="company" className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5" />
                Company Configuration
              </TabsTrigger>
            </TabsList>

            <TabsContent value="system" className="space-y-6">
              {/* Add System Configuration */}
              <Card className="bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Add System Configuration</CardTitle>
                  <CardDescription className="text-base">
                    System-wide configuration values that apply to all companies unless overridden.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSystemConfigSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="sys-key" className="text-base font-medium">Configuration Key</Label>
                        <Input
                          id="sys-key"
                          value={newSystemConfig.key}
                          onChange={(e) => setNewSystemConfig(prev => ({ ...prev, key: e.target.value }))}
                          placeholder="e.g., email_sender, server_port"
                          required
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label htmlFor="sys-value" className="text-base font-medium">Value</Label>
                        <Input
                          id="sys-value"
                          value={newSystemConfig.value}
                          onChange={(e) => setNewSystemConfig(prev => ({ ...prev, value: e.target.value }))}
                          placeholder="Configuration value"
                          required
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label htmlFor="sys-category" className="text-base font-medium">Category</Label>
                        <Select
                          value={newSystemConfig.category}
                          onValueChange={(value) => setNewSystemConfig(prev => ({ ...prev, category: value }))}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.filter(c => c !== 'all').map(category => (
                              <SelectItem key={category} value={category}>
                                {category.charAt(0).toUpperCase() + category.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="sys-description" className="text-base font-medium">Description (Optional)</Label>
                        <Input
                          id="sys-description"
                          value={newSystemConfig.description}
                          onChange={(e) => setNewSystemConfig(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Brief description of this configuration"
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={systemConfigMutation.isPending} size="lg">
                      <Plus className="h-5 w-5 mr-2" />
                      {systemConfigMutation.isPending ? 'Adding...' : 'Add System Config'}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Current System Configurations */}
              <Card className="bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Current System Configurations</CardTitle>
                  <CardDescription className="text-base">
                    {filteredSystemConfigs.length} configuration{filteredSystemConfigs.length !== 1 ? 's' : ''} found
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {systemLoading ? (
                    <div className="text-center py-8">Loading system configurations...</div>
                  ) : filteredSystemConfigs.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      No system configurations found for the selected category.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredSystemConfigs.map((config) => (
                        <div key={config.id} className="border rounded-lg p-6 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between">
                            <div className="space-y-3 flex-1">
                              <div className="flex items-center gap-3">
                                <code className="bg-gray-100 px-3 py-1 rounded text-sm font-mono font-semibold">
                                  {config.key}
                                </code>
                                <Badge variant="secondary" className="text-xs">
                                  {config.category}
                                </Badge>
                              </div>
                              
                              {editingSystemConfig === config.id ? (
                                <div className="space-y-4">
                                  <div>
                                    <Label className="text-sm font-medium">Value</Label>
                                    <Input
                                      value={editValues[config.id]?.value || ''}
                                      onChange={(e) => setEditValues(prev => ({
                                        ...prev,
                                        [config.id]: { ...prev[config.id], value: e.target.value }
                                      }))}
                                      className="mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">Description</Label>
                                    <Input
                                      value={editValues[config.id]?.description || ''}
                                      onChange={(e) => setEditValues(prev => ({
                                        ...prev,
                                        [config.id]: { ...prev[config.id], description: e.target.value }
                                      }))}
                                      className="mt-1"
                                      placeholder="Optional description"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleSaveSystemConfig(config.id)}>
                                      <Save className="h-4 w-4 mr-1" />
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                                      <X className="h-4 w-4 mr-1" />
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="text-base">
                                    <span className="font-medium text-gray-700">Value:</span>{' '}
                                    <span className="font-mono bg-gray-50 px-2 py-1 rounded">{config.value}</span>
                                  </div>
                                  {config.description && (
                                    <div className="text-sm text-gray-600">
                                      <span className="font-medium">Description:</span> {config.description}
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-400">
                                    Last updated: {new Date(config.updatedAt).toLocaleString()}
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {editingSystemConfig !== config.id && (
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleEditSystemConfig(config)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="company" className="space-y-6">
              {/* Add Company Configuration */}
              <Card className="bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Add Company Configuration</CardTitle>
                  <CardDescription className="text-base">
                    Company-specific configuration values that override system defaults.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCompanyConfigSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="comp-company" className="text-base font-medium">Company</Label>
                        <Select
                          value={newCompanyConfig.companyId}
                          onValueChange={(value) => setNewCompanyConfig(prev => ({ ...prev, companyId: value }))}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Select company" />
                          </SelectTrigger>
                          <SelectContent>
                            {companies.map(company => (
                              <SelectItem key={company.id} value={company.id.toString()}>
                                {company.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="comp-key" className="text-base font-medium">Configuration Key</Label>
                        <Input
                          id="comp-key"
                          value={newCompanyConfig.key}
                          onChange={(e) => setNewCompanyConfig(prev => ({ ...prev, key: e.target.value }))}
                          placeholder="e.g., email_sender, margin_rate"
                          required
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label htmlFor="comp-value" className="text-base font-medium">Value</Label>
                        <Input
                          id="comp-value"
                          value={newCompanyConfig.value}
                          onChange={(e) => setNewCompanyConfig(prev => ({ ...prev, value: e.target.value }))}
                          placeholder="Configuration value"
                          required
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label htmlFor="comp-category" className="text-base font-medium">Category</Label>
                        <Select
                          value={newCompanyConfig.category}
                          onValueChange={(value) => setNewCompanyConfig(prev => ({ ...prev, category: value }))}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.filter(c => c !== 'all').map(category => (
                              <SelectItem key={category} value={category}>
                                {category.charAt(0).toUpperCase() + category.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="comp-description" className="text-base font-medium">Description (Optional)</Label>
                        <Input
                          id="comp-description"
                          value={newCompanyConfig.description}
                          onChange={(e) => setNewCompanyConfig(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Brief description of this configuration"
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={companyConfigMutation.isPending} size="lg">
                      <Plus className="h-5 w-5 mr-2" />
                      {companyConfigMutation.isPending ? 'Adding...' : 'Add Company Config'}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Current Company Configurations */}
              <Card className="bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Current Company Configurations</CardTitle>
                  <CardDescription className="text-base">
                    {filteredCompanyConfigs.length} configuration{filteredCompanyConfigs.length !== 1 ? 's' : ''} found
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {companyLoading ? (
                    <div className="text-center py-8">Loading company configurations...</div>
                  ) : filteredCompanyConfigs.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      No company configurations found for the selected category.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredCompanyConfigs.map((config) => (
                        <div key={config.id} className="border rounded-lg p-6 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between">
                            <div className="space-y-3 flex-1">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-sm font-medium">
                                  {config.companyName}
                                </Badge>
                                <code className="bg-gray-100 px-3 py-1 rounded text-sm font-mono font-semibold">
                                  {config.key}
                                </code>
                                <Badge variant="secondary" className="text-xs">
                                  {config.category}
                                </Badge>
                              </div>
                              
                              {editingCompanyConfig === config.id ? (
                                <div className="space-y-4">
                                  <div>
                                    <Label className="text-sm font-medium">Value</Label>
                                    <Input
                                      value={editValues[config.id]?.value || ''}
                                      onChange={(e) => setEditValues(prev => ({
                                        ...prev,
                                        [config.id]: { ...prev[config.id], value: e.target.value }
                                      }))}
                                      className="mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">Description</Label>
                                    <Input
                                      value={editValues[config.id]?.description || ''}
                                      onChange={(e) => setEditValues(prev => ({
                                        ...prev,
                                        [config.id]: { ...prev[config.id], description: e.target.value }
                                      }))}
                                      className="mt-1"
                                      placeholder="Optional description"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleSaveCompanyConfig(config.id)}>
                                      <Save className="h-4 w-4 mr-1" />
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                                      <X className="h-4 w-4 mr-1" />
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="text-base">
                                    <span className="font-medium text-gray-700">Value:</span>{' '}
                                    <span className="font-mono bg-gray-50 px-2 py-1 rounded">{config.value}</span>
                                  </div>
                                  {config.description && (
                                    <div className="text-sm text-gray-600">
                                      <span className="font-medium">Description:</span> {config.description}
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-400">
                                    Last updated: {new Date(config.updatedAt).toLocaleString()}
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {editingCompanyConfig !== config.id && (
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleEditCompanyConfig(config)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
      </div>
    </SadminLayout>
  );
}