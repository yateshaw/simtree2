import { scrypt as scryptCallback, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scryptCallback);

import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import {
  User,
  Employee,
  InsertUser,
  EsimPlan,
  PurchasedEsim,
  Subscription,
  Payment,
  DataPackage,
  PlanHistory,
  Company,
  InsertCompany,
  ServerConnection,
  ConnectionLog,
  InsertServerConnection,
  InsertConnectionLog,
  Coupon,
  InsertCoupon,
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import * as schema from "@shared/schema";
import { sql } from "drizzle-orm";
import { eq, desc, and, isNotNull, inArray, gte, lt } from "drizzle-orm";
import { pool, db } from "./db";
import { broadcastSpendingUpdate } from "./utils/spending-calculator";
import { companyCurrencyService } from "./services/company-currency.service";

const PostgresSessionStore = connectPg(session);

// Export this interface for use in other modules
export interface IStorage {
  // Server connection monitoring methods
  getServerConnections(): Promise<ServerConnection[]>;
  getServerConnectionByName(
    serviceName: string,
  ): Promise<ServerConnection | undefined>;
  createServerConnection(
    connection: InsertServerConnection,
  ): Promise<ServerConnection>;
  updateServerConnection(
    id: number,
    data: Partial<ServerConnection>,
  ): Promise<ServerConnection>;
  deleteServerConnection(id: number): Promise<void>;
  getConnectionLogs(limit?: number): Promise<ConnectionLog[]>;
  // Get all active eSIMs for usage sync
  getActiveEsims(): Promise<PurchasedEsim[]>;
  getConnectionLogsByService(
    serviceName: string,
    limit?: number,
  ): Promise<ConnectionLog[]>;
  createConnectionLog(log: InsertConnectionLog): Promise<ConnectionLog>;
  deleteConnectionLogs(olderThan?: Date): Promise<number>;
  
  // Coupon system methods
  createCoupon(couponData: InsertCoupon): Promise<Coupon>;
  getCoupon(id: number): Promise<Coupon | undefined>;
  getCouponByCode(code: string): Promise<Coupon | undefined>;
  getCompanyCoupons(companyId: number): Promise<Coupon[]>;
  getAllCoupons(): Promise<Coupon[]>;
  updateCoupon(id: number, data: Partial<Coupon>): Promise<Coupon>;
  deleteCoupon(id: number): Promise<void>;
  redeemCoupon(code: string, userId: number): Promise<{ success: boolean, wallet?: any, coupon?: Coupon, error?: string }>;
  markCouponAsUsed(id: number, userId: number): Promise<Coupon>;

  // Existing methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyUser(userId: number): Promise<User>;
  updateUserProfile(userId: number, data: Partial<User>): Promise<User>;
  deleteUser(userId: number): Promise<void>;
  createVerificationToken(userId: number): Promise<string>;
  // Removed obsolete validateVerificationToken method - no longer used in the modern authentication flow

  // Company methods
  getCompany(id: number): Promise<Company | undefined>;
  getCompanyByName(name: string): Promise<Company | undefined>;
  getCompanyByTaxNumber(taxNumber: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, data: Partial<Company>): Promise<Company>;
  deleteCompany(id: number, forceDeletion?: boolean): Promise<void>;
  getAllCompanies(): Promise<Company[]>;

  // Employee methods
  getEmployees(companyId: number): Promise<Employee[]>;
  createEmployee(employee: Omit<Employee, "id">): Promise<Employee>;
  updateEmployee(id: number, data: Partial<Employee>): Promise<Employee>;
  deleteEmployee(id: number): Promise<void>;
  getAllEmployees(): Promise<Employee[]>;
  getClientsWithCompanyDetails(): Promise<any[]>; // Returns users with company information
  sessionStore: session.Store;

  // Subscription methods
  getCompanySubscription(companyId: number): Promise<Subscription | undefined>;
  createSubscription(
    subscription: Omit<Subscription, "id" | "startDate" | "status">,
  ): Promise<Subscription>;
  updateSubscription(
    id: number,
    data: Partial<Subscription>,
  ): Promise<Subscription>;

  // Payment methods
  getCompanyPayments(companyId: number): Promise<Payment[]>;
  createPayment(payment: Omit<Payment, "id" | "paymentDate">): Promise<Payment>;

  // Cache management
  clearCompanyCaches(): Promise<void>;

  // New eSIM related methods
  getEsimPlans(): Promise<EsimPlan[]>;
  getActiveEsimPlans(): Promise<EsimPlan[]>;
  createEsimPlan(plan: Omit<EsimPlan, "id">): Promise<EsimPlan>;
  updateEsimPlan(id: number, data: Partial<EsimPlan>): Promise<EsimPlan>;
  getPurchasedEsims(
    params: { employeeId: number } | number,
  ): Promise<PurchasedEsim[]>;
  getPurchasedEsimById(id: number): Promise<PurchasedEsim | undefined>;
  createPurchasedEsim(esim: Omit<PurchasedEsim, "id">): Promise<PurchasedEsim>;
  updatePurchasedEsim(
    id: number,
    data: Partial<PurchasedEsim>,
  ): Promise<PurchasedEsim>;
  getDataPackages(employeeId: number): Promise<DataPackage[]>;
  createDataPackage(pkg: Omit<DataPackage, "id">): Promise<DataPackage>;

  // eSIM methods
  getEsimPlan(id: number): Promise<EsimPlan | undefined>;
  getEmployee(id: number): Promise<Employee | undefined>;
  clearEsimPlans(): Promise<void>;
  getActiveEsims(): Promise<PurchasedEsim[]>; // Method to get all active eSIMs for usage checking
  getWallet(companyId: number): Promise<any>;
  getWalletByUserId(userId: number): Promise<any>; // Add method to get wallet by user ID
  createWallet(companyId: number): Promise<any>;
  addWalletCredit(
    companyId: number,
    amount: number,
    description?: string,
  ): Promise<any>;
  getWalletTransactions(walletId: number): Promise<any>;
  addWalletTransaction(
    walletId: number,
    amount: number,
    type: string,
    description: string,
    paymentDetails?: {
      stripePaymentId?: string;
      stripeSessionId?: string;
      stripePaymentIntentId?: string;
      status?: string;
      paymentMethod?: string;
    },
  ): Promise<any>;
  updateWalletBalance(walletId: number, newBalance: number): Promise<any>;
  addWalletBalance(walletId: number, amount: number): Promise<any>; // Add method for adding to wallet balance
  addWalletFunds(companyId: number, amount: number, paymentDetails?: { method?: string; description?: string; stripePaymentIntentId?: string }): Promise<any>;
  getSadminCompanyId(): Promise<number | null>; // Get the Simtree sadmin company ID
  addProfitToSadminWallet(
    profit: number,
    planName: string,
    employeeName: string,
    companyName: string,
  ): Promise<boolean>;
  deductProfitFromSadminWallet(
    profit: number,
    planName: string,
    employeeName: string,
    companyName: string,
  ): Promise<boolean>;

  // Add new methods for plan history
  getPlanHistory(employeeId: number): Promise<PlanHistory[]>;
  addPlanHistory(history: Omit<PlanHistory, "id">): Promise<PlanHistory>;
  updatePlanHistoryStatus(id: number, status: string): Promise<void>;
  updateAllPlanHistoryToExpired(employeeId: number): Promise<void>;
  getWalletTransactionsByCompany(companyId: number): Promise<any>;
  getCompanyWalletBalance(companyId: number): Promise<number>;
  getAllWalletTransactions(): Promise<any>;
  deductWalletBalance(
    companyId: number,
    amount: number,
    description: string,
  ): Promise<any>;
  getEsimPlanByProviderId(providerId: string): Promise<EsimPlan | undefined>;
  cancelPurchasedEsim(id: number): Promise<PurchasedEsim | null>; // Added method for cancellation
  createMissingWallets(): Promise<number>; // Create wallets for users who don't have them
  deleteCompany(id: number, forceDeletion?: boolean): Promise<void>; // Delete a company and all its associated data
  rebalanceAllWallets(): Promise<{ updated: number; total: number }>; // Recalculate all wallet balances from transactions
  migrateSimtreeWallets(): Promise<{ migrated: number; created: number; message: string }>; // Fix SimTree wallet companyId mismatch

  // Stripe payment methods
  createStripeCheckoutSession(
    companyId: number,
    amount: number,
    description?: string,
  ): Promise<{ sessionId: string; transactionId: number }>;
  updateTransactionStatus(
    transactionId: number,
    status: string,
    stripeData?: {
      stripePaymentId?: string;
      stripePaymentIntentId?: string;
      paymentMethod?: string;
    },
  ): Promise<any>;
  getTransactionByStripeSessionId(sessionId: string): Promise<any>;
  processStripePayment(sessionId: string): Promise<any>;
  refundTransaction(transactionId: number, reason?: string): Promise<any>;
  
  // Billing system methods
  getCompaniesWithEsimPurchases(startDate: Date, endDate: Date): Promise<Company[]>;
  getUsersByCompanyId(companyId: number): Promise<User[]>;
}

export class DatabaseStorage implements IStorage {
  readonly sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }
  
  // Coupon system implementation
  async createCoupon(couponData: InsertCoupon): Promise<Coupon> {
    try {
      // Generate a random code if not provided
      if (!couponData.code) {
        couponData.code = this.generateCouponCode();
      }
      
      const [coupon] = await db
        .insert(schema.coupons)
        .values({
          ...couponData,
          createdAt: new Date(),
          isUsed: false
        })
        .returning();
        
      return coupon;
    } catch (error) {
      console.error("Error creating coupon:", error);
      throw error;
    }
  }
  
  async getCoupon(id: number): Promise<Coupon | undefined> {
    try {
      const [coupon] = await db
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.id, id));
        
      return coupon;
    } catch (error) {
      console.error("Error getting coupon:", error);
      throw error;
    }
  }
  
  async getCouponByCode(code: string): Promise<Coupon | undefined> {
    try {
      const [coupon] = await db
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, code));
        
      return coupon;
    } catch (error) {
      console.error("Error getting coupon by code:", error);
      throw error;
    }
  }
  
  async getCompanyCoupons(companyId: number): Promise<Coupon[]> {
    try {
      // Get company's admins
      const admins = await db
        .select()
        .from(schema.users)
        .where(and(
          eq(schema.users.companyId, companyId),
          eq(schema.users.isAdmin, true)
        ));
      
      if (!admins || admins.length === 0) {
        return [];
      }
      
      // Get admin IDs
      const adminIds = admins.map(admin => admin.id);
      
      // Get coupons created by these admins
      const coupons = await db
        .select()
        .from(schema.coupons)
        .where(inArray(schema.coupons.createdBy, adminIds))
        .orderBy(desc(schema.coupons.createdAt));
        
      return coupons;
    } catch (error) {
      console.error("Error getting company coupons:", error);
      throw error;
    }
  }
  
  async getAllCoupons(): Promise<Coupon[]> {
    try {
      const coupons = await db
        .select()
        .from(schema.coupons)
        .orderBy(desc(schema.coupons.createdAt));
        
      return coupons;
    } catch (error) {
      console.error("Error getting all coupons:", error);
      throw error;
    }
  }
  
  async updateCoupon(id: number, data: Partial<Coupon>): Promise<Coupon> {
    try {
      const [updatedCoupon] = await db
        .update(schema.coupons)
        .set(data)
        .where(eq(schema.coupons.id, id))
        .returning();
        
      if (!updatedCoupon) {
        throw new Error("Coupon not found");
      }
      
      return updatedCoupon;
    } catch (error) {
      console.error("Error updating coupon:", error);
      throw error;
    }
  }
  
  async redeemCoupon(code: string, userId: number): Promise<{ success: boolean, wallet?: any, coupon?: Coupon, error?: string }> {
    try {
      // Get the coupon by code
      const coupon = await this.getCouponByCode(code);
      
      if (!coupon) {
        return { success: false, error: "Coupon not found" };
      }
      
      // Check if coupon is already used
      if (coupon.isUsed) {
        return { success: false, error: "Coupon has already been used" };
      }
      
      // Check if coupon has expired
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return { success: false, error: "Coupon has expired" };
      }
      
      // Get the user
      const user = await this.getUser(userId);
      if (!user) {
        return { success: false, error: "User not found" };
      }
      
      // Get the wallet for this user's company
      if (!user.companyId) {
        return { success: false, error: "User has no company associated" };
      }
      const wallet = await this.getWallet(user.companyId);
      if (!wallet) {
        return { success: false, error: "Wallet not found" };
      }
      
      // Start a transaction to ensure all operations succeed or none
      return await db.transaction(async (tx) => {
        // Add wallet transaction with a clean description format
        // Don't include internal coupon descriptions for clients, only for sadmin
        const isSadmin = await this.isSuperAdmin(userId);
        const transactionDescription = isSadmin 
          ? `Coupon redemption: ${coupon.code}${coupon.description ? ` - ${coupon.description}` : ''}`
          : `Simtree credit (coupon: ${coupon.code})`;
          
        const transaction = await this.addWalletTransaction(
          wallet.id,
          parseFloat(coupon.amount.toString()),
          "credit",
          transactionDescription,
          { paymentMethod: "coupon" }
        );
        
        // Update wallet balance
        const newBalance = parseFloat(wallet.balance) + parseFloat(coupon.amount.toString());
        const updatedWallet = await this.updateWalletBalance(wallet.id, newBalance);
        
        // Mark coupon as used
        const updatedCoupon = await this.markCouponAsUsed(coupon.id, userId);
        
        return { 
          success: true, 
          wallet: updatedWallet, 
          coupon: updatedCoupon 
        };
      });
    } catch (error: any) {
      console.error("Error redeeming coupon:", error);
      return { success: false, error: error?.message || "Unknown error occurred" };
    }
  }
  
  async markCouponAsUsed(id: number, userId: number): Promise<Coupon> {
    try {
      const [updatedCoupon] = await db
        .update(schema.coupons)
        .set({
          isUsed: true,
          usedBy: userId,
          usedAt: new Date()
        })
        .where(eq(schema.coupons.id, id))
        .returning();
        
      if (!updatedCoupon) {
        throw new Error("Coupon not found");
      }
      
      return updatedCoupon;
    } catch (error) {
      console.error("Error marking coupon as used:", error);
      throw error;
    }
  }
  
  async deleteCoupon(id: number): Promise<void> {
    try {
      // Check if the coupon exists
      const coupon = await this.getCoupon(id);
      if (!coupon) {
        throw new Error("Coupon not found");
      }
      
      // Don't allow deletion of used coupons
      if (coupon.isUsed) {
        throw new Error("Cannot delete a coupon that has already been used");
      }
      
      // Delete the coupon
      await db
        .delete(schema.coupons)
        .where(eq(schema.coupons.id, id));
        
    } catch (error) {
      console.error("Error deleting coupon:", error);
      throw error;
    }
  }
  
  // Helper method to generate a random coupon code
  private generateCouponCode(length: number = 10): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    
    // Create a 2-part code with a hyphen in the middle (e.g., ABCD-1234)
    const firstPartLength = Math.ceil(length / 2);
    const secondPartLength = length - firstPartLength;
    
    for (let i = 0; i < firstPartLength; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    result += '-';
    
    for (let i = 0; i < secondPartLength; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  // Server Connection Monitoring Methods
  async getServerConnections(): Promise<ServerConnection[]> {
    return await db
      .select()
      .from(schema.serverConnections)
      .orderBy(desc(schema.serverConnections.lastChecked));
  }

  async getServerConnectionByName(
    serviceName: string,
  ): Promise<ServerConnection | undefined> {
    const connections = await db
      .select()
      .from(schema.serverConnections)
      .where(eq(schema.serverConnections.serviceName, serviceName));
    return connections[0];
  }

  async createServerConnection(
    connection: InsertServerConnection,
  ): Promise<ServerConnection> {
    const [newConnection] = await db
      .insert(schema.serverConnections)
      .values({
        ...connection,
        lastChecked: new Date(),
      })
      .returning();
    return newConnection;
  }

  async updateServerConnection(
    id: number,
    data: Partial<ServerConnection>,
  ): Promise<ServerConnection> {
    const [updatedConnection] = await db
      .update(schema.serverConnections)
      .set({
        ...data,
        status:
          typeof data.status === "string"
            ? data.status
            : JSON.stringify(data.status),
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        lastChecked: new Date(),
      })
      .where(eq(schema.serverConnections.id, id))
      .returning();

    if (!updatedConnection) throw new Error("Connection not found");
    return updatedConnection;
  }

  async deleteServerConnection(id: number): Promise<void> {
    await db
      .delete(schema.serverConnections)
      .where(eq(schema.serverConnections.id, id));
  }

  async getConnectionLogs(limit: number = 100): Promise<ConnectionLog[]> {
    return await db
      .select()
      .from(schema.connectionLogs)
      .orderBy(desc(schema.connectionLogs.timestamp))
      .limit(limit);
  }

  async getConnectionLogsByService(
    serviceName: string,
    limit: number = 100,
  ): Promise<ConnectionLog[]> {
    return await db
      .select()
      .from(schema.connectionLogs)
      .where(eq(schema.connectionLogs.serviceName, serviceName))
      .orderBy(desc(schema.connectionLogs.timestamp))
      .limit(limit);
  }

  async createConnectionLog(log: InsertConnectionLog): Promise<ConnectionLog> {
    const [newLog] = await db
      .insert(schema.connectionLogs)
      .values({
        ...log,
        timestamp: new Date(),
      })
      .returning();
    return newLog;
  }

  async deleteConnectionLogs(
    olderThan: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  ): Promise<number> {
    const result = await db
      .delete(schema.connectionLogs)
      .where(sql`timestamp < ${olderThan}`)
      .returning({ count: sql`count(*)` });

    return Number(result[0]?.count || 0);
  }

  async getAllEmployeesWithCompanies(): Promise<
    (Employee & { companyName: string | null })[]
  > {
    try {
      // First, get all employees
      const employees = await db
        .select()
        .from(schema.employees);
      
      // Then get all companies
      const companies = await db
        .select()
        .from(schema.companies);
      
      // Manually join the data
      const result = employees.map(employee => ({
        ...employee,
        companyName: companies.find(c => c.id === employee.companyId)?.name || null
      }));
      
      return result;
    } catch (error) {
      console.error('Error in getAllEmployeesWithCompanies:', error);
      throw error;
    }
  }

  async getUser(id: number) {
    const users = await db
      .select()
      .from(schema.users)
      .where(sql`id = ${id}`);
    return users[0];
  }
  
  /**
   * Check if a user has superadmin privileges
   * @param userId User ID to check
   * @returns True if user is a superadmin, false otherwise
   */
  async isSuperAdmin(userId: number): Promise<boolean> {
    try {
      const user = await this.getUser(userId);
      // Consider a user superadmin if they have the isSuperAdmin flag or if their username is "sadmin" 
      return user ? (user.isSuperAdmin === true || user.username === 'sadmin') : false;
    } catch (error) {
      console.error("Error checking if user is superadmin:", error);
      return false;
    }
  }

  async getUserByUsername(username: string) {
    const users = await db
      .select()
      .from(schema.users)
      .where(sql`username = ${username}`);
    return users[0];
  }

  async getUserByEmail(email: string) {
    const users = await db
      .select()
      .from(schema.users)
      .where(sql`email = ${email}`);
    return users[0];
  }
  
  async getUserByEmailAndCompany(email: string, companyId: number) {
    const users = await db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.email, email),
          eq(schema.users.companyId, companyId)
        )
      );
    return users[0];
  }

  async createUser(insertUser: InsertUser) {
    // Create the user and properly link to company if provided
    const [newUser] = await db
      .insert(schema.users)
      .values({
        username: insertUser.username,
        email: insertUser.email,
        password: insertUser.password,
        isAdmin: insertUser.isAdmin ?? false,
        isSuperAdmin: insertUser.isSuperAdmin ?? false,
        companyId: insertUser.companyId ?? null, // Use the provided companyId
        isVerified: insertUser.isVerified ?? false,
        verificationToken: insertUser.verificationToken ?? null,
        verificationTokenExpiry: insertUser.verificationTokenExpiry ?? null,
      })
      .returning();

    return newUser;
  }

  async getEmployees(companyId: number) {
    return await db
      .select()
      .from(schema.employees)
      .where(sql`company_id = ${companyId}`);
  }
  
  async getAllEmployees(): Promise<Employee[]> {
    try {
      // Get all employees from all companies (for superadmin)
      console.log('Fetching all employees from all companies');
      return await db
        .select()
        .from(schema.employees);
    } catch (error) {
      console.error('Error fetching all employees:', error);
      throw error;
    }
  }

  async createEmployee(employee: Omit<Employee, "id">) {
    const [newExec] = await db
      .insert(schema.employees)
      .values(employee)
      .returning();
    return newExec;
  }

  async updateEmployee(id: number, data: Partial<Employee>) {
    const [updated] = await db
      .update(schema.employees)
      .set(data)
      .where(sql`id = ${id}`)
      .returning();
    if (!updated) throw new Error("Employee not found");
    return updated;
  }

  async deleteEmployee(
    id: number,
    forceDelete: boolean = false,
  ): Promise<void> {
    // Use a transaction to ensure data consistency
    return await db.transaction(async (tx) => {
      // First get the employee details
      const [employee] = await tx
        .select()
        .from(schema.employees)
        .where(eq(schema.employees.id, id));

      if (!employee) {
        throw new Error("Employee not found");
      }

      console.log(`Attempting to delete employee ${id} (${employee.name})`);
      console.log(
        `Employee details: id=${employee.id}, forceDelete=${forceDelete}`,
      );

      // Check for active purchased eSIMs - look for any status that's not cancelled or expired
      const allPurchasedEsims = await tx
        .select()
        .from(schema.purchasedEsims)
        .where(eq(schema.purchasedEsims.employeeId, id));

      console.log(
        `Found ${allPurchasedEsims.length} total purchased eSIMs for employee ${id}`,
      );

      if (allPurchasedEsims.length > 0) {
        console.log(
          `eSIM statuses for employee ${id}:`,
          allPurchasedEsims.map(
            (e) =>
              `ID: ${e.id}, Status: ${e.status}, isCancelled: ${(e.metadata as any)?.isCancelled ? "true" : "false"}`,
          ),
        );
      }

      // Filter to find any truly active eSIMs using comprehensive cancellation detection
      // This matches the frontend logic EXACTLY to ensure complete system-wide consistency
      const activePurchasedEsims = allPurchasedEsims.filter((esim) => {
        console.log(`Backend: Checking eSIM ${esim.id} for employee ${id}`);
        console.log(`Backend: eSIM ${esim.id} status: ${esim.status}`);
        console.log(`Backend: eSIM ${esim.id} metadata type:`, typeof esim.metadata);
        console.log(`Backend: eSIM ${esim.id} metadata:`, JSON.stringify(esim.metadata, null, 2));        
        const metadata = esim.metadata as any;
        console.log(`Backend: eSIM ${esim.id} rawData exists:`, !!(metadata && metadata.rawData));
        
        // Use the same comprehensive cancellation detection as frontend
        const isCancelled = this.isEsimCancelledOrRefundedBackend(esim);
        
        console.log(`Backend: eSIM ${esim.id} cancellation result: ${isCancelled}`);
        
        if (isCancelled) {
          console.log(`Backend: eSIM ${esim.id} is cancelled via comprehensive detection`);
          return false;
        }

        console.log(`Backend: eSIM ${esim.id} is considered ACTIVE`);
        // If we reach here, the eSIM is considered active
        return true;
      });

      console.log(
        `Found ${activePurchasedEsims.length} active eSIMs for employee ${id}`,
      );

      // Only check active purchased eSIMs - the currentPlan field might be stale
      // and not updated when eSIMs are cancelled
      if (!forceDelete && activePurchasedEsims.length > 0) {
        throw new Error("You can't delete an employee with an active plan");
      }

      // If no active plan or forceDelete is true, proceed with deletion
      console.log(`Deleting plan history for employee ${id}`);
      await tx
        .delete(schema.planHistory)
        .where(eq(schema.planHistory.employeeId, id));

      console.log(`Deleting purchased eSIMs for employee ${id}`);
      await tx
        .delete(schema.purchasedEsims)
        .where(eq(schema.purchasedEsims.employeeId, id));

      console.log(`Deleting employee ${id}`);
      await tx.delete(schema.employees).where(eq(schema.employees.id, id));

      console.log(`Successfully deleted employee ${id}`);
    });
  }

  /**
   * Comprehensive eSIM cancellation detection for backend
   * This mirrors the frontend logic exactly to ensure complete system consistency
   */
  private isEsimCancelledOrRefundedBackend(esim: any): boolean {
    if (!esim) return false;
    
    // LAYER 1: Database status - primary source of truth
    if (esim.status === 'cancelled') {
      return true;
    }
    
    // LAYER 2: Frontend cancellation flags
    if (esim.isCancelled === true) {
      return true;
    }
    
    // LAYER 3: Parse metadata if it's a string (from database)
    let metadata = esim.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (error) {
        console.log(`Failed to parse metadata for eSIM ${esim.id}:`, error);
        metadata = null;
      }
    }
    
    // LAYER 4: Comprehensive metadata analysis
    if (metadata) {
      // Direct cancellation indicators
      if (metadata.isCancelled === true || 
          metadata.refunded === true ||
          metadata.status === 'cancelled') {
        return true;
      }
      
      // Cancellation timestamp presence indicates cancellation
      if (metadata.cancelledAt || 
          metadata.cancelRequestTime ||
          metadata.refundDate ||
          metadata.cancelledInProvider === true) {
        return true;
      }
      
      // Refund completion indicators
      if (metadata.pendingRefund === false && metadata.refunded === true) {
        return true;
      }
      
      // Previous status checks
      if (metadata.previousStatus === 'cancelled') {
        return true;
      }
      
      // LAYER 5: Provider API status analysis
      if (metadata.rawData) {
        const providerStatus = this.extractProviderStatusBackend(metadata.rawData);
        
        // Comprehensive provider cancellation statuses
        const cancelledStatuses = [
          'CANCEL', 'CANCELLED', 'REVOKED', 'TERMINATED', 
          'SUSPENDED', 'INACTIVE', 'DISABLED', 'EXPIRED_CANCELLED',
          'USED_EXPIRED', 'RELEASED'
        ];
        
        console.log(`Backend: eSIM ${esim.id} provider status extracted: "${providerStatus}"`);
        console.log(`Backend: eSIM ${esim.id} checking against cancelled statuses:`, cancelledStatuses);
        
        if (providerStatus && cancelledStatuses.includes(providerStatus)) {
          return true;
        }
      }
    }
    
    // LAYER 5: Time-based expiration check for activated eSIMs
    if (esim.status === 'activated' && esim.planValidity && esim.activationDate) {
      const activationDate = new Date(esim.activationDate);
      const expiryDate = new Date(activationDate);
      expiryDate.setDate(expiryDate.getDate() + esim.planValidity);
      
      const now = new Date();
      if (now > expiryDate) {
        return true;
      }
    }
    
    // LAYER 6: Status exclusions (don't treat certain statuses as cancelled)
    if (esim.status === 'error') {
      return false; // Error status doesn't mean cancelled, just needs attention
    }
    
    return false;
  }

  /**
   * Backend provider status extraction matching frontend logic
   */
  private extractProviderStatusBackend(rawData: any): string | null {
    if (!rawData) return null;
    
    let parsedData = rawData;
    
    // Handle string rawData by parsing JSON
    if (typeof rawData === 'string') {
      try {
        parsedData = JSON.parse(rawData);
      } catch {
        return null;
      }
    }
    
    // Handle object rawData with comprehensive pattern matching
    if (typeof parsedData === 'object') {
      // Pattern 1: obj.esimList[0].esimStatus (primary provider format)
      if (parsedData.obj?.esimList?.[0]?.esimStatus) {
        return parsedData.obj.esimList[0].esimStatus;
      }
      
      // Pattern 2: Direct esimStatus field
      if (parsedData.esimStatus) {
        return parsedData.esimStatus;
      }
      
      // Pattern 3: esimList array directly
      if (Array.isArray(parsedData.esimList) && parsedData.esimList[0]?.esimStatus) {
        return parsedData.esimList[0].esimStatus;
      }
      
      // Pattern 4: Nested data structures
      if (parsedData.data?.esimStatus) {
        return parsedData.data.esimStatus;
      }
      
      // Pattern 5: Response wrapper
      if (parsedData.response?.esimStatus) {
        return parsedData.response.esimStatus;
      }
      
      // Pattern 6: Alternative nested paths
      if (parsedData.result?.esimStatus) {
        return parsedData.result.esimStatus;
      }
    }
    
    return null;
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const companies = await db
      .select()
      .from(schema.companies)
      .where(sql`id = ${id}`);
    return companies[0];
  }

  async getCompanyByName(name: string): Promise<Company | undefined> {
    const companies = await db
      .select()
      .from(schema.companies)
      .where(sql`name = ${name}`);
    return companies[0];
  }

  async getCompanyByTaxNumber(taxNumber: string): Promise<Company | undefined> {
    const companies = await db
      .select()
      .from(schema.companies)
      .where(sql`tax_number = ${taxNumber}`);
    return companies[0];
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    try {
      console.log("Creating company:", company.name);

      // Insert the company
      const [newCompany] = await db
        .insert(schema.companies)
        .values({
          name: company.name,
          taxNumber: company.taxNumber || null,
          address: company.address || null,
          country: company.country || null,
          entityType: company.entityType || null,
          contactName: company.contactName || null,
          contactPhone: company.contactPhone || null,
          contactEmail: company.contactEmail || null,
          website: company.website || null,
          industry: company.industry || null,
          description: company.description || null,
          logo: company.logo || null,
          verified: company.verified || true, // Default to verified: true unless explicitly set to false
          active: true,
          createdAt: new Date(),
        })
        .returning();

      // Create appropriate wallet(s) based on company type
      const simtreeCompanyId = 1;
      
      if (newCompany.id === simtreeCompanyId) {
        // SimTree should have three wallet types
        await this.createSimtreeWallets();
      } else {
        // Client companies should only have a general wallet
        await db.insert(schema.wallets).values({
          companyId: newCompany.id,
          balance: "0.00",
          lastUpdated: new Date(),
          walletType: "general",
        });
      }

      console.log(`Company created with ID: ${newCompany.id}`);
      return newCompany;
    } catch (error) {
      console.error("Error creating company:", error);
      throw error;
    }
  }
  
  /**
   * Creates all required wallets for SimTree (platform owner)
   * SimTree always uses company ID 1 as a system/platform company
   * SimTree should have general, profit, provider, stripe_fees, and tax wallet types
   * @returns Array of created wallets
   */
  async createSimtreeWallets() {
    console.log(`[Storage] Creating SimTree wallets`);
    
    // SimTree platform owner always uses company ID 1
    const simtreeCompanyId = 1;
    console.log(`[Storage] Using SimTree platform company ID: ${simtreeCompanyId}`);
    const walletTypes: schema.WalletType[] = ['general', 'profit', 'provider', 'stripe_fees', 'tax'];
    const createdWallets = [];
    
    for (const walletType of walletTypes) {
      // Check if this wallet type already exists
      const existingWallet = await db
        .select()
        .from(schema.wallets)
        .where(and(
          eq(schema.wallets.companyId, simtreeCompanyId),
          eq(schema.wallets.walletType, walletType)
        ))
        .limit(1);
      
      if (existingWallet.length > 0) {
        console.log(`[Storage] SimTree ${walletType} wallet already exists`);
        createdWallets.push(existingWallet[0]);
        continue;
      }
      
      // Create wallet if it doesn't exist
      const [wallet] = await db
        .insert(schema.wallets)
        .values({
          companyId: simtreeCompanyId,
          balance: '0.00',
          lastUpdated: new Date(),
          walletType,
        })
        .returning();
      
      console.log(`[Storage] Created SimTree ${walletType} wallet: Wallet ID ${wallet.id}`);
      createdWallets.push(wallet);
    }
    
    return createdWallets;
  }

  /**
   * Ensure SimTree platform wallets exist and recalculate all balances
   * SimTree platform owner always uses company ID 1
   */
  async migrateSimtreeWallets(): Promise<{ migrated: number; created: number; message: string }> {
    console.log('[Storage] Starting SimTree wallet fix...');
    
    // First, ensure a SimTree platform company exists
    // Check if company ID 1 exists
    const existingCompany = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, 1))
      .limit(1);
    
    let simtreeCompanyId: number;
    
    if (existingCompany.length === 0) {
      // No company with ID 1 exists, look for any company named SimTree
      const simtreeByName = await db
        .select()
        .from(schema.companies)
        .where(sql`LOWER(name) = 'simtree'`)
        .limit(1);
      
      if (simtreeByName.length > 0) {
        simtreeCompanyId = simtreeByName[0].id;
        console.log(`[Storage] Found SimTree company by name with ID: ${simtreeCompanyId}`);
      } else {
        // Create a SimTree platform company
        console.log('[Storage] Creating SimTree platform company...');
        const [newCompany] = await db
          .insert(schema.companies)
          .values({
            name: 'SimTree',
            email: 'platform@simtree.co',
            country: 'Platform',
            active: true,
            verified: true,
            createdAt: new Date(),
          })
          .returning();
        simtreeCompanyId = newCompany.id;
        console.log(`[Storage] Created SimTree platform company with ID: ${simtreeCompanyId}`);
      }
    } else {
      simtreeCompanyId = 1;
      console.log(`[Storage] Using existing company ID 1: ${existingCompany[0].name}`);
    }
    
    console.log(`[Storage] Using SimTree platform company ID: ${simtreeCompanyId}`);
    
    let created = 0;
    
    // Ensure all required wallet types exist for SimTree (company ID 1)
    const walletTypes: schema.WalletType[] = ['general', 'profit', 'provider', 'stripe_fees', 'tax'];
    
    for (const walletType of walletTypes) {
      const existingWallet = await db
        .select()
        .from(schema.wallets)
        .where(and(
          eq(schema.wallets.companyId, simtreeCompanyId),
          eq(schema.wallets.walletType, walletType)
        ))
        .limit(1);
      
      if (existingWallet.length === 0) {
        console.log(`[Storage] Creating missing ${walletType} wallet for SimTree`);
        await db
          .insert(schema.wallets)
          .values({
            companyId: simtreeCompanyId,
            balance: '0.00',
            lastUpdated: new Date(),
            walletType,
          });
        created++;
      } else {
        console.log(`[Storage] ${walletType} wallet exists with ID ${existingWallet[0].id}, balance: ${existingWallet[0].balance}`);
      }
    }
    
    // Log all SimTree wallets and their transactions
    const simtreeWallets = await db
      .select()
      .from(schema.wallets)
      .where(eq(schema.wallets.companyId, simtreeCompanyId));
    
    console.log(`[Storage] Found ${simtreeWallets.length} SimTree wallets (company ID ${simtreeCompanyId})`);
    
    for (const wallet of simtreeWallets) {
      const txCount = await db
        .select({ count: sql`COUNT(*)` })
        .from(schema.walletTransactions)
        .where(eq(schema.walletTransactions.walletId, wallet.id));
      console.log(`[Storage] Wallet ${wallet.id} (${wallet.walletType}): ${txCount[0].count} transactions, current balance: ${wallet.balance}`);
    }
    
    // Now run rebalance to fix all balances
    const rebalanceResult = await this.rebalanceAllWallets();
    
    const message = `Fix complete: ${created} wallets created, ${rebalanceResult.updated} of ${rebalanceResult.total} wallet balances updated`;
    console.log(`[Storage] ${message}`);
    
    return { migrated: 0, created, message };
  }

  async updateCompany(id: number, data: Partial<Company>): Promise<Company> {
    // Convert empty taxNumber to null to avoid unique constraint violations
    // PostgreSQL allows multiple NULL values but not multiple empty strings with unique constraint
    const processedData = { ...data };
    if ('taxNumber' in processedData && (processedData.taxNumber === '' || processedData.taxNumber === undefined)) {
      processedData.taxNumber = null;
    }
    
    const [updatedCompany] = await db
      .update(schema.companies)
      .set(processedData)
      .where(eq(schema.companies.id, id))
      .returning();

    if (!updatedCompany) {
      throw new Error("Company not found");
    }

    return updatedCompany;
  }

  async getAllCompanies() {
    return await db.select().from(schema.companies);
  }

  async getClientsWithCompanyDetails() {
    try {
      console.log("Retrieving clients with company details...");

      // Query clients directly from the database to get the latest state
      // Using raw SQL query to force a fresh read without any query cache
      await db.execute(sql`SELECT 1 FROM users LIMIT 1`);

      // Use a join query to retrieve all users with their company details in a single database query
      // This is more efficient than fetching all users and companies separately
      const clientsWithCompanies = await db
        .select({
          // User fields
          id: schema.users.id,
          username: schema.users.username,
          email: schema.users.email,
          password: schema.users.password,
          isAdmin: schema.users.isAdmin,
          isSuperAdmin: schema.users.isSuperAdmin,
          companyId: schema.users.companyId,
          isVerified: schema.users.isVerified,
          verificationToken: schema.users.verificationToken,
          verificationTokenExpiry: schema.users.verificationTokenExpiry,
          createdAt: schema.users.createdAt,
          // Company fields (explicitly included)
          companyId_rel: schema.companies.id,
          companyName: schema.companies.name,
          companyTaxNumber: schema.companies.taxNumber,
          companyAddress: schema.companies.address,
          companyCountry: schema.companies.country,
          companyEntityType: schema.companies.entityType,
          companyContactName: schema.companies.contactName,
          companyContactPhone: schema.companies.contactPhone,
          companyContactEmail: schema.companies.contactEmail,
          companyIndustry: schema.companies.industry,
          companyWebsite: schema.companies.website,
          companyDescription: schema.companies.description,
          companyVerified: schema.companies.verified,
        })
        .from(schema.users)
        // Exclude the sadmin user specifically by username
        .where(sql`${schema.users.username} != 'sadmin'`)
        .leftJoin(
          schema.companies,
          eq(schema.users.companyId, schema.companies.id),
        );

      console.log(
        `Retrieved ${clientsWithCompanies.length} clients from database`,
      );

      // Process the result to format it correctly for the frontend
      const formattedClients = clientsWithCompanies.map((row) => {
        // Extract the user data
        const userData = {
          id: row.id,
          username: row.username,
          email: row.email,
          password: row.password,
          isAdmin: row.isAdmin,
          isSuperAdmin: row.isSuperAdmin,
          companyId: row.companyId,
          isVerified: row.isVerified,
          verificationToken: row.verificationToken,
          verificationTokenExpiry: row.verificationTokenExpiry,
          createdAt: row.createdAt,
        };

        // If there's a joined company, add the company data
        if (row.companyId_rel) {
          return {
            ...userData,
            companyName: row.companyName, // For backward compatibility at the top level
            company: {
              id: row.companyId_rel,
              name: row.companyName,
              companyName: row.companyName, // For backward compatibility
              taxNumber: row.companyTaxNumber,
              address: row.companyAddress,
              country: row.companyCountry,
              entityType: row.companyEntityType,
              contactPhone: row.companyContactPhone,
              contactEmail: row.companyContactEmail,
              industry: row.companyIndustry,
              website: row.companyWebsite,
              description: row.companyDescription,
              verified: row.companyVerified, // Include company verification status
            },
          };
        }

        // If no company data, just return the user data as is
        return userData;
      });

      // Log the number of clients before and after formatting
      console.log(
        `Formatted ${formattedClients.length} clients for the frontend`,
      );
      return formattedClients;
    } catch (error) {
      console.error("Error retrieving clients with company details:", error);
      throw error;
    }
  }


  async verifyUser(userId: number): Promise<User> {
    const [updatedUser] = await db
      .update(schema.users)
      .set({ isVerified: true, verificationToken: null })
      .where(eq(schema.users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new Error("User not found");
    }

    return updatedUser;
  }

  async updateUserProfile(userId: number, data: Partial<User>): Promise<User> {
    const [updatedUser] = await db
      .update(schema.users)
      .set(data)
      .where(eq(schema.users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new Error("User not found");
    }

    return updatedUser;
  }

  async deleteUser(userId: number): Promise<void> {
    // This function implements the necessary logic to delete a user
    // and their associated data safely. This is called from the routes.ts file
    try {
      console.log(`Storage: Deleting user with ID ${userId}`);

      // Get the user first
      const user = await this.getUser(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Use a transaction to ensure all related data is deleted consistently
      await db.transaction(async (tx) => {
        // Due to the database schema setup, employees.company_id references users.id
        // We need to delete employees that reference this user directly
        console.log(
          `Storage: Deleting employees where company_id = ${userId}`,
        );

        // Get all employees that reference this user directly
        const employees = await tx
          .select()
          .from(schema.employees)
          .where(eq(schema.employees.companyId, userId));

        if (employees.length > 0) {
          console.log(
            `Storage: Found ${employees.length} employees referencing user ID ${userId}`,
          );

          // For each employee, we need to delete related data first
          for (const employee of employees) {
            // Delete data packages for this employee
            await tx
              .delete(schema.dataPackages)
              .where(eq(schema.dataPackages.employeeId, employee.id))
              .execute();

            // Delete purchased eSIMs for this employee
            await tx
              .delete(schema.purchasedEsims)
              .where(eq(schema.purchasedEsims.employeeId, employee.id))
              .execute();

            // Delete plan history for this employee
            await tx
              .delete(schema.planHistory)
              .where(eq(schema.planHistory.employeeId, employee.id))
              .execute();
          }

          // Now delete all employees
          await tx
            .delete(schema.employees)
            .where(eq(schema.employees.companyId, userId))
            .execute();
        }

        // Check for subscriptions referencing this user
        const subscriptions = await tx
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.companyId, userId));

        if (subscriptions.length > 0) {
          console.log(
            `Storage: Found ${subscriptions.length} subscriptions referencing user ID ${userId}`,
          );

          // Delete payments related to these subscriptions
          for (const subscription of subscriptions) {
            await tx
              .delete(schema.payments)
              .where(eq(schema.payments.subscriptionId, subscription.id))
              .execute();
          }

          // Delete subscriptions
          await tx
            .delete(schema.subscriptions)
            .where(eq(schema.subscriptions.companyId, userId))
            .execute();
        }

        // Check for payments directly referencing this user
        await tx
          .delete(schema.payments)
          .where(eq(schema.payments.companyId, userId))
          .execute();

        // Handle wallets referencing this user
        const wallets = await tx
          .select()
          .from(schema.wallets)
          .where(eq(schema.wallets.companyId, userId));

        if (wallets.length > 0) {
          console.log(
            `Storage: Found ${wallets.length} wallets referencing user ID ${userId}`,
          );

          // Delete transactions for each wallet
          for (const wallet of wallets) {
            await tx
              .delete(schema.walletTransactions)
              .where(eq(schema.walletTransactions.walletId, wallet.id))
              .execute();
          }

          // Delete wallets
          await tx
            .delete(schema.wallets)
            .where(eq(schema.wallets.companyId, userId))
            .execute();
        }

        // If user has a company ID, handle company-related data
        if (user.companyId) {
          console.log(
            `Storage: User has company_id = ${user.companyId}, cleaning up company data`,
          );

          // Delete company
          await tx
            .delete(schema.companies)
            .where(eq(schema.companies.id, user.companyId))
            .execute();
        }

        // Finally, delete the user
        await tx
          .delete(schema.users)
          .where(eq(schema.users.id, userId))
          .execute();
      });

      console.log(`Storage: User ${userId} deleted successfully`);
    } catch (error) {
      console.error(`Storage: Error deleting user ${userId}:`, error);
      throw error;
    }
  }

  async createVerificationToken(userId: number): Promise<string> {
    // Generate a random token
    const token = randomBytes(32).toString("hex");

    // Update the user with the verification token
    const [updatedUser] = await db
      .update(schema.users)
      .set({ verificationToken: token })
      .where(eq(schema.users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new Error("User not found");
    }

    return token;
  }

  // The validateVerificationToken method was removed as it's no longer used
  // Modern authentication flow now uses the set-password endpoint to validate tokens

  async getEsimPlans(): Promise<EsimPlan[]> {
    return await db.select().from(schema.esimPlans);
  }

  async getActiveEsimPlans(): Promise<EsimPlan[]> {
    return await db
      .select()
      .from(schema.esimPlans)
      .where(eq(schema.esimPlans.isActive, true));
  }

  async createEsimPlan(plan: Omit<EsimPlan, "id">): Promise<EsimPlan> {
    const planData = {
      providerId: plan.providerId,
      name: plan.name,
      description: plan.description,
      data: plan.data,
      validity: plan.validity,
      providerPrice: plan.providerPrice,
      sellingPrice: plan.sellingPrice,
      countries: plan.countries,
      speed: plan.speed,
      isActive: true,
      retailPrice: plan.retailPrice,
    };
    const [newPlan] = await db
      .insert(schema.esimPlans)
      .values([planData]) // Wrap planData in array
      .returning();
    return newPlan;
  }

  async updateEsimPlan(id: number, data: Partial<EsimPlan>): Promise<EsimPlan> {
    const [updated] = await db
      .update(schema.esimPlans)
      .set(data)
      .where(eq(schema.esimPlans.id, id))
      .returning();
    if (!updated) throw new Error("eSIM plan not found");
    return updated;
  }

  async getPurchasedEsims(
    params: { employeeId: number } | number,
  ): Promise<PurchasedEsim[]> {
    // Handle both object with employeeId property and direct employeeId number
    const execId =
      typeof params === "object" && params !== null
        ? Number(params.employeeId)
        : Number(params);

    if (isNaN(execId) || execId <= 0) {
      console.error("Invalid employeeId in getPurchasedEsims:", params);
      throw new Error(`Invalid employeeId: ${JSON.stringify(params)}`);
    }

    return await db
      .select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.employeeId, execId));
  }

  async createPurchasedEsim(
    esim: Omit<PurchasedEsim, "id">,
  ): Promise<PurchasedEsim> {
    const [newEsim] = await db
      .insert(schema.purchasedEsims)
      .values(esim)
      .returning();
    return newEsim;
  }

  async updatePurchasedEsim(
    id: number,
    data: Partial<PurchasedEsim>,
  ): Promise<PurchasedEsim> {
    // Start a transaction to update both purchased_esim and employee
    const [updated] = await db.transaction(async (tx) => {
      // First update the purchased eSIM
      const [updatedEsim] = await tx
        .update(schema.purchasedEsims)
        .set(data)
        .where(eq(schema.purchasedEsims.id, id))
        .returning();

      if (!updatedEsim) throw new Error("Purchased eSIM not found");

      // If status is being set to 'activated', update the employee's current plan and add to history
      if (data.status === "activated" && updatedEsim.employeeId) {
        console.log("Activating eSIM for employee:", updatedEsim.employeeId);

        // Get the plan details
        const [plan] = await tx
          .select()
          .from(schema.esimPlans)
          .where(eq(schema.esimPlans.id, updatedEsim.planId || 0));

        if (plan) {
          console.log("Found plan:", plan);

          // Update the employee's plan timing data
          await tx
            .update(schema.employees)
            .set({
              planStartDate: sql`NOW()`,
              planEndDate: data.expiryDate ? sql`${data.expiryDate}` : null,
              planValidity: plan.validity,
            })
            .where(eq(schema.employees.id, updatedEsim.employeeId));

          // Add to plan history
          await tx.insert(schema.planHistory).values({
            employeeId: updatedEsim.employeeId,
            planName: plan.name,
            planData: plan.data,
            startDate: new Date(),
            endDate: data.expiryDate ? new Date(data.expiryDate) : null,
            status: "active",
            providerId: plan.providerId,
            dataUsed: "0",
          });
        }
      }

      return [updatedEsim];
    });

    return updated;
  }

  async getCompanySubscription(companyId: number) {
    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(sql`company_id = ${companyId}`);
    return subscription;
  }

  async createSubscription(
    subscription: Omit<Subscription, "id" | "startDate" | "status">,
  ) {
    const [newSub] = await db
      .insert(schema.subscriptions)
      .values({
        ...subscription,
        status: "active",
      })
      .returning();
    return newSub;
  }

  async updateSubscription(id: number, data: Partial<Subscription>) {
    const [updated] = await db
      .update(schema.subscriptions)
      .set(data)
      .where(sql`id = ${id}`)
      .returning();
    if (!updated) throw new Error("Subscription not found");
    return updated;
  }

  async getCompanyPayments(companyId: number) {
    return await db
      .select()
      .from(schema.payments)
      .where(sql`company_id = ${companyId}`);
  }

  async createPayment(payment: Omit<Payment, "id" | "paymentDate">) {
    const [newPayment] = await db
      .insert(schema.payments)
      .values(payment)
      .returning();
    return newPayment;
  }
  async getDataPackages(employeeId: number) {
    return await db
      .select()
      .from(schema.dataPackages)
      .where(sql`employee_id = ${employeeId}`);
  }

  async createDataPackage(pkg: Omit<DataPackage, "id">) {
    const [newPkg] = await db
      .insert(schema.dataPackages)
      .values(pkg)
      .returning();
    return newPkg;
  }
  async getEsimPlan(id: number): Promise<EsimPlan | undefined> {
    const [plan] = await db
      .select()
      .from(schema.esimPlans)
      .where(eq(schema.esimPlans.id, id));
    return plan;
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const [employee] = await db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, id));
    return employee;
  }

  async getEmployeeByEmail(email: string): Promise<Employee | undefined> {
    const [employee] = await db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.email, email));
    return employee;
  }
  
  /**
   * Checks if the email belongs to a company admin (not just any employee)
   * Company admins are users with is_admin=true, who are the ones who created/own companies
   */
  async getCompanyAdminByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(
        eq(schema.users.email, email),
        eq(schema.users.isAdmin, true)
      ));
    return user;
  }
  async clearEsimPlans(): Promise<void> {
    // Instead of deleting, we'll deactivate plans that are not referenced
    const [purchasedPlans] = await db
      .select({
        planId: schema.purchasedEsims.planId,
      })
      .from(schema.purchasedEsims)
      .execute();

    // Update all plans to inactive except those that are referenced
    await db
      .update(schema.esimPlans)
      .set({ isActive: false })
      .where(sql`id NOT IN (SELECT DISTINCT plan_id FROM purchased_esims)`);
  }

  async getWallet(companyId: number) {
    try {
      console.log(`[Storage] Finding wallet for company ID: ${companyId}`);

      // Check if this is SimTree
      const company = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.id, companyId))
        .limit(1)
        .then(results => results[0]);
        
      const isSimTree = company && company.name.toLowerCase() === 'simtree';
      console.log(`[Storage] Company ${companyId} isSimTree: ${isSimTree}`);
      
      // Get wallets for this company
      const wallets = await db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.companyId, companyId));

      if (wallets && wallets.length > 0) {
        // Always prefer the general wallet
        const generalWallet = wallets.find(w => w.walletType === 'general');
        if (generalWallet) {
          console.log(
            `[Storage] Found general wallet ID ${generalWallet.id} for company ID ${companyId}`,
          );
          return generalWallet;
        }
        
        console.log(
          `[Storage] Found wallet ID ${wallets[0].id} directly for company ID ${companyId}`,
        );
        return wallets[0];
      }

      // If no wallet found, check if this is a valid company
      if (company) {
        console.log(
          `[Storage] Company exists: ${company.name}. Creating wallet...`,
        );
        // Create a new wallet for this company
        return this.createWallet(companyId);
      }

      // Last fallback - check if this might be a user ID from legacy data
      // This is for backward compatibility with any existing data
      const user = await this.getUser(companyId);
      if (user && user.companyId) {
        console.log(
          `[Storage] ⚠️ Warning: ID ${companyId} appears to be a user ID, not company ID.`,
        );
        console.log(
          `[Storage] User ${user.username} has company ID: ${user.companyId}`,
        );

        // Check for wallet with user's company ID
        const companyWallets = await db
          .select()
          .from(schema.wallets)
          .where(eq(schema.wallets.companyId, user.companyId));

        if (companyWallets && companyWallets.length > 0) {
          console.log(
            `[Storage] Found wallet for user's company ${user.companyId}`,
          );
          return companyWallets[0];
        }

        // Create wallet for user's company
        console.log(
          `[Storage] Creating wallet for user's company ${user.companyId}`,
        );
        return this.createWallet(user.companyId);
      }

      // Truly no wallet or company found
      console.warn(
        `[Storage] ❌ No wallet or company found for ID: ${companyId}`,
      );
      throw new Error(`No wallet or company found for ID: ${companyId}`);
    } catch (error) {
      console.error(
        `[Storage] ❌ Error getting wallet for company ${companyId}:`,
        error,
      );
      throw error;
    }
  }

  async getWalletByTypeAndCompany(companyId: number, walletType: string) {
    try {
      let wallet = await db
        .select()
        .from(schema.wallets)
        .where(and(
          eq(schema.wallets.companyId, companyId),
          eq(schema.wallets.walletType, walletType)
        ))
        .limit(1);

      // If wallet doesn't exist, create it
      if (!wallet[0]) {
        console.log(`Creating missing ${walletType} wallet for company ${companyId}`);
        const [newWallet] = await db
          .insert(schema.wallets)
          .values({
            companyId: companyId,
            balance: "0",
            lastUpdated: new Date(),
            walletType: walletType
          })
          .returning();
        return newWallet;
      }

      return wallet[0];
    } catch (error) {
      console.error(`Error getting/creating wallet by type ${walletType} for company ${companyId}:`, error);
      return null;
    }
  }

  async createWallet(companyId: number) {
    try {
      console.log(`[Storage] Creating wallet for company ID: ${companyId}`);

      // First, explicitly check if a wallet already exists for this company ID
      // to avoid duplicate wallets
      const existingWallets = await db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.companyId, companyId));

      if (existingWallets && existingWallets.length > 0) {
        console.log(
          `[Storage] ⚠️ Wallet already exists for company ID ${companyId}, wallet ID: ${existingWallets[0].id}`,
        );
        return existingWallets[0];
      }

      // Also check if the company exists
      const company = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.id, companyId))
        .limit(1);

      if (!company || company.length === 0) {
        console.log(
          `[Storage] ⚠️ Error: Cannot create wallet for companyId ${companyId} because company doesn't exist in database`,
        );
        console.log(
          `[Storage] Failing wallet creation for non-existent company ID: ${companyId}`,
        );

        // Throw an error instead of returning a dummy wallet
        throw new Error(
          `Cannot create wallet for non-existent company ID: ${companyId}`,
        );
      } else {
        console.log(
          `[Storage] Company found: ${company[0].name} (ID: ${company[0].id})`,
        );
      }

      // Get the company's currency based on their country  
      const companyCurrency = await companyCurrencyService.getCurrencyForCompany(companyId);
      
      // Create the wallet with the company ID and proper currency
      const [newWallet] = await db
        .insert(schema.wallets)
        .values({
          companyId: companyId,
          balance: "0",
          currency: companyCurrency,
          lastUpdated: new Date(),
        })
        .returning();

      console.log(
        `[Storage] 🌟 Successfully created wallet ID ${newWallet.id} for company ID ${companyId}`,
      );
      return newWallet;
    } catch (error) {
      console.error("[Storage] ❌ Error creating wallet:", error);
      throw error;
    }
  }

  async addWalletCredit(
    companyId: number,
    amount: number,
    description: string = "Added credit",
  ) {
    const wallet = await this.getWallet(companyId);
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const newBalance = parseFloat(wallet.balance) + amount;

    // Add transaction
    await this.addWalletTransaction(wallet.id, amount, "credit", description);

    // Update wallet balance
    return this.updateWalletBalance(wallet.id, newBalance);
  }

  async addWalletFunds(
    companyId: number,
    amount: number,
    paymentDetails?: { 
      method?: string; 
      description?: string; 
      stripePaymentIntentId?: string 
    }
  ) {
    try {
      const wallet = await this.getWallet(companyId);
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      // Create transaction record
      const transaction = await this.createWalletTransaction({
        walletId: wallet.id,
        amount: amount.toString(),
        type: "credit",
        description: paymentDetails?.description || `Funds added - $${amount.toFixed(2)}`,
        stripePaymentIntentId: paymentDetails?.stripePaymentIntentId,
        paymentMethod: paymentDetails?.method || "stripe",
        status: "completed"
      });

      return {
        success: true,
        transaction,
        newBalance: wallet.balance // This will be updated by createWalletTransaction
      };
    } catch (error) {
      console.error("Error adding wallet funds:", error);
      throw error;
    }
  }

  async getWalletTransactions(walletId: number) {
    return db
      .select({
        id: schema.walletTransactions.id,
        walletId: schema.walletTransactions.walletId,
        amount: schema.walletTransactions.amount,
        type: schema.walletTransactions.type,
        description: schema.walletTransactions.description,
        createdAt: schema.walletTransactions.createdAt,
        stripePaymentId: schema.walletTransactions.stripePaymentId,
      })
      .from(schema.walletTransactions)
      .where(eq(schema.walletTransactions.walletId, walletId))
      .orderBy(desc(schema.walletTransactions.createdAt));
  }

  async addWalletTransaction(
    walletId: number,
    amount: number,
    type: string,
    description: string,
    paymentDetails?: {
      stripePaymentId?: string;
      stripeSessionId?: string;
      stripePaymentIntentId?: string;
      status?: string;
      paymentMethod?: string;
      esimPlanId?: number;
      esimOrderId?: string;
      relatedTransactionId?: number;
    },
  ) {
    try {
      console.log("Adding transaction:", {
        walletId,
        amount,
        type,
        description,
        paymentDetails,
      });
      
      // Start a transaction to ensure data consistency
      return await db.transaction(async (tx) => {
        // Get wallet information to determine which company this belongs to
        const [wallet] = await tx
          .select()
          .from(schema.wallets)
          .where(eq(schema.wallets.id, walletId));
          
        if (!wallet) {
          throw new Error(`Wallet with ID ${walletId} not found`);
        }
        
        // Get company information
        const [company] = await tx
          .select()
          .from(schema.companies)
          .where(eq(schema.companies.id, wallet.companyId));
        
        if (!company) {
          throw new Error(`Company with ID ${wallet.companyId} not found`);
        }
        
        // Create the transaction in the specific wallet using the wallet's currency
        const [transaction] = await tx
          .insert(schema.walletTransactions)
          .values({
            walletId,
            amount: amount.toString(),
            currency: wallet.currency,
            type,
            description,
            stripePaymentId: paymentDetails?.stripePaymentId,
            stripeSessionId: paymentDetails?.stripeSessionId,
            stripePaymentIntentId: paymentDetails?.stripePaymentIntentId,
            status: paymentDetails?.status || "completed",
            paymentMethod: paymentDetails?.paymentMethod,
            esimPlanId: paymentDetails?.esimPlanId,
            esimOrderId: paymentDetails?.esimOrderId,
            relatedTransactionId: paymentDetails?.relatedTransactionId,
            createdAt: new Date(),
          })
          .returning();
        
        // If this transaction is not already a mirrored transaction (to avoid infinite loops)
        if (!paymentDetails?.relatedTransactionId) {
          // Get the SimTree company ID
          const simtreeCompanyId = await this.getSadminCompanyId();
          
          if (simtreeCompanyId) {
            // Find the SimTree general wallet (this is the master wallet that tracks everything)
            const [simtreeGeneralWallet] = await tx
              .select()
              .from(schema.wallets)
              .where(and(
                eq(schema.wallets.companyId, simtreeCompanyId),
                eq(schema.wallets.walletType, 'general')
              ));
              
            if (simtreeGeneralWallet) {
              // Only mirror if this isn't already the SimTree general wallet transaction
              if (wallet.companyId !== simtreeCompanyId || wallet.walletType !== 'general') {
                // Create a description that includes company information for clarity
                const masterDescription = `${company.name}: ${description}`;
                
                // Mirror this transaction to the SimTree general wallet (master wallet)
                await tx
                  .insert(schema.walletTransactions)
                  .values({
                    walletId: simtreeGeneralWallet.id,
                    amount: amount.toString(),
                    currency: simtreeGeneralWallet.currency,
                    type, // Keep the same transaction type (credit/debit)
                    description: masterDescription,
                    stripePaymentId: paymentDetails?.stripePaymentId,
                    stripeSessionId: paymentDetails?.stripeSessionId,
                    stripePaymentIntentId: paymentDetails?.stripePaymentIntentId,
                    status: paymentDetails?.status || "completed",
                    paymentMethod: paymentDetails?.paymentMethod,
                    esimPlanId: paymentDetails?.esimPlanId,
                    esimOrderId: paymentDetails?.esimOrderId,
                    relatedTransactionId: transaction.id, // Link to the original transaction
                    createdAt: new Date(), // Use the same timestamp
                  });
                
                // Update SimTree general wallet balance
                const [{ simtreeNewBalance }] = await tx
                  .select({
                    simtreeNewBalance: sql`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount::numeric ELSE -amount::numeric END), 0)`,
                  })
                  .from(schema.walletTransactions)
                  .where(and(
                    eq(schema.walletTransactions.walletId, simtreeGeneralWallet.id),
                    sql`(${schema.walletTransactions.status} IS NULL OR LOWER(${schema.walletTransactions.status}) IN ('completed', 'success', 'succeeded', 'processed'))`
                  ));
                
                await tx
                  .update(schema.wallets)
                  .set({
                    balance: simtreeNewBalance.toString(),
                    lastUpdated: new Date(),
                  })
                  .where(eq(schema.wallets.id, simtreeGeneralWallet.id));
                
                console.log(`Mirrored transaction ${transaction.id} to SimTree master wallet, balance: ${simtreeNewBalance}`);
              }
            } else {
              console.warn("SimTree general wallet not found for mirroring transactions");
            }
          }
          
          // If this is not a general wallet, also mirror to the company's own general wallet
          if (wallet.walletType !== 'general') {
            // Find the general wallet for this specific company 
            const [companyGeneralWallet] = await tx
              .select()
              .from(schema.wallets)
              .where(and(
                eq(schema.wallets.companyId, wallet.companyId),
                eq(schema.wallets.walletType, 'general')
              ));
              
            if (companyGeneralWallet) {
              // Mirror to the company's general wallet too
              await tx
                .insert(schema.walletTransactions)
                .values({
                  walletId: companyGeneralWallet.id,
                  amount: amount.toString(),
                  currency: companyGeneralWallet.currency,
                  type,
                  description: `${description} (from ${wallet.walletType} wallet)`,
                  stripePaymentId: paymentDetails?.stripePaymentId,
                  stripeSessionId: paymentDetails?.stripeSessionId,
                  stripePaymentIntentId: paymentDetails?.stripePaymentIntentId,
                  status: paymentDetails?.status || "completed",
                  paymentMethod: paymentDetails?.paymentMethod,
                  esimPlanId: paymentDetails?.esimPlanId,
                  esimOrderId: paymentDetails?.esimOrderId,
                  relatedTransactionId: transaction.id, // Link to the original transaction
                  createdAt: new Date(),
                });
              
              // Update company general wallet balance
              const [{ companyNewBalance }] = await tx
                .select({
                  companyNewBalance: sql`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount::numeric ELSE -amount::numeric END), 0)`,
                })
                .from(schema.walletTransactions)
                .where(and(
                  eq(schema.walletTransactions.walletId, companyGeneralWallet.id),
                  sql`(${schema.walletTransactions.status} IS NULL OR LOWER(${schema.walletTransactions.status}) IN ('completed', 'success', 'succeeded', 'processed'))`
                ));
              
              await tx
                .update(schema.wallets)
                .set({
                  balance: companyNewBalance.toString(),
                  lastUpdated: new Date(),
                })
                .where(eq(schema.wallets.id, companyGeneralWallet.id));
                
              console.log(`Mirrored transaction ${transaction.id} to company general wallet, balance: ${companyNewBalance}`);
            }
          }
        }

        console.log("Created transaction:", transaction);
        
        // Update the wallet balance after adding the transaction
        // Calculate new balance based on all valid transactions (various success statuses or NULL for legacy records)
        const [{ newBalance }] = await tx
          .select({
            newBalance: sql`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount::numeric ELSE -amount::numeric END), 0)`,
          })
          .from(schema.walletTransactions)
          .where(and(
            eq(schema.walletTransactions.walletId, walletId),
            sql`(${schema.walletTransactions.status} IS NULL OR LOWER(${schema.walletTransactions.status}) IN ('completed', 'success', 'succeeded', 'processed'))`
          ));
        
        // Update the wallet's balance field
        await tx
          .update(schema.wallets)
          .set({
            balance: newBalance.toString(),
            lastUpdated: new Date(),
          })
          .where(eq(schema.wallets.id, walletId));
        
        console.log(`Updated wallet ${walletId} balance to ${newBalance}`);
        
        return transaction;
      });
    } catch (error) {
      console.error("Error adding transaction:", error);
      throw error;
    }
  }

  async deleteWalletTransaction(transactionId: number) {
    try {
      // Start a transaction
      return await db.transaction(async (tx) => {
        // First get the transaction and wallet info
        const [transaction] = await tx
          .select()
          .from(schema.walletTransactions)
          .where(eq(schema.walletTransactions.id, transactionId));

        if (!transaction) {
          throw new Error("Transaction not found");
        }

        // Delete the transaction
        await tx
          .delete(schema.walletTransactions)
          .where(eq(schema.walletTransactions.id, transactionId));

        // Calculate new balance directly using SQL
        const [{ newBalance }] = await tx
          .select({
            newBalance: sql`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount::numeric ELSE -amount::numeric END), 0)`,
          })
          .from(schema.walletTransactions)
          .where(eq(schema.walletTransactions.walletId, transaction.walletId));

        console.log("New balance calculated:", newBalance);

        // Update wallet balance
        const [updatedWallet] = await tx
          .update(schema.wallets)
          .set({
            balance: newBalance.toString(),
            lastUpdated: new Date(),
          })
          .where(eq(schema.wallets.id, transaction.walletId))
          .returning();

        console.log("Updated wallet:", updatedWallet);

        return updatedWallet;
      });
    } catch (error) {
      console.error("Error in deleteWalletTransaction:", error);
      throw error;
    }
  }

  async getWalletByUserId(userId: number) {
    try {
      console.log(`[Storage] Finding wallet for user ID: ${userId}`);

      // First get the user's company ID
      const user = await this.getUser(userId);

      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      if (!user.companyId) {
        console.log(
          `[Storage] ⚠️ User ${userId} (${user.username}) doesn't have a company ID`,
        );
        throw new Error(`User ${userId} does not belong to a company`);
      }

      console.log(
        `[Storage] User ${userId} (${user.username}) belongs to company ID: ${user.companyId}`,
      );

      // Get wallet by company ID (correct approach)
      const [wallet] = await db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.companyId, user.companyId));

      if (wallet) {
        console.log(
          `[Storage] Found wallet ID ${wallet.id} for user ${userId} (company ${user.companyId})`,
        );
        return wallet;
      }

      // If wallet doesn't exist for this company, create it
      console.log(
        `[Storage] Creating new wallet for company ID ${user.companyId} (user ${userId})`,
      );
      
      // Get the company's currency based on their country
      const companyCurrency = await companyCurrencyService.getCurrencyForCompany(user.companyId);
      
      const [newWallet] = await db
        .insert(schema.wallets)
        .values({
          companyId: user.companyId, // Use company ID, not user ID
          balance: "0",
          currency: companyCurrency,
          lastUpdated: new Date(),
        })
        .returning();

      console.log(
        `[Storage] 🌟 Created wallet ID ${newWallet.id} for company ${user.companyId}`,
      );
      return newWallet;
    } catch (error) {
      console.error(
        `[Storage] ❌ Error getting wallet for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async addWalletBalance(walletId: number, amount: number) {
    try {
      // Get current wallet balance
      const [wallet] = await db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.id, walletId));

      if (!wallet) {
        throw new Error(`Wallet with ID ${walletId} not found`);
      }

      // Calculate new balance
      const newBalance = parseFloat(wallet.balance) + amount;

      // Update wallet balance
      return await this.updateWalletBalance(walletId, newBalance);
    } catch (error) {
      console.error(`Error adding ${amount} to wallet ${walletId}:`, error);
      throw error;
    }
  }

  async createTransaction(transaction: {
    type: string;
    status: string;
    amount: string;
    paymentMethod: string;
    description: string;
    walletId: number;
    stripePaymentId: string | null;
    stripeSessionId: string | null;
    stripePaymentIntentId: string | null;
  }) {
    try {
      console.log("Creating transaction:", transaction);
      const [result] = await db
        .insert(schema.walletTransactions)
        .values({
          ...transaction,
          createdAt: new Date(),
        })
        .returning();

      console.log("Transaction created:", result);
      return result;
    } catch (error) {
      console.error("Error creating transaction:", error);
      throw error;
    }
  }

  async updateWalletBalance(walletId: number, newBalance: number) {
    try {
      console.log("Updating wallet balance:", { walletId, newBalance });
      const [wallet] = await db
        .update(schema.wallets)
        .set({
          balance: newBalance.toFixed(2),
          lastUpdated: new Date(),
        })
        .where(eq(schema.wallets.id, walletId))
        .returning();

      console.log("Updated wallet:", wallet);

      if (!wallet) {
        throw new Error("Failed to update wallet balance");
      }

      return wallet;
    } catch (error) {
      console.error("Error updating wallet balance:", error);
      throw error;
    }
  }

  async clearWalletTransactions(walletId: number) {
    await db
      .delete(schema.walletTransactions)
      .where(eq(schema.walletTransactions.walletId, walletId));
  }

  async clearWallets() {
    await db.update(schema.wallets).set({ balance: "0" });
  }

  async createMissingWallets() {
    try {
      console.log("[Storage] 🔍 Checking for companies without wallets");

      // Find all companies
      const companies = await db.select().from(schema.companies);
      const wallets = await db.select().from(schema.wallets);

      // Create a map to track which wallet types exist for each company
      const companyWalletTypes = new Map();
      
      // Initialize the map with empty sets for each company
      for (const company of companies) {
        companyWalletTypes.set(company.id, new Set());
      }
      
      // Populate the map with existing wallet types
      for (const wallet of wallets) {
        if (wallet.companyId && companyWalletTypes.has(wallet.companyId)) {
          companyWalletTypes.get(wallet.companyId).add(wallet.walletType);
        }
      }

      console.log("[Storage] Checking wallet types for each company");
      
      // Find SimTree company
      const simtreeCompany = companies.find(c => c.name.toLowerCase() === 'simtree');
      
      // Create missing wallets for each company
      let createdCount = 0;
      for (const company of companies) {
        const existingTypes = companyWalletTypes.get(company.id) || new Set();
        const isSimTree = company.name.toLowerCase() === 'simtree';
        
        // For SimTree, we need all wallet types
        // For other companies, we only need a general wallet
        const requiredWalletTypes = isSimTree 
          ? ['general', 'profit', 'provider', 'stripe_fees', 'tax'] as const
          : ['general'] as const;
        
        console.log(`[Storage] Checking wallets for ${company.name} (isSimTree: ${isSimTree})`);
        
        for (const walletType of requiredWalletTypes) {
          // Skip if this wallet type already exists for this company
          if (existingTypes.has(walletType)) {
            continue;
          }
          
          // Get the company's currency based on their country
          const companyCurrency = await companyCurrencyService.getCurrencyForCompany(company.id);
          
          // Create the missing wallet for this company
          const [newWallet] = await db
            .insert(schema.wallets)
            .values({
              companyId: company.id,
              balance: "0",
              currency: companyCurrency,
              lastUpdated: new Date(),
              walletType: walletType,
            })
            .returning();

          console.log(
            `[Storage] 🌟 Created ${walletType} wallet (ID: ${newWallet.id}) for company ${company.id} (${company.name})`,
          );
          createdCount++;
        }
      }

      console.log(
        `[Storage] Created ${createdCount} new wallets for companies`,
      );
      return createdCount;
    } catch (error) {
      console.error("[Storage] ❌ Error creating missing wallets:", error);
      throw error;
    }
  }

  async getAllWallets() {
    try {
      // First fetch all wallets to get their basic info
      const wallets = await db
        .select({
          id: schema.wallets.id,
          companyId: schema.wallets.companyId,
          lastUpdated: schema.wallets.lastUpdated,
          walletType: schema.wallets.walletType,
          providerId: schema.wallets.providerId,
          companyName: schema.companies.name,
        })
        .from(schema.wallets)
        .leftJoin(
          schema.companies,
          eq(schema.wallets.companyId, schema.companies.id)
        )
        .orderBy(schema.wallets.companyId, schema.wallets.walletType);
      
      // Now get all wallet transactions
      console.log("[Storage] Getting all wallet transactions across all companies");
      const transactions = await db
        .select()
        .from(schema.walletTransactions);
      
      console.log("[Storage] Found", transactions.length, "wallet transactions across all companies");
      
      // Calculate balances from transactions for each wallet
      const walletsWithCalculatedBalances = wallets.map(wallet => {
        // Filter transactions for this wallet
        const walletTransactions = transactions.filter(tx => tx.walletId === wallet.id);
        
        // Calculate balance from transactions
        let calculatedBalance = 0;
        walletTransactions.forEach(tx => {
          const amount = Number(tx.amount) || 0;
          if (tx.type === 'credit') {
            calculatedBalance += amount;
          } else if (tx.type === 'debit') {
            calculatedBalance -= Math.abs(amount); // Use abs to handle inconsistent storage
          }
        });
        
        // Return wallet with calculated balance
        return {
          ...wallet,
          balance: calculatedBalance.toFixed(2), // Match the format of the original balance
        };
      });
      
      return walletsWithCalculatedBalances;
    } catch (error) {
      console.error("[Storage] Error getting all wallets:", error);
      throw error;
    }
  }
  
  /**
   * Gets a wallet for a specific company by wallet type
   * @param companyId The company ID
   * @param walletType The wallet type: 'general', 'profit', or 'provider'
   * @returns The wallet or null if not found
   */
  async getWalletByType(companyId: number, walletType: schema.WalletType) {
    try {
      const [wallet] = await db
        .select()
        .from(schema.wallets)
        .where(
          and(
            eq(schema.wallets.companyId, companyId),
            eq(schema.wallets.walletType, walletType)
          )
        );
      
      return wallet || null;
    } catch (error) {
      console.error(`[Storage] Error getting ${walletType} wallet for company ${companyId}:`, error);
      throw error;
    }
  }
  
  /**
   * Creates wallet transactions for an eSIM purchase according to the exact flow shown in diagrams
   * Purchase Flow:
   * 1. Deduct full price from Company's General Wallet (negative balance)
   * 2. Add full price to SimTree's General Wallet (Transaction 1: positive entry)
   * 3. Move profit from SimTree General to SimTree Profit Wallet (Transaction 2: negative in general, positive in profit)
   * 4. Move cost from SimTree General to SimTree Provider Wallet (Transaction 3: negative in general, positive in provider)
   */
  async createEsimPurchaseTransactions(
    companyId: number,
    esimPlanId: number,
    esimOrderId: string,
    totalAmount: number,
    costAmount: number,
    description: string
  ) {
    console.log(`[Storage] Creating eSIM purchase transactions following diagram flow`, {
      companyId,
      esimPlanId,
      esimOrderId,
      totalAmount,
      costAmount
    });
    
    // Import broadcastEvent for SSE notifications
    const { broadcastEvent } = await import('./sse');
    
    try {
      // Calculate profit amount (margin is 200%)
      const profitAmount = totalAmount - costAmount;
      
      // Get the company general wallet (client company should only have a general wallet)
      const companyWallet = await this.getWalletByType(companyId, 'general');
      
      if (!companyWallet) {
        throw new Error(`Missing wallet for company ${companyId}. Need to create required wallet first.`);
      }

      // Get company information
      const company = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
      const companyName = company.length > 0 ? company[0].name : `Company ID: ${companyId}`;
      const companyCountry = company.length > 0 ? company[0].country : null;
      
      // Check if company is from UAE and calculate VAT (5%)
      const isUAECompany = companyCountry === 'UAE' || companyCountry === 'United Arab Emirates';
      const vatRate = 0.05; // 5% VAT for UAE companies
      const vatAmount = isUAECompany ? totalAmount * vatRate : 0;
      const totalAmountWithVAT = totalAmount + vatAmount;
      
      console.log(`[Storage] Company VAT details:`, {
        companyCountry,
        isUAECompany,
        vatAmount: vatAmount.toFixed(2),
        totalAmountWithVAT: totalAmountWithVAT.toFixed(2)
      });
      
      console.log(`[Storage] Found company: ${companyName} (ID: ${companyId})`);
      
      // Get SimTree wallets - first find SimTree company by name
      const simtreeCompanyResult = await db.select().from(schema.companies).where(eq(schema.companies.name, 'Simtree')).limit(1);
      if (simtreeCompanyResult.length === 0) {
        throw new Error('SimTree company not found in database');
      }
      const simtreeCompanyId = simtreeCompanyResult[0].id;
      console.log(`[Storage] Found SimTree company ID: ${simtreeCompanyId}`);
      const simtreeGeneralWallet = await this.getWalletByType(simtreeCompanyId, 'general');
      const simtreeProfitWallet = await this.getWalletByType(simtreeCompanyId, 'profit');
      const simtreeProviderWallet = await this.getWalletByType(simtreeCompanyId, 'provider');
      let simtreeTaxWallet = await this.getWalletByType(simtreeCompanyId, 'tax');
      
      console.log(`[Storage] Wallet check results:`, {
        companyWallet: companyWallet?.id,
        simtreeGeneral: simtreeGeneralWallet?.id,
        simtreeProfit: simtreeProfitWallet?.id,
        simtreeProvider: simtreeProviderWallet?.id,
        simtreeTax: simtreeTaxWallet?.id
      });
      
      // Ensure all wallets exist
      if (!simtreeGeneralWallet) {
        throw new Error(`Missing SimTree general wallet. Need to create required wallet first.`);
      }
      
      if (!simtreeProfitWallet) {
        throw new Error(`Missing SimTree profit wallet. Need to create required wallet first.`);
      }
      
      if (!simtreeProviderWallet) {
        throw new Error(`Missing SimTree provider wallet. Need to create required wallet first.`);
      }
      
      if (isUAECompany && !simtreeTaxWallet) {
        console.log(`[Storage] Tax wallet missing for VAT processing - creating it now`);
        await this.createSimtreeWallets();
        // Re-fetch and reassign the tax wallet after creation
        simtreeTaxWallet = await this.getWalletByType(simtreeCompanyId, 'tax');
        if (!simtreeTaxWallet) {
          throw new Error(`Failed to create SimTree tax wallet for VAT processing.`);
        }
        console.log(`[Storage] Successfully created tax wallet ID: ${simtreeTaxWallet.id}`);
      }
      
      // Start a database transaction following the exact diagram flow
      await db.transaction(async (tx) => {
        // SECURITY FIX: Lock wallet rows to prevent race conditions during concurrent purchases
        // Use raw SQL for SELECT FOR UPDATE since Drizzle's .for() may not work reliably
        // Build wallet ID list - include tax wallet for UAE companies
        const walletIdsToLock = [
          companyWallet.id, 
          simtreeGeneralWallet.id, 
          simtreeProfitWallet.id, 
          simtreeProviderWallet.id
        ];
        if (isUAECompany && simtreeTaxWallet) {
          walletIdsToLock.push(simtreeTaxWallet.id);
        }
        
        const lockedWalletResult = await tx.execute(sql`
          SELECT id, balance FROM wallets 
          WHERE id IN (${sql.join(walletIdsToLock.map(id => sql`${id}`), sql`, `)})
          FOR UPDATE
        `);
        
        // Find the locked company wallet balance
        const lockedCompanyWallet = lockedWalletResult.rows.find(
          (row: any) => row.id === companyWallet.id
        ) as { id: number; balance: string } | undefined;
        
        if (!lockedCompanyWallet) {
          throw new Error('Failed to lock company wallet for transaction');
        }
        
        // Verify sufficient balance AFTER acquiring lock (prevents TOCTOU race condition)
        if (Number(lockedCompanyWallet.balance) < totalAmountWithVAT) {
          throw new Error(`Insufficient wallet balance. Available: $${lockedCompanyWallet.balance}, Required: $${totalAmountWithVAT.toFixed(2)}`);
        }
        
        // STEP 1: Deduct full eSIM price (including VAT for UAE companies) from Company's General Wallet
        const [companyDebitTx] = await tx
          .insert(schema.walletTransactions)
          .values({
            walletId: companyWallet.id,
            amount: (-totalAmountWithVAT).toFixed(2), // Negative because it's subtracted
            type: 'debit',
            description: `eSIM Purchase ${description} -$${totalAmountWithVAT.toFixed(2)}${isUAECompany ? ' (incl. VAT)' : ''}`,
            status: 'completed',
            createdAt: new Date(),
            esimPlanId,
            esimOrderId
          })
          .returning();
        
        // STEP 2: SimTree General Wallet - Transaction 1: Positive entry for eSIM amount only (VAT goes separately)
        const [simtreeGeneralTx1] = await tx
          .insert(schema.walletTransactions)
          .values({
            walletId: simtreeGeneralWallet.id,
            amount: totalAmount.toFixed(2),
            type: 'credit',
            description: `eSIM Purchase ${description} +$${totalAmount.toFixed(2)}`,
            status: 'completed',
            createdAt: new Date(),
            esimPlanId,
            esimOrderId,
            relatedTransactionId: companyDebitTx.id
          })
          .returning();
        
        // STEP 3: SimTree General Wallet - Transaction 2: Negative entry equal to profit margin (goes to Profit Wallet)
        const [simtreeGeneralTx2] = await tx
          .insert(schema.walletTransactions)
          .values({
            walletId: simtreeGeneralWallet.id,
            amount: (-profitAmount).toFixed(2), // Negative because it's subtracted
            type: 'debit',
            description: `Profit: eSIM Purchase ${description} -$${profitAmount.toFixed(2)}`,
            status: 'completed',
            createdAt: new Date(),
            esimPlanId,
            esimOrderId,
            relatedTransactionId: simtreeGeneralTx1.id
          })
          .returning();
        
        // STEP 4: SimTree General Wallet - Transaction 3: Negative entry equal to provider cost (goes to Provider Wallet)
        const [simtreeGeneralTx3] = await tx
          .insert(schema.walletTransactions)
          .values({
            walletId: simtreeGeneralWallet.id,
            amount: (-costAmount).toFixed(2), // Negative because it's subtracted
            type: 'debit',
            description: `Cost: eSIM Purchase ${description} -$${costAmount.toFixed(2)}`,
            status: 'completed',
            createdAt: new Date(),
            esimPlanId,
            esimOrderId,
            relatedTransactionId: simtreeGeneralTx1.id
          })
          .returning();
        
        // STEP 5: Add profit margin to SimTree's Profit Wallet
        const [simtreeProfitTx] = await tx
          .insert(schema.walletTransactions)
          .values({
            walletId: simtreeProfitWallet.id,
            amount: profitAmount.toFixed(2),
            type: 'credit',
            description: `Profit: eSIM Purchase ${description} +$${profitAmount.toFixed(2)}`,
            status: 'completed',
            createdAt: new Date(),
            esimPlanId,
            esimOrderId,
            relatedTransactionId: simtreeGeneralTx2.id
          })
          .returning();
        
        // STEP 6: Add provider cost to SimTree's Provider Wallet
        const [simtreeProviderTx] = await tx
          .insert(schema.walletTransactions)
          .values({
            walletId: simtreeProviderWallet.id,
            amount: costAmount.toFixed(2),
            type: 'credit',
            description: `Cost: eSIM Purchase ${description} +$${costAmount.toFixed(2)}`,
            status: 'completed',
            createdAt: new Date(),
            esimPlanId,
            esimOrderId,
            relatedTransactionId: simtreeGeneralTx3.id
          })
          .returning();
        
        // STEP 7 (UAE only): Add VAT to SimTree's Tax Wallet if company is from UAE
        let simtreeTaxTx = null;
        if (isUAECompany && vatAmount > 0) {
          // Get the tax wallet again in case it was just created
          const currentSimtreeTaxWallet = await this.getWalletByType(simtreeCompanyId, 'tax');
          if (!currentSimtreeTaxWallet) {
            throw new Error('Tax wallet not available for VAT transaction');
          }
          
          [simtreeTaxTx] = await tx
            .insert(schema.walletTransactions)
            .values({
              walletId: currentSimtreeTaxWallet.id,
              amount: vatAmount.toFixed(2),
              type: 'credit',
              description: `VAT (5%): eSIM Purchase ${description} +$${vatAmount.toFixed(2)}`,
              status: 'completed',
              createdAt: new Date(),
              esimPlanId,
              esimOrderId,
              relatedTransactionId: companyDebitTx.id
            })
            .returning();
        }
        
        // STEP 8: Update wallet balances to reflect the transactions
        // Update client company wallet balance (subtract full amount including VAT)
        await tx
          .update(schema.wallets)
          .set({
            balance: (Number(companyWallet.balance) - totalAmountWithVAT).toFixed(2),
            lastUpdated: new Date()
          })
          .where(eq(schema.wallets.id, companyWallet.id));
        
        // Update SimTree general wallet balance (add eSIM amount, then subtract profit and cost = net 0)
        // Note: VAT goes directly to tax wallet, not through general wallet
        await tx
          .update(schema.wallets)
          .set({
            balance: (Number(simtreeGeneralWallet.balance) + totalAmount - profitAmount - costAmount).toFixed(2),
            lastUpdated: new Date()
          })
          .where(eq(schema.wallets.id, simtreeGeneralWallet.id));
        
        // Update SimTree profit wallet balance (add profit)
        await tx
          .update(schema.wallets)
          .set({
            balance: (Number(simtreeProfitWallet.balance) + profitAmount).toFixed(2),
            lastUpdated: new Date()
          })
          .where(eq(schema.wallets.id, simtreeProfitWallet.id));
        
        // Update SimTree provider wallet balance (add cost)
        await tx
          .update(schema.wallets)
          .set({
            balance: (Number(simtreeProviderWallet.balance) + costAmount).toFixed(2),
            lastUpdated: new Date()
          })
          .where(eq(schema.wallets.id, simtreeProviderWallet.id));
        
        // Update SimTree tax wallet balance (add VAT if UAE company)
        if (isUAECompany && vatAmount > 0) {
          // Get the tax wallet again in case it was just created
          const currentSimtreeTaxWallet = await this.getWalletByType(simtreeCompanyId, 'tax');
          if (currentSimtreeTaxWallet) {
            await tx
              .update(schema.wallets)
              .set({
                balance: (Number(currentSimtreeTaxWallet.balance) + vatAmount).toFixed(2),
                lastUpdated: new Date()
              })
              .where(eq(schema.wallets.id, currentSimtreeTaxWallet.id));
            console.log(`[Storage] Updated SimTree tax wallet balance: +$${vatAmount.toFixed(2)}`);
          }
        }
        
        console.log(`[Storage] Created eSIM purchase transactions following diagram flow:`, {
          companyDebitTxId: companyDebitTx.id,
          simtreeGeneralTx1Id: simtreeGeneralTx1.id,
          simtreeGeneralTx2Id: simtreeGeneralTx2.id,
          simtreeGeneralTx3Id: simtreeGeneralTx3.id,
          simtreeProfitTxId: simtreeProfitTx.id,
          simtreeProviderTxId: simtreeProviderTx.id,
          simtreeTaxTxId: simtreeTaxTx?.id,
          isUAECompany,
          vatAmount: vatAmount.toFixed(2)
        });
        
        // Broadcast wallet balance update via SSE
        broadcastEvent({
          type: 'WALLET_BALANCE_UPDATE',
          data: {
            companyId,
            companyName,
            walletUpdates: [
              {
                walletId: companyWallet.id,
                walletType: 'general',
                newBalance: (Number(companyWallet.balance) - totalAmountWithVAT).toFixed(2),
                previousBalance: companyWallet.balance,
                change: -totalAmountWithVAT
              }
            ],
            transactionType: 'eSIM_purchase',
            description: `eSIM Purchase: ${description}`,
            amount: totalAmountWithVAT,
            timestamp: new Date().toISOString()
          }
        });
        
        return {
          companyDebitTransaction: companyDebitTx,
          simtreeGeneralTransaction1: simtreeGeneralTx1,
          simtreeGeneralTransaction2: simtreeGeneralTx2,
          simtreeGeneralTransaction3: simtreeGeneralTx3,
          simtreeProfitTransaction: simtreeProfitTx,
          simtreeProviderTransaction: simtreeProviderTx,
          simtreeTaxTransaction: simtreeTaxTx, // VAT transaction for UAE companies
          vatAmount,
          totalAmountWithVAT,
          isUAECompany
        };
      });
      
      console.log(`[Storage] Successfully completed eSIM purchase transaction flow with SSE notification`);
      
    } catch (error) {
      console.error(`[Storage] Error creating eSIM purchase transactions:`, error);
      console.error(`[Storage] Error details:`, {
        message: (error as any)?.message || "Unknown error",
        stack: (error as any)?.stack,
        companyId,
        esimPlanId,
        esimOrderId,
        totalAmount,
        costAmount
      });
      throw error;
    }
  }

  async getWalletTransactionsByCompany(companyId: number) {
    try {
      console.log(
        `[Storage] Getting wallet transactions for company ID: ${companyId}`,
      );

      // Get all wallets for this company
      const walletResult = await db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.companyId, companyId));

      if (walletResult.length > 0) {
        console.log(
          `[Storage] Found ${walletResult.length} wallets for company ID ${companyId}`,
          walletResult.map(w => ({ id: w.id, type: w.walletType }))
        );
        
        // Get all wallet IDs for this company
        const walletIds = walletResult.map(wallet => wallet.id);
        
        // Get all transactions across all wallets for this company
        const transactionsResult = await db
          .select({
            id: schema.walletTransactions.id,
            walletId: schema.walletTransactions.walletId,
            amount: schema.walletTransactions.amount,
            type: schema.walletTransactions.type,
            description: schema.walletTransactions.description,
            createdAt: schema.walletTransactions.createdAt,
            status: schema.walletTransactions.status,
            paymentMethod: schema.walletTransactions.paymentMethod,
            stripePaymentId: schema.walletTransactions.stripePaymentId,
            stripeSessionId: schema.walletTransactions.stripeSessionId,
            stripePaymentIntentId: schema.walletTransactions.stripePaymentIntentId,
            relatedTransactionId: schema.walletTransactions.relatedTransactionId,
            esimPlanId: schema.walletTransactions.esimPlanId,
            esimOrderId: schema.walletTransactions.esimOrderId,
            companyId: schema.wallets.companyId,
            walletType: schema.wallets.walletType,
          })
          .from(schema.walletTransactions)
          .leftJoin(
            schema.wallets,
            eq(schema.walletTransactions.walletId, schema.wallets.id),
          )
          .where(inArray(schema.walletTransactions.walletId, walletIds))
          .orderBy(desc(schema.walletTransactions.createdAt));

        // Get company information for name mapping
        const company = await db
          .select()
          .from(schema.companies)
          .where(eq(schema.companies.id, companyId))
          .limit(1);

        // Get all employees and their companies for profit transaction mapping
        const allEmployees = await db
          .select({
            id: schema.employees.id,
            name: schema.employees.name,
            companyId: schema.employees.companyId,
            companyName: schema.companies.name
          })
          .from(schema.employees)
          .leftJoin(schema.companies, eq(schema.employees.companyId, schema.companies.id));

        // Map transactions with proper company name
        const enrichedTransactions = transactionsResult.map(transaction => {
          let companyName = 'Unknown';
          
          // Special handling for SimTree (company ID 1)
          if (companyId === 1) {
            // For profit transactions, find the employee's company from the description
            if (transaction.description && transaction.description.includes('Profit:') && transaction.walletType === 'profit') {
              const employeeNameMatch = transaction.description.match(/for ([^+\-$]+?)(?:\s*[+\-$]|$)/);
              if (employeeNameMatch && employeeNameMatch[1]) {
                const employeeName = employeeNameMatch[1].trim();
                const employee = allEmployees.find(e => e.name === employeeName);
                if (employee && employee.companyName) {
                  companyName = employee.companyName;
                } else {
                  companyName = 'Simtree';
                }
              } else {
                companyName = 'Simtree';
              }
            } else {
              companyName = 'Simtree';
            }
          } else if (company && company.length > 0) {
            companyName = company[0].name;
          }

          return {
            ...transaction,
            companyName
          };
        });

        console.log(
          `[Storage] Found ${enrichedTransactions.length} transactions across ${walletIds.length} wallets for company ${companyId}`,
        );
        return enrichedTransactions;
      }

      // If no wallet was found directly by company ID, maybe we need to create one?
      console.log(
        `[Storage] ⚠️ No wallet found directly for company ID: ${companyId}. Checking if company exists.`,
      );

      // Check if this is a valid company
      const company = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.id, companyId))
        .limit(1);

      if (company && company.length > 0) {
        console.log(
          `[Storage] Company exists: ${company[0].name}. Creating missing wallet.`,
        );

        // Create a wallet for this company
        const [newWallet] = await db
          .insert(schema.wallets)
          .values({
            companyId: companyId,
            balance: "0",
            lastUpdated: new Date(),
          })
          .returning();

        console.log(
          `[Storage] Created new wallet ${newWallet.id} for company ${companyId}`,
        );

        // Return empty array since there won't be any transactions yet
        return [];
      }

      console.log(
        `[Storage] No company found with ID: ${companyId}. Returning empty array.`,
      );
      return [];
    } catch (error) {
      console.error(
        `[Storage] ❌ Error getting wallet transactions for company ${companyId}:`,
        error,
      );
      // Return empty array instead of throwing to avoid breaking the UI
      return [];
    }
  }

  async getAllWalletTransactions() {
    try {
      console.log(`[Storage] Getting all wallet transactions across all companies`);

      // Get ALL transactions with company details
      const allTransactions = await db
        .select({
          id: schema.walletTransactions.id,
          walletId: schema.walletTransactions.walletId,
          amount: schema.walletTransactions.amount,
          type: schema.walletTransactions.type,
          description: schema.walletTransactions.description,
          createdAt: schema.walletTransactions.createdAt,
          status: schema.walletTransactions.status,
          paymentMethod: schema.walletTransactions.paymentMethod,
          stripePaymentId: schema.walletTransactions.stripePaymentId,
          stripeSessionId: schema.walletTransactions.stripeSessionId,
          stripePaymentIntentId: schema.walletTransactions.stripePaymentIntentId,
          relatedTransactionId: schema.walletTransactions.relatedTransactionId,
          esimPlanId: schema.walletTransactions.esimPlanId,
          esimOrderId: schema.walletTransactions.esimOrderId,
          companyId: schema.wallets.companyId,
          walletType: schema.wallets.walletType,
          companyName: schema.companies.name,
        })
        .from(schema.walletTransactions)
        .leftJoin(
          schema.wallets,
          eq(schema.walletTransactions.walletId, schema.wallets.id)
        )
        .leftJoin(
          schema.companies,
          eq(schema.wallets.companyId, schema.companies.id)
        )
        .orderBy(desc(schema.walletTransactions.createdAt));
      
      console.log(`[Storage] Found ${allTransactions.length} total transactions across all companies`);
      
      // Get all companies and wallets to determine master wallet
      const companies = await db
        .select()
        .from(schema.companies);
        
      const wallets = await db
        .select()
        .from(schema.wallets);
      
      // As a safety net, find the SimTree company (should be ID 1)
      // Try different case variations since name could be 'SimTree', 'Simtree', or 'SIMTREE'
      const simtreeCompany = companies.find(c => 
        c.name.toLowerCase() === 'simtree' || 
        c.id === 1  // The superadmin company should always be ID 1
      );
      
      if (!simtreeCompany) {
        console.log(`[Storage] SimTree company not found. Cannot get master wallet transactions.`);
        console.log(`[Storage] Available companies:`, companies.map(c => `${c.id}: ${c.name}`));
        return allTransactions;
      }
      
      // Find the SimTree general wallet - this is the master wallet
      const simtreeWallets = wallets.filter(w => w.companyId === simtreeCompany.id);
      const masterWallet = simtreeWallets.find(w => w.walletType === 'general');
      
      if (!masterWallet) {
        console.log(`[Storage] SimTree general wallet not found. Cannot get master wallet transactions.`);
        return allTransactions;
      }
      
      // Get all transactions from other companies that need to be mirrored
      // These are transactions that:
      // 1. Are not already in the master wallet
      // 2. Are not already mirrored (don't have a relatedTransactionId)
      // 3. Are from companies other than SimTree
      
      // Calculate which transactions need to be added to the master wallet
      const masterWalletId = masterWallet.id;
      const masterTransactions = allTransactions.filter(tx => tx.walletId === masterWalletId);
      console.log(`[Storage] Found ${masterTransactions.length} existing transactions in master wallet`);
      
      // Get transactions from other companies that need to be mirrored to the master wallet
      const transactionsToMirror = allTransactions.filter(tx => {
        // Skip transactions that are already in master wallet
        if (tx.walletId === masterWalletId) return false;
        
        // Skip transactions that are already mirrored (have a relatedTransactionId)
        if (tx.relatedTransactionId !== null) return false;
        
        // Skip transactions from SimTree itself (different wallets)
        if (tx.companyId === simtreeCompany.id) return false;
        
        // Check if this transaction is already mirrored in the master wallet
        const existingMirror = masterTransactions.find(
          mt => mt.relatedTransactionId === tx.id
        );
        
        // Only include if not already mirrored
        return !existingMirror;
      });
      
      console.log(`[Storage] Found ${transactionsToMirror.length} transactions to mirror to master wallet`);
      
      // Mirror transactions to the master wallet if needed
      if (transactionsToMirror.length > 0) {
        await db.transaction(async (tx) => {
          for (const transaction of transactionsToMirror) {
            // Create a description with company name for the master wallet entry
            const masterDescription = `${transaction.companyName}: ${transaction.description}`;
            
            // Create a mirrored entry in the master wallet
            await tx.insert(schema.walletTransactions).values({
              walletId: masterWalletId,
              amount: transaction.amount,
              type: transaction.type,
              description: masterDescription,
              stripePaymentId: transaction.stripePaymentId,
              stripeSessionId: transaction.stripeSessionId,
              stripePaymentIntentId: transaction.stripePaymentIntentId,
              status: transaction.status || 'completed',
              paymentMethod: transaction.paymentMethod,
              esimPlanId: transaction.esimPlanId,
              esimOrderId: transaction.esimOrderId,
              relatedTransactionId: transaction.id,
              createdAt: transaction.createdAt,
            });
            
            console.log(`[Storage] Mirrored transaction ${transaction.id} to master wallet`);
          }
        });
      }
      
      // Now, return ALL transactions from the master wallet
      const finalMasterTransactions = await db
        .select({
          id: schema.walletTransactions.id,
          walletId: schema.walletTransactions.walletId,
          amount: schema.walletTransactions.amount,
          type: schema.walletTransactions.type,
          description: schema.walletTransactions.description,
          createdAt: schema.walletTransactions.createdAt,
          status: schema.walletTransactions.status,
          paymentMethod: schema.walletTransactions.paymentMethod,
          stripePaymentId: schema.walletTransactions.stripePaymentId,
          stripeSessionId: schema.walletTransactions.stripeSessionId,
          stripePaymentIntentId: schema.walletTransactions.stripePaymentIntentId,
          relatedTransactionId: schema.walletTransactions.relatedTransactionId,
          esimPlanId: schema.walletTransactions.esimPlanId,
          esimOrderId: schema.walletTransactions.esimOrderId,
          companyId: schema.wallets.companyId,
          walletType: schema.wallets.walletType,
          companyName: schema.companies.name,
        })
        .from(schema.walletTransactions)
        .leftJoin(
          schema.wallets,
          eq(schema.walletTransactions.walletId, schema.wallets.id)
        )
        .leftJoin(
          schema.companies,
          eq(schema.wallets.companyId, schema.companies.id)
        )
        .where(eq(schema.walletTransactions.walletId, masterWalletId))
        .orderBy(desc(schema.walletTransactions.createdAt));
        
      console.log(`[Storage] Returning ${finalMasterTransactions.length} transactions from master wallet`);
      
      return finalMasterTransactions;
    } catch (error) {
      console.error(`[Storage] Error getting all wallet transactions:`, error);
      throw error; 
    }
  }

  async getPlanHistory(employeeId: number): Promise<PlanHistory[]> {
    try {
      console.log("Fetching plan history for employee:", employeeId);

      const history = await db
        .select({
          id: schema.planHistory.id,
          employeeId: schema.planHistory.employeeId,
          planName: schema.planHistory.planName,
          planData: schema.planHistory.planData,
          startDate: schema.planHistory.startDate,
          endDate: schema.planHistory.endDate,
          dataUsed: schema.planHistory.dataUsed,
          status: schema.planHistory.status,
          providerId: schema.planHistory.providerId,
        })
        .from(schema.planHistory)
        .where(eq(schema.planHistory.employeeId, employeeId))
        .orderBy(desc(schema.planHistory.startDate));

      console.log("Retrieved plan history:", history);
      return history;
    } catch (error) {
      console.error("Error getting plan history:", error);
      throw error;
    }
  }

  async addPlanHistory(history: Omit<PlanHistory, "id">): Promise<PlanHistory> {
    try {
      // Log the incoming history data
      console.log("Adding plan history - Input data:", history);

      // Ensure we have all required fields
      if (
        !history.employeeId ||
        !history.planName ||
        !history.planData ||
        !history.status ||
        !history.providerId
      ) {
        throw new Error("Missing required fields for plan history");
      }

      // Format dates properly, ensuring they are valid Date objects
      const formattedHistory = {
        ...history,
        startDate: history.startDate ? new Date(history.startDate) : new Date(),
        endDate: history.endDate ? new Date(history.endDate) : null,
        dataUsed: history.dataUsed || "0",
      };

      console.log("Formatted history data:", formattedHistory);

      const [newHistory] = await db
        .insert(schema.planHistory)
        .values(formattedHistory)
        .returning();

      console.log("Created plan history record:", newHistory);

      return {
        ...newHistory,
        startDate: newHistory.startDate
          ? new Date(newHistory.startDate).toISOString()
          : null,
        endDate: newHistory.endDate
          ? new Date(newHistory.endDate).toISOString()
          : null,
      };
    } catch (error) {
      console.error("Error adding plan history:", error);
      throw error;
    }
  }

  async updatePlanHistoryStatus(id: number, status: string): Promise<void> {
    try {
      console.log(`Updating plan history ${id} status to ${status}`);

      await db
        .update(schema.planHistory)
        .set({ status })
        .where(eq(schema.planHistory.id, id));

      console.log(`Successfully updated plan history ${id} status to ${status}`);
    } catch (error) {
      console.error("Error updating plan history status:", error);
      throw error;
    }
  }

  async updateAllPlanHistoryToExpired(employeeId: number): Promise<void> {
    try {
      console.log(`Updating all plan history for employee ${employeeId} to expired`);

      await db
        .update(schema.planHistory)
        .set({ status: 'expired' })
        .where(eq(schema.planHistory.employeeId, employeeId));

      console.log(`Successfully updated all plan history for employee ${employeeId} to expired`);
    } catch (error) {
      console.error("Error updating all plan history to expired:", error);
      throw error;
    }
  }

  // Calculate wallet balance for a company based on all transactions
  async getCompanyWalletBalance(companyId: number, walletType?: string): Promise<number> {
    try {
      console.log(`[Storage] Calculating wallet balance for company ID: ${companyId}${walletType ? ` with wallet type ${walletType}` : ''}`);
      
      // Get all wallets for this company
      let query = db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.companyId, companyId));
      
      // Apply wallet type filter if specified
      if (walletType) {
        query = query.where(eq(schema.wallets.walletType, walletType));
      }
      
      const wallets = await query;

      if (wallets.length === 0) {
        console.log(`[Storage] No wallets found for company ${companyId}${walletType ? ` with type ${walletType}` : ''}`);
        return 0;
      }

      let totalBalance = 0;
      
      // For each wallet, calculate balance from transactions instead of using stored value
      for (const wallet of wallets) {
        const transactions = await db
          .select()
          .from(schema.walletTransactions)
          .where(eq(schema.walletTransactions.walletId, wallet.id));
        
        // Calculate balance from transactions - credit adds, debit always subtracts (use abs for consistency)
        const calculatedBalance = transactions.reduce((sum, tx) => {
          const amount = parseFloat(tx.amount);
          return tx.type === 'credit' ? sum + amount : sum - Math.abs(amount);
        }, 0);
        
        totalBalance += calculatedBalance;
        
        console.log(`[Storage] Wallet ${wallet.id} calculated balance from transactions: $${calculatedBalance.toFixed(2)}`);
        console.log(`[Storage] Wallet ${wallet.id} stored balance: $${Number(wallet.balance).toFixed(2)}`);
        
        // If balance doesn't match transactions, update it
        if (Math.abs(calculatedBalance - Number(wallet.balance)) > 0.001) {
          console.log(`[Storage] Updating wallet ${wallet.id} balance from ${wallet.balance} to ${calculatedBalance.toFixed(2)}`);
          await this.updateWalletBalance(wallet.id, calculatedBalance);
        }
      }
      
      console.log(`[Storage] Total balance from transactions across ${wallets.length} wallets for company ${companyId}: $${totalBalance.toFixed(2)}`);
      
      return totalBalance;
    } catch (error) {
      console.error(`[Storage] Error calculating wallet balance:`, error);
      throw new Error(`Failed to calculate wallet balance for company ${companyId}`);
    }
  }
  
  /**
   * Get wallet balances by type for a company
   * @param companyId The company ID
   * @returns An object with wallet balances by type: { general: number, profit: number, provider: number, stripe_fees: number, tax: number }
   */
  async getCompanyWalletBalancesByType(companyId: number): Promise<{ general: number; profit: number; provider: number; stripe_fees: number; tax: number }> {
    try {
      // First, get all wallets for this company to get their IDs and types
      const wallets = await db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.companyId, companyId));
      
      // Initialize default balances
      const balances = {
        general: 0,
        profit: 0,
        provider: 0,
        stripe_fees: 0,
        tax: 0
      };
      
      // If there are no wallets, return zero balances
      if (wallets.length === 0) {
        console.log(`[Storage] No wallets found for company ${companyId}, returning zero balances`);
        return balances;
      }
      
      // Create a map of wallet IDs to their types
      const walletTypeMap = new Map<number, string>();
      wallets.forEach(wallet => {
        walletTypeMap.set(wallet.id, wallet.walletType || 'general');
      });
      
      // Get all wallet IDs for this company
      const walletIds = wallets.map(wallet => wallet.id);
      
      // Get all transactions for these wallets
      const transactions = await db
        .select()
        .from(schema.walletTransactions)
        .where(inArray(schema.walletTransactions.walletId, walletIds));
      
      // Calculate balances from transactions
      transactions.forEach(transaction => {
        const walletId = transaction.walletId;
        if (!walletId) return; // Skip if no wallet ID
        
        const walletType = walletTypeMap.get(walletId);
        if (!walletType || !(walletType in balances)) return; // Skip if invalid wallet type
        
        // Parse the transaction amount
        let amount = Number(transaction.amount) || 0;
        const oldBalance = balances[walletType as keyof typeof balances];
        
        // Balance calculation - credit adds, debit always subtracts (use abs for consistency)
        if (transaction.type === 'credit') {
          balances[walletType as keyof typeof balances] += amount;
          console.log(`[BalanceCalc] CREDIT: Wallet ${walletId} (${walletType}) - Amount: +${amount} - Old Balance: ${oldBalance} - New Balance: ${balances[walletType as keyof typeof balances]} - Description: ${transaction.description}`);
        } else if (transaction.type === 'debit') {
          balances[walletType as keyof typeof balances] -= Math.abs(amount);
          console.log(`[BalanceCalc] DEBIT: Wallet ${walletId} (${walletType}) - Amount: -${Math.abs(amount)} - Old Balance: ${oldBalance} - New Balance: ${balances[walletType as keyof typeof balances]} - Description: ${transaction.description}`);
        }
      });
      
      // Balance calculation complete
      
      return balances;
    } catch (error) {
      console.error(`[Storage] Error getting wallet balances by type for company ${companyId}:`, error);
      return { general: 0, profit: 0, provider: 0, stripe_fees: 0, tax: 0 };
    }
  }

  async deductWalletBalance(
    companyId: number,
    amount: number,
    description: string,
  ) {
    try {
      console.log(
        "Starting deductWalletBalance for company:",
        companyId,
        "amount:",
        amount,
      );

      // This modified getWallet method handles both direct company IDs and user IDs
      const wallet = await this.getWallet(companyId);
      if (!wallet) {
        console.error(`No wallet found for company/user ID: ${companyId}`);
        throw new Error(`Wallet not found for company/user ID: ${companyId}`);
      }

      console.log(
        `Found wallet (ID: ${wallet.id}) for company/user ID: ${companyId}`,
      );

      const currentBalance = parseFloat(wallet.balance);
      const deductAmount = Math.abs(amount);

      console.log(
        "Current balance:",
        currentBalance,
        "Deduct amount:",
        deductAmount,
      );

      if (currentBalance < deductAmount) {
        console.error(
          `Insufficient balance: ${currentBalance} < ${deductAmount}`,
        );
        throw new Error("Insufficient balance");
      }

      // First update the balance
      const newBalance = currentBalance - deductAmount;
      console.log("New balance will be:", newBalance);

      const updatedWallet = await this.updateWalletBalance(
        wallet.id,
        newBalance,
      );
      if (!updatedWallet) {
        console.error("Failed to update wallet balance");
        throw new Error("Failed to update wallet balance");
      }

      console.log(
        `Successfully updated wallet balance to ${updatedWallet.balance}`,
      );

      // Then record the transaction
      const transaction = await this.addWalletTransaction(
        wallet.id,
        deductAmount, // Store positive amount for debit
        "debit",
        description,
      );

      if (!transaction) {
        // If transaction fails, rollback the balance
        await this.updateWalletBalance(wallet.id, currentBalance);
        throw new Error("Failed to record transaction");
      }

      console.log("Successfully completed deductWalletBalance");
      return { wallet: updatedWallet, transaction };
    } catch (error) {
      console.error("Error in deductWalletBalance:", error);
      throw error;
    }
  }
  async getEsimPlanByProviderId(
    providerId: string,
  ): Promise<EsimPlan | undefined> {
    const [plan] = await db
      .select()
      .from(schema.esimPlans)
      .where(eq(schema.esimPlans.providerId, providerId));
    return plan;
  }

  async getEsimPlanById(id: number): Promise<EsimPlan | undefined> {
    const [plan] = await db
      .select()
      .from(schema.esimPlans)
      .where(eq(schema.esimPlans.id, id));
    return plan;
  }

  async getPurchasedEsimById(id: number): Promise<PurchasedEsim | undefined> {
    const [esim] = await db
      .select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.id, id));
    return esim;
  }

  async cancelPurchasedEsim(id: number): Promise<PurchasedEsim | null> {
    return await db.transaction(async (tx) => {
      // Get the eSIM details before cancelling
      const [esim] = await tx
        .select()
        .from(schema.purchasedEsims)
        .where(eq(schema.purchasedEsims.id, id));

      if (!esim) throw new Error("eSIM not found");

      // Get the plan details
      const [plan] = await tx
        .select()
        .from(schema.esimPlans)
        .where(eq(schema.esimPlans.id, esim.planId));

      if (!plan) throw new Error("Plan not found");
      
      // Get employee details to determine company ID
      const [employee] = await tx
        .select()
        .from(schema.employees)
        .where(eq(schema.employees.id, esim.employeeId));
        
      if (!employee) throw new Error("Employee not found");
      
      // Get company information
      const [company] = await tx
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.id, employee.companyId));
        
      const companyName = company?.name || `Company ID: ${employee.companyId}`;
      
      // Get original transactions related to this purchase
      const originalTransactions = await tx
        .select()
        .from(schema.walletTransactions)
        .where(eq(schema.walletTransactions.esimOrderId, esim.orderId));
        
      console.log(`[Storage] Found ${originalTransactions.length} original transactions for eSIM ${id} with order ID ${esim.orderId}`);
      
      // If we have original transactions, process refunds
      if (originalTransactions.length > 0) {
        // Get the client company wallet (should be a general wallet)
        const clientWallet = await this.getWalletByType(employee.companyId, 'general');
        
        if (!clientWallet) {
          throw new Error(`Missing wallet for client company ${employee.companyId}`);
        }
        
        // Get SimTree wallets (SimTree is company ID 1 - the platform owner)
        const simtreeCompanyId = 1;
        const simtreeGeneralWallet = await this.getWalletByType(simtreeCompanyId, 'general');
        const simtreeProfitWallet = await this.getWalletByType(simtreeCompanyId, 'profit');
        const simtreeProviderWallet = await this.getWalletByType(simtreeCompanyId, 'provider');
        const simtreeTaxWallet = await this.getWalletByType(simtreeCompanyId, 'tax');
        
        if (!simtreeGeneralWallet || !simtreeProfitWallet || !simtreeProviderWallet) {
          throw new Error(`Missing SimTree wallets - unable to process refund properly`);
        }
        
        // Check if this is a UAE company for VAT refund handling
        const isUAECompany = company?.country === 'UAE' || company?.country === 'United Arab Emirates';
        console.log(`[Storage] Company VAT status for refund:`, {
          companyName: company?.name,
          country: company?.country,
          isUAECompany
        });
        
        // Find original transactions
        const clientDebitTransaction = originalTransactions.find(
          t => t.walletId === clientWallet.id && t.type === 'debit'
        );
        
        const simtreeGeneralCreditTransaction = originalTransactions.find(
          t => t.walletId === simtreeGeneralWallet.id && t.type === 'credit'
        );
        
        const simtreeProviderCreditTransaction = originalTransactions.find(
          t => t.walletId === simtreeProviderWallet.id && t.type === 'credit'
        );
        
        const simtreeProfitCreditTransaction = originalTransactions.find(
          t => t.walletId === simtreeProfitWallet.id && t.type === 'credit'
        );
        
        // Find VAT transaction if this is a UAE company
        const vatTransaction = isUAECompany && simtreeTaxWallet ? originalTransactions.find(
          t => t.walletId === simtreeTaxWallet.id && t.type === 'credit' && t.description?.includes('VAT')
        ) : null;
        
        // If we found the necessary transactions, process the refund
        if (clientDebitTransaction) {
          const totalAmount = Number(clientDebitTransaction.amount);
          const vatAmount = vatTransaction ? Number(vatTransaction.amount) : 0;
          const esimAmount = totalAmount - vatAmount; // eSIM amount without VAT
          
          console.log(`[Storage] Refund breakdown:`, {
            totalAmount,
            esimAmount,
            vatAmount,
            isUAECompany,
            hasVatTransaction: !!vatTransaction
          });
          
          // Calculate cost and profit amounts based on SimTree transactions (for eSIM only)
          let costAmount = 0;
          let profitAmount = 0;
          
          if (simtreeProviderCreditTransaction) {
            costAmount = Number(simtreeProviderCreditTransaction.amount);
          } else {
            console.warn(`No provider cost transaction found for eSIM ${id} - using estimated cost`);
            // Use an estimation based on eSIM amount only (not including VAT)
            costAmount = esimAmount / 2; // Rough estimate
          }
          
          if (simtreeProfitCreditTransaction) {
            profitAmount = Number(simtreeProfitCreditTransaction.amount);
          } else {
            // Calculate profit as the difference between eSIM amount and cost (VAT is not part of profit)
            profitAmount = esimAmount - costAmount;
          }
          
          console.log(`[Storage] Processing refund for eSIM ${id}:`, {
            totalAmount,
            costAmount,
            profitAmount
          });
          
          // REFUND FLOW FOLLOWING DIAGRAM EXACTLY:
          // 1. Add back full price to Company's General Wallet (positive balance)
          const [clientRefund] = await tx
            .insert(schema.walletTransactions)
            .values({
              walletId: clientWallet.id,
              amount: totalAmount.toFixed(2),
              type: 'credit',
              description: `Refund for cancelled eSIM: refund Belgium 1GB 7Days for Juan Pablo Shaw +$${totalAmount.toFixed(2)}`,
              status: 'completed',
              createdAt: new Date(),
              esimPlanId: plan.id,
              esimOrderId: esim.orderId,
              relatedTransactionId: clientDebitTransaction.id
            })
            .returning();
            
          // 2. SimTree General Wallet - Transaction 1: Negative entry equal to full retail price refunded to company
          const [simtreeGeneralRefundTx1] = await tx
            .insert(schema.walletTransactions)
            .values({
              walletId: simtreeGeneralWallet.id,
              amount: (-totalAmount).toFixed(2), // Negative because it's subtracted
              type: 'debit',
              description: `Refund for cancelled eSIM: refund Belgium 1GB 7Days for Juan Pablo Shaw -$${totalAmount.toFixed(2)}`,
              status: 'completed',
              createdAt: new Date(),
              esimPlanId: plan.id,
              esimOrderId: esim.orderId,
              relatedTransactionId: clientRefund.id
            })
            .returning();
            
          // 3. SimTree General Wallet - Transaction 2: Positive entry equal to profit margin, retrieved from Profit Wallet
          const [simtreeGeneralRefundTx2] = await tx
            .insert(schema.walletTransactions)
            .values({
              walletId: simtreeGeneralWallet.id,
              amount: profitAmount.toFixed(2), // Positive because it's returned from profit wallet
              type: 'credit',
              description: `Replenish profit: eSIM refund Belgium 1GB 7Days for Juan Pablo Shaw +$${profitAmount.toFixed(2)}`,
              status: 'completed',
              createdAt: new Date(),
              esimPlanId: plan.id,
              esimOrderId: esim.orderId,
              relatedTransactionId: simtreeGeneralRefundTx1.id
            })
            .returning();
            
          // 4. SimTree General Wallet - Transaction 3: Positive entry equal to provider cost, retrieved from Provider Wallet
          const [simtreeGeneralRefundTx3] = await tx
            .insert(schema.walletTransactions)
            .values({
              walletId: simtreeGeneralWallet.id,
              amount: costAmount.toFixed(2), // Positive because it's returned from provider wallet
              type: 'credit',
              description: `Replenish cost: eSIM refund Belgium 1GB 7Days for Juan Pablo Shaw +$${costAmount.toFixed(2)}`,
              status: 'completed',
              createdAt: new Date(),
              esimPlanId: plan.id,
              esimOrderId: esim.orderId,
              relatedTransactionId: simtreeGeneralRefundTx1.id
            })
            .returning();
            
          // 5. Deduct profit margin from SimTree's Profit Wallet (negative because it's returned)
          const [simtreeProfitRefund] = await tx
            .insert(schema.walletTransactions)
            .values({
              walletId: simtreeProfitWallet.id,
              amount: (-profitAmount).toFixed(2), // Negative because it's returned to general
              type: 'debit',
              description: `Company refund: eSIM refund Belgium 1GB 7Days for Juan Pablo Shaw -$${profitAmount.toFixed(2)}`,
              status: 'completed',
              createdAt: new Date(),
              esimPlanId: plan.id,
              esimOrderId: esim.orderId,
              relatedTransactionId: simtreeGeneralRefundTx2.id
            })
            .returning();
          
          // 6. Deduct provider cost from SimTree's Provider Wallet (negative because it's returned)
          const [simtreeProviderRefund] = await tx
            .insert(schema.walletTransactions)
            .values({
              walletId: simtreeProviderWallet.id,
              amount: (-costAmount).toFixed(2), // Negative because it's returned to general
              type: 'debit',
              description: `Company refund: eSIM refund Belgium 1GB 7Days for Juan Pablo Shaw -$${costAmount.toFixed(2)}`,
              status: 'completed',
              createdAt: new Date(),
              esimPlanId: plan.id,
              esimOrderId: esim.orderId,
              relatedTransactionId: simtreeGeneralRefundTx3.id
            })
            .returning();
            
          // 7. VAT Refund for UAE companies - Return VAT from SimTree Tax Wallet to Client Wallet
          let vatRefundTransaction = null;
          if (isUAECompany && vatAmount > 0 && simtreeTaxWallet) {
            console.log(`[Storage] Processing VAT refund: $${vatAmount.toFixed(2)} from SimTree tax wallet to client wallet`);
            
            // Create VAT refund transaction to client (part of the total refund to client)
            [vatRefundTransaction] = await tx
              .insert(schema.walletTransactions)
              .values({
                walletId: clientWallet.id,
                amount: vatAmount.toFixed(2),
                type: 'credit',
                description: `VAT refund for cancelled eSIM: ${plan.name} for ${employee.name} +$${vatAmount.toFixed(2)}`,
                status: 'completed',
                createdAt: new Date(),
                esimPlanId: plan.id,
                esimOrderId: esim.orderId,
                relatedTransactionId: clientRefund.id
              })
              .returning();
              
            // Deduct VAT from SimTree Tax Wallet
            await tx
              .insert(schema.walletTransactions)
              .values({
                walletId: simtreeTaxWallet.id,
                amount: (-vatAmount).toFixed(2), // Negative because VAT is refunded
                type: 'debit',
                description: `VAT refund: ${plan.name} for ${employee.name} -$${vatAmount.toFixed(2)}`,
                status: 'completed',
                createdAt: new Date(),
                esimPlanId: plan.id,
                esimOrderId: esim.orderId,
                relatedTransactionId: vatRefundTransaction.id
              });
              
            console.log(`[Storage] VAT refund completed: $${vatAmount.toFixed(2)} refunded to client, deducted from SimTree tax wallet`);
          }
            
          // 8. Update wallet balances to reflect the refund transactions following diagram flow
          // Update client company wallet balance (add back full amount including VAT)
          const clientRefundAmount = totalAmount + (vatRefundTransaction ? vatAmount : 0);
          await tx
            .update(schema.wallets)
            .set({
              balance: (Number(clientWallet.balance) + clientRefundAmount).toFixed(2),
              lastUpdated: new Date()
            })
            .where(eq(schema.wallets.id, clientWallet.id));
            
          // Update SimTree general wallet balance (subtract total, add back profit and cost = net 0)
          await tx
            .update(schema.wallets)
            .set({
              balance: (Number(simtreeGeneralWallet.balance) - totalAmount + profitAmount + costAmount).toFixed(2),
              lastUpdated: new Date()
            })
            .where(eq(schema.wallets.id, simtreeGeneralWallet.id));
            
          // Update SimTree provider wallet balance (subtract cost)
          await tx
            .update(schema.wallets)
            .set({
              balance: (Number(simtreeProviderWallet.balance) - costAmount).toFixed(2),
              lastUpdated: new Date()
            })
            .where(eq(schema.wallets.id, simtreeProviderWallet.id));
            
          // Update SimTree profit wallet balance (subtract profit)
          await tx
            .update(schema.wallets)
            .set({
              balance: (Number(simtreeProfitWallet.balance) - profitAmount).toFixed(2),
              lastUpdated: new Date()
            })
            .where(eq(schema.wallets.id, simtreeProfitWallet.id));
            
          // Update SimTree tax wallet balance for UAE companies (subtract VAT refund)
          if (isUAECompany && vatAmount > 0 && simtreeTaxWallet) {
            await tx
              .update(schema.wallets)
              .set({
                balance: (Number(simtreeTaxWallet.balance) - vatAmount).toFixed(2),
                lastUpdated: new Date()
              })
              .where(eq(schema.wallets.id, simtreeTaxWallet.id));
            console.log(`[Storage] Updated SimTree tax wallet balance: -$${vatAmount.toFixed(2)}`);
          }
            
          console.log(`[Storage] Created refund transactions following diagram flow:`, {
            clientRefundId: clientRefund.id,
            simtreeGeneralRefundTx1Id: simtreeGeneralRefundTx1.id,
            simtreeGeneralRefundTx2Id: simtreeGeneralRefundTx2.id,
            simtreeGeneralRefundTx3Id: simtreeGeneralRefundTx3.id,
            simtreeProfitRefundId: simtreeProfitRefund.id,
            simtreeProviderRefundId: simtreeProviderRefund.id,
            vatRefundTransactionId: vatRefundTransaction?.id,
            totalRefundAmount: (totalAmount + (vatRefundTransaction ? vatAmount : 0)).toFixed(2),
            vatAmount: vatAmount.toFixed(2),
            isUAECompany
          });
        } else {
          console.warn(`[Storage] Could not find original client transaction for eSIM ${id} - cannot process refund`);
        }
      } else {
        console.warn(`[Storage] No original transactions found for eSIM ${id} with order ID ${esim.orderId}`);
      }

      // Update the eSIM status and set cancelledAt timestamp for credit note processing
      const [updatedEsim] = await tx
        .update(schema.purchasedEsims)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          metadata: {
            ...esim.metadata,
            refunded: true,
            refundDate: new Date().toISOString(),
            isCancelled: true,
            cancelledAt: new Date().toISOString(),
            previousStatus: esim.status
          },
        })
        .where(eq(schema.purchasedEsims.id, id))
        .returning();

      // Add to plan history
      if (esim.employeeId) {
        await tx.insert(schema.planHistory).values({
          employeeId: esim.employeeId,
          planName: plan.name,
          planData: plan.data,
          startDate: new Date(esim.purchaseDate),
          endDate: new Date(), // End date is now since it's cancelled
          status: "cancelled",
          providerId: plan.providerId,
          dataUsed: "0",
        });

        // Reset employee's plan data - IMPORTANT to prevent "ghost" plans
        // This ensures the UI correctly shows "No active plan" after cancellation
        await tx
          .update(schema.employees)
          .set({
            dataUsage: "0",
            dataLimit: "0",
            planStartDate: null,
            planEndDate: null,
            planValidity: null,
          })
          .where(eq(schema.employees.id, esim.employeeId));
      }

      return updatedEsim;
    });
  }

  // Stripe payment methods
  async createStripeCheckoutSession(
    companyId: number,
    amount: number,
    description = "Wallet top-up",
  ) {
    try {
      // First get the wallet
      const wallet = await this.getWallet(companyId);
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      // Get company details for metadata
      const company = await this.getUser(companyId);
      if (!company) {
        throw new Error("Company not found");
      }

      // Create a pending transaction first
      const transaction = await this.addWalletTransaction(
        wallet.id,
        amount,
        "credit",
        description,
        {
          status: "pending",
          paymentMethod: "stripe",
        },
      );

      // Return the transaction ID to be used in the frontend
      return {
        sessionId: "", // Will be updated when the actual Stripe session is created
        transactionId: transaction.id,
      };
    } catch (error) {
      console.error("Error creating stripe checkout session:", error);
      throw error;
    }
  }

  async updateTransactionStatus(
    transactionId: number,
    status: string,
    stripeData?: {
      stripePaymentId?: string;
      stripePaymentIntentId?: string;
      paymentMethod?: string;
    },
  ) {
    try {
      // Update the transaction status
      const [transaction] = await db
        .update(schema.walletTransactions)
        .set({
          status,
          stripePaymentId: stripeData?.stripePaymentId,
          stripePaymentIntentId: stripeData?.stripePaymentIntentId,
          paymentMethod: stripeData?.paymentMethod || "stripe",
        })
        .where(eq(schema.walletTransactions.id, transactionId))
        .returning();

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      // If the status is "completed", update the wallet balance
      if (status === "completed") {
        // Get the wallet
        const [wallet] = await db
          .select()
          .from(schema.wallets)
          .where(eq(schema.wallets.id, transaction.walletId));

        if (!wallet) {
          throw new Error("Wallet not found");
        }

        // Update the wallet balance
        const currentBalance = parseFloat(wallet.balance);
        const newBalance = currentBalance + parseFloat(transaction.amount);
        await this.updateWalletBalance(wallet.id, newBalance);
      }

      return transaction;
    } catch (error) {
      console.error("Error updating transaction status:", error);
      throw error;
    }
  }

  async getTransactionByStripeSessionId(sessionId: string) {
    try {
      const [transaction] = await db
        .select()
        .from(schema.walletTransactions)
        .where(eq(schema.walletTransactions.stripeSessionId, sessionId));

      return transaction;
    } catch (error) {
      console.error("Error getting transaction by stripe session ID:", error);
      throw error;
    }
  }

  async getTransactionByStripePaymentIntentId(paymentIntentId: string) {
    try {
      const [transaction] = await db
        .select()
        .from(schema.walletTransactions)
        .where(
          eq(schema.walletTransactions.stripePaymentIntentId, paymentIntentId),
        );

      return transaction;
    } catch (error) {
      console.error(
        "Error getting transaction by stripe payment intent ID:",
        error,
      );
      throw error;
    }
  }

  async getWalletsByCompanyId(companyId: number) {
    try {
      const wallets = await db
        .select({
          id: schema.wallets.id,
          companyId: schema.wallets.companyId,
          balance: schema.wallets.balance,
          lastUpdated: schema.wallets.lastUpdated,
          walletType: schema.wallets.walletType,
          providerId: schema.wallets.providerId,
          companyName: schema.companies.name,
        })
        .from(schema.wallets)
        .leftJoin(
          schema.companies,
          eq(schema.wallets.companyId, schema.companies.id)
        )
        .where(eq(schema.wallets.companyId, companyId))
        .orderBy(schema.wallets.walletType);
      
      console.log(`[Storage] Found ${wallets.length} wallets for company ID ${companyId}`, 
        wallets.map(w => ({ id: w.id, type: w.walletType, balance: w.balance }))
      );
      
      return wallets;
    } catch (error) {
      console.error("[Storage] Error getting wallets by company ID:", error);
      throw error;
    }
  }

  async addToWalletBalance(walletId: number, amount: number) {
    try {
      // Get current wallet
      const [wallet] = await db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.id, walletId));

      if (!wallet) {
        throw new Error("Wallet not found");
      }

      // Calculate new balance
      const currentBalance = parseFloat(wallet.balance);
      const newBalance = currentBalance + amount;

      // Update wallet balance
      await this.updateWalletBalance(walletId, newBalance);

      return newBalance;
    } catch (error) {
      console.error("Error adding to wallet balance:", error);
      throw error;
    }
  }

  async createWalletTransaction(transactionData: {
    walletId: number;
    amount: string;
    type: "credit" | "debit" | "refund";
    description: string;
    stripePaymentIntentId?: string;
    stripeSessionId?: string;
    stripePaymentId?: string;
    paymentMethod?: string;
    status?: string;
  }) {
    try {
      // Insert the transaction
      const [transaction] = await db
        .insert(schema.walletTransactions)
        .values({
          walletId: transactionData.walletId,
          amount: transactionData.amount,
          type: transactionData.type,
          description: transactionData.description,
          stripePaymentIntentId: transactionData.stripePaymentIntentId || null,
          stripeSessionId: transactionData.stripeSessionId || null,
          stripePaymentId: transactionData.stripePaymentId || null,
          status: transactionData.status || "completed",
          paymentMethod: transactionData.paymentMethod || null,
          createdAt: new Date(),
        })
        .returning();

      // If it's a credit transaction, add the amount to the wallet balance
      if (transactionData.type === "credit") {
        await this.addToWalletBalance(
          transactionData.walletId,
          parseFloat(transactionData.amount),
        );
      }
      // If it's a debit transaction, subtract the amount from the wallet balance
      else if (transactionData.type === "debit") {
        await this.addToWalletBalance(
          transactionData.walletId,
          -parseFloat(transactionData.amount),
        );
      }
      // For refund transactions, we'd typically handle those separately

      // Broadcast spending update for debit transactions (purchases)
      if (transactionData.type === "debit" && (transactionData.status === "completed" || !transactionData.status)) {
        // Don't await to avoid blocking the transaction
        setTimeout(() => {
          broadcastSpendingUpdate().catch(err => 
            console.error("Error broadcasting spending update:", err)
          );
        }, 100);
      }

      return transaction;
    } catch (error) {
      console.error("Error creating wallet transaction:", error);
      throw error;
    }
  }

  async processStripePayment(sessionId: string) {
    try {
      // Find the transaction
      const transaction = await this.getTransactionByStripeSessionId(sessionId);
      if (!transaction) {
        throw new Error("Transaction not found");
      }

      // If transaction is already completed, don't process it again
      if (transaction.status === "completed") {
        return transaction;
      }

      // Update the transaction status to completed
      return await this.updateTransactionStatus(transaction.id, "completed");
    } catch (error) {
      console.error("Error processing stripe payment:", error);
      throw error;
    }
  }

  async refundTransaction(transactionId: number, reason = "Refund requested") {
    try {
      // Start a transaction
      return await db.transaction(async (tx) => {
        // First get the transaction and wallet info
        const [transaction] = await tx
          .select()
          .from(schema.walletTransactions)
          .where(eq(schema.walletTransactions.id, transactionId));

        if (!transaction) {
          throw new Error("Transaction not found");
        }

        // Get the wallet
        const [wallet] = await tx
          .select()
          .from(schema.wallets)
          .where(eq(schema.wallets.id, transaction.walletId));

        if (!wallet) {
          throw new Error("Wallet not found");
        }

        // Determine if this is a Stripe credit transaction that needs to be refunded
        const isStripeCredit = transaction.type === "credit" && 
                              transaction.status === "completed" && 
                              transaction.stripePaymentIntentId;

        // Determine if this is a purchase transaction (debit) that needs to be refunded
        const isPurchaseDebit = transaction.type === "debit" && 
                               transaction.status === "completed" && 
                               transaction.esimOrderId;
        
        // Get information about the company if available
        let companyInfo = null;
        let companyId = null;
        
        if (wallet.companyId) {
          companyId = wallet.companyId;
          [companyInfo] = await tx
            .select()
            .from(schema.companies)
            .where(eq(schema.companies.id, wallet.companyId));
        }

        // Process refunds differently based on transaction type
        if (isStripeCredit) {
          // For Stripe credit transactions (wallet funding), handle as before
          // Check if wallet has enough balance for the refund
          const currentBalance = parseFloat(wallet.balance);
          const refundAmount = parseFloat(transaction.amount);

          if (currentBalance < refundAmount) {
            throw new Error("Insufficient wallet balance for refund");
          }

          // Update the original transaction status to refunded
          await tx
            .update(schema.walletTransactions)
            .set({ status: "refunded" })
            .where(eq(schema.walletTransactions.id, transactionId));

          // Create a new refund transaction
          const [refundTransaction] = await tx
            .insert(schema.walletTransactions)
            .values({
              walletId: wallet.id,
              amount: transaction.amount,
              type: "refund",
              description: `${reason} (Transaction #${transaction.id})`,
              stripePaymentId: transaction.stripePaymentId,
              stripeSessionId: transaction.stripeSessionId,
              stripePaymentIntentId: transaction.stripePaymentIntentId,
              status: "completed",
              paymentMethod: transaction.paymentMethod, 
              createdAt: new Date(),
            })
            .returning();

          // Update wallet balance
          const newBalance = currentBalance - refundAmount;
          const [updatedWallet] = await tx
            .update(schema.wallets)
            .set({
              balance: newBalance.toFixed(2),
              lastUpdated: new Date(),
            })
            .where(eq(schema.wallets.id, wallet.id))
            .returning();

          return { refundTransaction, updatedWallet };
          
        } else if (isPurchaseDebit && transaction.esimOrderId) {
          // For eSIM purchase transactions, refund through the cancelPurchasedEsim function
          // Find the purchased eSIM
          const [esim] = await tx
            .select()
            .from(schema.purchasedEsims)
            .where(eq(schema.purchasedEsims.orderId, transaction.esimOrderId));
            
          if (!esim) {
            throw new Error(`No eSIM found with order ID ${transaction.esimOrderId}`);
          }
          
          // Instead of implementing the refund logic here, we'll mark the transaction as pending refund
          // and use the cancelPurchasedEsim function to handle the refund
          await tx
            .update(schema.walletTransactions)
            .set({ 
              status: "pending_refund",
              description: `${transaction.description} - Refund requested: ${reason}`
            })
            .where(eq(schema.walletTransactions.id, transactionId));
            
          // Now cancel the eSIM outside the transaction to ensure proper refund processing
          // This will be done asynchronously to avoid nested transactions
          setTimeout(async () => {
            try {
              await this.cancelPurchasedEsim(esim.id);
              console.log(`Successfully processed refund for eSIM ID ${esim.id} (Order ${transaction.esimOrderId})`);
            } catch (error) {
              console.error(`Failed to process refund for eSIM ID ${esim.id}:`, error);
            }
          }, 100);
          
          return { 
            status: "pending",
            message: `Refund initiated for eSIM with order ID ${transaction.esimOrderId}. Please wait while the refund is processed.`
          };
          
        } else {
          throw new Error(`Transaction type ${transaction.type} with status ${transaction.status} cannot be refunded.`);
        }
      });
    } catch (error) {
      console.error("Error processing refund:", error);
      throw error;
    }
  }

  async deleteCompany(
    id: number,
    forceDeletion: boolean = false,
  ): Promise<void> {
    console.log(
      `Starting delete company operation for company ID: ${id}, forceDeletion=${forceDeletion}`,
    );

    try {
      await db.transaction(async (tx) => {
        // Find the company in the companies table by ID
        const [companyInfo] = await tx
          .select()
          .from(schema.companies)
          .where(eq(schema.companies.id, id));

        if (!companyInfo) {
          console.error(`Company with ID ${id} not found in database`);
          throw new Error("Company not found");
        }
        console.log(`Company found: ${companyInfo.name} (ID: ${id})`);

        // Get all employees for this company
        const employees = await tx
          .select()
          .from(schema.employees)
          .where(eq(schema.employees.companyId, id));
        console.log(`Found ${employees.length} employees to delete`);

        // For superadmin operations, we'll always proceed with deletion
        // For normal admin operations, check if any employees have active plans
        // This ensures superadmins can delete any company regardless of active plans
        if (!forceDeletion) {
          const employeesWithActivePlans = employees.filter(
            (employee) => employee.currentPlan !== null,
          );

          if (employeesWithActivePlans.length > 0) {
            throw new Error(
              "Cannot delete company with active employee plans. Please cancel all active plans first or use force deletion option.",
            );
          }
        }

        console.log(
          `Proceeding with company deletion (force=${forceDeletion})`,
        );

        // If we're forcing deletion, we need to handle active employees with plans
        if (forceDeletion) {
          // Log the employees with plans that will be forcefully deleted
          const execsWithPlans = employees.filter(
            (e) => e.currentPlan !== null,
          );
          if (execsWithPlans.length > 0) {
            console.log(
              `Force deleting ${execsWithPlans.length} employees with active plans:`,
            );
            execsWithPlans.forEach((e) => {
              console.log(
                `  - Employee ID ${e.id}, Name: ${e.name}, Plan: ${e.currentPlan}`,
              );
            });
          }
        }

        // Get all users associated with this company
        const users = await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.companyId, id));
        console.log(`Found ${users.length} users to delete`);

        // IMPORTANT: In the actual database, wallets.company_id could reference users.id
        // instead of companies.id as defined in the schema.ts file
        // So we need to handle both possibilities

        // Find wallets directly linked to company
        let companyWallets = await tx
          .select()
          .from(schema.wallets)
          .where(eq(schema.wallets.companyId, id));
        console.log(
          `Found ${companyWallets.length} wallets directly linked to company ID ${id}`,
        );

        // Find all wallets that reference any user of this company
        // Note: This should ONLY look for wallets that belong to THIS specific company
        let userWallets = [];
        if (users.length > 0) {
          // Only look for wallets that are specifically linked to this company
          // Don't look for wallets by user.id as that could affect other companies
          userWallets = []; // Keep empty since we're only handling company-linked wallets
        }
        console.log(
          `Found a total of ${userWallets.length} wallets linked to users of company ${id}`,
        );

        // Combine both sets of wallets
        const allWallets = [...companyWallets, ...userWallets];
        console.log(
          `Combined total of ${allWallets.length} wallets to process`,
        );

        // Delete all related data in the proper order to maintain referential integrity

        // 1. First delete all plan history for all employees (highest dependency)
        for (const employee of employees) {
          try {
            // Delete plan history for this employee first
            const deletedHistory = await tx
              .delete(schema.planHistory)
              .where(eq(schema.planHistory.employeeId, employee.id))
              .returning();
            console.log(
              `Deleted ${deletedHistory.length} plan history records for employee ID ${employee.id}`,
            );
          } catch (historyError) {
            console.error(
              `Error deleting plan history for employee ${employee.id}:`,
              historyError,
            );
            if (forceDeletion) {
              console.log(
                `Continuing with force deletion despite plan history deletion error`,
              );
            } else {
              throw historyError;
            }
          }

          try {
            // Delete purchased eSIMs for this employee
            const deletedEsims = await tx
              .delete(schema.purchasedEsims)
              .where(eq(schema.purchasedEsims.employeeId, employee.id))
              .returning();
            console.log(
              `Deleted ${deletedEsims.length} eSIMs for employee ID ${employee.id}`,
            );
          } catch (esimError) {
            console.error(
              `Error deleting eSIMs for employee ${employee.id}:`,
              esimError,
            );
            if (forceDeletion) {
              console.log(
                `Continuing with force deletion despite eSIM deletion error`,
              );
            } else {
              throw esimError;
            }
          }

          try {
            // Delete data packages for this employee
            const deletedPackages = await tx
              .delete(schema.dataPackages)
              .where(eq(schema.dataPackages.employeeId, employee.id))
              .returning();
            console.log(
              `Deleted ${deletedPackages.length} data packages for employee ID ${employee.id}`,
            );
          } catch (packageError) {
            console.error(
              `Error deleting data packages for employee ${employee.id}:`,
              packageError,
            );
            if (forceDeletion) {
              console.log(
                `Continuing with force deletion despite data package deletion error`,
              );
            } else {
              throw packageError;
            }
          }
        }

        // 2. Delete all wallet transactions for all wallets AND update any reference to company/users in other wallet transactions
        for (const wallet of allWallets) {
          try {
            // We originally thought we needed to update companyId in wallet transactions
            // But there is no such field in the wallet_transactions table
            // Instead, we'll update the transaction descriptions to indicate company deletion

            // Get all transactions linked to wallets that will be deleted
            const allTransactionIds = [];

            // Collect all transactions from these wallets
            for (const wallet of allWallets) {
              const transactions = await tx
                .select()
                .from(schema.walletTransactions)
                .where(eq(schema.walletTransactions.walletId, wallet.id));

              if (transactions.length > 0) {
                allTransactionIds.push(...transactions.map((t) => t.id));
              }
            }

            if (allTransactionIds.length > 0) {
              console.log(
                `Found ${allTransactionIds.length} transactions from wallets of company ${id}`,
              );
            }

            // Now delete transactions for this specific wallet
            const deletedTransactions = await tx
              .delete(schema.walletTransactions)
              .where(eq(schema.walletTransactions.walletId, wallet.id))
              .returning();
            console.log(
              `Deleted ${deletedTransactions.length} transactions for wallet ID ${wallet.id}`,
            );
          } catch (transactionError) {
            console.error(
              `Error handling transactions for wallet ${wallet.id}:`,
              transactionError,
            );
            if (forceDeletion) {
              console.log(
                `Continuing with force deletion despite wallet transaction handling error`,
              );
            } else {
              throw transactionError;
            }
          }
        }

        // 3. Delete all wallets for this company
        for (const wallet of allWallets) {
          try {
            await tx
              .delete(schema.wallets)
              .where(eq(schema.wallets.id, wallet.id))
              .returning();
            console.log(`Deleted wallet ID ${wallet.id}`);
          } catch (walletError) {
            console.error(`Error deleting wallet ${wallet.id}:`, walletError);
            if (forceDeletion) {
              console.log(
                `Continuing with force deletion despite wallet deletion error`,
              );
            } else {
              throw walletError;
            }
          }
        }

        // 4. Delete all employees
        try {
          const deletedEmployees = await tx
            .delete(schema.employees)
            .where(eq(schema.employees.companyId, id))
            .returning();
          console.log(`Deleted ${deletedEmployees.length} employees`);
        } catch (execError) {
          console.error(`Error deleting employees:`, execError);
          if (forceDeletion) {
            console.log(
              `Continuing with force deletion despite employee deletion error`,
            );
          } else {
            throw execError;
          }
        }

        // 5. Delete all subscriptions
        try {
          const deletedSubscriptions = await tx
            .delete(schema.subscriptions)
            .where(eq(schema.subscriptions.companyId, id))
            .returning();
          console.log(`Deleted ${deletedSubscriptions.length} subscriptions`);
        } catch (subError) {
          console.error(`Error deleting subscriptions:`, subError);
          if (forceDeletion) {
            console.log(
              `Continuing with force deletion despite subscription deletion error`,
            );
          } else {
            throw subError;
          }
        }

        // 5.5. Delete company configuration entries
        try {
          const deletedConfigs = await tx
            .delete(schema.companyConfig)
            .where(eq(schema.companyConfig.companyId, id))
            .returning();
          console.log(`Deleted ${deletedConfigs.length} company configuration entries`);
        } catch (configError) {
          console.error(`Error deleting company configurations:`, configError);
          if (forceDeletion) {
            console.log(
              `Continuing with force deletion despite company config deletion error`,
            );
          } else {
            throw configError;
          }
        }

        // 6. Delete all payments
        try {
          const deletedPayments = await tx
            .delete(schema.payments)
            .where(eq(schema.payments.companyId, id))
            .returning();
          console.log(`Deleted ${deletedPayments.length} payments`);
        } catch (payError) {
          console.error(`Error deleting payments:`, payError);
          if (forceDeletion) {
            console.log(
              `Continuing with force deletion despite payment deletion error`,
            );
          } else {
            throw payError;
          }
        }

        // 7. Update user references to null first before deleting the company
        // This prevents foreign key constraint issues
        if (users.length > 0) {
          try {
            const updatedUsers = await tx
              .update(schema.users)
              .set({ companyId: null, isAdmin: false, role: "user" })
              .where(eq(schema.users.companyId, id))
              .returning();
            console.log(
              `Updated company ID to null for ${updatedUsers.length} users`,
            );
          } catch (userUpdateError) {
            console.error(`Error updating users:`, userUpdateError);
            if (forceDeletion) {
              console.log(
                `Continuing with force deletion despite user update error`,
              );
            } else {
              throw userUpdateError;
            }
          }
        }

        // 8. Delete the company record itself
        try {
          const deletedCompany = await tx
            .delete(schema.companies)
            .where(eq(schema.companies.id, id))
            .returning();
          console.log(
            `Successfully deleted company ${companyInfo.name} (ID: ${id})`,
          );
        } catch (companyError) {
          console.error(`Error deleting company:`, companyError);
          throw companyError; // Always throw this error as it's the main operation
        }

        // 9. Finally delete the users if needed (only with force deletion)
        if (forceDeletion && users.length > 0) {
          for (const user of users) {
            try {
              console.log(
                `Cleaning up references to user ID ${user.id} before deletion`,
              );

              // First, clean up any coupon references to this user
              try {
                // Clear both usedBy and createdBy references to this user
                const updatedUsedCoupons = await tx
                  .update(schema.coupons)
                  .set({ usedBy: null })
                  .where(eq(schema.coupons.usedBy, user.id))
                  .returning();
                console.log(`Cleared ${updatedUsedCoupons.length} coupon 'used_by' references for user ${user.id}`);
                
                const updatedCreatedCoupons = await tx
                  .update(schema.coupons)
                  .set({ createdBy: null })
                  .where(eq(schema.coupons.createdBy, user.id))
                  .returning();
                console.log(`Cleared ${updatedCreatedCoupons.length} coupon 'created_by' references for user ${user.id}`);
              } catch (couponError) {
                console.error(`Error clearing coupon references for user ${user.id}:`, couponError);
                throw couponError; // Don't continue if coupon cleanup fails, this causes rollback
              }

              const deletedUser = await tx
                .delete(schema.users)
                .where(eq(schema.users.id, user.id))
                .returning();
              console.log(`Deleted user ID ${user.id}`);
            } catch (userDeleteError) {
              console.error(`Error deleting user ${user.id}:`, userDeleteError);
              console.log(
                `Continuing with force deletion despite user deletion error`,
              );
              // Just log the error but continue with other users in force deletion mode
            }
          }
        }
        console.log("=== TRANSACTION COMPLETION ===");
        console.log("All deletion operations completed within transaction");
        console.log("Transaction about to commit...");
      });

      console.log(
        `Company deletion completed successfully for company ID: ${id}`,
      );
      console.log("Transaction has been committed successfully");
    } catch (error: any) {
      console.error("Error deleting company:", error);
      console.error(
        "Error details:",
        JSON.stringify(
          {
            message: error.message,
            stack: error.stack,
            code: error.code,
            name: error.name,
            sqlState: error.sqlState,
            constraint: error.constraint,
          },
          null,
          2,
        ),
      );

      // Format the error message for better client-side handling
      let errorMessage = "Failed to delete company";

      // Check for specific database constraints or issues
      if (error.message && error.message.includes("foreign key constraint")) {
        console.error("Foreign key constraint violation detected");
        errorMessage =
          "Cannot delete company due to database constraints. There may be records still referencing this company.";
      } else if (
        error.message &&
        error.message.includes("active employee plans")
      ) {
        console.error("Active employee plans detected");
        errorMessage =
          "Cannot delete company with active employee plans. Please cancel all active plans first.";
      } else if (error.message && error.message.includes("Company not found")) {
        console.error("Company not found in database");
        errorMessage = "Company not found";
      } else if (error.message) {
        // Use the original error message if available
        console.error("Using original error message:", error.message);
        errorMessage = error.message;
      }

      // Create a new error with the formatted message
      const formattedError = new Error(errorMessage);

      // Add original error details to the error object for debugging
      (formattedError as any).originalError = error;
      (formattedError as any).sqlState = error.sqlState;
      (formattedError as any).constraint = error.constraint;
      (formattedError as any).stack = error.stack;
      (formattedError as any).code = error.code;

      console.error("Throwing formatted error:", formattedError.message);
      throw formattedError;
    }
  }

  // ----- Server Connection Monitoring Methods -----

  // Utility method to clear all caches related to companies
  async clearCompanyCaches(): Promise<void> {
    try {
      console.log("Clearing all company-related caches...");

      // If there's a cache mechanism, we'd clear it here
      // Since this application doesn't have an explicit caching layer,
      // we'll just log that we would clear the caches

      console.log("Company caches cleared");
      return;
    } catch (error) {
      console.error("Error clearing company caches:", error);
      throw error;
    }
  }

  async logConnectionStatus(log: InsertConnectionLog): Promise<ConnectionLog> {
    try {
      const created = await db
        .insert(schema.connectionLogs)
        .values({
          serviceName: log.serviceName,
          status: log.status,
          timestamp: log.timestamp || new Date(),
          message: log.message || null,
          responseTime: log.responseTime || null,
          metadata: log.metadata || null,
        })
        .returning();

      return created[0];
    } catch (error) {
      console.error(
        `Failed to log connection status for ${log.serviceName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get the Simtree sadmin company ID
   * This is used for recording profit in the admin wallet
   */
  async getSadminCompanyId(): Promise<number | null> {
    try {
      console.log("Looking up Simtree sadmin company ID");

      // First find the sadmin user
      const sadminUsers = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, "sadmin"));

      if (sadminUsers.length === 0) {
        console.warn("No sadmin user found in the system");
        return null;
      }

      const sadminUser = sadminUsers[0];
      if (!sadminUser.companyId) {
        console.warn(
          "The sadmin user exists but is not associated with any company",
        );
        return null;
      }

      console.log(`Found sadmin user with company ID: ${sadminUser.companyId}`);
      return sadminUser.companyId;
    } catch (error) {
      console.error("Error retrieving sadmin company ID:", error);
      return null;
    }
  }

  /**
   * Add profit to the sadmin wallet
   * Used when a company purchases an eSIM, to record the difference between retail price and provider price
   */
  async addProfitToSadminWallet(
    profit: number,
    planName: string,
    employeeName: string,
    companyName: string,
  ): Promise<boolean> {
    try {
      if (profit <= 0) {
        console.log(
          `Skipping profit recording as the amount is not positive: ${profit}`,
        );
        return false;
      }

      // Get the sadmin company ID
      const sadminCompanyId = await this.getSadminCompanyId();
      if (!sadminCompanyId) {
        console.error("Cannot record profit: sadmin company ID not found");
        return false;
      }

      // Check if sadmin has a wallet, create one if not
      let sadminWallet = await this.getWalletsByCompanyId(sadminCompanyId);
      if (!sadminWallet || sadminWallet.length === 0) {
        // Create wallet for sadmin
        console.log(
          `Creating new wallet for sadmin company ID: ${sadminCompanyId}`,
        );
        await this.createWallet(sadminCompanyId);
        sadminWallet = await this.getWalletsByCompanyId(sadminCompanyId);
      }

      if (!sadminWallet || sadminWallet.length === 0) {
        console.error("Failed to create wallet for sadmin");
        return false;
      }

      // Add profit to the wallet
      const profitDescription = `Profit from ${planName} purchase by ${employeeName} (${companyName})`;
      await this.addWalletCredit(sadminCompanyId, profit, profitDescription);

      console.log(
        `Successfully added profit of $${profit.toFixed(2)} to sadmin wallet`,
      );
      return true;
    } catch (error) {
      console.error("Error adding profit to sadmin wallet:", error);
      return false;
    }
  }

  /**
   * Deduct profit from the sadmin wallet when an eSIM is refunded
   * This reverses the profit that was previously added when the eSIM was purchased
   */
  async deductProfitFromSadminWallet(
    profit: number,
    planName: string,
    employeeName: string,
    companyName: string,
  ): Promise<boolean> {
    try {
      if (profit <= 0) {
        console.log(
          `Skipping profit reversal as the amount is not positive: ${profit}`,
        );
        return false;
      }

      // SimTree company ID is always 1
      const simtreeCompanyId = 1;
      
      // Get the SimTree profit wallet specifically
      const simtreeProfitWallet = await this.getWalletByType(simtreeCompanyId, 'profit');
      if (!simtreeProfitWallet) {
        console.error("Cannot reverse profit: SimTree profit wallet not found");
        return false;
      }

      // Deduct profit from the profit wallet specifically
      const profitDescription = `Debit for refund of ${planName} to ${employeeName} (${companyName})`;
      await this.addWalletTransaction(
        simtreeProfitWallet.id,
        Math.abs(profit), // Always store positive amount for debit
        "debit",
        profitDescription,
        { status: "completed" },
      );

      console.log(
        `Successfully reversed profit of $${profit.toFixed(2)} from SimTree profit wallet`,
      );
      return true;
    } catch (error) {
      console.error("Error reversing profit from SimTree profit wallet:", error);
      return false;
    }
  }

  // Get all active eSIMs for usage sync
  async getActiveEsims(): Promise<PurchasedEsim[]> {
    try {
      const activeEsims = await db
        .select()
        .from(schema.purchasedEsims)
        .where(
          and(
            // Include active statuses
            inArray(schema.purchasedEsims.status, [
              'active', 
              'waiting_for_activation', 
              'activated', 
              'onboard'
            ]),
            // Exclude explicitly cancelled ones
            isNotNull(schema.purchasedEsims.employeeId)
          )
        );

      // Filter out eSIMs that are cancelled or refunded in metadata
      return activeEsims.filter(esim => {
        // Check for cancellation flags in metadata
        if (esim.metadata && typeof esim.metadata === 'object') {
          const metadata = esim.metadata as any;
          
          // Check direct cancellation flags
          if (metadata.isCancelled === true || metadata.refunded === true) {
            return false;
          }
          
          // Check rawData for CANCEL status
          if (metadata.rawData) {
            try {
              let parsedData = metadata.rawData;
              if (typeof parsedData === 'string') {
                parsedData = JSON.parse(parsedData);
              }
              if (parsedData.obj?.esimList?.[0]?.esimStatus === 'CANCEL') {
                return false;
              }
            } catch (error) {
              // If parsing fails, ignore and continue
            }
          }
        }
        
        return true;
      });
    } catch (error) {
      console.error("Error getting active eSIMs:", error);
      throw error;
    }
  }

  // Billing system method implementations
  async getCompaniesWithEsimPurchases(startDate: Date, endDate: Date): Promise<Company[]> {
    try {
      const companies = await db
        .selectDistinct({
          id: schema.companies.id,
          name: schema.companies.name,
          contactEmail: schema.companies.contactEmail,
          address: schema.companies.address,
          country: schema.companies.country,
          taxNumber: schema.companies.taxNumber,
          entityType: schema.companies.entityType,
          contactName: schema.companies.contactName,
          contactPhone: schema.companies.contactPhone,
          verified: schema.companies.verified,
          active: schema.companies.active,
          logo: schema.companies.logo,
          website: schema.companies.website,
          industry: schema.companies.industry,
          description: schema.companies.description,
          phoneCountryCode: schema.companies.phoneCountryCode,
          phoneNumber: schema.companies.phoneNumber,
          lastActivityDate: schema.companies.lastActivityDate,
          createdAt: schema.companies.createdAt
        })
        .from(schema.purchasedEsims)
        .leftJoin(schema.employees, eq(schema.purchasedEsims.employeeId, schema.employees.id))
        .leftJoin(schema.companies, eq(schema.employees.companyId, schema.companies.id))
        .where(
          and(
            gte(schema.purchasedEsims.purchaseDate, startDate),
            lt(schema.purchasedEsims.purchaseDate, endDate)
          )
        );

      return companies.filter(company => company.id !== null) as Company[];
    } catch (error) {
      console.error("Error getting companies with eSIM purchases:", error);
      throw error;
    }
  }

  async getUsersByCompanyId(companyId: number): Promise<User[]> {
    try {
      return await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.companyId, companyId));
    } catch (error) {
      console.error("Error getting users by company ID:", error);
      throw error;
    }
  }

  async rebalanceAllWallets(): Promise<{ updated: number; total: number }> {
    console.log('Starting wallet balance recalculation...');
    
    try {
      // First, log all distinct transaction statuses to help debug
      const statusList = await db
        .select({
          status: schema.walletTransactions.status,
          count: sql`COUNT(*)`,
        })
        .from(schema.walletTransactions)
        .groupBy(schema.walletTransactions.status);
      console.log('Transaction statuses in database:', JSON.stringify(statusList));
      
      const wallets = await db.select().from(schema.wallets);
      console.log(`Found ${wallets.length} wallets to check`);
      
      let updatedCount = 0;
      
      for (const wallet of wallets) {
        // Calculate balance based on ALL transactions except explicitly failed ones
        // This includes NULL status, 'completed', 'success', 'succeeded', 'processed', 'pending', etc.
        const [{ calculatedBalance, txCount }] = await db
          .select({
            calculatedBalance: sql`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount::numeric ELSE -amount::numeric END), 0)`,
            txCount: sql`COUNT(*)`,
          })
          .from(schema.walletTransactions)
          .where(and(
            eq(schema.walletTransactions.walletId, wallet.id),
            sql`(${schema.walletTransactions.status} IS NULL OR LOWER(${schema.walletTransactions.status}) NOT IN ('failed', 'cancelled', 'refunded', 'rejected', 'error'))`
          ));
        
        const formattedBalance = parseFloat(calculatedBalance as string).toFixed(2);
        
        console.log(`Wallet ${wallet.id} (${wallet.walletType}): ${txCount} transactions, calculated balance: ${formattedBalance}, current: ${wallet.balance}`);
        
        // Always update the balance
        if (formattedBalance !== wallet.balance) {
          console.log(`Updating wallet ${wallet.id} (${wallet.walletType}) balance from ${wallet.balance} to ${formattedBalance}`);
          
          await db
            .update(schema.wallets)
            .set({
              balance: formattedBalance,
              lastUpdated: new Date(),
            })
            .where(eq(schema.wallets.id, wallet.id));
          
          updatedCount++;
        } else {
          console.log(`Wallet ${wallet.id} (${wallet.walletType}) balance is already correct: ${wallet.balance}`);
        }
      }
      
      console.log(`Wallet balance recalculation complete. Updated ${updatedCount} of ${wallets.length} wallets.`);
      return { updated: updatedCount, total: wallets.length };
    } catch (error) {
      console.error('Error recalculating wallet balances:', error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();
