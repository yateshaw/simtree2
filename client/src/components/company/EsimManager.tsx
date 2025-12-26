import React, { useEffect, useState } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Loader2, RefreshCw, Send, DatabaseIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { EsimDetails } from "./EsimDetails";
import { 
  Dialog, 
  DialogContent, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// Flag management approach:
// 1. First check if the eSIM API provides a flag image directly
// 2. Otherwise use our local SVG flags
const FLAG_LOCAL_PATH = "/flags";

interface EsimManagerProps {
  employeeId?: number;
  employees?: any[];
  plans?: any[];
}

export default function EsimManager({ employeeId, employees = [], plans = [] }: EsimManagerProps) {
  const [loading, setLoading] = useState(true);
  const [esims, setEsims] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEsim, setSelectedEsim] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Set up automatic synchronization with the provider API
  useEffect(() => {
    const performInitialSync = async () => {
      if (employeeId) {
        // First fetch basic eSIM data
        await fetchEsimsByEmployeeId(employeeId);
        
        // Then synchronize with the provider API automatically
        // This happens in the background without requiring user interaction
        // and doesn't show notifications
        await syncWithEsimApi(false);
      } else {
        // If employee list is provided instead of employeeId, use it directly
        setEsims([]);
        setLoading(false);
      }
    };
    
    performInitialSync();
  }, [employeeId]);
  
  // Debug useEffect to check for flag URLs in API data
  useEffect(() => {
    if (esims && esims.length > 0) {
      if (import.meta.env.DEV) { console.log("Debugging flag images paths:"); }
      
      // Check first eSIM for any potential flag URL paths
      const firstEsim = esims[0];
      console.log({
        esimId: firstEsim.id,
        directFlagUrl: firstEsim.flagUrl || null,
        planFlagUrl: firstEsim.plan?.flagUrl || null,
        metadataFlagUrl: firstEsim.metadata?.flagUrl || null,
        hasRawData: !!firstEsim.metadata?.rawData,
        rawDataType: firstEsim.metadata?.rawData ? typeof firstEsim.metadata.rawData : null,
        rawDataObj: firstEsim.metadata?.rawData?.obj ? "exists" : null,
        esimListExists: firstEsim.metadata?.rawData?.obj?.esimList ? "exists" : null,
        packageListExists: firstEsim.metadata?.rawData?.obj?.esimList?.[0]?.packageList ? "exists" : null,
        flagImgExists: firstEsim.metadata?.rawData?.obj?.esimList?.[0]?.packageList?.[0]?.flagImg ? "exists" : null
      });
      
      if (firstEsim.metadata?.rawData?.obj?.esimList?.[0]?.packageList?.[0]?.flagImg) {
        if (import.meta.env.DEV) { console.log("Found flag image URL:", firstEsim.metadata.rawData.obj.esimList[0].packageList[0].flagImg); }
      }
    }
  }, [esims]);

  const fetchEsimsByEmployeeId = async (execId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/esim/purchased/${execId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch eSIMs");
      }
      const { data } = await response.json();
      if (import.meta.env.DEV) { console.log("Fetched eSIMs:", data); }
      setEsims(data || []);
    } catch (error) {
      console.error("Error fetching eSIMs:", error);
      toast({
        title: "Error",
        description: "Failed to load eSIM information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshEsimStatus = async (esimId: number) => {
    try {
      setRefreshing(true);
      // Force cache bypass with timestamp
      const timestamp = new Date().getTime();
      const response = await fetch(
        `/api/esim/purchased/${employeeId}?esimId=${esimId}&_t=${timestamp}`,
        {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        }
      );

      if (!response.ok) {
        throw new Error("Failed to refresh eSIM status");
      }

      const { data: updatedEsim } = await response.json();
      if (import.meta.env.DEV) { console.log("Refreshed eSIM status:", updatedEsim); }

      // Update the esims state with the new data
      setEsims(current =>
        current.map(esim => {
          if (esim.id === updatedEsim.id) {
            // Merge the existing esim data with updated data
            return {
              ...esim,
              ...updatedEsim,
              // Ensure metadata is properly updated
              metadata: updatedEsim.metadata
            };
          }
          return esim;
        })
      );

      // If this is the currently selected eSIM, update it in the details view
      if (selectedEsim?.id === esimId) {
        setSelectedEsim(updatedEsim);
      }

      // Invalidate relevant queries to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employeeEsims"] });

      toast({
        title: "Success",
        description: "eSIM status refreshed",
      });

      return updatedEsim;
    } catch (error) {
      console.error("Error refreshing eSIM:", error);
      toast({
        title: "Error",
        description: "Failed to refresh eSIM status",
        variant: "destructive",
      });
      throw error;
    } finally {
      setRefreshing(false);
    }
  };

  const handleViewDetails = async (esim: any) => {
    try {
      const updatedEsim = await refreshEsimStatus(esim.id);
      setSelectedEsim(updatedEsim);
      setShowDetails(true);
    } catch (error) {
      console.error("Error viewing details:", error);
    }
  };

  const sendActivationEmail = async (esimId: number, email: string) => {
    try {
      const response = await fetch("/api/esim/send-activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId,
          email,
          esimId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send activation email");
      }

      toast({
        title: "Success",
        description: "Activation email sent successfully",
      });
    } catch (error) {
      console.error("Error sending activation email:", error);
      toast({
        title: "Error",
        description: "Failed to send activation email",
        variant: "destructive",
      });
    }
  };

  const getStatusLabel = (status: string, esim?: any) => {
    // If esim is provided, check metadata for GOT_RESOURCE status with QR and activation code
    if (esim) {
      const providerStatus = esim?.metadata?.obj?.obj?.esimList?.[0]?.esimStatus?.toUpperCase();
      const hasQrCode = !!esim.qrCode;
      const hasActivationCode = !!esim.activationCode;

      // Check if GOT_RESOURCE with QR and activation code - should be treated as activated
      if (providerStatus === "GOT_RESOURCE" && hasQrCode && hasActivationCode) {
        return 'Active';
      }
    }

    switch (status) {
      case 'activated':
        return 'Active';
      case 'waiting_for_activation':
        return 'Waiting For Activation';
      case 'pending':
        return 'Processing';
      case 'cancelled':
        return 'Cancelled';
      case 'expired':
        return 'Expired';
      case 'error':
        return 'Error';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "waiting_for_activation":
        return "bg-blue-100 text-blue-800";
      case "activated":
        return "bg-green-100 text-green-800";
      case "expired":
        return "bg-gray-100 text-gray-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      case "error":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  
  // Function to render country flags or region abbreviations
  const renderCountryFlag = (countryCode: string, esimData?: any) => {
    // First check if we have a direct flag URL from the API data
    if (esimData?.flagUrl || esimData?.plan?.flagUrl || esimData?.metadata?.flagUrl) {
      const flagUrl = esimData?.flagUrl || esimData?.plan?.flagUrl || esimData?.metadata?.flagUrl;
      return (
        <img
          src={flagUrl}
          alt={countryCode}
          className="w-5 h-5 rounded-full mr-2"
          loading="lazy"
        />
      );
    }
    
    // Also check if flag image is in the API metadata
    if (esimData?.metadata?.rawData?.obj?.flagImg || 
        (esimData?.metadata?.rawData && typeof esimData.metadata.rawData === 'string' && 
         esimData.metadata.rawData.includes('flagImg'))) {
      // Try to extract flag from metadata
      try {
        let flagImg;
        if (typeof esimData.metadata.rawData === 'string') {
          const parsed = JSON.parse(esimData.metadata.rawData);
          flagImg = parsed.obj?.flagImg;
        } else {
          flagImg = esimData.metadata.rawData.obj?.flagImg;
        }
        
        if (flagImg) {
          return (
            <img
              src={flagImg}
              alt={countryCode}
              className="w-5 h-5 rounded-full mr-2"
              loading="lazy"
            />
          );
        }
      } catch (error) {
        console.error("Error parsing flag data from metadata:", error);
      }
    }
    
    // Check for flag in nested esimList array
    if (esimData?.metadata?.rawData?.obj?.esimList?.[0]?.packageList?.[0]?.flagImg) {
      return (
        <img
          src={esimData.metadata.rawData.obj.esimList[0].packageList[0].flagImg}
          alt={countryCode}
          className="w-5 h-5 rounded-full mr-2"
          loading="lazy"
        />
      );
    }
    
    // Special regions or non-standard country codes
    const specialRegions: Record<string, string> = {
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
    
    // Handle special regions with abbreviation in colored circle
    if (specialRegions[countryCode.toLowerCase()]) {
      const abbr = (() => {
        if (countryCode.toLowerCase() === 'global') return 'GL';
        if (countryCode.toLowerCase() === 'car' || countryCode.toLowerCase().includes('carib')) return 'CR';
        if (countryCode.toLowerCase() === 'eu' || countryCode.toLowerCase().includes('europe')) return 'EU';
        if (countryCode.toLowerCase() === 'na' || countryCode.toLowerCase().includes('north')) return 'NA';
        if (countryCode.toLowerCase() === 'sa' || countryCode.toLowerCase().includes('south')) return 'SA';
        if (countryCode.toLowerCase() === 'apac' || countryCode.toLowerCase().includes('asia')) return 'AS';
        if (countryCode.toLowerCase() === 'af' || countryCode.toLowerCase().includes('africa')) return 'AF';
        return countryCode.substring(0, 2).toUpperCase();
      })();
      
      return (
        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold mr-2">
          {abbr}
        </div>
      );
    }
    
    // Handle country codes with our local SVG flags
    if (countryCode) {
      const code = countryCode.toLowerCase();
      // Handle special cases for global, regions, etc.
      const specialCodes: Record<string, string> = {
        'global': 'global',
        'car': 'cr',
        'caribbean': 'cr',
        'europe': 'eu',
        'north america': 'na',
        'south america': 'sa',
        'asia': 'as',
        'asia-pacific': 'as',
        'apac': 'as',
        'africa': 'af'
      };
      
      const flagCode = (specialCodes as Record<string, string>)[code] || (code.length === 2 ? code : null);
      
      if (flagCode) {
        return (
          <img
            src={`${FLAG_LOCAL_PATH}/${flagCode}.svg`}
            alt={countryCode}
            className="w-5 h-5 rounded-full mr-2"
            loading="lazy"
            onError={(e) => {
              if (import.meta.env.DEV) { console.log(`Flag not found for ${flagCode}, falling back to text`); }
              const target = e.currentTarget;
              target.onerror = null;
              const div = document.createElement('div');
              div.className = "w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold mr-2";
              div.textContent = countryCode.substring(0, 2).toUpperCase();
              target.parentNode?.replaceChild(div, target);
            }}
          />
        );
      }
    }
    
    // Fallback for unknown country codes
    return (
      <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-bold mr-2">
        {countryCode ? countryCode.substring(0, 2).toUpperCase() : "??"}
      </div>
    );
  };

  // Function to handle button clicks - used as event handlers
  const handleSyncButtonClick = () => {
    syncWithEsimApi(true);
  };
  
  const handleRefreshButtonClick = () => {
    if (employeeId) {
      fetchEsimsByEmployeeId(employeeId);
    }
  };
  
  // Function to synchronize eSIM statuses with the provider API
  // showNotifications=false for automatic sync in the background
  const syncWithEsimApi = async (showNotifications: boolean = true) => {
    if (!employeeId) return;
    
    setRefreshing(true);
    try {
      // Call the API endpoint to fix eSIMs for this employee
      const response = await fetch('/api/debug/fix-employee-esims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId })
      });
      
      const result = await response.json();
      
      if (result.success) {
        const fixedCount = result.fixedEsims?.length || 0;
        
        if (fixedCount > 0) {
          // Only show toast notification if showNotifications is true
          if (showNotifications) {
            toast({
              title: "eSIM statuses synchronized",
              description: `${fixedCount} eSIMs were updated based on the provider API data.`,
              duration: 5000
            });
          }
          
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
          queryClient.invalidateQueries({ queryKey: ['/api/esim/purchased'] });
          queryClient.invalidateQueries({ queryKey: [`/api/esim/purchased/${employeeId}`] });
          
          // Refetch data for this employee after a short delay
          await new Promise(resolve => setTimeout(resolve, 1000));
          fetchEsimsByEmployeeId(employeeId);
        } else if (showNotifications) {
          // Only show this notification if showNotifications is true
          toast({
            title: "All eSIMs are up to date",
            description: "All eSIM statuses are already synchronized with the provider API.",
            duration: 5000
          });
        }
      } else if (showNotifications) {
        // Only show error notifications if showNotifications is true
        toast({
          variant: 'destructive',
          title: "Error updating eSIMs",
          description: result.message || "Something went wrong. Please try again.",
          duration: 5000
        });
      }
    } catch (error) {
      console.error("Error synchronizing eSIM statuses:", error);
      // Only show error notifications if showNotifications is true
      if (showNotifications) {
        toast({
          variant: 'destructive',
          title: "Error synchronizing eSIMs",
          description: "An unexpected error occurred. Please try again.",
          duration: 5000
        });
      }
    } finally {
      setRefreshing(false);
    }
  };

  const activeEsims = (esims || []).filter(
    (esim) => !["cancelled", "expired"].includes(esim.status)
  );

  const sortedEsims = [...activeEsims].sort((a, b) => {
    return new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
  });

  // Render available plans if employees array is provided
  if (employees.length > 0 && plans.length > 0 && !employeeId) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id} className="overflow-hidden hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-4">
                <div className="flex flex-col h-full">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    <div className="flex items-center space-x-2 mt-1">
                      <div className="flex items-center">
                        {plan.countries && plan.countries.length === 1 && plan.countries[0].length === 2 ? (
                          renderCountryFlag(plan.countries[0], plan)
                        ) : null}
                        <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full flex items-center">
                          {plan.locationName}
                        </span>
                      </div>
                      <span className="text-xs font-medium px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
                        {parseFloat(plan.dataAmount).toFixed(1)} GB
                      </span>
                      <span className="text-xs font-medium px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full">
                        {plan.validity} days
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-auto">
                    <div className="flex justify-between items-center mt-2">
                      <p className="text-xl font-bold text-indigo-700">${parseFloat(plan.retailPrice).toFixed(2)}</p>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm">
                            Assign Plan
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <div className="space-y-4">
                            <h2 className="text-xl font-bold">Assign {plan.name}</h2>
                            <p>Select an employee to assign this plan to:</p>
                            <div className="max-h-72 overflow-y-auto">
                              {employees.map((exec) => (
                                <Button 
                                  key={exec.id}
                                  variant="outline"
                                  className="w-full justify-start mb-2"
                                  onClick={() => {
                                    // This would normally call an API to assign the plan
                                    toast({
                                      title: "Feature Not Implemented",
                                      description: "Plan assignment would be processed here",
                                    });
                                  }}
                                >
                                  {exec.name}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Original eSIM display for a specific employee
  return (
    <div className="space-y-4 my-2">
      {/* Header with sync button */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Employee eSIMs</h2>
        <div className="flex items-center space-x-2">
          {loading ? (
            <div className="flex items-center space-x-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSyncButtonClick}
                    disabled={refreshing}
                    className="mr-2"
                  >
                    <DatabaseIcon className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                    Sync Database
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Synchronize eSIM statuses with the provider API and update database</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshButtonClick}
                    disabled={refreshing}
                  >
                    <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Refresh the display without updating database records</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      
      {loading ? (
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-2">Loading eSIM information...</p>
        </div>
      ) : sortedEsims.length === 0 ? (
        <p>No active eSIMs found for this employee.</p>
      ) : (
        <div className="space-y-4">
          {sortedEsims.map((esim) => (
            <Card key={esim.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-shrink-0">
                    {esim.qrCode ? (
                      <div className="bg-white p-2 rounded-lg">
                        <img
                          src={esim.qrCode}
                          alt="eSIM QR Code"
                          className="w-[150px] h-[150px]"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[150px] w-[150px] bg-gray-100 rounded-lg">
                        <p className="text-sm text-gray-500">QR Code not available</p>
                      </div>
                    )}
                  </div>

                  <div className="flex-grow">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium flex items-center">
                          {esim.plan?.countries && esim.plan.countries.length === 1 && esim.plan.countries[0].length === 2 ? (
                            renderCountryFlag(esim.plan.countries[0], esim)
                          ) : null}
                          eSIM Plan: {esim.plan?.name || "Loading..."}
                        </h3>
                        <div
                          className={`mt-1 inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                            esim.status
                          )}`}
                        >
                          {getStatusLabel(esim.status, esim)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refreshEsimStatus(esim.id)}
                        disabled={refreshing}
                      >
                        <RefreshCw
                          className={`h-4 w-4 mr-1 ${
                            refreshing ? "animate-spin" : ""
                          }`}
                        />
                        Refresh
                      </Button>
                    </div>

                    <div className="mt-2 space-y-1 text-sm">
                      <p>
                        <span className="font-medium">Order ID:</span>{" "}
                        {esim.orderId}
                      </p>
                      {esim.iccid && (
                        <p>
                          <span className="font-medium">ICCID:</span>{" "}
                          {esim.iccid}
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Purchased:</span>{" "}
                        {new Date(esim.purchaseDate).toLocaleString()}
                      </p>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDetails(esim)}
                      >
                        View Details
                      </Button>
                      {(esim.status === "waiting_for_activation" ||
                        esim.status === "activated") && (
                        <Button
                          size="sm"
                          onClick={() =>
                            sendActivationEmail(
                              esim.id,
                              "employee@example.com"
                            )
                          }
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Send to Employee
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedEsim && (
        <EsimDetails
          isOpen={showDetails}
          onClose={() => {
            setShowDetails(false);
            setSelectedEsim(null);
          }}
          esim={selectedEsim}
          planName={selectedEsim.plan?.name}
          employeeId={employeeId} // Pass employeeId
          onRefresh={refreshEsimStatus}
        />
      )}
    </div>
  );
}