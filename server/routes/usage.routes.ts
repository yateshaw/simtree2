import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { purchasedEsims, esimPlans, employees, companies } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

/**
 * Get eSIM usage information for public viewing
 * This route is accessible without authentication and allows monitoring of specific eSIM usage
 */
router.get('/:employeeId/:esimId', async (req, res) => {
  try {
    const { employeeId, esimId } = z.object({
      employeeId: z.string().transform(val => parseInt(val, 10)),
      esimId: z.string().transform(val => parseInt(val, 10))
    }).parse(req.params);

    console.log(`Fetching usage data for employee ${employeeId} and eSIM ${esimId}`);

    // Get the eSIM details with associated plan and employee information
    const esimResult = await db
      .select({
        esim: purchasedEsims,
        plan: esimPlans,
        employee: employees,
        company: companies
      })
      .from(purchasedEsims)
      .leftJoin(esimPlans, eq(purchasedEsims.planId, esimPlans.id))
      .leftJoin(employees, eq(purchasedEsims.employeeId, employees.id))
      .leftJoin(companies, eq(employees.companyId, companies.id))
      .where(
        and(
          eq(purchasedEsims.id, esimId),
          eq(purchasedEsims.employeeId, employeeId)
        )
      )
      .limit(1);

    if (esimResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'eSIM not found or does not belong to the specified employee'
      });
    }

    const { esim, plan, employee, company } = esimResult[0];

    if (!esim || !employee) {
      return res.status(404).json({
        success: false,
        message: 'eSIM or employee information not found'
      });
    }

    // Calculate usage percentage
    const totalDataGB = plan?.data ? parseFloat(plan.data.toString()) : 0;
    const usedDataGB = esim.dataUsed ? parseFloat(esim.dataUsed.toString()) : 0;
    const usagePercentage = totalDataGB > 0 ? (usedDataGB / totalDataGB) * 100 : 0;

    // Calculate remaining data
    const remainingDataGB = Math.max(0, totalDataGB - usedDataGB);

    // Format dates
    const formatDate = (date: string | Date | null) => {
      if (!date) return null;
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    // Determine status display
    const getStatusDisplay = (status: string) => {
      switch (status?.toLowerCase()) {
        case 'active':
          return { text: 'Active', color: 'green' };
        case 'activated':
          return { text: 'Activated', color: 'green' };
        case 'purchased':
          return { text: 'Ready for Activation', color: 'orange' };
        case 'expired':
          return { text: 'Expired', color: 'red' };
        case 'cancelled':
          return { text: 'Cancelled', color: 'red' };
        default:
          return { text: status || 'Unknown', color: 'gray' };
      }
    };

    const statusDisplay = getStatusDisplay(esim.status);

    // Prepare response data
    const usageData = {
      success: true,
      data: {
        // eSIM Information
        esim: {
          id: esim.id,
          orderId: esim.orderId,
          iccid: esim.iccid,
          status: statusDisplay,
          purchaseDate: formatDate(esim.purchaseDate),
          activationDate: formatDate(esim.activationDate),
          expiryDate: formatDate(esim.expiryDate)
        },
        // Plan Information
        plan: plan ? {
          name: plan.name,
          description: plan.description,
          totalDataGB: totalDataGB,
          validity: plan.validity,
          countries: plan.countries || [],
          speed: plan.speed
        } : null,
        // Usage Information
        usage: {
          usedDataGB: usedDataGB,
          remainingDataGB: remainingDataGB,
          usagePercentage: Math.min(100, Math.round(usagePercentage * 100) / 100),
          totalDataGB: totalDataGB
        },
        // Employee Information (limited for privacy)
        employee: {
          name: employee.name,
          position: employee.position
        },
        // Company Information (limited for privacy)
        company: company ? {
          name: company.name
        } : null,
        // Metadata
        lastUpdated: new Date().toISOString(),
        isExpired: esim.expiryDate ? new Date() > new Date(esim.expiryDate) : false
      }
    };

    res.json(usageData);

  } catch (error) {
    console.error('Error fetching eSIM usage data:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request parameters',
        errors: error.errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching usage data'
    });
  }
});

export default router;