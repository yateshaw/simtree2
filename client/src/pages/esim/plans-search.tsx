import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import SadminLayout from "@/components/layout/SadminLayout";
import PlanSearchBar from "@/components/admin/PlanSearchBar";
import PlanSearchResults from "@/components/admin/PlanSearchResults";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import type { EsimPlan } from "@shared/schema";

export default function PlansSearchPage() {
  const { user } = useAuth();
  const [filteredPlans, setFilteredPlans] = useState<EsimPlan[]>([]);
  
  // Fetch all plans
  const { data: plansResponse, isLoading } = useQuery<{ success: boolean, data: EsimPlan[] }>({
    queryKey: ["/api/admin/plans"],
    enabled: !!user,
  });
  
  // Extract plans from the response
  const plans = plansResponse?.success ? plansResponse.data : [];
  
  // Set filtered plans when plans are loaded
  React.useEffect(() => {
    if (plans && plans.length > 0) {
      setFilteredPlans(plans);
    }
  }, [plans]);

  const handleSearch = (results: EsimPlan[]) => {
    setFilteredPlans(results);
  };
  
  return (
    <SadminLayout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">eSIM Plans Search</h1>
          <Link href="/admin/dashboard">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        
        <PlanSearchBar 
          plans={plans} 
          onSearch={handleSearch} 
        />
        
        <PlanSearchResults 
          filteredPlans={filteredPlans} 
          isLoading={isLoading} 
        />
      </div>
    </SadminLayout>
  );
}