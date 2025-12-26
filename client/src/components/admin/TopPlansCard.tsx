import React, { useMemo } from "react";
import { Trophy } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { EsimPlan } from "@shared/schema";
import { config } from '@/lib/config';

interface TopPlansCardProps {
  purchasedEsims?: any[];
  plans?: EsimPlan[];
}

export default function TopPlansCard({ 
  purchasedEsims = [], 
  plans = [] 
}: TopPlansCardProps) {
  
  // Find the most purchased plan
  const topPlan = useMemo(() => {
    if (!purchasedEsims.length || !plans.length) return null;
    
    // Count occurrences of each plan by providerId
    const planCounts: Record<string, number> = {};
    
    purchasedEsims.forEach((esim: any) => {
      // Check if plan_id exists (direct database format)
      if (esim.plan_id && esim.status !== 'cancelled' && esim.status !== 'refunded') {
        // Find the plan using plan_id to get its provider_id
        const plan = plans.find(p => p.id === esim.plan_id);
        if (plan && plan.providerId) {
          planCounts[plan.providerId] = (planCounts[plan.providerId] || 0) + 1;
        }
      } 
      // Also handle the previous structure with providerId (frontend format)
      else if (esim.providerId && esim.status !== 'cancelled' && esim.status !== 'refunded') {
        planCounts[esim.providerId] = (planCounts[esim.providerId] || 0) + 1;
      }
    });
    
    // Find the plan with highest count
    let maxCount = 0;
    let topProviderId = '';
    
    Object.entries(planCounts).forEach(([providerId, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topProviderId = providerId;
      }
    });
    
    const topPlanDetails = plans.find(p => p.providerId === topProviderId);
    
    if (!topPlanDetails) return null;
    
    return {
      name: topPlanDetails.name || topProviderId,
      count: maxCount,
      providerId: topProviderId
    };
  }, [purchasedEsims, plans]);
  
  return (
    <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-orange-50 to-amber-50 hover:shadow-lg transition-all">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <Trophy className="h-5 w-5" />
          Top Purchased Plan
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-4xl font-bold text-amber-700">
              {topPlan ? (
                <span className="flex items-center">
                  <span>{topPlan.name.split(' ')[0]}</span>
                  <span className="ml-2 text-base text-amber-600">({topPlan.count} purchases)</span>
                </span>
              ) : (
                <span className="text-2xl text-amber-600">No purchases yet</span>
              )}
            </p>
            <p className="text-sm text-amber-600">Most Purchased eSIM Plan</p>
          </div>
          <div className="flex flex-col items-end">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 text-xs border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-200"
              onClick={() => window.location.href = config.getFullUrl('/esim/plans')}
            >
              <Trophy className="h-3 w-3" />
              View Plans
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}