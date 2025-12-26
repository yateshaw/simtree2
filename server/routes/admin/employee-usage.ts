import express from 'express';
import { db } from '../../db';
import * as schema from '../../../shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import { EsimAccessService } from '../../services/esim-access';

const router = express.Router();

interface EmployeeUsageUpdate {
  esimId: number;
  orderId: string;
  realTimeUsageGB: number;
  usagePercentage: number;
  lastUpdated: string;
}

/**
 * Get real-time usage data for employees' eSIMs
 * This endpoint fetches current usage from the provider API for all active eSIMs
 */
router.get('/real-time-usage/:companyId?', async (req, res) => {
  try {
    const { companyId } = req.params;
    const parsedCompanyId = companyId ? parseInt(companyId) : null;
    
    console.log(`[Employee Usage] Fetching real-time usage data for ${parsedCompanyId ? `company ${parsedCompanyId}` : 'all companies'}`);
    
    // Build query to get purchased eSIMs with employee and plan data
    const whereConditions = [
      sql`${schema.purchasedEsims.status} IN ('activated', 'active')`
    ];
    
    // Add company filter if specified
    if (parsedCompanyId) {
      whereConditions.push(eq(schema.employees.companyId!, parsedCompanyId));
    }
    

    
    console.log(`[Employee Usage] Found ${esims.length} active eSIMs for real-time usage check`);
    
    const usageUpdates: EmployeeUsageUpdate[] = [];
    const esimService = new EsimAccessService(db);
    
    // Process each active eSIM to get real-time usage
    for (const esim of esims) {
      try {
        console.log(`[Employee Usage] Checking real-time usage for eSIM ${esim.orderId}`);
        
        const statusResult = await esimService.checkEsimStatus(esim.orderId);
        
        if (statusResult && statusResult.rawData && statusResult.rawData.obj && statusResult.rawData.obj.esimList) {
          const esimInfo = statusResult.rawData.obj.esimList[0];
          
          if (esimInfo && esimInfo.orderUsage !== undefined) {
            // Convert bytes to GB
            const realTimeUsedBytes = parseInt(esimInfo.orderUsage.toString());
            const realTimeUsedGB = realTimeUsedBytes / (1024 * 1024 * 1024);
            const planDataGB = parseFloat(esim.planData.toString());
            const usagePercentage = planDataGB > 0 ? (realTimeUsedGB / planDataGB) * 100 : 0;
            
            // Only include if real-time data is available and different from stored data
            const storedUsageGB = parseFloat(esim.dataUsed?.toString() || "0");
            
            if (realTimeUsedGB > storedUsageGB || realTimeUsedGB > 0) {
              usageUpdates.push({
                esimId: esim.esimId,
                orderId: esim.orderId,
                realTimeUsageGB: realTimeUsedGB,
                usagePercentage: Math.min(usagePercentage, 100),
                lastUpdated: new Date().toISOString()
              });
              
              console.log(`[Employee Usage] Real-time usage for ${esim.orderId}: ${realTimeUsedGB.toFixed(3)}GB (${usagePercentage.toFixed(1)}%)`);
            }
          }
        }
      } catch (error) {
        console.log(`[Employee Usage] Failed to fetch real-time usage for ${esim.orderId}:`, error);
        // Continue with next eSIM - don't fail entire request
      }
    }
    
    console.log(`[Employee Usage] Returning ${usageUpdates.length} real-time usage updates`);
    
    res.json({
      success: true,
      data: usageUpdates,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Employee Usage] Error fetching real-time usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch real-time usage data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;