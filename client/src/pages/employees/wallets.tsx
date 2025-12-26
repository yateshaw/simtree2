import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import SadminLayout from '@/components/layout/SadminLayout';
import { Search, PlusCircle, DollarSign, RefreshCw, DownloadCloud } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/formatters';

export default function EmployeeWallets() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch employees with wallet data
  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ['/api/employees/with-wallets'],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const employees = employeesData?.data || [];

  // Filter employees based on search term
  const filteredEmployees = employees.filter(exec => 
    exec.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (exec.email && exec.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (exec.company && exec.company.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleAddCredit = (employeeId: number) => {
    toast({
      title: "Adding credit",
      description: "This functionality will be implemented soon.",
    });
  };

  return (
    <SadminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Employee Wallets</h1>
            <p className="text-gray-500 mt-1">
              Manage individual wallet balances and credits for employees
            </p>
          </div>
          <Button variant="outline" className="flex items-center gap-2">
            <DownloadCloud size={18} /> Export Report
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Employee Wallet Management</CardTitle>
            <CardDescription>
              Manage credit balances for employee travel accounts
            </CardDescription>

            <div className="flex items-center gap-4 mt-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  type="search"
                  placeholder="Search by employee name, email, or company..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Button variant="default" className="flex items-center gap-2">
                <RefreshCw size={16} /> Refresh Data
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {employeesLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Wallet ID</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                          No employees found. Try adjusting your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredEmployees.map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell className="font-medium">
                            <div>
                              <div className="font-medium">{employee.name}</div>
                              <div className="text-sm text-gray-500">{employee.email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {employee.company ? employee.company.name : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {employee.wallet ? employee.wallet.id : 'Not Created'}
                          </TableCell>
                          <TableCell className="font-medium">
                            {employee.wallet 
                              ? formatCurrency(employee.wallet.balance || 0) 
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={employee.wallet ? 'default' : 'secondary'}
                            >
                              {employee.wallet ? 'Active' : 'No Wallet'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="mr-2"
                              onClick={() => handleAddCredit(employee.id)}
                            >
                              <DollarSign size={14} className="mr-1" /> Add Credit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                            >
                              View History
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SadminLayout>
  );
}