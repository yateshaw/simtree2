import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import SuperAdminEmployeeTable from '@/components/admin/SuperAdminEmployeeTable';
import SadminLayout from '@/components/layout/SadminLayout';
import { useAuth } from '@/hooks/use-auth';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Import types
import type { Employee, EsimPlan } from '@shared/schema';

export default function EmployeesList() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch employees data
  const { data: allEmployees, isLoading: employeesLoading, error: employeesError } = useQuery<(Employee & { companyName?: string })[]>({
    queryKey: ['/api/admin/employees'],
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!user,
  });

  // Fetch purchased eSIMs data for all employees across all companies (SuperAdmin view)
  const { data: purchasedEsimsResponse, isLoading: esimsLoading } = useQuery<{ success: boolean, data: Array<any> }>({
    queryKey: ['/api/admin/esims/purchased-esims'],
    staleTime: 1000 * 60 * 5, // 5 minutes - SSE handles real-time updates
    refetchOnWindowFocus: false,
    enabled: !!user && user.isSuperAdmin,
  });

  // Handle errors
  useEffect(() => {
    if (employeesError) {
      toast({
        title: 'Error loading employees',
        description: 'Unable to load employees data. Please try again later.',
        variant: 'destructive',
      });
    }
  }, [employeesError, toast]);

  // Extract purchased eSIMs data
  const purchasedEsims = purchasedEsimsResponse?.data || [];

  return (
    <SadminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Employees Management</h1>
            <p className="text-gray-500 mt-1">
              View and manage all employees across companies
            </p>
          </div>
          <Button variant="default" className="flex items-center gap-2">
            <Plus size={18} /> Add Employee
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>All Employees</CardTitle>
            <CardDescription>
              {allEmployees?.length || 0} employees registered in the platform
            </CardDescription>
          </CardHeader>

          <CardContent>
            {employeesLoading || esimsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <SuperAdminEmployeeTable 
                employees={allEmployees ?? []}
                purchasedEsimsData={purchasedEsims}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </SadminLayout>
  );
}