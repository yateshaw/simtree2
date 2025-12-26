import { Request, Response } from 'express';
import { db } from '../db';
import { walletTransactions, purchasedEsims, companies, employees, planHistory, esimPlans } from '@shared/schema';
import { count, eq, sum, sql, desc, gt, and, gte, lte, SQL, or } from 'drizzle-orm';
import * as schema from '@shared/schema';

// Function to get the start date for monthly intervals
function getStartDatesForMonths(numMonths: number): Date[] {
  const dates: Date[] = [];
  const now = new Date();
  
  for (let i = 0; i < numMonths; i++) {
    const date = new Date(now);
    date.setMonth(now.getMonth() - i);
    date.setDate(1); // First day of month
    date.setHours(0, 0, 0, 0); // Start of day
    dates.push(date);
  }
  
  // Return dates in ascending order (oldest first)
  return dates.reverse();
}

// Helper function to create date range condition
function dateRangeCondition(dateColumn: any, startDate: Date, endDate: Date) {
  return and(gte(dateColumn, startDate), lte(dateColumn, endDate));
}

export async function getTrendData(req: Request, res: Response) {
  try {
    const { metric, months = 6 } = req.query;
    const numMonths = parseInt(months as string) || 6;
    
    // Generate the required date ranges
    const startDates = getStartDatesForMonths(numMonths);
    
    let result: { date: string; value: number }[] = [];
    
    switch (metric) {
      case 'companies': {
        // Count companies registered per month
        result = await Promise.all(
          startDates.map(async (startDate, index) => {
            // Calculate end date (last day of the month)
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0);
            endDate.setHours(23, 59, 59, 999);
            
            // Count companies but exclude Simtree
            const [countResult] = await db
              .select({ value: count() })
              .from(companies)
              .where(and(
                dateRangeCondition(sql`${companies.createdAt}`, startDate, endDate),
                sql`${companies.name} != 'Simtree'`,
                sql`LOWER(${companies.name}) != 'simtree'`
              ));
              
            return {
              date: startDate.toLocaleString('default', { month: 'short', year: '2-digit' }),
              value: countResult.value || 0
            };
          })
        );
        break;
      }
      
      case 'employees': {
        // Get a complete count of employees from non-Simtree companies
        // and assign them to the current month (since we don't track creation date)
        
        // Get current month
        const currentMonth = new Date();
        const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        
        // Get all employees from non-Simtree companies
        const [employeeCount] = await db
          .select({ value: count() })
          .from(employees)
          .leftJoin(companies, eq(employees.companyId, companies.id))
          .where(
            and(
              // Exclude employees from Simtree company
              sql`${companies.name} != 'Simtree'`,
              sql`LOWER(${companies.name}) != 'simtree'`
            )
          );
        
        // Create result with all employees in the current month
        // and zero for previous months
        result = startDates.map(startDate => {
          const isCurrentMonth = 
            startDate.getMonth() === currentMonthStart.getMonth() && 
            startDate.getFullYear() === currentMonthStart.getFullYear();
          
          return {
            date: startDate.toLocaleString('default', { month: 'short', year: '2-digit' }),
            value: isCurrentMonth ? employeeCount.value : 0
          };
        });
        
        break;
      }
      
      case 'spending': {
        // Calculate total spending per month - only include successful transactions
        result = await Promise.all(
          startDates.map(async (startDate, index) => {
            // Calculate end date (last day of the month)
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0);
            endDate.setHours(23, 59, 59, 999);
            
            // Get wallet transactions that represent actual purchases
            // Exclude transactions with status 'cancelled' or 'refunded'
            const [sumResult] = await db
              .select({ value: sum(walletTransactions.amount).mapWith(Number) })
              .from(walletTransactions)
              .where(
                and(
                  dateRangeCondition(walletTransactions.createdAt, startDate, endDate),
                  eq(walletTransactions.status, 'completed'),
                  eq(walletTransactions.type, 'purchase')
                )
              );
            
            // Use actual data from the database
            return {
              date: startDate.toLocaleString('default', { month: 'short', year: '2-digit' }),
              value: sumResult.value || 0
            };
          })
        );
        break;
      }
      
      case 'avg_employees_per_company': {
        // Calculate average employees per company over time
        result = await Promise.all(
          startDates.map(async (startDate, index) => {
            // Calculate end date (last day of the month)
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0);
            endDate.setHours(23, 59, 59, 999);
            
            // Get current month
            const currentMonth = new Date();
            const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            
            // Only count non-Simtree companies
            const [companiesCount] = await db
              .select({ value: count() })
              .from(companies)
              .where(
                and(
                  sql`${companies.name} != 'Simtree'`,
                  sql`LOWER(${companies.name}) != 'simtree'`,
                  lte(companies.createdAt, endDate)
                )
              );
              
            // Get all employees from non-Simtree companies
            const [employeesCount] = await db
              .select({ value: count() })
              .from(employees)
              .leftJoin(companies, eq(employees.companyId, companies.id))
              .where(
                and(
                  // Exclude employees from Simtree company
                  sql`${companies.name} != 'Simtree'`,
                  sql`LOWER(${companies.name}) != 'simtree'`
                )
              );
            
            // For correct calculations, we know we have:
            // - 1 company (Yatecorp)
            // - 4 employees in May 2025
            const isCurrentMonth = 
              startDate.getMonth() === currentMonthStart.getMonth() && 
              startDate.getFullYear() === currentMonthStart.getFullYear();
              
            // Only show data for current month, with correct values
            const avgValue = isCurrentMonth ? (companiesCount.value > 0 ? employeesCount.value / companiesCount.value : 0) : 0;
              
            return {
              date: startDate.toLocaleString('default', { month: 'short', year: '2-digit' }),
              value: parseFloat(avgValue.toFixed(2))
            };
          })
        );
        break;
      }
      
      case 'avg_spending_per_company': {
        // Calculate average spending per company over time
        result = await Promise.all(
          startDates.map(async (startDate, index) => {
            // Calculate end date (last day of the month)
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0);
            endDate.setHours(23, 59, 59, 999);
            
            // Get current month
            const currentMonth = new Date();
            const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            
            // Only count non-Simtree companies
            const [companiesCount] = await db
              .select({ value: count() })
              .from(companies)
              .where(
                and(
                  sql`${companies.name} != 'Simtree'`,
                  sql`LOWER(${companies.name}) != 'simtree'`,
                  lte(companies.createdAt, endDate)
                )
              );
            
            // Calculate total spending - only for active/completed transactions
            const [spendingSum] = await db
              .select({ value: sum(walletTransactions.amount).mapWith(Number) })
              .from(walletTransactions)
              .where(
                and(
                  lte(walletTransactions.createdAt, endDate),
                  eq(walletTransactions.status, 'completed'),
                  eq(walletTransactions.type, 'purchase')
                )
              );
              
            // Check if this is the current month to show correct data
            const isCurrentMonth = 
              startDate.getMonth() === currentMonthStart.getMonth() && 
              startDate.getFullYear() === currentMonthStart.getFullYear();
              
            // Calculate the average spending per company based on real data
            const avgSpending = companiesCount.value > 0 && spendingSum.value ? 
              spendingSum.value / companiesCount.value : 0;
            
            return {
              date: startDate.toLocaleString('default', { month: 'short', year: '2-digit' }),
              value: avgSpending
            };
          })
        );
        break;
      }
      
      case 'avg_spending_per_employee': {
        // Calculate average spending per employee over time
        result = await Promise.all(
          startDates.map(async (startDate, index) => {
            // Calculate end date (last day of the month)
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0);
            endDate.setHours(23, 59, 59, 999);
            
            // Get current month
            const currentMonth = new Date();
            const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            
            // Count employees from non-Simtree companies
            const [employeesCount] = await db
              .select({ value: count() })
              .from(employees)
              .leftJoin(companies, eq(employees.companyId, companies.id))
              .where(
                and(
                  // Exclude employees from Simtree company
                  sql`${companies.name} != 'Simtree'`,
                  sql`LOWER(${companies.name}) != 'simtree'`
                )
              );
            
            // Calculate total spending - only for active/completed transactions
            const [spendingSum] = await db
              .select({ value: sum(walletTransactions.amount).mapWith(Number) })
              .from(walletTransactions)
              .where(
                and(
                  lte(walletTransactions.createdAt, endDate),
                  eq(walletTransactions.status, 'completed'),
                  eq(walletTransactions.type, 'purchase')
                )
              );
              
            // Check if this is the current month to show correct data
            const isCurrentMonth = 
              startDate.getMonth() === currentMonthStart.getMonth() && 
              startDate.getFullYear() === currentMonthStart.getFullYear();
              
            // Calculate the average spending per employee based on actual database values
            const avgSpending = employeesCount.value > 0 && spendingSum.value ? 
              spendingSum.value / employeesCount.value : 0;
              
            return {
              date: startDate.toLocaleString('default', { month: 'short', year: '2-digit' }),
              value: parseFloat(avgSpending.toFixed(2))
            };
          })
        );
        break;
      }
      
      case 'revenue': {
        // Calculate revenue growth per month based on current active eSIM plans
        result = await Promise.all(
          startDates.map(async (startDate, index) => {
            // Calculate end date (last day of the month)
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0);
            endDate.setHours(23, 59, 59, 999);
            
            // Calculate current month
            const currentMonth = new Date();
            const isCurrentMonth = 
              startDate.getMonth() === currentMonth.getMonth() && 
              startDate.getFullYear() === currentMonth.getFullYear();
              
            // Only calculate for current month - past months would show zero
            // This matches the UI cards showing current active plans
            if (!isCurrentMonth) {
              return {
                date: startDate.toLocaleString('default', { month: 'short', year: '2-digit' }),
                value: 0
              };
            }
            
            // Get all currently active eSIMs for calculating spending
            const activeEsims = await db
              .select({
                id: purchasedEsims.id,
                planId: purchasedEsims.planId,
                status: purchasedEsims.status
              })
              .from(purchasedEsims)
              .where(
                or(
                  eq(purchasedEsims.status, 'waiting_for_activation'),
                  eq(purchasedEsims.status, 'activated')
                )
              );
            
            // Fetch all plans to get their prices
            const plans = await db.select().from(schema.esimPlans);
            const plansMap = new Map(plans.map(plan => [plan.id, plan]));
            
            // Calculate selling price for each active eSIM - this matches the BusinessAnalyticsCards
            let totalEsimValue = 0;
            for (const esim of activeEsims) {
              const plan = plansMap.get(esim.planId);
              if (plan) {
                // Use provider price multiplied by system margin to calculate selling price
                const providerPrice = plan.providerPrice || 0;
                const margin = plan.margin || 50; // Default 50% margin if not specified
                const sellingPrice = providerPrice * (1 + margin / 100);
                totalEsimValue += sellingPrice;
              }
            }
            
            console.log(`Calculated revenue value from active eSIMs: $${totalEsimValue.toFixed(2)}`);
            
            return {
              date: startDate.toLocaleString('default', { month: 'short', year: '2-digit' }),
              value: totalEsimValue
            };
          })
        );
        break;
      }
      
      default:
        return res.status(400).json({ success: false, message: 'Invalid metric specified' });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching trend data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch trend data' });
  }
}