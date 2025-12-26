import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Trophy, Award, Medal, Globe, Clock, Database } from "lucide-react";
import type { EsimPlan } from "@shared/schema";

// Define a type for the processed plan with count information
interface PlanWithCount {
  planId: number;
  providerId: string;
  name: string;
  count: number;
  data: string;
  validity: number;
  countries: string[];
}

interface TopPurchasedPlansCardProps {
  purchasedEsims?: any[];
  plans?: EsimPlan[];
}

export default function TopPurchasedPlansCard({ 
  purchasedEsims = [],
  plans = []
}: TopPurchasedPlansCardProps) {
  
  // Calculate the most purchased plans
  const topPurchasedPlans = useMemo<PlanWithCount[]>(() => {
    if (!purchasedEsims.length || !plans.length) return [];
    
    // Count occurrences of each plan by planId
    const planCounts: Record<number, number> = {};
    
    purchasedEsims.forEach((esim: any) => {
      // Skip cancelled or refunded plans as requested
      if (esim.status === 'cancelled' || esim.status === 'refunded') {
        return;
      }
      
      // Use planId from the database format (most common case)
      const planId = esim.planId || esim.plan_id;
      
      // Only count active or completed purchases
      if (planId) {
        planCounts[planId] = (planCounts[planId] || 0) + 1;
      } 
      // Fallback to providerId if planId isn't available
      else if (esim.providerId) {
        // Find the corresponding plan
        const plan = plans.find(p => p.providerId === esim.providerId);
        if (plan) {
          planCounts[plan.id] = (planCounts[plan.id] || 0) + 1;
        }
      }
    });
    
    // Create an array of plan objects with their counts
    const plansWithCounts = Object.entries(planCounts)
      .map(([planIdStr, count]) => {
        const planId = parseInt(planIdStr);
        const plan = plans.find(p => p.id === planId);
        
        if (!plan) {
          return null;
        }
        
        return {
          planId,
          providerId: plan.providerId,
          name: plan.name,
          count,
          data: plan.data || '0',
          validity: plan.validity || 0,
          countries: plan.countries || []
        };
      })
      .filter((plan): plan is PlanWithCount => plan !== null); // Type-safe way to remove nulls
    
    // Sort by count (highest first) and take top 3
    return plansWithCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [purchasedEsims, plans]);

  // Get the appropriate position label
  const getPositionLabel = (index: number) => {
    switch(index) {
      case 0: return "1st";
      case 1: return "2nd";
      case 2: return "3rd";
      default: return `${index+1}th`;
    }
  };
  
  // Get the appropriate badge for each rank
  const getRankBadge = (index: number) => {
    switch(index) {
      case 0: 
        return (
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-sm">
            <Trophy className="h-4 w-4 text-white" />
          </div>
        );
      case 1: 
        return (
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-gray-300 to-gray-400 shadow-sm">
            <Trophy className="h-4 w-4 text-white" />
          </div>
        );
      case 2: 
        return (
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-amber-600 to-amber-800 shadow-sm">
            <Trophy className="h-4 w-4 text-white" />
          </div>
        );
      default: 
        return (
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200">
            <Trophy className="h-4 w-4 text-gray-500" />
          </div>
        );
    }
  };
  
  return (
    <Card className="shadow-sm overflow-hidden border-0 rounded-xl">
      <CardHeader className="border-b bg-white pb-4">
        <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Top Purchased Plans
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 bg-gray-50">
        {topPurchasedPlans.length > 0 ? (
          <div>
            {topPurchasedPlans.map((plan: PlanWithCount, index: number) => (
              <div 
                key={`${plan.planId}-${plan.providerId}`}
                className="flex items-start p-4 border-b last:border-b-0 transition-colors hover:bg-gray-100/50"
              >
                <div className="mr-3 flex-shrink-0 mt-1">
                  {getRankBadge(index)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-gray-900 flex items-center gap-1">
                        {plan.name}
                        <span className="text-xs font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          {getPositionLabel(index)}
                        </span>
                      </h4>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Database className="h-3 w-3" />
                          <span>{plan.data}GB</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{plan.validity} days</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          <span>{plan.countries.length} {plan.countries.length === 1 ? 'country' : 'countries'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-center min-w-12 h-12 rounded-lg bg-indigo-100 text-indigo-700">
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-bold">{plan.count}</span>
                        <span className="text-xs">sold</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Trophy className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No plan purchases recorded yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}