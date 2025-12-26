import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Globe, Wifi, Clock, DollarSign } from "lucide-react";
import type { EsimPlan } from "@shared/schema";
import { useAdminCurrency } from "@/hooks/use-admin-currency";
import { convertCurrency, formatCurrency } from "@shared/utils/currency";

interface PlanSearchResultsProps {
  filteredPlans: EsimPlan[];
  isLoading?: boolean;
}

export default function PlanSearchResults({ 
  filteredPlans, 
  isLoading = false 
}: PlanSearchResultsProps) {
  const { adminCurrency } = useAdminCurrency();

  // Format price with company currency
  const formatPrice = (price: string | number) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    const targetCurrency = adminCurrency || 'USD';
    const convertedAmount = convertCurrency(numPrice, 'USD', targetCurrency);
    return formatCurrency(convertedAmount, targetCurrency);
  };
  
  if (isLoading) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Loading plans...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="shadow-md">
      <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50">
        <CardTitle className="flex items-center gap-2">
          <span className="p-1.5 bg-blue-100 rounded-full">
            <Globe className="h-4 w-4 text-blue-600" />
          </span>
          eSIM Plans ({filteredPlans.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[500px]">
          {filteredPlans.length > 0 ? (
            <div className="space-y-0 divide-y">
              {filteredPlans.map((plan) => (
                <div key={plan.id} className="p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-gray-900">{plan.name}</h3>
                      <p className="text-sm text-gray-500">{plan.description || plan.name}</p>
                      
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline" className="flex items-center gap-1 bg-blue-50">
                          <Wifi className="h-3 w-3" />
                          {plan.data}GB
                        </Badge>
                        
                        <Badge variant="outline" className="flex items-center gap-1 bg-amber-50">
                          <Clock className="h-3 w-3" />
                          {plan.validity} days
                        </Badge>
                        
                        <Badge variant="outline" className="flex items-center gap-1 bg-emerald-50">
                          <DollarSign className="h-3 w-3" />
                          {formatPrice(plan.sellingPrice)}
                        </Badge>
                      </div>
                      
                      <div className="mt-2">
                        <p className="text-xs text-gray-500">Provider ID: {plan.providerId}</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <Badge variant={plan.isActive ? "default" : "destructive"} className="ml-2">
                        {plan.isActive ? "Active" : "Inactive"}
                      </Badge>
                      
                      <div className="mt-2 text-xs text-gray-500">
                        {plan.countries && plan.countries.length > 0 && (
                          <span>{plan.countries.length} {plan.countries.length === 1 ? 'country' : 'countries'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <Globe className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No plans found matching your search criteria.</p>
              <p className="text-sm mt-2">Try different search terms or check all available plans.</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}