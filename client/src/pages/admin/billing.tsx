import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Receipt, Mail, Calendar, DollarSign, FileText, Send, Plus, Search, Trash2, Eye, Download } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import SadminLayout from "@/components/layout/SadminLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { formatCurrency } from "@/lib/utils/formatters";

interface ReceiptData {
  id: number;
  receiptNumber: string;
  type: string;
  amount: string;
  description: string;
  paymentMethod: string;
  stripePaymentId?: string;
  emailSent: boolean;
  emailSentAt?: string;
  createdAt: string;
  company: {
    id: number;
    name: string;
    contactEmail: string;
  };
}

interface BillData {
  id: number;
  billNumber: string;
  billingDate: string;
  totalAmount: string;
  currency: string;
  emailSent: boolean;
  emailSentAt?: string;
  createdAt: string;
  company: {
    id: number;
    name: string;
    contactEmail: string;
  };
  items: Array<{
    id: number;
    planName: string;
    planDescription?: string;
    unitPrice: string;
    quantity: number;
    totalAmount: string;
    countries?: string[];
    dataAmount: string;
    validity: number;
  }>;
}

interface CompanyData {
  id: number;
  name: string;
  contactEmail: string;
}

interface UninvoicedEsim {
  id: number;
  orderId: string;
  employeeName: string;
  planName: string;
  dataAmount: string;
  validity: number;
  sellingPrice: string;
  purchaseDate: string;
  status: string;
  countries?: string[];
}

export default function BillingPage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualBillOpen, setManualBillOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedEsims, setSelectedEsims] = useState<number[]>([]);
  const [customItems, setCustomItems] = useState<Array<{description: string, amount: string}>>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isSadminUser = user?.username === 'sadmin' && user?.isSuperAdmin;

  // Fetch all receipts
  const { data: receipts = [], isLoading: receiptsLoading } = useQuery({
    queryKey: ['/api/sadmin/receipts'],
    queryFn: () => apiRequest('/api/sadmin/receipts') as Promise<ReceiptData[]>
  });

  // Fetch all bills
  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ['/api/sadmin/bills'],
    queryFn: () => apiRequest('/api/sadmin/bills') as Promise<BillData[]>
  });

  // Fetch all companies  
  const { data: companies = [], isLoading: companiesLoading } = useQuery({
    queryKey: ['/api/sadmin/companies'],
    queryFn: () => apiRequest('/api/sadmin/companies') as Promise<CompanyData[]>
  });

  // Fetch uninvoiced eSIMs for selected company
  const { data: uninvoicedEsims = [], isLoading: esimsLoading, refetch: refetchEsims } = useQuery({
    queryKey: [`/api/sadmin/companies/${selectedCompany}/uninvoiced-esims`, startDate, endDate],
    queryFn: () => {
      if (!selectedCompany) return Promise.resolve([]);
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      return apiRequest(`/api/sadmin/companies/${selectedCompany}/uninvoiced-esims${queryString}`) as Promise<UninvoicedEsim[]>;
    },
    enabled: !!selectedCompany
  });

  // Fetch next bill number
  const { data: nextBillNumber } = useQuery({
    queryKey: ['/api/sadmin/bills/next-number'],
    queryFn: () => apiRequest('/api/sadmin/bills/next-number') as Promise<{ nextBillNumber: string }>
  });

  // Resend receipt email mutation
  const resendReceiptMutation = useMutation({
    mutationFn: (receiptId: number) => 
      apiRequest(`/api/sadmin/receipts/${receiptId}/resend`, { method: 'POST' }),
    onSuccess: () => {
      toast({
        title: "Email Sent",
        description: "Receipt email has been resent successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sadmin/receipts'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to resend receipt email",
        variant: "destructive",
      });
    }
  });

  // Resend bill email mutation
  const resendBillMutation = useMutation({
    mutationFn: (billId: number) => 
      apiRequest(`/api/sadmin/bills/${billId}/resend`, { method: 'POST' }),
    onSuccess: () => {
      toast({
        title: "Email Sent",
        description: "Bill email has been resent successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sadmin/bills'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to resend bill email",
        variant: "destructive",
      });
    }
  });

  // Delete bill mutation
  const deleteBillMutation = useMutation({
    mutationFn: (billId: number) => 
      apiRequest(`/api/sadmin/bills/${billId}`, { method: 'DELETE' }),
    onSuccess: () => {
      console.log('Bill deleted successfully');
      toast({
        title: "Bill Deleted",
        description: "Bill has been deleted and eSIMs returned to uninvoiced state",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sadmin/bills'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sadmin/companies'] }); // Refresh uninvoiced counts
    },
    onError: (error) => {
      console.error('Delete bill error:', error);
      toast({
        title: "Error",
        description: `Failed to delete bill: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Generate manual bill mutation
  const generateManualBillMutation = useMutation({
    mutationFn: ({ companyId, esimIds, customItems, startDate, endDate }: { companyId: number; esimIds?: number[]; customItems?: Array<{description: string, amount: number}>; startDate?: string; endDate?: string }) => 
      apiRequest('/api/sadmin/billing/generate-manual', { 
        method: 'POST',
        body: JSON.stringify({ companyId, esimIds, customItems, startDate, endDate }),
        headers: { 'Content-Type': 'application/json' }
      }),
    onSuccess: (data) => {
      toast({
        title: "Bill Generated",
        description: `Successfully created bill ${data.bill?.billNumber}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sadmin/bills'] });
      setManualBillOpen(false);
      setSelectedCompany("");
      setStartDate("");
      setEndDate("");
      setSelectedEsims([]);
      setCustomItems([]);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate manual bill",
        variant: "destructive",
      });
    }
  });

  // Note: Using imported formatCurrency function which supports multiple currencies

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
  };

  const getReceiptTypeColor = (type: string) => {
    switch (type) {
      case 'credit_addition': return 'bg-green-100 text-green-800';
      case 'payment': return 'bg-blue-100 text-blue-800';
      case 'refund': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Only super admins can access this page
  if (user && !user.isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[70vh]">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">You don't have permission to access this page.</p>
          <Button variant="outline" onClick={() => window.location.href = '/admin'}>
            Return to Dashboard
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const renderContent = () => (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing Management</h1>
          <p className="text-muted-foreground">
            Manage receipts, bills, and automated billing processes
          </p>
        </div>
        
        <Dialog open={manualBillOpen} onOpenChange={setManualBillOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Manual Bill
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Manual Bill</DialogTitle>
              <DialogDescription>
                Generate a custom bill for specific company and date range. Only uninvoiced eSIMs will be included.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-select">Company</Label>
                  <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id.toString()}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Date Range (Optional)</Label>
                  <div className="flex space-x-2">
                    <Input
                      type="date"
                      placeholder="Start Date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                    <Input
                      type="date"
                      placeholder="End Date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Bill Number</Label>
                  <div className="p-2 bg-muted rounded-md text-sm font-mono">
                    {nextBillNumber?.nextBillNumber || 'Loading...'}
                  </div>
                </div>
              </div>

              {selectedCompany && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Uninvoiced eSIMs</h4>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => refetchEsims()}
                      disabled={esimsLoading}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                  
                  {esimsLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : uninvoicedEsims.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-2">
                        Select specific eSIMs to bill (leave empty to bill all):
                      </div>
                      {uninvoicedEsims.map((esim) => (
                        <div key={esim.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`esim-${esim.id}`}
                            checked={selectedEsims.includes(esim.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedEsims([...selectedEsims, esim.id]);
                              } else {
                                setSelectedEsims(selectedEsims.filter(id => id !== esim.id));
                              }
                            }}
                          />
                          <label htmlFor={`esim-${esim.id}`} className="text-sm flex-1 cursor-pointer">
                            <div className="flex justify-between items-center">
                              <span>
                                {esim.orderId} - {esim.employeeName} - {esim.planName}
                              </span>
                              <div className="text-right">
                                <div className="font-medium">${parseFloat(esim.sellingPrice || '0').toFixed(2)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {format(new Date(esim.purchaseDate), 'MMM dd, yyyy')}
                                </div>
                              </div>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No uninvoiced eSIMs found for the selected criteria.
                    </div>
                  )}
                </div>
              )}
              
              {/* Custom Billing Items Section */}
              {selectedCompany && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Custom Billing Items</h4>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setCustomItems([...customItems, { description: '', amount: '' }]);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Item
                    </Button>
                  </div>
                  
                  {customItems.length > 0 && (
                    <div className="space-y-3 border rounded-lg p-4">
                      {customItems.map((item, index) => (
                        <div key={index} className="flex items-center space-x-3">
                          <div className="flex-1">
                            <Input
                              placeholder="Description (e.g., Setup fee, Support charges)"
                              value={item.description}
                              onChange={(e) => {
                                const newItems = [...customItems];
                                newItems[index].description = e.target.value;
                                setCustomItems(newItems);
                              }}
                            />
                          </div>
                          <div className="w-32">
                            <Input
                              placeholder="Amount"
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.amount}
                              onChange={(e) => {
                                const newItems = [...customItems];
                                newItems[index].amount = e.target.value;
                                setCustomItems(newItems);
                              }}
                            />
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setCustomItems(customItems.filter((_, i) => i !== index));
                            }}
                          >
                            ✕
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setManualBillOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    if (!selectedCompany) return;
                    
                    // Filter custom items to only include those with both description and amount
                    const validCustomItems = customItems.filter(item => 
                      item.description.trim() && item.amount.trim() && parseFloat(item.amount) > 0
                    ).map(item => ({
                      description: item.description.trim(),
                      amount: parseFloat(item.amount)
                    }));
                    
                    generateManualBillMutation.mutate({
                      companyId: parseInt(selectedCompany),
                      esimIds: selectedEsims.length > 0 ? selectedEsims : undefined,
                      customItems: validCustomItems.length > 0 ? validCustomItems : undefined,
                      startDate: startDate || undefined,
                      endDate: endDate || undefined
                    });
                  }}
                  disabled={!selectedCompany || generateManualBillMutation.isPending}
                >
                  {generateManualBillMutation.isPending ? "Creating..." : "Create Bill"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Receipts</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{receipts.length}</div>
            <p className="text-xs text-muted-foreground">
              {receipts.filter(r => r.emailSent).length} emails sent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bills</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bills.length}</div>
            <p className="text-xs text-muted-foreground">
              {bills.filter(b => b.emailSent).length} emails sent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receipt Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(receipts.reduce((sum, r) => sum + parseFloat(r.amount), 0))}
            </div>
            <p className="text-xs text-muted-foreground">Credit additions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bills Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                bills.reduce((sum, b) => sum + parseFloat(b.totalAmount), 0), 
                bills[0]?.currency || 'USD'
              )}
            </div>
            <p className="text-xs text-muted-foreground">eSIM purchases</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="receipts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
        </TabsList>
        
        <TabsContent value="receipts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Receipts</CardTitle>
              <CardDescription>
                All receipts for credit additions and payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {receiptsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt #</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Email Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map((receipt) => (
                      <TableRow key={receipt.id}>
                        <TableCell className="font-mono text-sm">
                          {receipt.receiptNumber}
                        </TableCell>
                        <TableCell>{receipt.company.name}</TableCell>
                        <TableCell>
                          <Badge className={getReceiptTypeColor(receipt.type)}>
                            {receipt.type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(parseFloat(receipt.amount))}
                        </TableCell>
                        <TableCell>{receipt.paymentMethod || 'N/A'}</TableCell>
                        <TableCell>{formatDate(receipt.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {receipt.emailSent ? (
                              <Badge variant="secondary">
                                <Mail className="w-3 h-3 mr-1" />
                                Sent
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                <Mail className="w-3 h-3 mr-1" />
                                Not sent
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/api/sadmin/receipts/${receipt.id}/view`, '_blank')}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/api/sadmin/receipts/${receipt.id}/view?download=true`, '_blank')}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resendReceiptMutation.mutate(receipt.id)}
                              disabled={resendReceiptMutation.isPending}
                            >
                              <Send className="w-3 h-3 mr-1" />
                              Resend
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bills" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Bills</CardTitle>
              <CardDescription>
                Automated daily bills for eSIM purchases grouped by plan
              </CardDescription>
            </CardHeader>
            <CardContent>
              {billsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill #</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Billing Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>Email Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-mono text-sm">
                          {bill.billNumber}
                        </TableCell>
                        <TableCell>{bill.company.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                            {format(new Date(bill.billingDate), 'MMM dd, yyyy')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {bill.items.length} plan types
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(parseFloat(bill.totalAmount), bill.currency)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {bill.emailSent ? (
                              <Badge variant="secondary">
                                <Mail className="w-3 h-3 mr-1" />
                                Sent
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                <Mail className="w-3 h-3 mr-1" />
                                Not sent
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/api/sadmin/bills/${bill.id}/view`, '_blank')}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/api/sadmin/bills/${bill.id}/view?download=true`, '_blank')}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resendBillMutation.mutate(bill.id)}
                              disabled={resendBillMutation.isPending}
                            >
                              <Send className="w-3 h-3 mr-1" />
                              Resend
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete bill ${bill.billNumber}? This will return all eSIMs in this bill to uninvoiced state.`)) {
                                  deleteBillMutation.mutate(bill.id);
                                }
                              }}
                              disabled={deleteBillMutation.isPending}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>
    </div>
  );

  return isSadminUser ? (
    <SadminLayout>
      {renderContent()}
    </SadminLayout>
  ) : (
    <DashboardLayout>
      {renderContent()}
    </DashboardLayout>
  );
}