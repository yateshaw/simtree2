import { Router } from "express";
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Check if user is superadmin
const requireSuperAdmin = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: "SuperAdmin access required" });
  }
  next();
};

// Admin routes for purchased eSIMs management
// Middleware to check if user is admin
const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// Get all eSIM plan prices - used to dynamically get pricing information
router.get("/esim-plan-prices", requireAdmin, async (req: any, res: any) => {
  try {
    // Get all eSIM plans with their prices
    const plans = await db.select().from(schema.esimPlans);
    
    // Convert to a price map for easy consumption by the frontend
    const priceMap = plans.reduce((acc: Record<number, number>, plan) => {
      acc[plan.id] = Number(plan.sellingPrice);
      return acc;
    }, {});
    
    return res.json({ success: true, data: priceMap });
  } catch (error) {
    console.error("Error fetching eSIM plan prices:", error);
    return res.status(500).json({ error: "Failed to fetch eSIM plan prices" });
  }
});

// Get employee-company mapping - used to dynamically determine which employee belongs to which company
router.get("/employee-company-mapping", requireAdmin, async (req: any, res: any) => {
  try {
    // Get all employees with their company IDs
    const employees = await db.select({
      employeeId: schema.employees.id,
      companyId: schema.employees.companyId
    }).from(schema.employees);
    
    // Convert to a mapping for easy consumption by the frontend
    const mapping = employees.reduce((acc: Record<number, number>, exec) => {
      if (exec.employeeId !== null && exec.companyId !== null) {
        acc[exec.employeeId] = exec.companyId;
      }
      return acc;
    }, {});
    
    return res.json({ success: true, data: mapping });
  } catch (error) {
    console.error("Error fetching employee-company mapping:", error);
    return res.status(500).json({ error: "Failed to fetch employee-company mapping" });
  }
});

// Get system company ID - used to identify which company is the system company (Simtree)
router.get("/system-company-id", requireAdmin, async (req: any, res: any) => {
  try {
    // Get the Simtree company ID
    const [simtreeCompany] = await db.select()
      .from(schema.companies)
      .where(eq(schema.companies.name, "Simtree"));
    
    if (!simtreeCompany) {
      return res.json({ success: true, data: { systemCompanyId: 1 } }); // Default to 1 if not found
    }
    
    return res.json({ success: true, data: { systemCompanyId: simtreeCompany.id } });
  } catch (error) {
    console.error("Error fetching system company ID:", error);
    return res.status(500).json({ error: "Failed to fetch system company ID" });
  }
});

router.get("/purchased-esims", requireAdmin, async (req: any, res: any) => {
  if (!req.user.isSuperAdmin) {
    return res.status(403).json({ error: "Forbidden: SuperAdmin access required" });
  }

  try {
    console.log("[Admin] Fetching all purchased eSIMs across all companies");
    
    // Get all purchased eSIMs by joining with employees
    const allEsims = await db.select()
      .from(schema.purchasedEsims)
      .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
      .leftJoin(schema.companies, eq(schema.employees.companyId, schema.companies.id));
    
    // Modify each eSIM to include employee and company names for display
    const enhancedEsims = allEsims.map(esim => ({
      ...esim.purchased_esims,
      employeeName: esim.employees?.name || "Unknown Employee",
      employeeEmail: esim.employees?.email || "",
      companyName: esim.companies?.name || "Unknown Company",
    }));
    
    console.log(`[Admin] Found ${enhancedEsims.length} purchased eSIMs across all companies`);
    return res.json({ success: true, data: enhancedEsims });
  } catch (error) {
    console.error("Error fetching purchased eSIMs:", error);
    return res.status(500).json({ error: "Failed to get purchased eSIMs" });
  }
});

export default router;