import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const FLAG_LOCAL_PATH = "/flags";

interface SimplePlansListProps {
  plans: Array<{
    id: number;
    name: string;
    providerId: string;
    data: string;
    validity: number;
    countries?: string[];
  }>;
}

const SimplePlansList: React.FC<SimplePlansListProps> = ({ plans = [] }) => {
  const [searchTerm, setSearchTerm] = useState("");

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

  // Helper function to check if a query matches any country alias
  const matchesCountryAlias = (query: string, countryCode: string): boolean => {
    const code = countryCode.toLowerCase();
    if (code.includes(query)) return true;
    const aliases = countryAliases[code];
    if (aliases) {
      return aliases.some(alias => alias.includes(query) || query.includes(alias));
    }
    return false;
  };

  const filteredPlans = plans.filter((plan) => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    return (
      plan.name.toLowerCase().includes(term) ||
      plan.countries?.some(country => 
        country.toLowerCase().includes(term) || matchesCountryAlias(term, country)
      )
    );
  });

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

  const getCountryCode = (code: string): string => {
    const regionMapping: Record<string, string> = {
      'cas': 'CA',
      'car': 'CR', // Caribbean
      'africa': 'AF',  // Africa (using full name to avoid conflict with Afghanistan)
      'apac': 'AS', // Asia-Pacific
      'emea': 'EU', // Europe, Middle East, and Africa
      'latam': 'SA', // Latin America
      'global': 'global',
      'gl': 'global',
      'eu': 'EU',  // Europe
      'na': 'NA',  // North America
      'sa': 'SA',  // South America
      'sau': 'SA'  // Saudi Arabia
    };

    const normalizedCode = code.toLowerCase();
    return regionMapping[normalizedCode] || code;
  };

  const renderCountryIcon = (plan: {
    id: number;
    name: string;
    providerId: string;
    data: string;
    validity: number;
    countries?: string[];
  }) => {
    if (!plan.countries || plan.countries.length === 0) {
      return (
        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
          GL
        </div>
      );
    }

    const countryCode = plan.countries[0];
    const code = getCountryCode(countryCode);
    
    // For multi-country plans, show badge with first letter of plan name
    if (plan.countries.length > 1) {
      return (
        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
          {plan.name.charAt(0).toUpperCase()}
        </div>
      );
    }
    
    // If it's a region, show as an icon with the region code
    if (isRegion(countryCode)) {
      // Display the region code
      const displayText = code === 'global' ? 'GL' : 
                         code === 'EU' ? 'EU' : 
                         code === 'NA' ? 'NA' :
                         code === 'SA' ? 'SA' :
                         code === 'AF' ? 'AF' :
                         code === 'AS' ? 'AS' :
                         code === 'CR' ? 'CR' :
                         code.substring(0, 2).toUpperCase();
                         
      return (
        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
          {displayText}
        </div>
      );
    }

    // For single-country plans, use the flag image
    return (
      <div className="w-5 h-5 rounded-full overflow-hidden">
        <img
          src={`${FLAG_LOCAL_PATH}/${code.toLowerCase()}.svg`}
          alt={countryCode}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            if (import.meta.env.DEV) { console.log(`Flag not found for ${code.toLowerCase()}, falling back to text`); }
            const target = e.currentTarget;
            target.onerror = null;
            const div = document.createElement('div');
            div.className = "w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold";
            div.textContent = code.substring(0, 2).toUpperCase();
            target.parentNode?.replaceChild(div, target);
          }}
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Search Plans</h3>
        <Input
          type="text"
          placeholder="Search by plan name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <h4 className="text-xs uppercase font-semibold text-gray-500 mb-3">PLAN</h4>
          <div className="space-y-3">
            {filteredPlans.map((plan) => (
              <div key={plan.id} className="flex items-center space-x-3">
                {renderCountryIcon(plan)}
                <span className="font-medium text-sm">
                  {plan.name} ({plan.data} / {plan.validity}D)
                </span>
              </div>
            ))}
            {filteredPlans.length === 0 && (
              <div className="text-center py-4 text-gray-500">
                No plans match your search
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SimplePlansList;