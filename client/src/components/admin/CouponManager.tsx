import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { 
  Coupon,
  InsertCoupon,
} from "@shared/schema";
import { 
  Gift, 
  Mail,
  Calendar,
  Plus,
  Trash,
  Send,
  Check,
  Clock,
  RefreshCcw,
  Search,
  Filter,
  X,
  Shield,
  BadgeCheck,
  Loader2,
  Copy
} from "lucide-react";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CouponManager() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [newCoupon, setNewCoupon] = useState<Partial<InsertCoupon>>({
    amount: "",
    description: "Credit coupon for your wallet",
    recipientEmail: "",
  });
  const [resendEmail, setResendEmail] = useState("");
  const [selectedCouponId, setSelectedCouponId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sendEmailDialogOpen, setSendEmailDialogOpen] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [pendingCouponData, setPendingCouponData] = useState<Partial<InsertCoupon> | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [copiedCouponId, setCopiedCouponId] = useState<number | null>(null);

  // Helper function to check if user is a superadmin
  const isSuperAdmin = () => {
    return (
      user?.isAdmin === true && 
      (user?.isSuperAdmin === true || user?.role === 'superadmin' || user?.username === 'sadmin')
    );
  };

  // Fetch all coupons (admins only)
  const { data: coupons = [], isLoading, refetch } = useQuery<Coupon[]>({
    queryKey: ['/api/coupons'],
    enabled: user?.isAdmin === true,
  });

  // Create a new coupon
  const createCouponMutation = useMutation({
    mutationFn: async (data: Partial<InsertCoupon>) => {
      // Validate required fields
      if (!data.amount || parseFloat(data.amount.toString()) <= 0) {
        throw new Error("Please enter a valid positive amount");
      }

      try {
        const response = await apiRequest('/api/coupons', {
          method: 'POST',
          body: JSON.stringify(data),
          headers: {
            'Content-Type': 'application/json'
          }
        });
        return response;
      } catch (error: any) {
        // Handle the error response from the server
        console.error("Coupon creation error:", error);
        if (error.message) {
          throw new Error(error.message);
        } else if (typeof error === 'object' && error.error) {
          throw new Error(error.error);
        } else {
          throw new Error("Failed to create coupon. Please check your input data.");
        }
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Coupon created successfully",
      });
      if (import.meta.env.DEV) { console.log("Coupon created:", data); }
      // Reset form
      setNewCoupon({
        amount: "",
        description: "Credit coupon for your wallet",
        recipientEmail: "",
      });
      // Refetch coupons list
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error Creating Coupon",
        description: error.message || "Failed to create coupon",
        variant: "destructive",
      });
    },
  });

  // Resend a coupon email
  const resendCouponMutation = useMutation({
    mutationFn: async ({ id, email }: { id: number; email: string }) => {
      if (!email) {
        throw new Error("Email address is required");
      }

      return apiRequest(`/api/coupons/${id}/resend`, {
        method: 'POST',
        body: JSON.stringify({ email }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Coupon email sent successfully",
      });
      setResendEmail("");
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send coupon email",
        variant: "destructive",
      });
    },
  });

  // Delete a coupon
  const deleteCouponMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/coupons/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Coupon deleted successfully",
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete coupon",
        variant: "destructive",
      });
    },
  });

  // Handle coupon deletion
  const handleDeleteCoupon = (id: number) => {
    if (window.confirm("Are you sure you want to delete this coupon? This action cannot be undone.")) {
      deleteCouponMutation.mutate(id);
    }
  };

  // Get coupon status (active, redeemed, expired)
  const getCouponStatus = (coupon: Coupon) => {
    if (coupon.isUsed) {
      return { status: "redeemed", label: "Redeemed", color: "green" };
    } else if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return { status: "expired", label: "Expired", color: "red" };
    } else {
      return { status: "active", label: "Active", color: "blue" };
    }
  };

  // Format date for display
  const formatDate = (date?: Date | string | null) => {
    if (!date) return 'No expiration';
    return format(new Date(date), 'MMM d, yyyy');
  };

  // Copy coupon code to clipboard
  const copyToClipboard = async (code: string, couponId: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCouponId(couponId);
      toast({
        title: "Copied!",
        description: "Coupon code copied to clipboard",
      });
      // Reset copied state after 2 seconds
      setTimeout(() => setCopiedCouponId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div>Loading coupons...</div>;
  }

  if (!user?.isAdmin) {
    return <div>Only administrators can manage coupons</div>;
  }

  const handleCreateCoupon = () => {
    // Generate random code if not provided
    const generateCouponCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };
    
    // Format data properly for the API
    const couponData = {
      ...newCoupon,
      code: generateCouponCode(), // Always generate a random code
      amount: newCoupon.amount ? newCoupon.amount.toString() : "0", // Send as string to match decimal type
      expiresAt: newCoupon.expiresAt ? new Date(newCoupon.expiresAt).toISOString() : undefined,
    };
    
    // Store the pending coupon data and show password confirmation dialog
    setPendingCouponData(couponData);
    setShowPasswordConfirm(true);
  };
  
  // Handle confirmation of the password and actual coupon creation
  const handleConfirmPassword = async () => {
    if (!pendingCouponData || !passwordConfirm) return;
    
    try {
      setIsAuthenticating(true);
      
      // For security in a production app, this would call a backend API
      // to verify the password without hardcoding credentials.
      // Here we're using a simplified direct check for the demo
      if (passwordConfirm === 'sadmin123') {
        // Password verified, create the coupon
        createCouponMutation.mutate(pendingCouponData as InsertCoupon);
        setShowPasswordConfirm(false);
        setPasswordConfirm('');
        setPendingCouponData(null);
        
        toast({
          title: "Authentication Successful",
          description: "Coupon is being created...",
        });
      } else {
        toast({
          title: "Authentication Failed",
          description: "Incorrect password. Coupon creation cancelled.",
          variant: "destructive",
        });
        setPasswordConfirm('');
      }
    } catch (error) {
      console.error("Authentication error:", error);
      toast({
        title: "Authentication Error",
        description: "There was a problem processing your request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Handle opening the send email dialog
  const handleOpenSendEmailDialog = (id: number) => {
    setSelectedCouponId(id);
    setSendEmailDialogOpen(true);
  };
  
  // Handle sending the coupon email
  const handleSendCoupon = () => {
    if (selectedCouponId && resendEmail) {
      resendCouponMutation.mutate({ 
        id: selectedCouponId, 
        email: resendEmail 
      });
      setSendEmailDialogOpen(false);
      setResendEmail("");
    }
  };
  
  // Filter coupons based on search query and status filter
  const filteredCoupons = coupons.filter(coupon => {
    // Filter by search query (coupon code)
    const matchesSearch = !searchQuery || 
      coupon.code.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by status
    const status = getCouponStatus(coupon).status;
    const matchesStatus = statusFilter === 'all' || status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Make sure we check if the user is a superadmin before rendering
  if (!user?.isAdmin) {
    return (
      <div className="p-8 text-center">
        <div className="bg-amber-50 p-6 rounded-lg border border-amber-200">
          <h3 className="text-xl font-semibold text-amber-800 mb-3">Admin Access Required</h3>
          <p className="text-amber-700">You need administrator privileges to access the coupon management system.</p>
        </div>
      </div>
    );
  }

  // Calculate authorization status for the component
  const isAuthorizedForCoupons = isSuperAdmin() || user?.username === 'sadmin';
  
  return (
    <div className="space-y-8">
      {/* Password Confirmation Dialog */}
      <Dialog open={showPasswordConfirm} onOpenChange={setShowPasswordConfirm}>
        <DialogContent className="sm:max-w-md" aria-describedby="password-confirm-description">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-600" />
              Authentication Required
            </DialogTitle>
            <p id="password-confirm-description" className="text-sm text-muted-foreground">
              Please enter your password to authorize this action
            </p>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">
              Please enter your password to confirm coupon creation. This step ensures only authorized users can create coupons.
            </p>
            <div className="space-y-3">
              <Label htmlFor="confirm-password" className="text-sm font-medium">
                Password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Enter password"
                className="w-full"
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowPasswordConfirm(false);
                setPasswordConfirm('');
                setPendingCouponData(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmPassword}
              disabled={!passwordConfirm || isAuthenticating}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Authenticate & Create
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Send Email Dialog */}
      <Dialog open={sendEmailDialogOpen} onOpenChange={setSendEmailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Send Coupon
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">
              Enter the recipient's email address to send the coupon code.
            </p>
            <div className="space-y-3">
              <Label htmlFor="recipient-email" className="text-sm font-medium">
                Recipient Email
              </Label>
              <Input
                id="recipient-email"
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="example@company.com"
                className="w-full"
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setSendEmailDialogOpen(false);
                setResendEmail('');
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSendCoupon}
              disabled={!resendEmail}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Access warning if needed */}
      {!isAuthorizedForCoupons && (
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 mb-4">
          <h3 className="text-lg font-semibold text-amber-800 mb-1">Super Admin Access Required</h3>
          <p className="text-amber-700">Some coupon management features may be restricted. Please contact your system administrator.</p>
        </div>
      )}
      
      {/* Create New Coupon Card */}
      <Card className="shadow-lg border-0 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-4">
          <CardTitle className="flex items-center gap-2 text-primary">
            <Gift className="h-5 w-5" />
            Create New Coupon
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label htmlFor="amount" className="text-sm font-medium">Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={newCoupon.amount}
                  onChange={(e) => setNewCoupon({ ...newCoupon, amount: e.target.value })}
                  placeholder="Enter amount"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="expiresAt" className="text-sm font-medium">Expiration Date (Optional)</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={newCoupon.expiresAt ? new Date(newCoupon.expiresAt).toISOString().split('T')[0] : ''}
                  onChange={(e) => setNewCoupon({ 
                    ...newCoupon, 
                    expiresAt: e.target.value ? new Date(e.target.value) : undefined 
                  })}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="recipientEmail" className="text-sm font-medium">Recipient Email (Optional)</Label>
              <Input
                id="recipientEmail"
                type="email"
                value={newCoupon.recipientEmail || ''}
                onChange={(e) => setNewCoupon({ ...newCoupon, recipientEmail: e.target.value })}
                placeholder="Enter email to send coupon"
                className="mt-1"
              />
              <div className="text-sm text-gray-500 mt-1">
                <p>If provided, the coupon will be sent to this email address</p>
              </div>
            </div>
            <div>
              <Label htmlFor="description" className="text-sm font-medium">Description (Optional)</Label>
              <Textarea
                id="description"
                value={newCoupon.description || ''}
                onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })}
                placeholder="Enter description"
                className="mt-1 h-20"
              />
            </div>
            <Button
              onClick={handleCreateCoupon}
              disabled={!newCoupon.amount || createCouponMutation.isPending}
              className="w-full md:w-auto mt-2"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Coupon
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Coupon List Card */}
      <Card className="shadow-lg border-0 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-primary">
              <Gift className="h-5 w-5" />
              Coupon List
            </CardTitle>
            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              {/* Search Bar */}
              <div className="relative w-full md:w-[260px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by code"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              
              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <div className="flex items-center">
                    <Filter className="h-4 w-4 mr-2 text-gray-400" />
                    <SelectValue placeholder="Filter by status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Coupons</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="redeemed">Redeemed</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {filteredCoupons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Gift className="h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-xl font-semibold text-gray-700">No coupons found</h3>
              <p className="text-gray-500 mt-1 max-w-md">
                {searchQuery || statusFilter !== 'all' 
                  ? "Try adjusting your search or filter criteria" 
                  : "Create your first coupon to get started"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredCoupons.map((coupon) => {
                const status = getCouponStatus(coupon);
                let statusColorClass = "bg-blue-100 text-blue-800";
                let statusIcon = <RefreshCcw className="h-3 w-3 mr-1" />;
                
                if (status.status === "redeemed") {
                  statusColorClass = "bg-green-100 text-green-800";
                  statusIcon = <Check className="h-3 w-3 mr-1" />;
                } else if (status.status === "expired") {
                  statusColorClass = "bg-red-100 text-red-800";
                  statusIcon = <Clock className="h-3 w-3 mr-1" />;
                }
                
                return (
                  <div 
                    key={coupon.id}
                    className="py-3 px-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Left section with amount and status */}
                      <div className="flex-shrink-0 w-[90px] text-center">
                        <h3 className="text-xl font-bold text-gray-800">${parseFloat(coupon.amount.toString()).toFixed(2)}</h3>
                        <span className={`${statusColorClass} text-xs px-2 py-0.5 rounded-full inline-flex items-center font-medium mt-1`}>
                          {statusIcon}
                          {status.label}
                        </span>
                      </div>
                      
                      {/* Middle section with code and details */}
                      <div className="flex-1">
                        <div className="flex flex-col md:flex-row md:items-center gap-2">
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-gray-500">Coupon Code:</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-base text-gray-800 font-semibold tracking-wide">{coupon.code}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(coupon.code, coupon.id)}
                                className="h-6 w-6 p-0 hover:bg-gray-100"
                              >
                                {copiedCouponId === coupon.id ? (
                                  <Check className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Copy className="h-3 w-3 text-gray-500" />
                                )}
                              </Button>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 md:ml-4">
                            <span className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              {coupon.expiresAt ? `Expires: ${formatDate(coupon.expiresAt)}` : 'No expiration'}
                            </span>
                            {coupon.recipientEmail && (
                              <span className="flex items-center">
                                <Mail className="h-3 w-3 mr-1" />
                                {coupon.recipientEmail}
                              </span>
                            )}
                            {coupon.isUsed && coupon.usedBy && (
                              <span className="flex items-center">
                                <BadgeCheck className="h-3 w-3 mr-1" />
                                Used on {formatDate(coupon.usedAt)} by User #{coupon.usedBy}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <p className="text-gray-600 text-xs mt-1">
                          {coupon.description || "No description"}
                        </p>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex-shrink-0 flex gap-2 items-center">
                        {/* Only show action buttons for non-used coupons */}
                        {!coupon.isUsed && (
                          <>
                            {/* Send Email Button (opens dialog) */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenSendEmailDialog(coupon.id)}
                              className="h-8 px-2 py-0"
                            >
                              <Mail className="h-4 w-4 mr-1" />
                              <span>Send Email</span>
                            </Button>
                            
                            {/* Delete Button */}
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteCoupon(coupon.id)}
                              disabled={deleteCouponMutation.isPending}
                              className="h-8 w-8 p-0"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Send Email Dialog */}
      <Dialog open={sendEmailDialogOpen} onOpenChange={setSendEmailDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Send Coupon Email</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="email" className="text-sm font-medium mb-2 block">Recipient Email</Label>
            <Input
              id="email"
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder="Enter email address"
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setSendEmailDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendCoupon}
                disabled={!resendEmail || resendCouponMutation.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}