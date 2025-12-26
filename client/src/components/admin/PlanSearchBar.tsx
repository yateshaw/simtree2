import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { EsimPlan } from "@shared/schema";

interface PlanSearchBarProps {
  plans: EsimPlan[];
  onSearch: (results: EsimPlan[]) => void;
}

export default function PlanSearchBar({ plans, onSearch }: PlanSearchBarProps) {
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
  
  const handleSearch = () => {
    if (!searchTerm.trim()) {
      // If empty search, return all plans
      onSearch(plans);
      return;
    }
    
    // Filter plans based on search term
    const term = searchTerm.toLowerCase();
    const results = plans.filter(plan => {
      return (
        plan.name.toLowerCase().includes(term) ||
        plan.description?.toLowerCase().includes(term) ||
        plan.providerId.toLowerCase().includes(term) ||
        plan.countries?.some(country => 
          country.toLowerCase().includes(term) || matchesCountryAlias(term, country)
        )
      );
    });
    
    onSearch(results);
  };
  
  const handleClear = () => {
    setSearchTerm("");
    onSearch(plans);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };
  
  return (
    <Card className="shadow-sm border-0 mb-4">
      <CardContent className="pt-4">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder="Search plans by name, provider ID, or country..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pr-10"
            />
            {searchTerm && (
              <button
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={handleClear}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button 
            variant="default" 
            onClick={handleSearch}
            className="gap-2"
          >
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}