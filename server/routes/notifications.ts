import { Router } from 'express';
import { emitEvent, EventTypes } from '../sse';

const router = Router();

/**
 * Route to trigger test notifications for demonstration purposes
 */
router.post('/api/notifications/test', (req, res) => {
  try {
    const { type = 'system_notification' } = req.body;
    
    switch (type) {
      case 'auto_renewal': {
        // Simulate auto-renewal notification
        emitEvent(EventTypes.AUTO_RENEWAL_EVENT, {
          employeeId: 1,
          employeeName: 'Test Employee',
          companyId: 1,
          companyName: 'Test Company',
          planName: 'Test Plan',
          planCost: 10.99,
          availableBalance: 5.50,
          status: 'disabled',
          message: 'Auto-renewal has been disabled due to insufficient balance.',
          reason: 'insufficient_balance'
        });
        break;
      }
      
      case 'wallet': {
        // Simulate wallet update notification
        emitEvent(EventTypes.WALLET_BALANCE_UPDATE, {
          companyId: 1,
          walletId: 1,
          oldBalance: '50.00',
          newBalance: '100.00',
          amount: '50.00',
          message: 'Your wallet has been credited with $50.00',
        });
        break;
      }
      
      case 'esim_status': {
        // Simulate eSIM status change notification
        emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
          employeeId: 1,
          employeeName: 'Test Employee',
          iccid: '1234567890',
          oldStatus: 'waiting_for_activation',
          newStatus: 'activated',
          message: 'Your eSIM has been activated.'
        });
        break;
      }
      
      default: {
        // Default system notification
        emitEvent(EventTypes.SYSTEM_NOTIFICATION, {
          title: 'Test Notification',
          message: 'This is a test system notification.',
          status: 'info'
        });
      }
    }
    
    res.status(200).json({ success: true, message: `Test notification of type ${type} sent` });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ success: false, message: 'Failed to send test notification' });
  }
});

export default router;