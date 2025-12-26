import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useEventSource } from '@/hooks/useEventSource';
import { apiRequest } from '@/lib/queryClient';
import { 
  AlertTriangle, 
  RefreshCw, 
  BellRing, 
  Wallet, 
  Router,
  Send,
  Trash,
  Copy
} from 'lucide-react';
import { format } from 'date-fns';

interface StatusUpdatesProps {
  isSuperAdmin?: boolean;
}

const StatusUpdates: React.FC<StatusUpdatesProps> = ({ isSuperAdmin = false }) => {
  const [activeTab, setActiveTab] = useState('events');
  const [customEventData, setCustomEventData] = useState('');
  const [customEventType, setCustomEventType] = useState('system_notification');
  const { toast } = useToast();
  
  // Create stable callback references to prevent hook dependency changes
  const handleSSEOpen = useCallback(() => {
    // Only show toast for superadmins to avoid spam
    if (isSuperAdmin) {
      toast({
        title: 'Real-time Updates Active',
        description: 'System monitoring is connected',
        variant: 'default',
      });
    }
  }, [isSuperAdmin, toast]);

  const handleSSEError = useCallback(() => {
    // Only show error toast for superadmins
    if (isSuperAdmin) {
      toast({
        title: 'Connection Issue',
        description: 'Real-time updates temporarily unavailable',
        variant: 'destructive',
      });
    }
  }, [isSuperAdmin, toast]);

  // Configure the SSE connection through our custom hook
  // This is the core real-time functionality that updates the frontend when webhooks update the database
  const { 
    status: sseStatus, 
    events,
    close: closeConnection,
    connect: reconnect,
    clearEvents: clearSSEEvents
  } = useEventSource({
    url: '/api/events',
    withCredentials: true,
    reconnectInterval: 60000, // 60 seconds (reduced from 30) - less aggressive reconnection
    maxRetries: 2, // Reduced retries to minimize compute usage
    enabled: true, // Keep enabled as this is core functionality
    onOpen: handleSSEOpen,
    onError: handleSSEError
  });

  // Function to send a test event (for superadmins only)
  const sendTestEvent = async () => {
    try {
      const response = await apiRequest('/api/sse/test-event', {
        method: 'POST',
        body: JSON.stringify({
          eventType: customEventType,
          data: customEventData ? JSON.parse(customEventData) : {}
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      toast({
        title: 'Test Event Sent',
        description: 'Your test event has been sent to all connected clients',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error sending test event:', error);
      toast({
        title: 'Error Sending Test Event',
        description: 'Failed to send test event. Check the console for details.',
        variant: 'destructive',
      });
    }
  };

  // Function to manually reconnect SSE if needed
  const reconnectSSE = () => {
    reconnect();
    toast({
      title: 'Reconnecting',
      description: 'Attempting to reconnect real-time monitoring',
      variant: 'default',
    });
  };

  // Function to clear all events
  const clearEvents = () => {
    clearSSEEvents();
    toast({
      title: 'Events Cleared',
      description: 'Event history has been cleared',
      variant: 'default',
    });
  };

  // Function to copy events to clipboard
  const copyEventsToClipboard = () => {
    const eventsText = events.map(e => JSON.stringify(e, null, 2)).join('\n\n');
    navigator.clipboard.writeText(eventsText)
      .then(() => {
        toast({
          title: 'Copied to Clipboard',
          description: 'Events have been copied to clipboard',
          variant: 'default',
        });
      })
      .catch(err => {
        console.error('Failed to copy events:', err);
        toast({
          title: 'Copy Failed',
          description: 'Failed to copy events to clipboard',
          variant: 'destructive',
        });
      });
  };

  // Helper to get the appropriate icon for each event type
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'esim_status_change':
        return <Router className="h-5 w-5 text-blue-500" />;
      case 'wallet_balance_update':
        return <Wallet className="h-5 w-5 text-green-500" />;
      case 'system_notification':
        return <BellRing className="h-5 w-5 text-yellow-500" />;
      case 'connection_status':
        return <RefreshCw className="h-5 w-5 text-purple-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  // Helper to get appropriate styling for each event type
  const getEventStyle = (type: string) => {
    switch (type) {
      case 'esim_status_change':
        return 'bg-blue-50 border-blue-200';
      case 'wallet_balance_update':
        return 'bg-green-50 border-green-200';
      case 'system_notification':
        return 'bg-yellow-50 border-yellow-200';
      case 'connection_status':
        return 'bg-purple-50 border-purple-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  // Test data samples for superadmins
  const testEventSamples = [
    {
      type: 'system_notification',
      data: { message: 'System maintenance completed successfully', level: 'info' }
    },
    {
      type: 'esim_status_change',
      data: { 
        iccid: '8944123456789012345',
        orderId: 'ORD123456',
        oldStatus: 'waiting_for_activation',
        newStatus: 'active'
      }
    },
    {
      type: 'wallet_balance_update',
      data: { 
        walletId: 123,
        previousBalance: '100.00',
        newBalance: '125.00',
        change: '+25.00',
        reason: 'Credit purchase' 
      }
    }
  ];

  // Load sample data for the custom event input
  const loadSampleData = (index: number) => {
    const sample = testEventSamples[index];
    setCustomEventType(sample.type);
    setCustomEventData(JSON.stringify(sample.data, null, 2));
  };

  return (
    <Tabs defaultValue="events" value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="events">Real-time Updates</TabsTrigger>
        {isSuperAdmin && <TabsTrigger value="test">Test Controls</TabsTrigger>}
      </TabsList>

      {/* Real-time Events Tab */}
      <TabsContent value="events" className="pt-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Badge variant={sseStatus === 'open' ? 'default' : 'destructive'}>
              {sseStatus === 'open' ? 'Connected' : sseStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {events.length} events received
            </span>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={reconnect}
              disabled={sseStatus === 'open' || sseStatus === 'connecting'}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Reconnect
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearEvents}
            >
              <Trash className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={copyEventsToClipboard}
              disabled={events.length === 0}
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[500px] rounded-md border">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No events received yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Events will appear here when they are received
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {events.slice().reverse().map((event, index) => (
                <Alert key={index} className={`border ${getEventStyle(event.type)} relative`}>
                  <div className="flex items-start gap-4">
                    {getEventIcon(event.type)}
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <AlertTitle className="text-sm font-medium">
                          {event.type}
                        </AlertTitle>
                        <span className="text-xs text-muted-foreground">
                          {event.timestamp ? format(new Date(event.timestamp), 'MMM d, h:mm:ss a') : 'No timestamp'}
                        </span>
                      </div>
                      <AlertDescription className="mt-1">
                        <pre className="text-xs bg-background p-2 rounded whitespace-pre-wrap break-all">
                          {JSON.stringify(event.data, null, 2)}
                        </pre>
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              ))}
            </div>
          )}
        </ScrollArea>
      </TabsContent>

      {/* Test Controls Tab (SuperAdmin only) */}
      {isSuperAdmin && (
        <TabsContent value="test" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Event Generator</CardTitle>
              <CardDescription>
                Create and send test events to all connected clients
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Event Type</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={customEventType}
                  onChange={e => setCustomEventType(e.target.value)}
                >
                  <option value="system_notification">System Notification</option>
                  <option value="esim_status_change">eSIM Status Change</option>
                  <option value="wallet_balance_update">Wallet Balance Update</option>
                  <option value="connection_status">Connection Status</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Event Data (JSON)</label>
                <textarea 
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder='{"message": "Test notification", "level": "info"}'
                  value={customEventData}
                  onChange={e => setCustomEventData(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => loadSampleData(0)}
                >
                  Load System Notification
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => loadSampleData(1)}
                >
                  Load eSIM Status Change
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => loadSampleData(2)}
                >
                  Load Wallet Update
                </Button>
              </div>

              <Separator />

              <Button 
                onClick={sendTestEvent}
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                Send Test Event
              </Button>
            </CardContent>
          </Card>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Admin Testing Only</AlertTitle>
            <AlertDescription>
              These test events are sent to all connected clients including customers and staff.
              Use with caution in production environments.
            </AlertDescription>
          </Alert>
        </TabsContent>
      )}
    </Tabs>
  );
};

export default StatusUpdates;