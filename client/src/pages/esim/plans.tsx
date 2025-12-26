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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit, Trash2, Wifi, Search, Save, FileDown, DollarSign, Receipt, TrendingUp, TrendingDown, CheckSquare, Square } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ESIMPlan {
  id: number;
  providerId: string;
  name: string;
  description: string;
  data: string;
  validity: number;
  providerPrice: string;
  sellingPrice: string;
  retailPrice: string;
  margin: string;
  countries: string[];
  speed: string;
  isActive: boolean;
}

export default function ESIMPlansPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<ESIMPlan | null>(null);
  const [currentPlan, setCurrentPlan] = useState<ESIMPlan | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Fetch eSIM plans
  const { data: apiResponse, isLoading, error } = useQuery({
    queryKey: ['/api/admin/plans'],
    queryFn: async () => {
      try {
        const result = await apiRequest('/api/admin/plans');
        if (import.meta.env.DEV) { console.log("API Response:", result); }
        return result;
      } catch (error) {
        console.error("Error fetching eSIM plans:", error);
        toast({
          title: "Error",
          description: "Failed to load eSIM plans. Please try again.",
          variant: "destructive",
        });
        return { success: false, data: [] };
      }
    }
  });
  
  // Safely extract unsortedPlans from the response
  const unsortedPlans = React.useMemo(() => {
    if (!apiResponse) return [];
    if (apiResponse.success && Array.isArray(apiResponse.data)) {
      return apiResponse.data;
    }
    if (Array.isArray(apiResponse)) {
      return apiResponse;
    }
    return [];
  }, [apiResponse]);
  
  // Sort plans alphabetically by name
  const sortedPlans = React.useMemo(() => {
    if (!unsortedPlans || !Array.isArray(unsortedPlans)) return [];
    return [...unsortedPlans].sort((a: ESIMPlan, b: ESIMPlan) => 
      a.name.localeCompare(b.name)
    );
  }, [unsortedPlans]);
  
  // Country aliases for search (common abbreviations and alternate names)
  const countryAliasesSearch: Record<string, string[]> = {
    "ae": ["uae", "emirates", "dubai", "abu dhabi"],
    "gb": ["uk", "britain", "england", "scotland", "wales"],
    "us": ["usa", "america", "united states"],
    "cn": ["china", "prc"],
    "hk": ["hong kong"],
    "ru": ["russia"],
    "de": ["germany"],
    "fr": ["france"],
    "jp": ["japan"],
    "kr": ["korea", "south korea"],
    "sa": ["saudi", "saudi arabia", "ksa"],
  };

  // Helper function to check if a query matches any country alias
  const matchesCountryAlias = (query: string, countryCode: string): boolean => {
    const code = countryCode.toLowerCase();
    // Check direct match with country code
    if (code.includes(query)) return true;
    // Check if query matches any alias for this country code
    const aliases = countryAliasesSearch[code];
    if (aliases) {
      return aliases.some(alias => alias.includes(query) || query.includes(alias));
    }
    return false;
  };

  // Filter plans based on search query
  const plans = React.useMemo(() => {
    if (!sortedPlans || sortedPlans.length === 0) return [];
    if (!searchQuery.trim()) return sortedPlans;
    
    const query = searchQuery.toLowerCase().trim();
    return sortedPlans.filter((plan) => {
      return (
        plan.name.toLowerCase().includes(query) ||
        plan.providerId.toLowerCase().includes(query) ||
        (plan.speed && plan.speed.toLowerCase().includes(query)) ||
        (plan.countries && plan.countries.some((country: string) => 
          country.toLowerCase().includes(query) || matchesCountryAlias(query, country)
        ))
      );
    });
  }, [sortedPlans, searchQuery]);
  
  // State for managing margins
  const [margins, setMargins] = useState<Record<number, number>>({});
  const [dirtyMargins, setDirtyMargins] = useState<Record<number, boolean>>({});
  
  // State for bulk margin controls
  const [selectedPlans, setSelectedPlans] = useState<Set<number>>(new Set());
  const [bulkMarginValue, setBulkMarginValue] = useState<string>('');
  const [selectAllChecked, setSelectAllChecked] = useState(false);
  
  // Initialize margins from plans when data is loaded
  React.useEffect(() => {
    if (plans && plans.length > 0) {
      const initialMargins: Record<number, number> = {};
      const initialDirtyState: Record<number, boolean> = {};
      
      plans.forEach((plan: ESIMPlan) => {
        initialMargins[plan.id] = parseFloat(plan.margin) || 0;
        initialDirtyState[plan.id] = false;
      });
      
      setMargins(initialMargins);
      setDirtyMargins(initialDirtyState);
    }
  }, [plans]);

  // Bulk margin control functions
  const toggleSelectAll = () => {
    if (selectAllChecked) {
      setSelectedPlans(new Set());
      setSelectAllChecked(false);
    } else {
      const allPlanIds = new Set(plans.map(plan => plan.id));
      setSelectedPlans(allPlanIds);
      setSelectAllChecked(true);
    }
  };

  const togglePlanSelection = (planId: number) => {
    const newSelection = new Set(selectedPlans);
    if (newSelection.has(planId)) {
      newSelection.delete(planId);
    } else {
      newSelection.add(planId);
    }
    setSelectedPlans(newSelection);
    setSelectAllChecked(newSelection.size === plans.length);
  };

  const handleBulkMarginChange = (operation: 'add' | 'subtract') => {
    const marginValue = parseFloat(bulkMarginValue);
    if (isNaN(marginValue) || marginValue <= 0) {
      toast({
        title: "Invalid margin value",
        description: "Please enter a valid positive number for the margin percentage.",
        variant: "destructive",
      });
      return;
    }

    if (selectedPlans.size === 0) {
      toast({
        title: "No plans selected",
        description: "Please select at least one plan to modify margins.",
        variant: "destructive",
      });
      return;
    }

    const updatedMargins = { ...margins };
    const updatedDirtyMargins = { ...dirtyMargins };

    selectedPlans.forEach(planId => {
      const currentMargin = updatedMargins[planId] || 0;
      let newMargin = operation === 'add' ? currentMargin + marginValue : currentMargin - marginValue;
      
      // Ensure margin doesn't go below 0
      newMargin = Math.max(0, newMargin);
      
      updatedMargins[planId] = newMargin;
      updatedDirtyMargins[planId] = true;
    });

    setMargins(updatedMargins);
    setDirtyMargins(updatedDirtyMargins);
    setBulkMarginValue('');
  };

  // Toggle plan active status
  const toggleActiveMutation = useMutation({
    mutationFn: async (planId: number) => {
      const plan = plans.find((p: ESIMPlan) => p.id === planId);
      if (!plan) return null;
      
      return fetch('/api/admin/plans/toggle-active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId,
          isActive: !plan.isActive
        })
      }).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      toast({
        title: "Success",
        description: "Plan status updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update plan status. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Update plan margin mutation
  const marginMutation = useMutation({
    mutationFn: async (planData: { id: number, margin: number }) => {
      return fetch(`/api/admin/plans/${planData.id}/margin`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ margin: planData.margin })
      }).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      toast({
        title: "Margin updated",
        description: "The plan margin has been successfully updated",
      });
      // Reset dirty flags after successful update
      setDirtyMargins({});
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update plan margin",
        variant: "destructive",
      });
    },
  });
  
  // Handler for margin changes
  const handleMarginChange = (planId: number, value: string) => {
    // Allow empty string for erasing digits
    if (value === '') {
      setMargins(prev => ({
        ...prev,
        [planId]: 0
      }));
      setDirtyMargins(prev => ({
        ...prev,
        [planId]: true
      }));
      return;
    }
    
    const numericValue = parseInt(value, 10);
    if (!isNaN(numericValue)) {
      setMargins(prev => ({
        ...prev,
        [planId]: numericValue
      }));
      setDirtyMargins(prev => ({
        ...prev,
        [planId]: true
      }));
    }
  };
  
  // Save margin changes
  const handleSaveMargin = (planId: number) => {
    if (margins[planId] !== undefined) {
      marginMutation.mutate({ id: planId, margin: margins[planId] });
    }
  };
  
  // Batch update all margin changes
  const batchMarginMutation = useMutation({
    mutationFn: async (planData: { plans: {id: number, margin: number}[] }) => {
      return fetch('/api/admin/plans/batch-update-margins', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(planData)
      }).then(res => res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      setDirtyMargins({});
      toast({
        title: "Success",
        description: `Margins updated for ${data.data.updated} plans`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update margins",
        variant: "destructive",
      });
    },
  });

  // Save all margin changes using batch API endpoint
  const handleSaveAllMargins = () => {
    // Get all dirty margins
    const dirtyPlanIds = Object.entries(dirtyMargins)
      .filter(([_, isDirty]) => isDirty)
      .map(([id]) => parseInt(id, 10));
    
    if (dirtyPlanIds.length === 0) {
      toast({
        title: "No changes",
        description: "No margin changes to save",
      });
      return;
    }
    
    // Create payload for batch update
    const plansToUpdate = dirtyPlanIds.map(id => ({
      id,
      margin: margins[id]
    }));
    
    batchMarginMutation.mutate({ plans: plansToUpdate });
  };

  const handleEditPlan = (plan: ESIMPlan) => {
    setCurrentPlan(plan);
    setIsEditDialogOpen(true);
  };

  const handleToggleActive = (planId: number) => {
    toggleActiveMutation.mutate(planId);
  };

  // Country code to full name mapping
  const countryCodeToName: Record<string, string> = {
    "ae": "United Arab Emirates",
    "am": "Armenia",
    "at": "Austria",
    "au": "Australia",
    "ax": "Åland Islands",
    "be": "Belgium",
    "bg": "Bulgaria",
    "ca": "Canada",
    "ch": "Switzerland",
    "cn": "China",
    "cy": "Cyprus",
    "cz": "Czech Republic",
    "de": "Germany",
    "dk": "Denmark",
    "ee": "Estonia",
    "es": "Spain",
    "fi": "Finland",
    "fr": "France",
    "gb": "United Kingdom",
    "gg": "Guernsey",
    "gi": "Gibraltar",
    "gl": "Greenland",
    "gr": "Greece",
    "hk": "Hong Kong",
    "hr": "Croatia",
    "hu": "Hungary",
    "id": "Indonesia",
    "ie": "Ireland",
    "il": "Israel",
    "im": "Isle of Man",
    "in": "India",
    "is": "Iceland",
    "it": "Italy",
    "je": "Jersey",
    "jp": "Japan",
    "li": "Liechtenstein",
    "lt": "Lithuania",
    "lu": "Luxembourg",
    "lv": "Latvia",
    "mk": "North Macedonia",
    "mt": "Malta",
    "mx": "Mexico",
    "nl": "Netherlands",
    "no": "Norway",
    "nz": "New Zealand",
    "pl": "Poland",
    "pt": "Portugal",
    "ro": "Romania",
    "rs": "Serbia",
    "ru": "Russia",
    "se": "Sweden",
    "sg": "Singapore",
    "si": "Slovenia",
    "sk": "Slovakia",
    "th": "Thailand",
    "tr": "Turkey",
    "tw": "Taiwan",
    "ua": "Ukraine",
    "us": "United States",
    "za": "South Africa"
  };

  // Country aliases for search (common abbreviations and alternate names)
  const countryAliases: Record<string, string[]> = {
    "ae": ["uae", "emirates", "dubai", "abu dhabi"],
    "gb": ["uk", "britain", "england", "scotland", "wales"],
    "us": ["usa", "america", "united states"],
    "cn": ["china", "prc"],
    "hk": ["hong kong"],
    "ru": ["russia"],
    "de": ["germany"],
    "fr": ["france"],
    "jp": ["japan"],
    "kr": ["korea", "south korea"],
    "sa": ["saudi", "saudi arabia", "ksa"],
  };

  // Format countries list for display
  const formatCountries = (countries: string[]) => {
    if (!countries || countries.length === 0) return 'Global';
    if (countries.length === 1) {
      const code = countries[0].toLowerCase();
      return countryCodeToName[code] || code.toUpperCase();
    }
    return `${countries.length} Countries`;
  };
  
  // Create tooltip content for multiple countries
  const getCountriesTooltip = (countries: string[]) => {
    if (countries.length <= 1) return null;
    
    return countries
      .map(code => countryCodeToName[code.toLowerCase()] || code.toUpperCase())
      .sort()
      .join("\n");
  };

  // Format to 2 decimal places
  const formatNumber = (value: string) => {
    return parseFloat(value).toFixed(2);
  };
  
  // Format margin as integer without decimals
  const formatMargin = (value: string) => {
    return Math.round(parseFloat(value));
  };

  // PDF Export Functions
  const exportToPDF = (type: 'price' | 'cost') => {
    const doc = new jsPDF();
    
    // Add logo and company header
    doc.setFontSize(20);
    doc.setTextColor(0, 100, 200);
    doc.text('SimTree', 20, 20);
    
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    const title = type === 'price' ? 'eSIM Plans - Price List' : 'eSIM Plans - Cost List';
    doc.text(title, 20, 35);
    
    // Add generation date
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 45);
    
    // Prepare table data - using USD for price lists
    const tableData = plans.map(plan => {
      const dataDisplay = parseFloat(plan.data) >= 1 ? 
        `${plan.data}GB` : 
        `${(parseFloat(plan.data) * 1000).toFixed(0)}MB`;
      
      if (type === 'price') {
        return [
          plan.name,
          plan.providerId,
          dataDisplay,
          `${plan.validity} days`,
          `USD ${formatNumber(plan.sellingPrice)}`,
          plan.speed,
          plan.isActive ? 'Active' : 'Inactive'
        ];
      } else {
        return [
          plan.name,
          plan.providerId,
          dataDisplay,
          `${plan.validity} days`,
          `USD ${formatNumber(plan.providerPrice)}`,
          `USD ${formatNumber(plan.sellingPrice)}`,
          `${formatMargin(plan.margin)}%`,
          plan.speed,
          plan.isActive ? 'Active' : 'Inactive'
        ];
      }
    });

    // Define table columns
    const columns = type === 'price' 
      ? ['Plan Name', 'Provider ID', 'Data', 'Validity', 'Selling Price', 'Speed', 'Status']
      : ['Plan Name', 'Provider ID', 'Data', 'Validity', 'Cost Price', 'Selling Price', 'Margin', 'Speed', 'Status'];

    // Generate table
    autoTable(doc, {
      head: [columns],
      body: tableData,
      startY: 55,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [0, 100, 200],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      columnStyles: type === 'price' ? {
        0: { cellWidth: 35 }, // Plan Name
        1: { cellWidth: 25 }, // Provider ID
        2: { cellWidth: 20 }, // Data
        3: { cellWidth: 20 }, // Validity
        4: { cellWidth: 25 }, // Selling Price
        5: { cellWidth: 20 }, // Speed
        6: { cellWidth: 20 }, // Status
      } : {
        0: { cellWidth: 30 }, // Plan Name
        1: { cellWidth: 20 }, // Provider ID
        2: { cellWidth: 15 }, // Data
        3: { cellWidth: 15 }, // Validity
        4: { cellWidth: 20 }, // Cost Price
        5: { cellWidth: 20 }, // Selling Price
        6: { cellWidth: 15 }, // Margin
        7: { cellWidth: 15 }, // Speed
        8: { cellWidth: 15 }, // Status
      },
    });

    // Add footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
      doc.text('SimTree eSIM Management Platform', 20, doc.internal.pageSize.height - 10);
    }

    // Save the PDF
    const filename = type === 'price' ? 'esim-price-list.pdf' : 'esim-cost-list.pdf';
    doc.save(filename);
    
    toast({
      title: "Export Complete",
      description: `${type === 'price' ? 'Price list' : 'Cost list'} exported successfully`,
    });
  };

  return (
    <SadminLayout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">eSIM Plans Management</h1>
          <Button 
            disabled={true}
            onClick={() => {
              setSelectedPlan(null);
              setIsNewDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add New Plan
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Available eSIM Plans</CardTitle>
            <CardDescription>
              Manage all available eSIM data plans across different regions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search plans by name, provider ID, country..."
                      className="pl-8"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      className="border-green-500 text-green-600 hover:bg-green-50" 
                      onClick={() => exportToPDF('price')}
                    >
                      <DollarSign className="mr-2 h-4 w-4" /> Export Price List
                    </Button>
                    <Button 
                      variant="outline"
                      className="border-purple-500 text-purple-600 hover:bg-purple-50" 
                      onClick={() => exportToPDF('cost')}
                    >
                      <Receipt className="mr-2 h-4 w-4" /> Export Cost List
                    </Button>
                    <Button 
                      variant="default"
                      className="bg-blue-500 hover:bg-blue-600 text-white" 
                      onClick={handleSaveAllMargins}
                      disabled={Object.keys(dirtyMargins).length === 0}
                    >
                      <Save className="mr-2 h-4 w-4" /> Save All Margins
                    </Button>
                  </div>
                </div>

                {/* Bulk Margin Controls */}
                <div className="bg-gray-50 p-4 rounded-lg mb-4 border">
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">Bulk Margin Controls</h3>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleSelectAll}
                        className="flex items-center gap-2"
                      >
                        {selectAllChecked ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                        {selectAllChecked ? 'Deselect All' : 'Select All'}
                      </Button>
                      <span className="text-sm text-gray-600">
                        {selectedPlans.size} of {plans.length} plans selected
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="Enter %"
                          value={bulkMarginValue}
                          onChange={(e) => setBulkMarginValue(e.target.value)}
                          className="w-24 h-9"
                          min="0"
                          step="0.1"
                        />
                        <span className="text-sm text-gray-600">%</span>
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkMarginChange('add')}
                        disabled={selectedPlans.size === 0 || !bulkMarginValue}
                        className="flex items-center gap-1 border-green-500 text-green-600 hover:bg-green-50"
                      >
                        <TrendingUp className="h-4 w-4" />
                        Add
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkMarginChange('subtract')}
                        disabled={selectedPlans.size === 0 || !bulkMarginValue}
                        className="flex items-center gap-1 border-red-500 text-red-600 hover:bg-red-50"
                      >
                        <TrendingDown className="h-4 w-4" />
                        Subtract
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-medium w-12">Select</TableHead>
                      <TableHead className="font-medium">Name</TableHead>
                      <TableHead className="font-medium">Provider ID</TableHead>
                      <TableHead className="font-medium">Data</TableHead>
                      <TableHead className="font-medium">Validity</TableHead>
                      <TableHead className="font-medium">Cost</TableHead>
                      <TableHead className="font-medium">Selling</TableHead>
                      <TableHead className="font-medium">Margin</TableHead>
                      <TableHead className="font-medium">Country/Region</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans && plans.length > 0 ? (
                      plans.map((plan: ESIMPlan) => (
                        <TableRow key={plan.id} className="hover:bg-gray-50">
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => togglePlanSelection(plan.id)}
                              className="p-1 h-8 w-8"
                            >
                              {selectedPlans.has(plan.id) ? (
                                <CheckSquare className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Square className="h-4 w-4 text-gray-400" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <Wifi className="mr-2 h-4 w-4 text-blue-500" />
                              {plan.name}
                            </div>
                          </TableCell>
                          <TableCell>{plan.providerId}</TableCell>
                          <TableCell>{plan.data}GB</TableCell>
                          <TableCell>{plan.validity} days</TableCell>
                          <TableCell>${formatNumber(plan.providerPrice)}</TableCell>
                          <TableCell>${formatNumber(plan.sellingPrice)}</TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <div className="relative">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={margins[plan.id] !== undefined ? Math.round(margins[plan.id]) : formatMargin(plan.margin)}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    // Allow empty string or digits only
                                    if (value === '' || /^\d+$/.test(value)) {
                                      handleMarginChange(plan.id, value);
                                    }
                                  }}
                                  className="w-20 h-10 text-right pr-7"
                                  min="0"
                                  max="500"
                                />
                                <span className="text-sm absolute right-3 top-1/2 transform -translate-y-1/2">%</span>
                              </div>
                              <div className="w-14">
                                {dirtyMargins[plan.id] && (
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="h-8 px-2 text-xs ml-1"
                                    onClick={() => handleSaveMargin(plan.id)}
                                  >
                                    Save
                                  </Button>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="relative">
                              <Badge 
                                variant="outline" 
                                className={plan.countries && plan.countries.length > 1 ? "cursor-help" : ""}
                                onMouseOver={() => {
                                  const tooltip = document.getElementById(`tooltip-${plan.id}`);
                                  if (tooltip) tooltip.style.display = 'block';
                                }}
                                onMouseOut={() => {
                                  const tooltip = document.getElementById(`tooltip-${plan.id}`);
                                  if (tooltip) tooltip.style.display = 'none';
                                }}
                              >
                                {formatCountries(plan.countries)}
                              </Badge>
                              {plan.countries && plan.countries.length > 1 && (
                                <div 
                                  id={`tooltip-${plan.id}`}
                                  className="absolute hidden bottom-full mb-2 bg-white border rounded-md p-2 shadow-lg whitespace-pre overflow-y-auto max-h-60 z-50 left-0"
                                  style={{ 
                                    width: "fit-content", 
                                    maxWidth: "200px", 
                                    display: 'none',
                                    lineHeight: '1.5',
                                    fontSize: '0.875rem',
                                    color: '#333'
                                  }}
                                >
                                  {getCountriesTooltip(plan.countries)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`cursor-pointer rounded-full px-4 py-1 ${plan.isActive ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-gray-200 hover:bg-gray-300"}`}
                              onClick={() => handleToggleActive(plan.id)}
                            >
                              {plan.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleEditPlan(plan)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-6 text-muted-foreground">
                          No eSIM plans found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Edit Plan Dialog - Placeholder UI, would need actual form fields */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit eSIM Plan</DialogTitle>
              <DialogDescription>
                Update the details for this eSIM plan
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {selectedPlan && (
                <>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                      Name
                    </Label>
                    <Input
                      id="name"
                      defaultValue={selectedPlan.name}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="data" className="text-right">
                      Data (GB)
                    </Label>
                    <Input
                      id="data"
                      defaultValue={selectedPlan.data}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="price" className="text-right">
                      Price ($)
                    </Label>
                    <Input
                      id="price"
                      defaultValue={selectedPlan?.sellingPrice}
                      className="col-span-3"
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button">Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* New Plan Dialog - Placeholder UI */}
        <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New eSIM Plan</DialogTitle>
              <DialogDescription>
                Create a new eSIM data plan
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-name" className="text-right">
                  Name
                </Label>
                <Input
                  id="new-name"
                  placeholder="e.g. US 5GB 30Days"
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-provider" className="text-right">
                  Provider ID
                </Label>
                <Input
                  id="new-provider"
                  placeholder="e.g. CKH123"
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-data" className="text-right">
                  Data (GB)
                </Label>
                <Input
                  id="new-data"
                  placeholder="e.g. 5"
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-validity" className="text-right">
                  Validity (days)
                </Label>
                <Input
                  id="new-validity"
                  placeholder="e.g. 30"
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-price" className="text-right">
                  Price ($)
                </Label>
                <Input
                  id="new-price"
                  placeholder="e.g. 19.99"
                  className="col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setIsNewDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button">Create Plan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SadminLayout>
  );
}