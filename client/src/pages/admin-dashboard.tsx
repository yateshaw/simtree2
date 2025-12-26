import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SadminLayout from "@/components/layout/SadminLayout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CompanyList from "@/components/admin/CompanyList";
import RevenueChart from "@/components/admin/RevenueChart";
import ClientsTable from "@/components/admin/ClientsTable";
// import { EsimStatusFixer } from "@/components/admin/EsimStatusFixer"; // Component not found
import CouponManager from "@/components/admin/CouponManager";
import BusinessAnalyticsCards from "@/components/admin/BusinessAnalyticsCards";
import TopPurchasedPlansCard from "@/components/admin/TopPurchasedPlansCard";
import TopClientsCard from "@/components/admin/TopClientsCard";
import GeographicAnalysisCard from "@/components/admin/GeographicAnalysisCard";
import ProfitChart from "@/components/admin/ProfitChart";
import { DataTable } from "@/components/ui/data-table";
import { 
  LogOut, 
  Wifi, 
  Globe, 
  Download, 
  Upload, 
  Plus, 
  DollarSign, 
  User as UserIcon, 
  BarChart, 
  Save,
  Gift,
  Search,
  Trophy,
  Building,
  Users,
  Database,
  Clock
} from "lucide-react";
import EmployeeTable from "@/components/company/EmployeeTable";
import SuperAdminEmployeeTable from "@/components/admin/SuperAdminEmployeeTable";
import UsageChart from "@/components/company/UsageChart";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import AddEmployeeForm from "@/components/company/AddEmployeeForm";
import EsimManager from "@/components/company/EsimManager";
import { downloadTemplate, uploadExcel } from "@/lib/excel";
import type { Employee, EsimPlan, Company } from "@shared/schema";
import type { User as UserType } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Determine if a code represents a region rather than a country
const isRegion = (code: string): boolean => {
  const regions = [
    'global', 'gl', 'eu', 'na', 'sa', 'af', 'as', 'apac', 
    'sea', 'car', 'cas', 'emea', 'latam', 'europe', 'asia', 'africa', 
    'north america', 'south america', 'caribbean'
  ];
  return regions.includes(code.toLowerCase());
};

export default function AdminDashboard() {
  const { logout, user } = useAuth();
  // Always using "all" companies view - dropdown functionality removed
  const selectedCompany = "all";
  // Debug logging removed for security
  const [filteredPlans, setFilteredPlans] = useState<EsimPlan[]>();
  const [margins, setMargins] = useState<Record<number, number>>({});
  const [dirtyMargins, setDirtyMargins] = useState<Record<number, boolean>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/admin/companies"],
    enabled: !!user,
  });
  
  // Filter out the Simtree company (id: 11) from the companies list for calculations
  const businessCompanies = companies?.filter(company => company.name !== "Simtree");

  const { data: allEmployees } = useQuery<(Employee & { companyName?: string })[]>({
    queryKey: ["/api/admin/employees"],
    enabled: !!user,
  });

  // Fetch purchased eSIMs - either all for superadmin view or company-specific when a company is selected
  const { data: purchasedEsimsResponse } = useQuery<{ success: boolean, data: Array<any> }>({
    queryKey: ["/api/esim/purchased"],
    staleTime: 1000 * 60 * 5, // 5 minutes - SSE handles real-time updates
    refetchOnWindowFocus: false,
    enabled: !!user,
  });
  
  // Extract purchased eSIMs data
  // Extract purchased eSIMs data and log for debugging
  const purchasedEsims = purchasedEsimsResponse?.data || [];
  // Debug logging removed for security
  
  // Always showing all employees - company dropdown removed
  const displayEmployees = allEmployees;

  // Fetch all plans for admin
  const { data: plansResponse, isLoading: loadingPlans } = useQuery<{ success: boolean, data: EsimPlan[] }>({
    queryKey: ["/api/admin/plans"],
    enabled: !!user,
  });
  
  // Extract plans from the response
  const plans = plansResponse?.success ? plansResponse.data : [];

  // Initialize margins from plans when data is loaded
  React.useEffect(() => {
    if (plans && plans.length > 0) {
      const initialMargins: Record<number, number> = {};
      const initialDirtyState: Record<number, boolean> = {};
      
      plans.forEach(plan => {
        initialMargins[plan.id] = plan.margin !== undefined ? Number(plan.margin) : 0;
        initialDirtyState[plan.id] = false;
      });
      
      setMargins(initialMargins);
      setDirtyMargins(initialDirtyState);
    }
  }, [plans]);

  // Update plan margins
  const marginMutation = useMutation({
    mutationFn: async (planData: { id: number, margin: number }) => {
      const response = await fetch(`/api/admin/plans/${planData.id}/margin`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ margin: planData.margin }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update plan margin');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({
        title: "Margin updated",
        description: "The plan margin has been successfully updated",
      });
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
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue)) {
      setMargins(prev => ({ ...prev, [planId]: numericValue }));
      setDirtyMargins(prev => ({ ...prev, [planId]: true }));
    }
  };

  // Handler for saving margin changes
  const handleSaveMargin = (planId: number) => {
    marginMutation.mutate({ id: planId, margin: margins[planId] });
    setDirtyMargins(prev => ({ ...prev, [planId]: false }));
  };

  // Decide which interface layout to use based on user type
  const isSadminUser = user?.username === 'sadmin' && user?.isSuperAdmin;
  
  // Component for coverage display
  const CoverageIndicator = ({ countries }: { countries: string[] }) => {
    if (!countries || countries.length === 0) return null;
    
    // Format country names for display
    const countryNames = countries.map(code => {
      try {
        // Use a mapping for regions that aren't standard country codes
        const regionMapping: Record<string, string> = {
          'gl': 'Global',
          'as': 'Asia',
          'cas': 'Central Asia',
          'car': 'Caribbean',
          'af': 'Africa',
          'apac': 'Asia-Pacific',
          'emea': 'Europe, Middle East & Africa',
          'latam': 'Latin America',
          'global': 'Global',
          'eu': 'Europe',
          'na': 'North America',
          'sa': 'South America',
          'sau': 'Saudi Arabia'
        };
        
        if (regionMapping[code.toLowerCase()]) {
          return regionMapping[code.toLowerCase()];
        } else {
          // Try to use the Intl API for standard country codes
          const regionCode = code.length > 2 ? code.substring(0, 2) : code;
          return new Intl.DisplayNames(['en'], { type: 'region' }).of(regionCode.toUpperCase()) || code.toUpperCase();
        }
      } catch (e) {
        return code.toUpperCase();
      }
    });
    
    return (
      <div className="flex flex-col items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center">
                <span className="inline-block">
                  {countries.length > 0 ? (
                    <Globe className="w-5 h-5 text-gray-600" />
                  ) : (
                    <Globe className="w-5 h-5 text-gray-400" />
                  )}
                </span>
                <span className="text-xs text-gray-500">
                  {countries.length} {countries.length === 1 ? 'country' : 'countries'}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs max-h-60 overflow-y-auto">
              <div>
                <p className="font-semibold mb-1">Coverage:</p>
                <ul className="list-disc pl-4">
                  {countryNames.map((name, idx) => (
                    <li key={idx}>{name}</li>
                  ))}
                </ul>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  };

  // Render dashboard content
  const renderDashboardContent = () => (
    <TooltipProvider>
      <div className="space-y-8">


        {/* Business Analytics Cards */}
        <BusinessAnalyticsCards 
          companies={businessCompanies || []}
          employees={allEmployees || []}
          purchasedEsims={purchasedEsims || []}
        />
            
            {/* Quick Actions */}
            <div className="flex flex-wrap justify-end gap-3 mt-6">
              <Link href="/sadmin-coupons">
                <Button variant="outline" size="sm" className="flex items-center gap-1 text-sm h-9 border-amber-200 text-amber-700 hover:bg-amber-50">
                  <Gift className="h-4 w-4" />
                  Manage Coupons
                </Button>
              </Link>
              
              <Link href="/companies/pending">
                <Button variant="outline" size="sm" className="flex items-center gap-1 text-sm h-9 border-blue-200 text-blue-700 hover:bg-blue-50">
                  <Building className="h-4 w-4" />
                  Pending Companies ({companies?.filter(c => !c.verified).length || 0})
                </Button>
              </Link>
              
              <Link href="/esim/plans-search">
                <Button variant="outline" size="sm" className="flex items-center gap-1 text-sm h-9 border-gray-200 text-gray-700 hover:bg-gray-50">
                  <Search className="h-4 w-4" />
                  Search All Plans
                </Button>
              </Link>
            </div>
            
            {/* Top Ranked Card Section - Kept from original */}
            <div className="grid md:grid-cols-2 gap-6 mt-6">
              {/* Top Purchased Plans Card */}
              <div className="flex flex-col">
                <TopPurchasedPlansCard
                  purchasedEsims={purchasedEsims || []}
                  plans={plans || []}
                />
              </div>
              
              {/* Top Clients Card */}
              <TopClientsCard
                purchasedEsims={purchasedEsims || []}
                companies={companies || []}
              />
            </div>
            
            {/* Geographical Usage & Data Analytics */}
            <div className="grid md:grid-cols-2 gap-6 mt-6">
              <GeographicAnalysisCard 
                purchasedEsims={purchasedEsims || []}
                plans={plans || []}
              />
              
              {/* Data Usage Patterns - Using real data */}
              <Card className="shadow-md overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-gray-50 to-purple-50 pb-3">
                  <CardTitle className="flex items-center gap-2 text-gray-800">
                    <BarChart className="h-5 w-5 text-purple-600" />
                    Plan Analysis
                  </CardTitle>
                  <p className="text-sm text-gray-500">Based on purchased eSIMs</p>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="space-y-6">
                    {/* Data Package Analysis */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Data Package Distribution</h4>
                      <div className="grid grid-cols-3 gap-4">
                        {(() => {
                          // Check if we have any non-cancelled eSIMs
                          const hasActiveEsims = purchasedEsims.some((esim: any) => 
                            esim.status !== 'cancelled' && esim.status !== 'refunded' && !esim.isCancelled
                          );
                          // Analyze data plans by size - only non-cancelled plans
                          const dataSizeGroups = { small: 0, medium: 0, large: 0 };
                          let totalAnalyzed = 0;
                          
                          // Filter out cancelled/refunded eSIMs first
                          const activeEsims = purchasedEsims.filter((esim: any) => 
                            esim.status !== 'cancelled' && esim.status !== 'refunded' && 
                            !esim.isCancelled
                          );
                          
                          activeEsims.forEach((esim: any) => {
                            if (esim && esim.planId) {
                              const plan = plans.find(p => p.id === esim.planId);
                              if (plan && plan.data) {
                                const dataGB = parseFloat(plan.data);
                                if (!isNaN(dataGB)) {
                                  totalAnalyzed++;
                                  if (dataGB <= 1) {
                                    dataSizeGroups.small++;
                                  } else if (dataGB <= 5) {
                                    dataSizeGroups.medium++;
                                  } else {
                                    dataSizeGroups.large++;
                                  }
                                }
                              }
                            }
                          });
                          
                          // If no data or all plans are cancelled, show zeros
                          if (totalAnalyzed === 0) {
                            dataSizeGroups.small = 0;
                            dataSizeGroups.medium = 0;
                            dataSizeGroups.large = 0;
                            totalAnalyzed = 0;
                          }
                          
                          // If no active eSIMs, show a placeholder message
                          if (!hasActiveEsims) {
                            return (
                              <div className="col-span-3 text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                                <Database className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                <p>No active eSIMs to analyze</p>
                              </div>
                            );
                          }
                          
                          const groups = [
                            { name: 'Small Plans', count: dataSizeGroups.small, icon: "blue" },
                            { name: 'Medium Plans', count: dataSizeGroups.medium, icon: "indigo" },
                            { name: 'Large Plans', count: dataSizeGroups.large, icon: "purple" }
                          ];
                          
                          return groups.map((group, idx) => (
                            <div key={group.name} className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm">
                              <div className={idx === 0 
                                ? "flex items-center justify-center h-8 w-8 bg-blue-100 rounded-full mb-2" 
                                : idx === 1 
                                  ? "flex items-center justify-center h-8 w-8 bg-indigo-100 rounded-full mb-2" 
                                  : "flex items-center justify-center h-8 w-8 bg-purple-100 rounded-full mb-2"}>
                                <Database className={idx === 0 
                                  ? "h-4 w-4 text-blue-600" 
                                  : idx === 1 
                                    ? "h-4 w-4 text-indigo-600" 
                                    : "h-4 w-4 text-purple-600"} />
                              </div>
                              <p className="text-xs text-gray-500">{group.name}</p>
                              <p className="text-lg font-semibold">
                                {totalAnalyzed > 0 ? Math.round((group.count / totalAnalyzed) * 100) : 0}%
                              </p>
                              <p className="text-xs text-gray-500 mt-1">({group.count} plans)</p>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                    
                    {/* Most Popular Plan Types - Based on duration */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Plan Duration Analysis</h4>
                      <div className="space-y-2">
                        {(() => {
                          // Check if we have any non-cancelled eSIMs
                          const hasActiveEsims = purchasedEsims.some((esim: any) => 
                            esim.status !== 'cancelled' && esim.status !== 'refunded' && !esim.isCancelled
                          );
                          // Analyze plan durations
                          const durationGroups = { 
                            short: 0,  // 1-7 days
                            medium: 0,  // 8-15 days
                            long: 0     // 16+ days
                          };
                          let totalAnalyzed = 0;
                          
                          // Filter active eSIMs for analysis
                          const activeEsims = purchasedEsims.filter((esim: any) => 
                            esim.status !== 'cancelled' && esim.status !== 'refunded' && 
                            !esim.isCancelled
                          );
                          
                          activeEsims.forEach((esim: any) => {
                            if (esim && esim.planId) {
                              const plan = plans.find(p => p.id === esim.planId);
                              if (plan && plan.validity) {
                                const days = Number(plan.validity);
                                if (!isNaN(days)) {
                                  totalAnalyzed++;
                                  if (days <= 7) {
                                    durationGroups.short++;
                                  } else if (days <= 15) {
                                    durationGroups.medium++;
                                  } else {
                                    durationGroups.long++;
                                  }
                                }
                              }
                            }
                          });
                          
                          // If no data or all plans are cancelled, show message
                          if (!hasActiveEsims) {
                            return (
                              <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                                <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                <p>No active eSIMs to analyze</p>
                              </div>
                            );
                          }
                          
                          // For active eSIMs, if calculations yielded no results, show zeros
                          if (totalAnalyzed === 0) {
                            durationGroups.short = 0;
                            durationGroups.medium = 0;
                            durationGroups.long = 0;
                            totalAnalyzed = 0;
                          }
                          
                          const durations = [
                            { name: '1-7 days', count: durationGroups.short, color: "blue" },
                            { name: '8-15 days', count: durationGroups.medium, color: "indigo" },
                            { name: '16+ days', count: durationGroups.long, color: "purple" }
                          ];
                          
                          return durations.map((duration, idx) => {
                            const percentage = totalAnalyzed > 0 ? Math.round((duration.count / totalAnalyzed) * 100) : 0;
                            const barClassName = idx === 0 ? "bg-blue-500 h-2 rounded-full" : 
                                               idx === 1 ? "bg-indigo-500 h-2 rounded-full" : 
                                                          "bg-purple-500 h-2 rounded-full";
                            const textClassName = idx === 0 ? "text-xs font-medium text-blue-600 w-10 text-right" : 
                                               idx === 1 ? "text-xs font-medium text-indigo-600 w-10 text-right" : 
                                                          "text-xs font-medium text-purple-600 w-10 text-right";
                            return (
                              <div key={duration.name} className="flex items-center">
                                <div className="w-full bg-gray-100 rounded-full h-2 flex-1 mr-2">
                                  <div 
                                    className={barClassName} 
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                </div>
                                <span className="text-xs text-gray-600 w-16 text-right">{duration.name}</span>
                                <span className={textClassName}>
                                  {percentage}%
                                </span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
              <Card className="shadow-md overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-gray-50 to-blue-50 pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <BarChart className="h-5 w-5 text-blue-600" />
                    Revenue Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-5">
                  <RevenueChart />
                </CardContent>
              </Card>

              <ProfitChart companies={companies} />
            </div>
            

            
            {/* eSIM Plans removed from dashboard as requested */}
      </div>
    </TooltipProvider>
  );

  return isSadminUser ? (
    <SadminLayout>
      {renderDashboardContent()}
    </SadminLayout>
  ) : (
    <DashboardLayout>
      {renderDashboardContent()}
    </DashboardLayout>
  );
}