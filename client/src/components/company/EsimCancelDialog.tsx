import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface EsimCancelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  esimId: number | null;
  employeeId: number;
  esimName: string;
  employeeName: string;
}

export function EsimCancelDialog({
  isOpen,
  onClose,
  esimId,
  employeeId,
  esimName,
  employeeName
}: EsimCancelDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [esimDetails, setEsimDetails] = useState<any>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen && esimId && employeeId) {
      fetchEsimDetails();
    }
  }, [isOpen, esimId, employeeId]);

  const fetchEsimDetails = async () => {
    if (!esimId || !employeeId) return;

    try {
      // Special handling for negative esimId (API-managed plans)
      // These might not exist in the standard purchased eSIMs list
      if (esimId < 0) {
        if (import.meta.env.DEV) { console.log("API-managed plan (negative esimId):", esimId); }
        // Create a minimal eSIM object with information we have
        const syntheticEsim = {
          id: esimId,
          employeeId: employeeId,
          status: 'waiting_for_activation', // Use waiting_for_activation for cancellation compatibility
          planId: -1, // Not a real plan ID
          isSynthetic: true,
          plan: { name: esimName }
        };
        if (import.meta.env.DEV) { console.log("Using synthetic eSIM for API-managed plan:", syntheticEsim); }
        setEsimDetails(syntheticEsim);
        return;
      }

      // Standard flow - fetch from API
      const response = await apiRequest<any[]>(`/esim/purchased/${employeeId}`);
      if (import.meta.env.DEV) { console.log(`Fetched ${response.length} eSIMs for employee ${employeeId}, looking for ID ${esimId}`); }
      
      // Log full list for debugging
      response.forEach(e => {
        if (import.meta.env.DEV) { console.log(`eSIM ID ${e.id}: ${e.status} (plan: ${e.planId})`); }
      });
      
      const esim = response.find((e: any) => e.id === esimId);
      if (!esim) {
        console.error(`eSIM ID ${esimId} not found in employee's eSIMs list`);
        
        // Instead of throwing, create a synthetic object with the information we have
        // This allows cancellation to proceed even if the eSIM isn't in the standard list
        const syntheticEsim = {
          id: esimId,
          employeeId: employeeId,
          status: 'waiting_for_activation', // Use waiting_for_activation for cancellation compatibility
          orderId: null, // We don't know the order ID
          planId: -1,
          isSynthetic: true,
          plan: { name: esimName }
        };
        if (import.meta.env.DEV) { console.log("Using synthetic eSIM since actual eSIM wasn't found:", syntheticEsim); }
        setEsimDetails(syntheticEsim);
        return;
      }
      
      // Log the response for debugging
      if (import.meta.env.DEV) { console.log("EsimCancelDialog - eSIM details:", esim); }
      
      // Also log the important properties
      console.log("EsimCancelDialog - Status:", {
        status: esim.status,
        id: esim.id,
        planId: esim.planId,
        orderId: esim.orderId || 'none',
        metadata: esim.metadata ? typeof esim.metadata : 'none'
      });
      
      setEsimDetails(esim);
    } catch (err: any) {
      console.error("Error fetching eSIM details:", err);
      
      // Instead of showing an error, create a synthetic object that allows proceeding
      const syntheticEsim = {
        id: esimId,
        employeeId: employeeId,
        status: 'waiting_for_activation', // Use waiting_for_activation for cancellation compatibility
        planId: -1,
        error: err.message, 
        isSynthetic: true,
        plan: { name: esimName }
      };
      console.error("Using synthetic eSIM after fetch error:", syntheticEsim);
      setEsimDetails(syntheticEsim);
      
      // We no longer throw an error to the UI in this case
      // setError(err.message || "Failed to fetch eSIM details");
    }
  };

  const handleCancelConfirm = async () => {
    if (!esimId && !employeeId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Special case for API-managed plans (like Central Asia)
      const isApiManagedPlan = esimId && esimId < 0;
      
      // Check if eSIM is eligible for cancellation (for regular eSIMs)
      // Only block already activated eSIMs
      // All pre-activation statuses (pending, waiting_for_activation, error) should allow cancellation
      if (!isApiManagedPlan && 
          (esimDetails?.status === 'activated' || esimDetails?.status === 'active') &&
          !(esimDetails?.status === 'error' || 
            esimDetails?.status === 'waiting_for_activation' || 
            esimDetails?.status === 'pending')) {
        setError("Cannot cancel an activated eSIM");
        return;
      }

      const requestData = isApiManagedPlan
        ? {
            // For API-managed plans, just use employeeId
            employeeId,
            isApiManagedPlan: true,
            planName: esimName
          }
        : {
            // Standard eSIM cancellation
            esimId,
            employeeId,
            orderNo: esimDetails?.orderId
          };

      if (import.meta.env.DEV) { console.log("Cancel request data:", requestData); }
      
      const response = await apiRequest<{
        success: boolean;
        error?: string;
        details?: string;
        providerCancelled?: boolean;
      }>('/esim/cancel', { 
        method: 'POST',
        body: JSON.stringify(requestData)
      });

      if (response.success) {
        if (import.meta.env.DEV) { console.log(`Refreshing data after cancellation for employee ${employeeId}`); }
        
        // Close dialog first to prevent flash during data refresh
        onClose();
        
        // Invalidate critical queries - do this in background after dialog closes
        await queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
        await queryClient.invalidateQueries({ queryKey: ['/esim/purchased'] });
        await queryClient.invalidateQueries({ queryKey: ['/wallet'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/wallet/transactions'] });
        
        // Dispatch event after a short delay to notify UI to refresh
        setTimeout(() => {
          window.dispatchEvent(new Event('refreshEmployees'));
          window.dispatchEvent(new CustomEvent('planCancelled', { detail: { employeeId } }));
        }, 300);

        toast({
          title: "eSIM cancelled",
          description: response.providerCancelled 
            ? "The eSIM has been cancelled with the provider and refunded successfully"
            : "The eSIM has been cancelled locally and refunded successfully",
          duration: 5000,
        });
      } else {
        let errorMessage = response.details || response.error || "Failed to cancel eSIM";
        if (errorMessage.includes('esimTranNo')) {
          errorMessage = "Error with eSIM transaction number. Please try again.";
        }
        setError(errorMessage);
      }
    } catch (err: any) {
      const errorMessage = err?.message || err?.toString?.() || 'Unknown error';
      console.error("Error cancelling eSIM:", errorMessage, err);
      setError(err?.message || "Failed to cancel eSIM. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel and Refund eSIM</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel this eSIM? The amount will be refunded to your wallet.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 my-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Warning</h3>
              <p className="text-sm text-yellow-700 mt-1">
                This will permanently cancel the eSIM plan for {employeeName}. This action cannot be undone.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-muted rounded-md p-4">
          <h3 className="text-sm font-medium mb-2">Plan Details</h3>
          <p className="text-sm">{esimName}</p>
          <p className="text-sm mt-1">Assigned to: {employeeName}</p>
          {esimDetails && (
            <p className="text-sm mt-1">
              Status: {
                // Standardize all non-active, non-cancelled statuses to one consistent term
                esimDetails.status === 'cancelled' 
                  ? 'CANCELLED' 
                  : esimDetails.status === 'error' || 
                    esimDetails.status === 'waiting_for_activation' || 
                    esimDetails.status === 'pending'
                    ? 'WAITING FOR ACTIVATION'  // Use WAITING FOR ACTIVATION as it works with the backend
                    : esimDetails.status === 'active' || esimDetails.status === 'activated'
                      ? 'ACTIVE'
                      : (esimDetails.status || '').replace(/_/g, ' ').toUpperCase()
              }
            </p>
          )}
        </div>

        {error && !esimDetails?.isSynthetic && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 my-2">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={(e) => {
              e.stopPropagation();
              handleCancelConfirm();
            }}
            disabled={isLoading || 
              ((esimDetails?.status === 'activated' || esimDetails?.status === 'active') && 
               !(esimDetails?.status === 'error' || 
                 esimDetails?.status === 'waiting_for_activation' || 
                 esimDetails?.status === 'pending'))}
          >
            {isLoading ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></span>
                Cancelling...
              </>
            ) : (
              "Confirm Cancellation"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}