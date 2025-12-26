import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Mail, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface QRCodeEmailTesterProps {
  employeeId?: number;
  employeeName?: string;
  employeeEmail?: string;
}

/**
 * Component for testing QR code email functionality
 * Used to send test emails with QR codes to employees
 */
export function QRCodeEmailTester({ 
  employeeId, 
  employeeName,
  employeeEmail 
}: QRCodeEmailTesterProps) {
  const { toast } = useToast();
  const [includeDebugInfo, setIncludeDebugInfo] = useState(false);
  const [debugNotes, setDebugNotes] = useState('');
  
  // Query to fetch the employee's eSIM details
  const { data: esimDetails, isLoading: loadingEsim } = useQuery({
    queryKey: ['/api/esim/purchased', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      try {
        const response = await api.get(`/api/esim/purchased/${employeeId}`);
        return response.data;
      } catch (error) {
        console.error('Error fetching eSIM details:', error);
        return null;
      }
    },
    enabled: !!employeeId,
  });

  // Get the active eSIM (non-cancelled one)
  const activeEsim = esimDetails?.find((esim: any) => 
    esim.status !== 'cancelled' && esim.qrCode
  );

  // Mutation for sending test email
  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('No employee selected');
      
      const response = await api.post('/api/email/send-individual-activation', { 
        employeeId: employeeId.toString(),
        includeDebugInfo,
        debugNotes: debugNotes || undefined
      });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to send email');
      }
      
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: 'Email Sent Successfully',
        description: `Activation email sent to ${employeeEmail || 'the employee'}`,
        variant: 'default',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Send Email',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle sending the email
  const handleSendEmail = () => {
    sendEmailMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>QR Code Email Tester</CardTitle>
        <CardDescription>
          Send a test activation email with QR code to an employee
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {!employeeId ? (
          <div className="flex flex-col items-center p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
            <p className="text-lg font-medium mb-2">No Employee Selected</p>
            <p className="text-sm text-muted-foreground">
              Please select an employee from the dropdown to continue.
            </p>
          </div>
        ) : loadingEsim ? (
          <div className="flex justify-center items-center p-6">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span>Loading eSIM details...</span>
          </div>
        ) : !activeEsim ? (
          <div className="flex flex-col items-center p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
            <p className="text-lg font-medium mb-2">No Active eSIM Found</p>
            <p className="text-sm text-muted-foreground">
              The selected employee does not have any active eSIM plans with QR codes.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Employee Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="font-semibold">Name:</div>
                <div>{employeeName}</div>
                <div className="font-semibold">Email:</div>
                <div>{employeeEmail}</div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-2">eSIM Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="font-semibold">eSIM ID:</div>
                <div>{activeEsim.id}</div>
                <div className="font-semibold">Status:</div>
                <div className="capitalize">{activeEsim.status}</div>
                <div className="font-semibold">QR Code Available:</div>
                <div>
                  {activeEsim.qrCode ? (
                    <span className="flex items-center text-green-600">
                      <CheckCircle className="h-4 w-4 mr-1" />Yes
                    </span>
                  ) : (
                    <span className="flex items-center text-red-600">
                      <AlertTriangle className="h-4 w-4 mr-1" />No
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="debug-mode"
                checked={includeDebugInfo}
                onCheckedChange={setIncludeDebugInfo}
              />
              <Label htmlFor="debug-mode">Include debug information in email</Label>
            </div>
            
            {includeDebugInfo && (
              <div className="space-y-2">
                <Label htmlFor="debug-notes">Debug Notes (will be included in email)</Label>
                <Textarea
                  id="debug-notes"
                  placeholder="Enter any debug information or notes..."
                  value={debugNotes}
                  onChange={(e) => setDebugNotes(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-end">
        <Button
          onClick={handleSendEmail}
          disabled={!employeeId || sendEmailMutation.isPending}
          className="w-full md:w-auto"
        >
          {sendEmailMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending Email...
            </>
          ) : (
            <>
              <Mail className="h-4 w-4 mr-2" />
              Send Test Email
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default QRCodeEmailTester;