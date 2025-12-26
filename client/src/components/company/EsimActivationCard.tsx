import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, Copy, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";

interface EsimActivationCardProps {
  employeeId: number;
  planId: string | number;
  esimId: number;
}

export function EsimActivationCard({ employeeId, planId, esimId }: EsimActivationCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: activationData, isLoading, error } = useQuery({
    queryKey: ['/api/esim/purchased', employeeId, esimId],
    queryFn: async () => {
      const response = await apiRequest(`/api/esim/purchased/${employeeId}?esimId=${esimId}`);
      if (!response || !response.length) {
        throw new Error('eSIM not found');
      }
      return response[0];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - rely on SSE for real-time updates
    retry: 3
  });

  const cancelPlanMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/esim/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ esimId })
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to cancel plan');
      }

      return response;
    },
    onSuccess: () => {
      toast({
        title: "Plan cancelled",
        description: "The eSIM plan has been cancelled and refunded",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/esim/purchased'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
    },
    onError: (error: any) => {
      console.error('Cancel plan error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to cancel the plan",
        variant: "destructive",
      });
    }
  });

  const handleCancelPlan = () => {
    if (confirm('Are you sure you want to cancel this plan?')) {
      cancelPlanMutation.mutate();
    }
  };

  const handleCopy = () => {
    if (activationData?.activationCode) {
      navigator.clipboard.writeText(activationData.activationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied",
        description: "Activation code copied to clipboard",
      });
    }
  };

  const downloadQRCode = () => {
    if (!activationData?.activationCode) return;

    // Generate QR code SVG
    const qrCodeSvg = document.querySelector('.qr-code-container svg');
    if (!qrCodeSvg) {
      console.error('QR code SVG element not found');
      return;
    }
    
    // Convert SVG to base64 image
    const svgData = new XMLSerializer().serializeToString(qrCodeSvg);
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tempImg = new Image();
    tempImg.onload = () => {
      ctx.drawImage(tempImg, 0, 0, canvas.width, canvas.height);
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `esim-qr-${activationData.iccid || 'code'}.png`;
      link.href = dataURL;
      link.click();
    };

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    tempImg.src = url;
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center space-y-4 py-6">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <p className="text-center">Failed to load eSIM details. Please try again later.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !activationData) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            <p className="ml-3 text-gray-500">Loading activation details...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>eSIM Activation</CardTitle>
      </CardHeader>
      <CardContent>
        {activationData.status === 'pending' ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-6">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            <p className="text-center">Your eSIM is being prepared. This may take a few minutes.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={handleCancelPlan}
              disabled={cancelPlanMutation.isPending}
            >
              {cancelPlanMutation.isPending ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Cancelling...
                </>
              ) : (
                "Cancel Plan and Refund"
              )}
            </Button>
          </div>
        ) : activationData.status === 'waiting_for_activation' ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-6">
            <div className="animate-pulse rounded-full h-12 w-12 bg-yellow-500/20 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>
            <p className="text-center">Your eSIM is ready and waiting for activation.</p>
            <p className="text-sm text-gray-500 text-center">
              Please proceed with the activation using the QR code or activation code below.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={handleCancelPlan}
              disabled={cancelPlanMutation.isPending}
            >
              {cancelPlanMutation.isPending ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Cancelling...
                </>
              ) : (
                "Cancel Plan and Refund"
              )}
            </Button>
          </div>
        ) : activationData.status === 'cancelled' ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-6">
            <AlertCircle className="h-12 w-12 text-orange-500" />
            <p className="text-center">This eSIM order was cancelled and refunded.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-center">
              {activationData.activationCode ? (
                <div className="border p-4 bg-white rounded-md qr-code-container">
                  <QRCodeSVG value={activationData.activationCode} size={200} level="H" />
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 w-32 bg-gray-100 rounded-md">
                  <p className="text-sm text-gray-500">QR code not available</p>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center space-y-3">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadQRCode}
                disabled={!activationData.activationCode}
              >
                Download QR Code
              </Button>
              
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  // Create a direct activation link
                  const activationUrl = `/api/activate/${employeeId}/${esimId}`;
                  
                  // For iOS devices, use the iOS-specific activation page
                  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                  const finalUrl = isIOS 
                    ? `/api/activate-ios/${employeeId}/${esimId}` 
                    : activationUrl;
                  
                  // Open in new tab
                  window.open(finalUrl, '_blank');
                }}
              >
                Activate on this device
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Activation Code:</p>
              <div className="relative">
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md break-all">
                  <span className="flex-1 font-mono text-sm">
                    {activationData.activationCode || 'Not available yet'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={handleCopy}
                    disabled={!activationData.activationCode}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">ICCID:</p>
              <p className="p-3 bg-gray-50 rounded-md font-mono text-sm">
                {activationData.iccid || 'Not available'}
              </p>
            </div>

            <div className="border-t pt-4 mt-4">
              <div className="text-sm space-y-2">
                <div className="space-y-1">
                  {(() => {
                    // Provider API sends both orderUsage and dataUsed
                    // orderUsage from metadata is in bytes, dataUsed from API is a string like "39580.00"
                    
                    // Constants for conversion
                    const BYTES_PER_MB = 1024 * 1024;
                    const BYTES_PER_GB = 1024 * 1024 * 1024;
                    
                    // Get data usage from either metadata (preferred) or our stored value
                    let dataUsageBytes = 0;
                    
                    // First priority: Check if orderUsage exists in metadata (most accurate source)
                    if (activationData.metadata?.rawData?.obj?.esimList?.[0]?.orderUsage !== undefined) {
                      dataUsageBytes = activationData.metadata.rawData.obj.esimList[0].orderUsage;
                    } 
                    // Second priority: Use our stored dataUsed value if it's a plausible byte value (e.g., "39580")
                    else if (activationData.dataUsed) {
                      const parsedValue = parseFloat(activationData.dataUsed);
                      if (parsedValue > 0) {
                        // If the value is small (<100), it might already be in MB/GB format
                        // If it's large (>1000), it's likely in bytes
                        if (parsedValue > 1000) {
                          dataUsageBytes = parsedValue;
                        } else {
                          // Already in MB or GB, convert to bytes
                          dataUsageBytes = parsedValue * BYTES_PER_MB; // Assume MB for small values
                        }
                      }
                    }
                    
                    // Get total volume (data limit) in bytes
                    let dataTotalBytes = BYTES_PER_GB; // Default to 1GB
                    
                    // Try to get the actual total volume from metadata
                    if (activationData.metadata?.rawData?.obj?.esimList?.[0]?.totalVolume) {
                      dataTotalBytes = activationData.metadata.rawData.obj.esimList[0].totalVolume;
                    }
                    
                    // Convert bytes to GB for display
                    const dataUsedGB = dataUsageBytes / BYTES_PER_GB;
                    const dataLimitGB = dataTotalBytes / BYTES_PER_GB;
                    
                    // Calculate percentage - handle potential division by zero
                    const usagePercent = dataLimitGB > 0 
                      ? Math.min(Math.round((dataUsedGB / dataLimitGB) * 100), 100) 
                      : 0;
                    
                    return (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Data Used:</span>
                          <span className="font-medium">
                            {dataUsedGB.toFixed(2)}/{dataLimitGB.toFixed(2)} GB ({usagePercent}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
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
                  })()}
                </div>
                {activationData.status === 'activated' && (
                <div className="flex justify-between mt-2">
                  <span className="text-gray-500">Expiry Date:</span>
                  <span>
                    {activationData.expiryDate
                      ? new Date(activationData.expiryDate).toLocaleDateString()
                      : 'Not available'}
                  </span>
                </div>
              )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EsimActivationCard;