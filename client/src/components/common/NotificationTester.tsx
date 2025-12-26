import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

/**
 * Component for testing different notification types
 */
const NotificationTester = () => {
  const [type, setType] = useState<string>('system_notification');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const sendTestNotification = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/api/notifications/test', {
        method: 'POST',
        data: { type }
      });

      toast({
        title: 'Test Notification Sent',
        description: `Successfully sent a notification of type: ${type}`,
        variant: 'default'
      });
    } catch (error) {
      console.error('Failed to send test notification:', error);
      toast({
        title: 'Error',
        description: 'Failed to send test notification',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Test Notifications</CardTitle>
        <CardDescription>
          Send test notifications to verify the notification system
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="notification-type">Notification Type</label>
            <Select
              value={type}
              onValueChange={setType}
            >
              <SelectTrigger id="notification-type">
                <SelectValue placeholder="Select notification type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system_notification">System Notification</SelectItem>
                <SelectItem value="auto_renewal">Auto-Renewal Event</SelectItem>
                <SelectItem value="wallet">Wallet Balance Update</SelectItem>
                <SelectItem value="esim_status">eSIM Status Change</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={sendTestNotification} 
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Sending...' : 'Send Test Notification'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default NotificationTester;