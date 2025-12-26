import React, { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Globe } from "lucide-react";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import BulkPlanAssignmentDialog from "./BulkPlanAssignmentDialog";
import { useAdminCurrency } from "@/hooks/use-admin-currency";
import { convertCurrency, formatCurrency } from "@shared/utils/currency";
import ReactCountryFlag from 'react-country-flag';

// Determine if a code represents a region rather than a country
// Note: 'af' is NOT included as a region because it's Afghanistan's country code
const isRegion = (code: string): boolean => {
  const regions = [
    'global', 'gl', 'eu', 'na', 'sa', 'as', 'apac', 
    'sea', 'car', 'cas', 'emea', 'latam', 'europe', 'asia', 'africa', 
    'north america', 'south america', 'caribbean'
  ];
  return regions.includes(code.toLowerCase());
};

interface PlanType {
  id: number;
  providerId: string;
  name: string;
  description?: string | null;
  data: string;
  validity: number;
  retailPrice: string;
  countries?: string[] | null;
  speed?: string | null;
  providerPrice?: string;
  sellingPrice?: string;
  margin?: string;
  isActive?: boolean;
}

interface PlanComparisonProps {
  plans: PlanType[];
}

const PlanComparison: React.FC<PlanComparisonProps> = ({ plans = [] }) => {
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dataFilter, setDataFilter] = useState<string>("all");
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { adminCurrency } = useAdminCurrency();

  // Format price with company currency
  const formatPrice = (price: string | number) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(numPrice, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };

  // Get unique regions/countries and sort them
  const regions = Array.from(new Set(plans.flatMap(plan => plan.countries || [])))
    .map(code => {
      const specialRegions: Record<string, string> = {
        'cas': 'Central Asia',
        'car': 'Caribbean',
        'africa': 'Africa',
        'apac': 'Asia-Pacific',
        'emea': 'Europe, Middle East & Africa',
        'latam': 'Latin America',
        'global': 'Global',
        'eu': 'Europe',
        'na': 'North America',
        'sa': 'South America',
        'sau': 'Saudi Arabia'
      };

      let displayName;
      if (specialRegions[code.toLowerCase()]) {
        displayName = specialRegions[code.toLowerCase()];
      } else {
        try {
          const regionCode = code.length === 2 ? code : code.substring(0, 2);
          displayName = new Intl.DisplayNames(['en'], { type: 'region' }).of(regionCode.toUpperCase()) || code;
        } catch {
          displayName = code.toUpperCase();
        }
      }

      return { code, displayName };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  // Function to convert country codes to names
  const getCountryNames = (countryCodes: string[]) => {
    const specialRegions: Record<string, string> = {
      'cas': 'Central Asia',
      'car': 'Caribbean',
      'africa': 'Africa',
      'apac': 'Asia-Pacific',
      'emea': 'Europe, Middle East & Africa',
      'latam': 'Latin America',
      'global': 'Global',
      'eu': 'Europe',
      'na': 'North America',
      'sa': 'South America',
      'sau': 'Saudi Arabia'
    };

    // Convert codes to readable names
    const countryNames = countryCodes.map(code => {
      if (specialRegions[code.toLowerCase()]) {
        return specialRegions[code.toLowerCase()];
      }

      try {
        if (code.length === 2) {
          return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) || code;
        } else {
          return code;
        }
      } catch {
        return code.toUpperCase();
      }
    });

    // Sort and join with line breaks
    return countryNames.sort().join('\n');
  };

  // Filter and sort plans
  const filteredPlans = [...plans]
    .filter(plan => {
      // Region filter
      if (selectedRegion !== "all" && !plan.countries?.includes(selectedRegion)) {
        return false;
      }

      // Search term filter
      if (searchTerm && !plan.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      // Data amount filter
      const dataAmount = parseFloat(plan.data);
      if (dataFilter === "small" && dataAmount > 5) return false;
      if (dataFilter === "medium" && (dataAmount <= 5 || dataAmount > 10)) return false;
      if (dataFilter === "large" && dataAmount <= 10) return false;

      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="search">Search Plans</Label>
            <Input
              id="search"
              type="text"
              placeholder="Search by plan name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="region">Region/Country</Label>
            <select
              id="region"
              className="w-full p-2 border rounded-md mt-1"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
            >
              <option value="all">All Regions/Countries</option>
              {regions.map(({ code, displayName }) => (
                <option key={code} value={code}>
                  {displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="data">Data Amount</Label>
            <select
              id="data"
              className="w-full p-2 border rounded-md mt-1"
              value={dataFilter}
              onChange={(e) => setDataFilter(e.target.value)}
            >
              <option value="all">All Data Amounts</option>
              <option value="small">Small (&le; 5GB)</option>
              <option value="medium">Medium (5-10GB)</option>
              <option value="large">Large (&gt; 10GB)</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Speed</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Validity (Days)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data (GB)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Countries</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredPlans.map((plan) => (
              <tr 
                key={plan.id} 
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setSelectedPlan(plan);
                  setIsDialogOpen(true);
                }}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {plan.countries && plan.countries.length > 0 ? (
                      <>
                        {plan.countries.length === 1 && !isRegion(plan.countries[0]) ? (
                          <ReactCountryFlag
                            svg
                            countryCode={plan.countries[0].toUpperCase()}
                            style={{ 
                              width: '1.25rem', 
                              height: '1.25rem',
                              marginRight: '0.5rem',
                              borderRadius: '9999px'
                            }}
                            title={plan.countries[0]}
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold mr-2">
                            {(() => {
                              // Check for regions
                              if (plan.countries.some(c => c.toLowerCase() === 'global' || c.toLowerCase() === 'gl')) return 'GL';
                              if (plan.countries.some(c => c.toLowerCase() === 'car' || c.toLowerCase().includes('carib'))) return 'CR';
                              if (plan.countries.some(c => c.toLowerCase() === 'eu' || c.toLowerCase().includes('europe'))) return 'EU';
                              if (plan.countries.some(c => c.toLowerCase() === 'na' || c.toLowerCase().includes('north'))) return 'NA';
                              if (plan.countries.some(c => c.toLowerCase() === 'sa' || c.toLowerCase().includes('south'))) return 'SA';
                              if (plan.countries.some(c => c.toLowerCase() === 'apac' || c.toLowerCase() === 'as' || c.toLowerCase().includes('asia'))) return 'AS';
                              if (plan.countries.some(c => c.toLowerCase().includes('africa'))) return 'AF';

                              // For multi-country plans, use the first letter of the plan name
                              if (plan.countries.length > 1) {
                                return plan.name.charAt(0).toUpperCase();
                              }

                              // For single region, use the first two letters
                              const firstCountry = plan.countries[0];
                              return firstCountry && firstCountry.length > 1
                                ? firstCountry.substring(0, 2).toUpperCase()
                                : 'GL';
                            })()}
                          </div>
                        )}
                        <span>{plan.name}</span>
                      </>
                    ) : (
                      <>
                        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold mr-2">
                          GL
                        </div>
                        <span>{plan.name}</span>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">{plan.speed || "4G/LTE"}</td>
                <td className="px-6 py-4">{plan.validity}</td>
                <td className="px-6 py-4">{plan.data}</td>
                <td className="px-6 py-4">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center cursor-help">
                          <div className="p-1.5 bg-blue-100 rounded-full mr-2">
                            <Globe className="h-4 w-4 text-blue-600" />
                          </div>
                          <span>
                            {plan.countries && plan.countries.length > 0 
                              ? `${plan.countries.length} ${plan.countries.length === 1 ? 'country' : 'countries'}`
                              : 'Global coverage'}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[300px] p-2">
                        <div className="text-sm whitespace-pre-line max-h-[300px] overflow-y-auto">
                          {plan.countries && plan.countries.length > 0 
                            ? getCountryNames(plan.countries)
                            : 'Global coverage - Check plan details for specific restrictions'}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </td>
                <td className="px-6 py-4 flex items-center justify-between">
                  <span>{formatPrice(plan.retailPrice)}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="ml-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPlan(plan);
                      setIsDialogOpen(true);
                    }}
                  >
                    <Users className="h-4 w-4 mr-1" />
                    Assign
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk Assignment Dialog */}
      <BulkPlanAssignmentDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setSelectedPlan(null);
        }}
        selectedPlan={selectedPlan}
      />
    </div>
  );
};

export default PlanComparison;