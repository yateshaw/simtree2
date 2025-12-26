import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmployeeGridUploader from './EmployeeGridUploader';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { insertEmployeeSchema } from "@shared/schema";
import type { z } from "zod";
import { User, Users, FileText } from 'lucide-react';

type FormData = z.infer<typeof insertEmployeeSchema>;

interface EmployeeManagerProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showBulkDefault?: boolean;
}

/**
 * EmployeeManager - A unified component for adding employees individually or in bulk
 * 
 * This component combines the functionality of the previous AddEmployeeForm and BulkExecUploadDialog
 * into a single tabbed interface, providing a consistent way to add employees to the system.
 */
const EmployeeManager: React.FC<EmployeeManagerProps> = ({ 
  trigger, 
  open,
  onOpenChange,
  showBulkDefault = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>(showBulkDefault ? "bulk" : "single");

  // Use controlled state if provided via props
  const dialogOpen = open !== undefined ? open : isOpen;
  const setDialogOpen = onOpenChange || setIsOpen;

  const handleClose = () => {
    setDialogOpen(false);
  };

  // Individual employee form setup
  const form = useForm<FormData>({
    resolver: zodResolver(insertEmployeeSchema),
    defaultValues: {
      name: "",
      position: "",
      email: "",
      phoneNumber: "",
    },
  });

  // Add individual employee mutation
  const addEmployeeMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest('/api/employees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      toast({
        title: "Success",
        description: "Employee added successfully",
      });
      form.reset();
      if (onOpenChange) handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add employee",
        variant: "destructive",
      });
    },
  });

  // Submit handler for individual employee form
  const onSubmit = (data: FormData) => {
    addEmployeeMutation.mutate(data);
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-[1200px] max-h-[95vh] overflow-y-auto">
        <DialogHeader className="space-y-3 pb-4">
          <DialogTitle className="text-xl font-semibold text-gray-900">Add Employees</DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            Add one or more employees easily. You can paste data directly from Excel or add them manually.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single" className="flex items-center">
              <User className="w-4 h-4 mr-2" />
              Add Single Employee
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center">
              <Users className="w-4 h-4 mr-2" />
              Bulk Add Employees
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="single" className="pt-6">
            <div className="max-w-md mx-auto">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-5">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-sm font-medium text-gray-700">Full Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="John Doe" 
                              className="h-11 px-4 text-sm border-gray-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="position"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-sm font-medium text-gray-700">Position *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="CEO, Manager, Director..." 
                              className="h-11 px-4 text-sm border-gray-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-sm font-medium text-gray-700">Email Address *</FormLabel>
                          <FormControl>
                            <Input 
                              type="email" 
                              placeholder="john@company.com" 
                              className="h-11 px-4 text-sm border-gray-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-sm font-medium text-gray-700">Phone Number *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="+1 (555) 123-4567" 
                              className="h-11 px-4 text-sm border-gray-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 text-sm font-medium bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    disabled={addEmployeeMutation.isPending}
                  >
                    {addEmployeeMutation.isPending ? "Adding Employee..." : "Add Employee"}
                  </Button>
                </form>
              </Form>
            </div>
          </TabsContent>
          
          <TabsContent value="bulk" className="pt-4">
            <EmployeeGridUploader onComplete={handleClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

// Export button trigger components for easier use in other files
export const SingleEmployeeButton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <EmployeeManager
    trigger={
      <Button variant="outline" size="sm" className={`text-xs sm:text-sm ${className}`}>
        <User className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
        <span className="whitespace-nowrap">Add Employee</span>
      </Button>
    }
  />
);

export const BulkEmployeeButton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <EmployeeManager
    showBulkDefault={true}
    trigger={
      <Button variant="outline" size="sm" className={`text-xs sm:text-sm ${className}`}>
        <FileText className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
        <span className="whitespace-nowrap">Bulk Add Employees</span>
      </Button>
    }
  />
);

export default EmployeeManager;