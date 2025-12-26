import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Building2, Globe, DollarSign, Save, Info } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { formatCurrency } from "@/lib/utils/formatters";
import { useEffect } from "react";
import { CURRENCIES, type Currency } from "@shared/utils/currency";

// Form validation schema
const companySettingsSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  contactName: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  taxNumber: z.string().optional(),
  entityType: z.string().optional(),
  phoneCountryCode: z.string().optional(),
  phoneNumber: z.string().optional(),
  address: z.string().min(1, "Address is required"),
  website: z.string().optional(),
  contactEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
  description: z.string().optional(),
});

type CompanySettingsFormData = z.infer<typeof companySettingsSchema>;

// Industry options
const commonIndustries = [
  { value: 'technology', label: 'Technology' },
  { value: 'telecommunications', label: 'Telecommunications' },
  { value: 'finance', label: 'Finance & Banking' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'retail', label: 'Retail & E-commerce' },
  { value: 'hospitality', label: 'Hospitality & Tourism' },
  { value: 'transportation', label: 'Transportation & Logistics' },
  { value: 'energy', label: 'Energy & Utilities' },
  { value: 'consulting', label: 'Consulting & Professional Services' },
  { value: 'other', label: 'Other' },
];

// Entity types
const entityTypes = [
  { value: 'corporation', label: 'Corporation' },
  { value: 'llc', label: 'LLC (Limited Liability Company)' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'nonprofit', label: 'Non-Profit Organization' },
  { value: 'other', label: 'Other' },
];

// Country options (same as profile creation)
const countrySelectOptions = [
  { value: 'us', label: 'United States', currency: 'USD' },
  { value: 'gb', label: 'United Kingdom', currency: 'USD' },
  { value: 'ca', label: 'Canada', currency: 'USD' },
  { value: 'au', label: 'Australia', currency: 'USD' },
  { value: 'de', label: 'Germany', currency: 'USD' },
  { value: 'fr', label: 'France', currency: 'USD' },
  { value: 'jp', label: 'Japan', currency: 'USD' },
  { value: 'cn', label: 'China', currency: 'USD' },
  { value: 'in', label: 'India', currency: 'USD' },
  { value: 'br', label: 'Brazil', currency: 'USD' },
  { value: 'mx', label: 'Mexico', currency: 'USD' },
  { value: 'sg', label: 'Singapore', currency: 'USD' },
  { value: 'ae', label: 'United Arab Emirates', currency: 'AED' },
  { value: 'es', label: 'Spain', currency: 'USD' },
  { value: 'it', label: 'Italy', currency: 'USD' },
  { value: 'nl', label: 'Netherlands', currency: 'USD' },
  { value: 'za', label: 'South Africa', currency: 'USD' },
  { value: 'ch', label: 'Switzerland', currency: 'USD' },
  { value: 'se', label: 'Sweden', currency: 'USD' },
  { value: 'kr', label: 'South Korea', currency: 'USD' },
  { value: 'ar', label: 'Argentina', currency: 'USD' },
];

export default function CompanySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch company data using the working /api/company endpoint
  const { data: companyData, isLoading } = useQuery({
    queryKey: ['/api/company'],
    retry: 1,
  });

  const company = (companyData as any)?.data || companyData;
  const currentCurrency = company?.currency || 'USD';

  // Initialize form with current company data
  const form = useForm<CompanySettingsFormData>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      name: '',
      contactName: '',
      industry: '',
      country: '',
      currency: 'USD',
      taxNumber: '',
      entityType: '',
      phoneCountryCode: '',
      phoneNumber: '',
      address: '',
      website: '',
      contactEmail: '',
      description: '',
    },
  });

  // Update form when data loads using useEffect
  useEffect(() => {
    if (company) {
      form.reset({
        name: company.name || '',
        contactName: company.contactName || '',
        industry: company.industry || '',
        country: company.country || '',
        currency: company.currency || 'USD',
        taxNumber: company.taxNumber || '',
        entityType: company.entityType || '',
        phoneCountryCode: company.phoneCountryCode || '',
        phoneNumber: company.phoneNumber || '',
        address: company.address || '',
        website: company.website || '',
        contactEmail: company.contactEmail || '',
        description: company.description || '',
      });
    }
  }, [company, form]);

  // Update company settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: CompanySettingsFormData) =>
      apiRequest('/api/company/settings', {
        method: 'PATCH',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: (data: any) => {
      toast({
        title: "Settings Updated",
        description: "Company settings updated successfully.",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/company'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update company settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CompanySettingsFormData) => {
    updateSettingsMutation.mutate(data);
  };

  const getCountryName = (countryCode?: string) => {
    if (!countryCode) return 'Not set';
    const country = countrySelectOptions.find(c => c.value === countryCode);
    return country?.label || countryCode.toUpperCase();
  };

  // Available currencies
  const availableCurrencies = Object.values(CURRENCIES);

  // Country code options for phone
  const phoneCountryCodes = [
    { code: '+1', country: 'US/CA' },
    { code: '+44', country: 'UK' },
    { code: '+971', country: 'UAE' },
    { code: '+91', country: 'IN' },
    { code: '+86', country: 'CN' },
    { code: '+81', country: 'JP' },
    { code: '+49', country: 'DE' },
    { code: '+33', country: 'FR' },
    { code: '+39', country: 'IT' },
    { code: '+34', country: 'ES' },
    { code: '+55', country: 'BR' },
    { code: '+52', country: 'MX' },
    { code: '+61', country: 'AU' },
    { code: '+82', country: 'KR' },
    { code: '+65', country: 'SG' },
  ];

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container max-w-4xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Company Settings</h1>
            <p className="text-muted-foreground">
              Manage your company information and currency settings
            </p>
          </div>
        </div>

        {/* Current Currency Info */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg text-blue-900">Currency Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-blue-700 font-medium">Current Country</div>
                <div className="text-lg font-semibold text-blue-900">
                  {getCountryName(company?.country)}
                </div>
              </div>
              <div>
                <div className="text-sm text-blue-700 font-medium">Current Currency</div>
                <div className="text-lg font-semibold text-blue-900">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-900">
                    {currentCurrency}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-sm text-blue-700 font-medium">Sample Amount</div>
                <div className="text-lg font-semibold text-blue-900">
                  {formatCurrency(100, currentCurrency)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Company Settings Form */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Building2 className="h-5 w-5 text-gray-600" />
              <div>
                <CardTitle>Company Information</CardTitle>
                <CardDescription>
                  Update your company details and currency settings.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Your company name" {...field} data-testid="input-company-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person</FormLabel>
                        <FormControl>
                          <Input placeholder="Primary contact name" {...field} data-testid="input-contact-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} data-testid="select-industry">
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {commonIndustries.map((industry) => (
                              <SelectItem key={industry.value} value={industry.value}>
                                {industry.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} data-testid="select-country">
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {countrySelectOptions.map((country) => (
                              <SelectItem key={country.value} value={country.value}>
                                {country.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} data-testid="select-currency">
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableCurrencies.map((currency) => (
                              <SelectItem key={currency.code} value={currency.code}>
                                <div className="flex items-center space-x-2">
                                  <span className="font-semibold">{currency.symbol}</span>
                                  <span>{currency.code} - {currency.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="taxNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax Number / Registration Number</FormLabel>
                        <FormControl>
                          <Input placeholder="Company tax/registration number" {...field} data-testid="input-tax-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Address</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Your company address" 
                          className="min-h-[80px]"
                          {...field} 
                          data-testid="input-company-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="entityType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entity Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} data-testid="select-entity-type">
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

                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="contact@example.com" 
                            {...field} 
                            data-testid="input-contact-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com" {...field} data-testid="input-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="phoneCountryCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Code</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} data-testid="select-phone-code">
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Code" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {phoneCountryCodes.map((item) => (
                                <SelectItem key={item.code} value={item.code}>
                                  {item.code} ({item.country})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="555-1234" {...field} data-testid="input-phone-number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Brief description of your company"
                          className="min-h-[100px]"
                          {...field} 
                          data-testid="input-company-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-settings"
                  >
                    {updateSettingsMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}