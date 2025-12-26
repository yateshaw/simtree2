import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PurchasedEsim } from '@shared/schema';
import { AlertTriangle, CheckCircle2, Clock, AlertCircle, Copy, RefreshCw, Zap, History, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EsimCancelDialog } from "./EsimCancelDialog";
import { QRCodeSVG } from 'qrcode.react';
import { apiRequest } from "@/lib/queryClient";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Enhanced type for metadata containing QR code information and renewal history
interface EsimMetadata {
  qrCode?: string;
  activationCode?: string;
  rawData?: {
    obj?: {
      esimList?: Array<{
        qrCodeUrl?: string;
        activationCode?: string;
        esimStatus?: string;
        shortUrl?: string;
        orderUsage?: number;
        packageList?: Array<{
          packageName?: string;
          slug?: string;
        }>;
        totalVolume?: number;
      }>;
    };
  };
  refunded?: boolean;
  isCancelled?: boolean;
  // Auto-renewal fields
  autoRenewalProcessed?: boolean;
  autoRenewalSuccess?: boolean;
  autoRenewalError?: string;
  topUpDate?: string;
  topUpOrderId?: string;
  previousExpiryDate?: string;
  renewalCount?: number;
  renewalHistory?: Array<{
    date: string;
    orderId: string;
    planId: number;
    planName: string;
    cost: number;
  }>;
}

// Enhanced type for PurchasedEsim with metadata structure
interface EnhancedPurchasedEsim extends Omit<PurchasedEsim, 'metadata'> {
  metadata?: EsimMetadata;
  plan?: {
    name?: string;
    countries?: string[];
    speed?: string;
    data?: number;
    validity?: number;
  };
  dataLimit?: string;
  isCancelled?: boolean;
}

interface EsimDetailsProps {
  isOpen: boolean;
  onClose: () => void;
  esim: EnhancedPurchasedEsim | null;
  planName?: string;
  employeeName?: string;
  employeeId?: number; 
  onCancel?: () => void;
  isLoading?: boolean;
  onRefresh?: (esimId: number) => Promise<void>;
}

export function EsimDetails({ 
  isOpen, 
  onClose, 
  esim, 
  planName, 
  employeeName, 
  employeeId, 
  isLoading = false, 
  onRefresh 
}: EsimDetailsProps) {
  const { toast } = useToast();
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  
  // Create a ref to store the onClose function so we can call it from EsimCancelDialog
  const onCloseRef = useRef(onClose);
  
  // Update the ref whenever onClose changes
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !esim || !onRefresh || esim.status === 'activated' || esim.status === 'active' || esim.status === 'cancelled') {
      return;
    }

    const refreshStatus = async () => {
      try {
        await onRefresh(esim.id);
      } catch (error) {
        console.error("Error auto-refreshing eSIM status:", error);
      }
    };

    const interval = setInterval(refreshStatus, 30000);
    return () => clearInterval(interval);
  }, [isOpen, esim?.id, esim?.status, onRefresh]);

  const getStatusInfo = (status: string, metadata: any) => {
    try {
      // First check the actual eSIM status from the database
      // This is the most accurate since it's already been updated by webhooks and sync jobs
      if (status === 'activated' || status === 'active') {
        return {
          status: 'activated',
          icon: <CheckCircle2 className="h-8 w-8 text-green-500" />,
          message: 'Your eSIM has been activated on your device.'
        };
      }
      
      // If the status is not already activated, then check the metadata
      // Safe access to metadata fields with error handling
      let providerStatus = null;
      let smdpStatus = null;

      if (metadata && typeof metadata === 'object' && 
          (metadata as any)?.rawData?.obj?.esimList && 
          Array.isArray((metadata as any).rawData.obj.esimList) && 
          (metadata as any).rawData.obj.esimList.length > 0) {

        const esimListItem = (metadata as any).rawData.obj.esimList[0];
        if (esimListItem) {
          if (typeof esimListItem.esimStatus === 'string') {
            providerStatus = esimListItem.esimStatus.toUpperCase();
          }
          if (typeof esimListItem.smdpStatus === 'string') {
            smdpStatus = esimListItem.smdpStatus.toUpperCase();
          }
        }
      }

      const hasQrCode = !!esim?.qrCode;
      const hasActivationCode = !!esim?.activationCode;

      if (import.meta.env.DEV) { console.log('Status check:', { status, providerStatus, smdpStatus, hasQrCode, hasActivationCode }); }

      if ((providerStatus === "ENABLED" || providerStatus === "IN_USE" || providerStatus === "ACTIVATED" || providerStatus === "ONBOARD" ||
          smdpStatus === "ENABLED" || smdpStatus === "ACTIVATED")) {
        return {
          status: 'activated',
          icon: <CheckCircle2 className="h-8 w-8 text-green-500" />,
          message: 'Your eSIM has been activated on your device.'
        };
      }

      if (providerStatus === "GOT_RESOURCE" && hasQrCode && hasActivationCode) {
        return {
          status: 'waiting_for_activation',
          icon: <Clock className="h-8 w-8 text-amber-500" />,
          message: 'Your eSIM is ready to be activated on your device.'
        };
      }
    } catch (error) {
      console.error("Error in getStatusInfo initial checks:", error);
      // Continue to the status switch as fallback
    }

    switch (status) {
      case 'waiting_for_activation':
        return {
          status: 'waiting_for_activation',
          icon: <Clock className="h-8 w-8 text-amber-500" />,
          message: 'Your eSIM is ready and waiting for activation.'
        };
      case 'cancelled':
        return {
          status: 'cancelled',
          icon: <AlertTriangle className="h-8 w-8 text-amber-500" />,
          message: 'This eSIM order was cancelled and refunded.'
        };
      case 'pending':
        return {
          status: 'pending',
          icon: <AlertCircle className="h-8 w-8 text-blue-500" />,
          message: 'Your eSIM is being processed.'
        };
      default:
        return {
          status: status,
          icon: <AlertCircle className="h-8 w-8 text-blue-500" />,
          message: 'Your eSIM details are available below.'
        };
    }
  };

  // Guard clause - if no esim data is provided, return null
  if (!esim) {
    if (import.meta.env.DEV) { console.log("No eSIM data provided to EsimDetails component"); }
    return null;
  }

  // Check if this is a synthetic eSIM (has negative ID)
  const isSyntheticEsim = esim && esim.id < 0;
  
  // Gather all required data with proper error handling
  let statusInfo;
  try {
    // Always use the standard status info, regardless of whether it's a synthetic eSIM
    statusInfo = getStatusInfo(esim?.status, esim?.metadata);
    // Ensure statusInfo has a status property to prevent TypeErrors when accessing statusInfo.status
    if (!statusInfo || typeof statusInfo.status === 'undefined') {
      console.error("Invalid statusInfo returned from getStatusInfo:", statusInfo);
      statusInfo = {
        status: 'unknown',
        icon: <AlertCircle className="h-8 w-8 text-gray-500" />,
        message: 'eSIM status information is currently unavailable.'
      };
    }
  } catch (error) {
    console.error("Error getting status info:", error);
    statusInfo = {
      status: 'error',
      icon: <AlertCircle className="h-8 w-8 text-red-500" />,
      message: 'There was an error retrieving your eSIM status.'
    };
  }

  const copyToClipboard = (text: string, description: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        toast({
          title: "Copied",
          description: `${description} copied to clipboard`,
          duration: 2000,
        });
      },
      (err) => {
        console.error('Failed to copy:', err);
        toast({
          title: "Error",
          description: "Failed to copy to clipboard",
          variant: "destructive",
          duration: 2000,
        });
      }
    );
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Loading eSIM Details...</DialogTitle>
            <DialogDescription>
              Please wait while we load the eSIM information and status.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-xl font-semibold tracking-tight">eSIM Details</DialogTitle>
            <DialogDescription>
              View eSIM status, activation details, data usage, and QR code information.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status Banner */}
            <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 via-blue-50/50 to-transparent p-3 rounded-lg border border-blue-100/50 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shadow-sm">
                {statusInfo.icon}
              </div>
              <h3 className="text-sm font-medium text-blue-900">
                {statusInfo.message}
              </h3>
            </div>

            {/* QR Code and Activation Details Section - Redesigned for better visibility */}
            <div className="grid grid-cols-2 gap-5 items-start">
              {/* QR Code Section - Now Larger */}
              <div className="flex justify-center">
              {(() => {
                try {
                  // Generate a QR code even for synthetic eSIMs (API-managed plans)
                  if (isSyntheticEsim) {
                    // Create a default activation code for API-managed plans if one doesn't exist
                    const syntheticActivationCode = `LPA:1$eSIM.api.direct$${esim.planId || 'PLAN'}${esim.employeeId || 'USER'}`;
                    
                    return (
                      <div className="flex flex-col items-center">
                        <h3 className="text-sm font-medium mb-2">Activation QR Code</h3>
                        <div className="border border-border rounded-lg bg-white p-5 shadow-sm qr-code-container">
                          <QRCodeSVG 
                            value={syntheticActivationCode} 
                            size={210} 
                            level="H"
                          />
                        </div>
                      </div>
                    );
                  }
                  
                  // Extract QR code URL from various possible locations
                  let qrCodeUrl: string | null = null;
                  
                  // DEBUG: Log all potential QR code sources to identify issues
                  console.log("QR Code Debug (FULL DATA):", {
                    fromMetadataQrCodeUrl: esim.metadata?.rawData?.obj?.esimList?.[0]?.qrCodeUrl,
                    fromDirectQrCode: esim.qrCode,
                    fromMetadataQrCode: esim.metadata?.qrCode,
                    shortUrl: esim.metadata?.rawData?.obj?.esimList?.[0]?.shortUrl,
                    fullEsim: esim,
                    fullMetadata: esim.metadata,
                    esimList: esim.metadata?.rawData?.obj?.esimList
                  });
                  
                  // Try to get QR code URL from metadata first
                  if (esim.metadata?.rawData?.obj?.esimList?.[0]?.qrCodeUrl) {
                    const rawQrUrl = esim.metadata.rawData.obj.esimList[0].qrCodeUrl;
                    // Check if it's a complete URL or just a path
                    if (typeof rawQrUrl === 'string') {
                      if (rawQrUrl.startsWith('http')) {
                        qrCodeUrl = rawQrUrl;
                      } else if (rawQrUrl.includes('p.qrsim.net/')) {
                        // Extract the ID and ensure it ends with .png
                        const matches = rawQrUrl.match(/p\.qrsim\.net\/([a-f0-9]+)/);
                        if (matches && matches[1]) {
                          qrCodeUrl = `https://p.qrsim.net/${matches[1]}.png`;
                        } else {
                          // If we can't extract the ID, try using the raw URL directly with https
                          qrCodeUrl = `https://${rawQrUrl}`;
                        }
                      }
                      if (import.meta.env.DEV) { console.log("Using metadata qrCodeUrl:", qrCodeUrl); }
                    }
                  }
                  
                  // Fallback to direct qrCode if available
                  if (!qrCodeUrl && esim.qrCode) {
                    const directQrCode = esim.qrCode;
                    if (typeof directQrCode === 'string') {
                      if (directQrCode.startsWith('http')) {
                        qrCodeUrl = directQrCode;
                      } else if (directQrCode.includes('p.qrsim.net/')) {
                        // Extract the ID and ensure it ends with .png
                        const matches = directQrCode.match(/p\.qrsim\.net\/([a-f0-9]+)/);
                        if (matches && matches[1]) {
                          qrCodeUrl = `https://p.qrsim.net/${matches[1]}.png`;
                        } else {
                          qrCodeUrl = `https://${directQrCode}`;
                        }
                      }
                      if (import.meta.env.DEV) { console.log("Using direct qrCode URL:", qrCodeUrl); }
                    }
                  }
                  
                  // Try to get from metadata.qrCode
                  if (!qrCodeUrl && esim.metadata?.qrCode) {
                    const metadataQrCode = esim.metadata.qrCode;
                    if (typeof metadataQrCode === 'string') {
                      if (metadataQrCode.startsWith('http')) {
                        qrCodeUrl = metadataQrCode;
                      } else if (metadataQrCode.includes('p.qrsim.net/')) {
                        // Extract the ID and ensure it ends with .png
                        const matches = metadataQrCode.match(/p\.qrsim\.net\/([a-f0-9]+)/);
                        if (matches && matches[1]) {
                          qrCodeUrl = `https://p.qrsim.net/${matches[1]}.png`;
                        } else {
                          qrCodeUrl = `https://${metadataQrCode}`;
                        }
                      }
                      if (import.meta.env.DEV) { console.log("Using metadata.qrCode URL:", qrCodeUrl); }
                    }
                  }

                  // Try to fix URL by extracting hash from shortUrl if available
                  if (!qrCodeUrl && esim.metadata?.rawData?.obj?.esimList?.[0]?.shortUrl) {
                    const shortUrl = esim.metadata.rawData.obj.esimList[0].shortUrl;
                    if (typeof shortUrl === 'string') {
                      const matches = shortUrl.match(/p\.qrsim\.net\/([a-f0-9]+)/);
                      if (matches && matches[1]) {
                        qrCodeUrl = `https://p.qrsim.net/${matches[1]}.png`;
                        if (import.meta.env.DEV) { console.log("Fixed using shortUrl:", qrCodeUrl); }
                      } else if (shortUrl.includes('p.qrsim.net/')) {
                        // If we can't extract the ID but it has the domain, try using it directly
                        qrCodeUrl = shortUrl.startsWith('http') ? shortUrl : `https://${shortUrl}`;
                        if (!qrCodeUrl.endsWith('.png')) qrCodeUrl += '.png';
                        if (import.meta.env.DEV) { console.log("Using shortUrl directly:", qrCodeUrl); }
                      }
                    }
                  }

                  if (import.meta.env.DEV) { 
                    console.log("QR Code rendering - qrCodeUrl:", qrCodeUrl);
                  }

                  // Always use the real QR image from eSIM Access if available
                  if (qrCodeUrl) {
                    // Use backend proxy to avoid CORS issues
                    const proxyUrl = `/api/qr-proxy?url=${encodeURIComponent(qrCodeUrl)}`;
                    
                    return (
                      <div className="flex flex-col items-center">
                        <h3 className="text-sm font-medium mb-2">Activation QR Code</h3>
                        <img
                          src={proxyUrl}
                          alt="eSIM QR Code"
                          className="w-52 h-52 border border-border rounded-lg shadow-sm p-2 bg-white"
                          onLoad={() => {
                            if (import.meta.env.DEV) { console.log("QR Code image loaded successfully via proxy:", qrCodeUrl); }
                          }}
                          onError={(e) => {
                            console.error("QR Code image failed to load via proxy:", qrCodeUrl, e);
                            const target = e.target as HTMLImageElement;
                            target.onerror = null; // Prevent infinite error loop
                            
                            // Final fallback to placeholder
                            target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.3 6H5.5C4.7 6 4 6.7 4 7.5V18.5C4 19.3 4.7 20 5.5 20H16.5C17.3 20 18 19.3 18 18.5V13.7'%3E%3C/path%3E%3Cpath d='M20 10V4H14'%3E%3C/path%3E%3Cpath d='M20 4L13 11'%3E%3C/path%3E%3C/svg%3E";
                          }}
                        />
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-col items-center">
                      <h3 className="text-sm font-medium mb-2">Activation QR Code</h3>
                      <div className="w-52 h-52 border border-border rounded-lg flex items-center justify-center bg-muted shadow-sm">
                        <p className="text-xs text-center p-2 text-muted-foreground">QR Code not available</p>
                      </div>
                    </div>
                  );
                } catch (error) {
                  console.error("Error displaying QR code:", error);
                  return (
                    <div className="flex flex-col items-center">
                      <h3 className="text-sm font-medium mb-2">Activation QR Code</h3>
                      <div className="w-52 h-52 border border-border rounded-lg flex items-center justify-center bg-muted shadow-sm">
                        <p className="text-xs text-center p-2 text-muted-foreground">QR Code not available</p>
                      </div>
                    </div>
                  );
                }
              })()}
              </div>

              {/* Add debug log for activation code */}
              {/* Debug log removed to fix React Node error */}

              {/* For synthetic eSIMs, always render activation code section */}
              {isSyntheticEsim ? (
                <div className="flex flex-col justify-center">
                  <h3 className="text-sm font-medium mb-2">Activation Code</h3>
                  <div className="flex items-center gap-2 p-4 bg-muted rounded-md border border-border/30 shadow-sm">
                    <div className="font-mono text-sm break-all flex-1">
                      {`LPA:1$eSIM.api.direct$${esim.planId || 'PLAN'}${esim.employeeId || 'USER'}`}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => copyToClipboard(
                        `LPA:1$eSIM.api.direct$${esim.planId || 'PLAN'}${esim.employeeId || 'USER'}`, 
                        'Activation code'
                      )}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                (esim.activationCode || esim.metadata?.activationCode || esim.metadata?.rawData?.obj?.esimList?.[0]?.activationCode) && (
                  <div className="flex flex-col justify-center">
                    <h3 className="text-sm font-medium mb-2">Activation Code</h3>
                    <div className="flex items-center gap-2 p-4 bg-muted rounded-md border border-border/30 shadow-sm">
                      <div className="font-mono text-sm break-all flex-1">
                        {esim.activationCode || esim.metadata?.activationCode || esim.metadata?.rawData?.obj?.esimList?.[0]?.activationCode}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => copyToClipboard(
                          esim.activationCode || esim.metadata?.activationCode || esim.metadata?.rawData?.obj?.esimList?.[0]?.activationCode || '', 
                          'Activation code'
                        )}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="space-y-3 mt-2">
              <div>
                <h2 className="text-xs font-semibold mb-1 border-b pb-1">Profile Information</h2>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <h3 className="text-sm text-muted-foreground">Order ID</h3>
                    <p className="font-medium">{esim.orderId}</p>
                  </div>
                  <div>
                    <h3 className="text-sm text-muted-foreground">Created</h3>
                    <p className="font-medium">
                      {esim.purchaseDate ? new Date(esim.purchaseDate).toLocaleString() : ''}
                    </p>
                  </div>
                  {(statusInfo.status === 'activated' || statusInfo.status === 'active') && (
                    <>
                      <div>
                        <h3 className="text-sm text-muted-foreground">Activated</h3>
                        <p className="font-medium">
                          {esim.activationDate ? new Date(esim.activationDate).toLocaleString() : '-'}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm text-muted-foreground">Expires</h3>
                        <p className="font-medium">
                          {esim.expiryDate ? new Date(esim.expiryDate).toLocaleString() : '-'}
                        </p>
                      </div>
                    </>
                  )}
                  <div>
                    <h3 className="text-sm text-muted-foreground">Status</h3>
                    <p className="font-medium">{typeof statusInfo.status === 'string' ? statusInfo.status.toUpperCase() : String(statusInfo.status).toUpperCase()}</p>
                  </div>
                  <div>
                    <h3 className="text-sm text-muted-foreground">ICCID</h3>
                    <p className="font-mono text-xs">{esim.iccid}</p>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xs font-semibold mb-1 border-b pb-1">Data Plan</h2>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <h3 className="text-sm text-muted-foreground">Plan Name</h3>
                    <p className="font-medium">{planName || 'Unknown'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm text-muted-foreground">Speed</h3>
                    <p className="font-medium">
                      {(() => {
                        // Get speed information from plan if available
                        if (esim.plan && typeof esim.plan === 'object' && 'speed' in esim.plan && esim.plan.speed) {
                          return esim.plan.speed;
                        }
                        
                        return "3G/4G/5G";
                      })()}
                    </p>
                  </div>
                  <div>
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm text-muted-foreground">Data Used</h3>
                      {(statusInfo?.status === 'activated' || statusInfo?.status === 'active') && onRefresh && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-xs" 
                          onClick={async () => {
                            try {
                              if (esim?.id) {
                                await onRefresh(esim.id);
                                toast({
                                  title: "Data usage updated",
                                  description: "Latest data usage information has been fetched from the provider",
                                  duration: 3000,
                                });
                              }
                            } catch (error) {
                              console.error("Error refreshing eSIM data:", error);
                              toast({
                                title: "Update failed",
                                description: "Could not refresh data usage information",
                                variant: "destructive",
                                duration: 3000,
                              });
                            }
                          }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {(() => {
                        try {
                          // Only proceed with data usage display if status is 'activated' or 'active'
                          if (!statusInfo || !statusInfo.status || 
                              (statusInfo.status !== 'activated' && statusInfo.status !== 'active')) {
                            return (
                              <div className="flex justify-between">
                                <span className="font-medium">Not available</span>
                                <span className="font-medium">-</span>
                              </div>
                            );
                          }

                          const dataUsed = parseFloat(esim.dataUsed || '0');

                          // Get total volume in GB from metadata if available
                          let dataLimit = 1; // Default to 1GB

                          // Get data limit from metadata if available
                          if (esim.metadata && typeof esim.metadata === 'object') {
                            try {
                              const totalVolume = (esim.metadata as any)?.rawData?.obj?.esimList?.[0]?.totalVolume;
                              if (totalVolume) {
                                // totalVolume is in bytes, convert to GB (1GB = 1,073,741,824 bytes)
                                dataLimit = totalVolume / 1073741824;
                                if (import.meta.env.DEV) { console.log("Using metadata volume:", dataLimit, "GB"); }
                              }
                            } catch (error) {
                              console.error("Error accessing metadata volume:", error);
                            }
                          }
                          else {
                            if (import.meta.env.DEV) { console.log("Using default data limit of 1GB"); }
                          }

                          // Safely convert data usage from bytes to GB
                          const dataUsedGB = dataUsed / 1073741824; // Convert bytes to GB (1GB = 1,073,741,824 bytes)
                          
                          // Get raw data directly from the provider if available
                          let usagePercent = 0;
                          
                          // Try to get usage directly from raw API data
                          if (esim.metadata?.rawData?.obj?.esimList?.[0]) {
                            const esimInfo = esim.metadata.rawData.obj.esimList[0];
                            const orderUsage = esimInfo.orderUsage;
                            const totalVolume = esimInfo.totalVolume;
                            
                            if (typeof orderUsage === 'number' && typeof totalVolume === 'number' && totalVolume > 0) {
                              // Use the provider's exact values for most accurate calculation
                              usagePercent = Math.min(Math.round((orderUsage / totalVolume) * 100), 100);
                              if (import.meta.env.DEV) { console.log(`Using provider's raw values: ${orderUsage}/${totalVolume} bytes = ${usagePercent}%`); }
                            }
                          }
                          
                          // Fallback to our calculation if provider data isn't available
                          if (usagePercent === 0 && dataLimit > 0) {
                            usagePercent = Math.min(Math.round((dataUsedGB / dataLimit) * 100), 100);
                            if (import.meta.env.DEV) { console.log(`Using calculated values: ${dataUsedGB}/${dataLimit} GB = ${usagePercent}%`); }
                          }

                          // Determine the display format (MB or GB) 
                          // Show in MB if data is less than 1GB
                          const usesMB = dataUsedGB < 1 || dataLimit < 1;

                          // Use provider's raw data for most accurate display if available
                          let displayUsed, displayLimit, unit;
                          
                          // Try to get raw values directly from metadata
                          let rawUsedBytes = 0;
                          let rawTotalBytes = 0;
                          
                          if (esim.metadata?.rawData?.obj?.esimList?.[0]) {
                            const esimInfo = esim.metadata.rawData.obj.esimList[0];
                            if (typeof esimInfo.orderUsage === 'number') {
                              rawUsedBytes = esimInfo.orderUsage;
                              if (import.meta.env.DEV) { console.log(`Raw orderUsage from provider: ${rawUsedBytes} bytes`); }
                            }
                            if (typeof esimInfo.totalVolume === 'number') {
                              rawTotalBytes = esimInfo.totalVolume;
                              if (import.meta.env.DEV) { console.log(`Raw totalVolume from provider: ${rawTotalBytes} bytes`); }
                            }
                          }
                          
                          if (rawUsedBytes > 0 && rawTotalBytes > 0) {
                            // Use provider's raw data for most accurate display
                            if (rawTotalBytes < 1073741824) { // Less than 1GB
                              // Show in MB for small packages
                              const usedMB = Math.round(rawUsedBytes / 1048576);
                              const totalMB = Math.round(rawTotalBytes / 1048576);
                              displayUsed = usedMB.toString();
                              displayLimit = totalMB.toString();
                              unit = "MB";
                              // Update usagePercent based on raw values
                              usagePercent = Math.min(Math.round((rawUsedBytes / rawTotalBytes) * 100), 100);
                              if (import.meta.env.DEV) { console.log(`Using provider data in MB: ${displayUsed}/${displayLimit} MB (${usagePercent}%)`); }
                            } else {
                              // Show in GB for larger packages
                              const usedGB = (rawUsedBytes / 1073741824).toFixed(2);
                              const totalGB = (rawTotalBytes / 1073741824).toFixed(2);
                              displayUsed = usedGB;
                              displayLimit = totalGB;
                              unit = "GB";
                              if (import.meta.env.DEV) { console.log(`Using provider data in GB: ${displayUsed}/${displayLimit} GB (${usagePercent}%)`); }
                            }
                          } 
                          else if (usesMB) {
                            // Fallback to calculated values for small data plans (less than 1GB)
                            displayUsed = (dataUsedGB * 1024).toFixed(0); // Convert GB to MB
                            displayLimit = (dataLimit * 1024).toFixed(0); // Convert GB to MB
                            unit = "MB";
                            if (import.meta.env.DEV) { console.log("Using calculated MB display:", displayUsed, "/", displayLimit, unit); }
                          } 
                          else {
                            // Fallback to calculated GB values for larger plans
                            displayUsed = dataUsedGB.toFixed(2);
                            displayLimit = dataLimit.toFixed(2);
                            unit = "GB";
                            if (import.meta.env.DEV) { console.log("Using calculated GB display:", displayUsed, "/", displayLimit, unit); }
                          }

                          return (
                            <>
                              <div className="flex justify-between">
                                <span className="font-medium">
                                  {displayUsed}/{displayLimit} {unit}
                                </span>
                                <span className="font-medium">
                                  {usagePercent}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    usagePercent > 90 ? "bg-red-500" : 
                                    usagePercent > 70 ? "bg-yellow-500" : 
                                    "bg-green-500"
                                  }`}
                                  style={{ width: `${usagePercent}%` }}
                                ></div>
                              </div>
                            </>
                          );
                        } catch (error) {
                          console.error("Error displaying data usage:", error);
                          return (
                            <div className="flex justify-between">
                              <span className="font-medium">Not available</span>
                              <span className="font-medium">-</span>
                            </div>
                          );
                        }
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-start gap-6">
                <div className="flex-1">
                  <h2 className="text-xs font-semibold mb-1 text-gray-900">Coverage</h2>
                  <div>
                    <h3 className="text-xs font-medium text-gray-600 mb-1">Location</h3>
                    <div className="p-3 bg-gray-50 rounded-lg text-sm border border-gray-100 shadow-sm">
                      {(() => {
                        try {
                          if (Array.isArray((esim as any)?.plan?.countries)) {
                            return (esim as any).plan.countries.map((country: string) => {
                              return typeof country === 'string' ? country.toUpperCase() : country;
                            }).join(', ');
                          }
                          return 'Unknown';
                        } catch (error) {
                          console.error("Error displaying countries:", error);
                          return 'Unknown';
                        }
                      })()}
                    </div>
                  </div>
                </div>

                {/* Show cancel button for waiting eSIMs, pending eSIMs, and API-managed plans */}
                {statusInfo && typeof statusInfo.status === 'string' && 
                  (statusInfo.status === 'waiting_for_activation' || 
                   statusInfo.status === 'pending' || 
                   statusInfo.status === 'api_plan' ||
                   (isSyntheticEsim && esim)) && (
                  <div className="min-w-[220px]">
                    <h2 className="text-xs font-semibold mb-1 text-gray-900">Actions</h2>
                    <Button 
                      variant="destructive" 
                      size="default"
                      className="w-full shadow-sm hover:shadow-md transition-all font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCancelDialogOpen(true);
                      }} 
                      disabled={isCancelling || statusInfo.status === 'cancelled'}
                    >
                      {isCancelling ? (
                        <>
                          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></span>
                          Cancelling...
                        </>
                      ) : (
                        "Cancel Plan and Refund"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* eSIM Renewal History Section */}
            {esim?.metadata?.renewalHistory && esim.metadata.renewalHistory.length > 0 && (
              <div className="mt-6 border rounded-md overflow-hidden">
                <Accordion type="single" collapsible defaultValue="renewal-history">
                  <AccordionItem value="renewal-history">
                    <AccordionTrigger className="px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-purple-600" />
                        <span className="font-medium">Renewal History</span>
                        <span className="text-xs bg-purple-100 text-purple-800 font-medium px-2 py-0.5 rounded-full">
                          {esim.metadata.renewalCount || esim.metadata.renewalHistory.length}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-gray-600">
                            <tr>
                              <th className="px-4 py-2 text-left">Date</th>
                              <th className="px-4 py-2 text-left">Plan</th>
                              <th className="px-4 py-2 text-left">Order ID</th>
                              <th className="px-4 py-2 text-right">Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {esim.metadata.renewalHistory.map((renewal, index) => (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-4 py-2 whitespace-nowrap">
                                  {new Date(renewal.date).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-2">{renewal.planName}</td>
                                <td className="px-4 py-2 font-mono text-xs">
                                  <div className="flex items-center gap-1">
                                    {renewal.orderId.substring(0, 10)}...
                                    <button
                                      onClick={() => copyToClipboard(renewal.orderId, "Order ID")}
                                      className="text-gray-400 hover:text-gray-700"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right">${renewal.cost.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}

            {/* Auto-Renewal Status for eSIMs that don't have renewal history but were processed */}
            {!esim?.metadata?.renewalHistory && esim?.metadata?.autoRenewalProcessed && (
              <div className="mt-6 border rounded-md p-4 bg-gray-50">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-purple-600" />
                  <span className="font-medium">Renewal Status</span>
                </div>
                <div className="mt-2 text-sm">
                  {esim.metadata.autoRenewalSuccess ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Last renewed on {new Date(esim.metadata.topUpDate || '').toLocaleDateString()}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Auto-renewal attempted but failed: {esim.metadata.autoRenewalError || 'Unknown error'}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {onRefresh && esim && (
              <div className="flex justify-end items-center mt-6">
                <Button 
                  variant="outline" 
                  onClick={() => onRefresh(esim.id)}
                  disabled={isLoading}
                  className="shadow-sm hover:shadow-md transition-all font-medium"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh Status
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EsimCancelDialog 
        isOpen={isCancelDialogOpen} 
        onClose={() => {
          // First close the cancel dialog
          setIsCancelDialogOpen(false);
          
          // Then close the main details dialog
          setTimeout(() => {
            onCloseRef.current();
          }, 300);
        }} 
        esimId={esim?.id || null}
        employeeId={employeeId || 0}
        esimName={typeof (esim as any)?.plan?.name === 'string' 
          ? (esim as any).plan.name 
          : (planName || "Unknown Plan")}
        employeeName={employeeName || "Unknown Employee"}
      />
    </>
  );
}