import React, { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

// Entity types available for selection
const entityTypes = [
  { value: 'corporation', label: 'Corporation' },
  { value: 'llc', label: 'Limited Liability Company (LLC)' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'soleProprietorship', label: 'Sole Proprietorship' },
  { value: 'nonprofit', label: 'Non-Profit Organization' },
];

// Form schema with validation rules
const assignCompanySchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  taxNumber: z.string().optional(),
  address: z.string().optional(),
  country: z.string().min(2, 'Country is required'),
  entityType: z.string().min(1, 'Entity type is required'),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email('Invalid email format').optional(),
  industry: z.string().optional(),
});

type AssignCompanyFormValues = z.infer<typeof assignCompanySchema>;

const AssignCompanyForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<AssignCompanyFormValues>({
    resolver: zodResolver(assignCompanySchema),
    defaultValues: {
      userId: '',
      companyName: '',
      taxNumber: '',
      address: '',
      country: '',
      entityType: 'corporation',
      contactPhone: '',
      contactEmail: '',
      industry: '',
    },
  });

  const assignCompanyMutation = useMutation({
    mutationFn: (data: AssignCompanyFormValues) => 
      apiRequest('/api/admin/assign-company', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Company has been successfully assigned to the user.',
      });
      // Invalidate the clients query to refresh the clients list
      queryClient.invalidateQueries({ queryKey: ['/api/admin/clients'] });
      form.reset();
      setIsLoading(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign company to user.',
        variant: 'destructive',
      });
      setIsLoading(false);
    },
  });

  const onSubmit = async (data: AssignCompanyFormValues) => {
    setIsLoading(true);
    assignCompanyMutation.mutate(data);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Assign Company to Existing User</CardTitle>
        <CardDescription>
          Use this form to create a company profile and assign it to a user who is already registered.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter user ID" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Company name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="Country" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="entityType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entity Type</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select entity type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {entityTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="taxNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Tax ID/Reg Number (optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Company address (optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact phone (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact email (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry</FormLabel>
                  <FormControl>
                    <Input placeholder="Industry (optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <CardFooter className="px-0 pt-4">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || assignCompanyMutation.isPending}
              >
                {isLoading || assignCompanyMutation.isPending ? 'Processing...' : 'Assign Company'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default AssignCompanyForm;