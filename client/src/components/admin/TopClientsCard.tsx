import React, { useMemo, useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Trophy, Users, DollarSign, Building, Briefcase, ArrowUpDown } from "lucide-react";
import type { Company } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils/formatters";
import { useAdminCurrency } from "@/hooks/use-admin-currency";
import { convertCurrency, formatCurrency as formatCurrencyWithSymbol } from "@shared/utils/currency";

// Define a type for the client with spending information
interface ClientWithSpending {
  id: number;
  name: string;
  totalSpent: number; // Total money spent on plans
  totalEsims: number; // Total number of eSIMs purchased
}

interface TopClientsCardProps {
  purchasedEsims?: any[];
  companies?: Company[];
}

export default function TopClientsCard({ 
  purchasedEsims = [],
  companies = []
}: TopClientsCardProps) {
  const [showByRevenue, setShowByRevenue] = useState<boolean>(true);
  
  // Use admin currency from context with fallback
  const { adminCurrency } = useAdminCurrency();
  
  // Format currency for display using admin selected currency
  const formatCurrencyAmount = (amount: number) => {
    // Fallback to USD if adminCurrency is undefined (during initial render)
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(amount, 'USD', targetCurrency);
    return formatCurrencyWithSymbol(convertedAmount, targetCurrency);
  };
  
  // Fetch the eSIM plan prices dynamically from the backend
  const { data: planPriceData } = useQuery({
    queryKey: ['/api/admin/esims/esim-plan-prices'],
    queryFn: async () => {
      const response = await fetch('/api/admin/esims/esim-plan-prices');
      if (!response.ok) throw new Error('Failed to fetch plan prices');
      return response.json();
    },
    // If the query fails, we'll use default values as a fallback
    retry: false,
    refetchOnWindowFocus: false
  });
  
  // Fetch the employee-company mapping dynamically from the backend
  const { data: employeeCompanyMappingData } = useQuery({
    queryKey: ['/api/admin/esims/employee-company-mapping'],
    queryFn: async () => {
      const response = await fetch('/api/admin/esims/employee-company-mapping');
      if (!response.ok) throw new Error('Failed to fetch employee-company mapping');
      return response.json();
    },
    // If the query fails, we'll use default values as a fallback
    retry: false,
    refetchOnWindowFocus: false
  });
  
  // Fetch the system company ID dynamically from the backend
  const { data: systemCompanyData } = useQuery({
    queryKey: ['/api/admin/esims/system-company-id'],
    queryFn: async () => {
      const response = await fetch('/api/admin/esims/system-company-id');
      if (!response.ok) throw new Error('Failed to fetch system company ID');
      return response.json();
    },
    // If the query fails, we'll use default values as a fallback
    retry: false,
    refetchOnWindowFocus: false
  });
  
  // Extract the actual data or fallback to defaults if not available yet
  const planPriceMap = planPriceData?.success ? planPriceData.data : {};
  const employeeCompanyMap = employeeCompanyMappingData?.success ? employeeCompanyMappingData.data : {};
  const systemCompanyId = systemCompanyData?.success ? systemCompanyData.data.systemCompanyId : 1;
  
  // We need to use the passed-in purchased ESIMs instead of making a direct API call,
  // as the admin page already provides this data
  // The TopClientsCard is used in admin-dashboard.tsx with purchasedEsims already loaded
  
  // Process employee and company data
  useEffect(() => {
    // First, identify which employees are from which companies
    if (purchasedEsims.length > 0 && companies.length > 0) {
      // Map employees to companies
      purchasedEsims.forEach((esim: any) => {
        const employeeId = esim.employeeId;
        const employeeName = esim.employeeName;
        const planId = esim.planId;
        
        // Look up the company for this employee using the dynamic mapping
        const companyId = employeeCompanyMap[employeeId];
        const company = companies.find(c => c.id === companyId);
        const companyName = company ? company.name : "Unknown";
        

      });
    }
  }, [purchasedEsims, companies, planPriceMap, employeeCompanyMap, systemCompanyId]);
  
  // Calculate company spending and eSIM counts dynamically from the real data
  const clientsData = useMemo<ClientWithSpending[]>(() => {

    
    if (!companies.length) return [];
    
    // Create a map to hold company spending data
    const companyData: Record<number, { 
      id: number, 
      name: string, 
      totalSpent: number, 
      totalEsims: number
    }> = {};
    
    // Initialize all companies (excluding the system company)
    companies.forEach(company => {
      if (company.id !== systemCompanyId) { // Exclude system company
        companyData[company.id] = {
          id: company.id,
          name: company.name,
          totalSpent: 0,
          totalEsims: 0
        };
      }
    });
    
    // Process eSIM data for spending calculations
    purchasedEsims.forEach(esim => {
      if (esim) {
        // Find the company for this employee using the dynamic mapping
        const companyId = employeeCompanyMap[esim.employeeId];
        const company = companies.find(c => c.id === companyId);
        
        if (company && company.id !== systemCompanyId) {
          // Get price for this plan from the dynamic map
          const price = planPriceMap[esim.planId] || 0;
          
          // Add this eSIM to the company's data
          if (companyData[company.id]) {
            // Check if the eSIM is cancelled
            const isCancelled = esim.status === "cancelled" || esim.metadata?.isCancelled;
            
            // Only count active (non-cancelled) eSIMs in the total count
            if (!isCancelled) {
              companyData[company.id].totalEsims += 1;
              companyData[company.id].totalSpent += price;
            }
          }
        }
      }
    });
    

    
    return Object.values(companyData);
  }, [companies, purchasedEsims, planPriceMap, employeeCompanyMap, systemCompanyId]);
  
  // Get top 5 clients based on the toggle state
  const topClients = useMemo(() => {
    // Use the dynamically calculated client data
    let combinedClientData = [...clientsData];
    
    // For each company defined in the system, ensure it has entries
    companies.forEach(company => {
      if (
        company.id !== systemCompanyId && // Exclude system company (Simtree) using dynamic ID
        !combinedClientData.some(client => client.id === company.id)
      ) {
        // This company exists but doesn't have any eSIM data yet
        // We'll still add it to the list with 0 values
        combinedClientData.push({
          id: company.id,
          name: company.name,
          totalSpent: 0,
          totalEsims: 0
        });
      }
    });
    
    // Sort the data according to the current view mode
    const sortedClients = showByRevenue
      ? [...combinedClientData].sort((a, b) => b.totalSpent - a.totalSpent)
      : [...combinedClientData].sort((a, b) => b.totalEsims - a.totalEsims);
    
    // Take up to 5 clients
    const realClients = sortedClients.slice(0, 5);
    
    // If we have less than 5 clients, add placeholders
    if (realClients.length < 5) {
      const placeholdersNeeded = 5 - realClients.length;
      for (let i = 0; i < placeholdersNeeded; i++) {
        realClients.push({
          id: -i - 1, // Use negative IDs to avoid conflicts
          name: "Unknown",
          totalSpent: 0,
          totalEsims: 0
        });
      }
    }
    
    return realClients;
  }, [clientsData, companies, showByRevenue, systemCompanyId]);
  
  // Get badges for rank position
  const getClientBadge = (index: number, isPlaceholder: boolean = false) => {
    if (isPlaceholder) {
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100">
          <Building className="h-4 w-4 text-gray-300" />
        </div>
      );
    }
    
    const badges = [
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-sm">
        <Trophy className="h-4 w-4 text-white" />
      </div>,
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-gray-300 to-gray-400 shadow-sm">
        <Briefcase className="h-4 w-4 text-white" />
      </div>,
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-amber-600 to-amber-800 shadow-sm">
        <Briefcase className="h-4 w-4 text-white" />
      </div>,
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
        <Briefcase className="h-4 w-4 text-blue-600" />
      </div>,
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100">
        <Briefcase className="h-4 w-4 text-purple-600" />
      </div>
    ];
    
    return badges[index] || badges[4];
  };
  
  // Note: Using imported formatCurrency function which supports multiple currencies
  
  return (
    <Card className="shadow-sm overflow-hidden border-0 rounded-xl">
      <CardHeader className="border-b bg-white pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Building className="h-5 w-5 text-emerald-500" />
            Top 5 Clients
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowByRevenue(!showByRevenue)}
            className="flex items-center gap-1 text-xs px-3 h-8 text-gray-600 hover:text-gray-900"
          >
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
            {showByRevenue ? 'Sort by Revenue' : 'Sort by Volume'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 bg-gray-50">
        {topClients.length > 0 ? (
          <div>
            {topClients.map((client, index) => (
              <div 
                key={client.id}
                className={`flex items-center p-4 border-b last:border-b-0 transition-colors 
                  ${client.name === "Unknown" ? "opacity-60" : "hover:bg-gray-100/50"}`}
              >
                <div className="mr-3 flex-shrink-0">
                  {getClientBadge(index, client.name === "Unknown")}
                </div>
                <div className="flex-1">
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <h4 className={`font-medium ${client.name === "Unknown" ? "text-gray-400 italic" : "text-gray-900"}`}>
                        {client.name}
                      </h4>
                      {index === 0 && client.name !== "Unknown" && (
                        <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          Top Client
                        </span>
                      )}
                    </div>
                    
                    {client.name !== "Unknown" ? (
                      <div className="flex items-center mt-1 text-xs text-gray-500">
                        <Users className="h-3.5 w-3.5 mr-1" />
                        <span>
                          {client.totalEsims} {client.totalEsims === 1 ? 'eSIM' : 'eSIMs'} purchased
                        </span>
                        {showByRevenue && (
                          <>
                            <span className="mx-1.5">•</span>
                            <DollarSign className="h-3.5 w-3.5 mr-0.5" />
                            <span>{formatCurrencyAmount(client.totalSpent)}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 italic mt-1">
                        No data available
                      </div>
                    )}
                  </div>
                </div>
                
                {client.name !== "Unknown" && (
                  <div className="flex items-center justify-center min-w-12 h-12 rounded-lg bg-emerald-100 text-emerald-700">
                    <div className="flex flex-col items-center">
                      <span className="text-lg font-bold">
                        {showByRevenue ? formatCurrencyAmount(client.totalSpent).replace(/^[$د.إ\s]+/, '') : client.totalEsims}
                      </span>
                      <span className="text-xs">
                        {showByRevenue ? 'revenue' : 'eSIMs'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Building className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No client spending data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}