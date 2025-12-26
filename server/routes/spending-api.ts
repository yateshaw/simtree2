import { Router } from 'express';
import { calculateCurrentMonthSpending, broadcastSpendingUpdate } from '../utils/spending-calculator';
import { requireSuperAdmin } from '../middleware/auth';

const router = Router();

/**
 * API endpoint to get current spending manually
 * Useful for initial load and debugging
 */
router.get('/current', async (req, res) => {
  try {
    const spending = await calculateCurrentMonthSpending();
    res.json({
      success: true,
      data: {
        totalSpending: spending,
        period: 'current_month',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching current spending:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate spending'
    });
  }
});

/**
 * API endpoint to manually trigger a spending update broadcast
 * Only accessible to super admins for testing
 */
router.post('/broadcast', requireSuperAdmin, async (req, res) => {
  try {
    await broadcastSpendingUpdate();
    res.json({
      success: true,
      message: 'Spending update broadcasted'
    });
  } catch (error) {
    console.error('Error broadcasting spending update:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to broadcast spending update'
    });
  }
});

/**
 * Debug endpoint to test spending calculation
 */
router.get('/debug', requireSuperAdmin, async (req, res) => {
  try {
    const spending = await calculateCurrentMonthSpending();
    res.json({
      success: true,
      calculatedSpending: spending,
      message: 'Check server logs for detailed calculation steps'
    });
  } catch (error) {
    console.error('Error in spending debug:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to debug spending calculation'
    });
  }
});

export default router;