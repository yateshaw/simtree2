import { useState, useEffect, useCallback } from 'react';
import { useEventSource } from './useEventSource';
import { EventTypes } from '../lib/events';
import { useToast } from './use-toast';

export interface Notification {
  id: string;
  type: EventTypes;
  title: string;
  message: string;
  status: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  read: boolean;
  data?: any;
}

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { toast } = useToast();
  const { events } = useEventSource({
    url: '/api/events',
    withCredentials: true,
  });

  // Process incoming events and convert them to notifications
  useEffect(() => {
    if (events.length > 0) {
      const latestEvent = events[events.length - 1];
      
      if (!latestEvent) return;
      
      if (import.meta.env.DEV) { console.log('Processing SSE event for notifications:', latestEvent); }
      
      let newNotification: Notification | null = null;
      
      // Handle different event types
      switch (latestEvent.type) {
        case EventTypes.AUTO_RENEWAL_EVENT:
          const { status, message, employeeName, planName } = latestEvent;
          
          newNotification = {
            id: `auto-renewal-${Date.now()}`,
            type: EventTypes.AUTO_RENEWAL_EVENT,
            title: status === 'disabled' 
              ? 'Auto-Renewal Disabled' 
              : 'Auto-Renewal Notification',
            message: message || `Auto-renewal status updated for ${employeeName}'s plan (${planName})`,
            status: status === 'disabled' ? 'warning' : 'info',
            timestamp: new Date(),
            read: false,
            data: latestEvent
          };
          break;
          
        case EventTypes.WALLET_BALANCE_UPDATE:
          newNotification = {
            id: `wallet-${Date.now()}`,
            type: EventTypes.WALLET_BALANCE_UPDATE,
            title: 'Wallet Balance Updated',
            message: `Your wallet balance has been updated.`,
            status: 'info',
            timestamp: new Date(),
            read: false,
            data: latestEvent
          };
          break;
          
        case EventTypes.SPENDING_UPDATE:
          // Don't show notifications for spending updates - they're handled silently
          // by the dashboard components for real-time display
          break;
          
        case EventTypes.ESIM_STATUS_CHANGE:
          const { oldStatus, newStatus, iccid } = latestEvent;
          
          newNotification = {
            id: `esim-${Date.now()}`,
            type: EventTypes.ESIM_STATUS_CHANGE,
            title: 'eSIM Status Changed',
            message: `eSIM ${iccid} status changed from ${oldStatus} to ${newStatus}`,
            status: 'info',
            timestamp: new Date(),
            read: false,
            data: latestEvent
          };
          break;
          
        case EventTypes.SYSTEM_NOTIFICATION:
          newNotification = {
            id: `system-${Date.now()}`,
            type: EventTypes.SYSTEM_NOTIFICATION,
            title: latestEvent.title || 'System Notification',
            message: latestEvent.message || 'You have a new system notification',
            status: latestEvent.status || 'info',
            timestamp: new Date(),
            read: false,
            data: latestEvent
          };
          break;
      }
      
      if (newNotification) {
        // Add to notifications list
        setNotifications(prev => [newNotification!, ...prev]);
        
        // Show toast for the new notification
        toast({
          title: newNotification.title,
          description: newNotification.message,
          variant: newNotification.status === 'error' ? 'destructive' : 'default',
        });
      }
    }
  }, [events, toast]);

  // Mark a notification as read
  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => 
      prev.map(notification => ({ ...notification, read: true }))
    );
  }, []);

  // Clear a specific notification
  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications
  };
};