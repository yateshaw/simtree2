// In-memory storage implementation to allow the application to function without database dependencies
import { IStorage } from "./storage";
import * as schema from "@shared/schema";
import { randomUUID } from "crypto";
import session from "express-session";
import memorystore from "memorystore";

// Create memory store for sessions
const MemoryStore = memorystore(session);

// Define types based on schema
type ServerConnection = typeof schema.serverConnections.$inferSelect;
type ConnectionLog = typeof schema.connectionLogs.$inferSelect;
type InsertServerConnection = Omit<ServerConnection, "id" | "createdAt" | "updatedAt">;
type InsertConnectionLog = Omit<ConnectionLog, "id" | "timestamp">;
type User = typeof schema.users.$inferSelect;
type Company = typeof schema.companies.$inferSelect;
type Employee = typeof schema.employees.$inferSelect;
type EsimProvider = typeof schema.esimProviders.$inferSelect;
type EsimPlan = typeof schema.esimPlans.$inferSelect;
type PurchasedEsim = typeof schema.purchasedEsims.$inferSelect;
type Wallet = typeof schema.wallets.$inferSelect;
type WalletTransaction = typeof schema.walletTransactions.$inferSelect;
type Coupon = typeof schema.coupons.$inferSelect;
type PlanHistory = typeof schema.planHistory.$inferSelect;
type Template = typeof schema.emailTemplates.$inferSelect;

// Type for InsertUser without id and createdAt
type InsertUser = Omit<User, "id" | "createdAt">;
type InsertCompany = Omit<Company, "id" | "createdAt">;
type InsertEmployee = Omit<Employee, "id" | "createdAt">;
type InsertEsimProvider = Omit<EsimProvider, "id" | "createdAt">;
type InsertEsimPlan = Omit<EsimPlan, "id" | "createdAt">;
type InsertPurchasedEsim = Omit<PurchasedEsim, "id" | "createdAt">;
type InsertWallet = Omit<Wallet, "id" | "createdAt">;
type InsertWalletTransaction = Omit<WalletTransaction, "id" | "createdAt">;
type InsertCoupon = Omit<Coupon, "id" | "createdAt">;
type InsertPlanHistory = Omit<PlanHistory, "id" | "createdAt">;
type InsertTemplate = Omit<Template, "id" | "createdAt">;

// Helper function to generate sequential IDs for each entity
const idCounters: Record<string, number> = {};

function getNextId(entityName: string): number {
  if (!idCounters[entityName]) {
    idCounters[entityName] = 1;
  }
  return idCounters[entityName]++;
}

/**
 * MemStorage implements the IStorage interface using in-memory data structures
 */
export class MemStorage implements IStorage {
  readonly sessionStore: session.Store;
  
  // In-memory storage containers
  private serverConnections: ServerConnection[] = [];
  private connectionLogs: ConnectionLog[] = [];
  private users: User[] = [];
  private companies: Company[] = [];
  private employees: Employee[] = [];
  private esimProviders: EsimProvider[] = [];
  private esimPlans: EsimPlan[] = [];
  private purchasedEsims: PurchasedEsim[] = [];
  private wallets: Wallet[] = [];
  private walletTransactions: WalletTransaction[] = [];
  private coupons: Coupon[] = [];
  private planHistory: PlanHistory[] = [];
  private stripeSessionMap: Record<string, {
    transactionId: number;
    companyId: number;
    amount: number;
    description?: string;
  }> = {};
  private emailTemplates: Template[] = [];
  
  constructor() {
    console.log("[MemStorage] Initializing in-memory storage");
    // Create the session store
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
    
    // Initialize with a default super admin user and company
    this.initializeDefaults();
  }
  
  private initializeDefaults() {
    // Create default Simtree company
    const simtreeCompany: Company = {
      id: getNextId('company'),
      name: 'Simtree',
      taxNumber: 'SIMTREE-TAX-1234',
      address: '123 Corporate Drive',
      country: 'Global',
      entityType: 'Corporation',
      contactName: 'System Administrator',
      phoneCountryCode: null,
      phoneNumber: null,
      contactPhone: '+1-555-SIMTREE',
      contactEmail: 'superadmin@esimplatform.com',
      verified: true,
      active: true,
      logo: null,
      website: 'https://simtree.global',
      industry: 'Telecommunications',
      description: 'System administrator company',
      createdAt: new Date()
    };
    this.companies.push(simtreeCompany);
    
    // Create default super admin user
    const sadminUser: User = {
      id: getNextId('user'),
      username: 'sadmin',
      email: 'sadmin@example.com',
      password: 'b14361404c078ffd549c03db443c3fede2f3e534d73f78f77301ed97d4a436a9.fd8111a15796f1f251c0fee11160ae547caa902ce95b35970f1ca0520362242e', // password is "password"
      isAdmin: true,
      isSuperAdmin: true,
      companyId: simtreeCompany.id,
      isVerified: true,
      verificationToken: null,
      verificationTokenExpiry: null,
      createdAt: new Date(),
      role: 'superadmin'
    };
    this.users.push(sadminUser);
    
    // Create wallet for the company
    const wallet: Wallet = {
      id: getNextId('wallet'),
      companyId: simtreeCompany.id,
      balance: 1000, // Starting with some balance
      currency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.wallets.push(wallet);
    
    console.log("[MemStorage] Initialized default company and admin user");
  }
  
  // Server Connection Methods
  async getServerConnections(): Promise<ServerConnection[]> {
    return this.serverConnections;
  }
  
  async getServerConnectionByName(serviceName: string): Promise<ServerConnection | undefined> {
    return this.serverConnections.find(conn => conn.serviceName === serviceName);
  }
  
  async createServerConnection(connection: InsertServerConnection): Promise<ServerConnection> {
    const now = new Date();
    const newConnection: ServerConnection = {
      id: getNextId('serverConnection'),
      ...connection,
      createdAt: now,
      updatedAt: now
    };
    this.serverConnections.push(newConnection);
    return newConnection;
  }
  
  async updateServerConnection(id: number, data: Partial<ServerConnection>): Promise<ServerConnection> {
    const connectionIndex = this.serverConnections.findIndex(conn => conn.id === id);
    if (connectionIndex === -1) {
      throw new Error(`Server connection with id ${id} not found`);
    }
    
    const updatedConnection = {
      ...this.serverConnections[connectionIndex],
      ...data,
      updatedAt: new Date()
    };
    
    this.serverConnections[connectionIndex] = updatedConnection;
    return updatedConnection;
  }
  
  async deleteServerConnection(id: number): Promise<void> {
    const connectionIndex = this.serverConnections.findIndex(conn => conn.id === id);
    if (connectionIndex !== -1) {
      this.serverConnections.splice(connectionIndex, 1);
    }
  }
  
  // Connection Logs Methods
  async getConnectionLogs(limit?: number): Promise<ConnectionLog[]> {
    let logs = [...this.connectionLogs].sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
    
    if (limit) {
      logs = logs.slice(0, limit);
    }
    
    return logs;
  }
  
  async getConnectionLogsByService(serviceName: string, limit?: number): Promise<ConnectionLog[]> {
    let logs = this.connectionLogs
      .filter(log => log.serviceName === serviceName)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
    if (limit) {
      logs = logs.slice(0, limit);
    }
    
    return logs;
  }
  
  async createConnectionLog(log: InsertConnectionLog): Promise<ConnectionLog> {
    const newLog: ConnectionLog = {
      id: getNextId('connectionLog'),
      ...log,
      timestamp: new Date()
    };
    
    this.connectionLogs.push(newLog);
    return newLog;
  }
  
  async deleteConnectionLogs(olderThan?: Date): Promise<number> {
    const initialCount = this.connectionLogs.length;
    
    if (olderThan) {
      this.connectionLogs = this.connectionLogs.filter(
        log => log.timestamp >= olderThan
      );
    } else {
      this.connectionLogs = [];
    }
    
    return initialCount - this.connectionLogs.length;
  }
  
  // Coupon Methods
  async createCoupon(couponData: InsertCoupon): Promise<Coupon> {
    const newCoupon: Coupon = {
      id: getNextId('coupon'),
      ...couponData,
      createdAt: new Date()
    };
    
    this.coupons.push(newCoupon);
    return newCoupon;
  }
  
  async getCoupon(id: number): Promise<Coupon | undefined> {
    return this.coupons.find(coupon => coupon.id === id);
  }
  
  async getCouponByCode(code: string): Promise<Coupon | undefined> {
    return this.coupons.find(coupon => coupon.code === code);
  }
  
  async getCompanyCoupons(companyId: number): Promise<Coupon[]> {
    return this.coupons.filter(coupon => coupon.companyId === companyId);
  }
  
  async getAllCoupons(): Promise<Coupon[]> {
    return this.coupons;
  }
  
  async updateCoupon(id: number, data: Partial<Coupon>): Promise<Coupon> {
    const couponIndex = this.coupons.findIndex(coupon => coupon.id === id);
    if (couponIndex === -1) {
      throw new Error(`Coupon with id ${id} not found`);
    }
    
    const updatedCoupon = {
      ...this.coupons[couponIndex],
      ...data
    };
    
    this.coupons[couponIndex] = updatedCoupon;
    return updatedCoupon;
  }
  
  async deleteCoupon(id: number): Promise<void> {
    const couponIndex = this.coupons.findIndex(coupon => coupon.id === id);
    if (couponIndex !== -1) {
      this.coupons.splice(couponIndex, 1);
    }
  }
  
  async redeemCoupon(code: string, userId: number): Promise<{ success: boolean, wallet?: any, coupon?: Coupon, error?: string }> {
    const coupon = await this.getCouponByCode(code);
    if (!coupon) {
      return { success: false, error: "Coupon not found" };
    }
    
    if (coupon.isRedeemed) {
      return { success: false, error: "Coupon already redeemed" };
    }
    
    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
      return { success: false, error: "Coupon has expired" };
    }
    
    // Get user and their company
    const user = this.users.find(u => u.id === userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }
    
    if (!user.companyId) {
      return { success: false, error: "User is not associated with a company" };
    }
    
    // Find wallet for the company
    const wallet = await this.getWallet(user.companyId);
    if (!wallet) {
      return { success: false, error: "Wallet not found" };
    }
    
    // Update wallet balance
    const updatedWallet = await this.updateWalletBalance(
      wallet.id,
      wallet.balance + coupon.amount,
      "Coupon redemption: " + coupon.code
    );
    
    // Mark coupon as redeemed
    await this.markCouponAsUsed(coupon.id, userId);
    
    return {
      success: true,
      wallet: updatedWallet,
      coupon: coupon
    };
  }
  
  async markCouponAsUsed(id: number, userId: number): Promise<Coupon> {
    const couponIndex = this.coupons.findIndex(coupon => coupon.id === id);
    if (couponIndex === -1) {
      throw new Error(`Coupon with id ${id} not found`);
    }
    
    const updatedCoupon = {
      ...this.coupons[couponIndex],
      isRedeemed: true,
      redeemedBy: userId,
      redeemedAt: new Date()
    };
    
    this.coupons[couponIndex] = updatedCoupon;
    return updatedCoupon;
  }
  
  // User Methods
  async getUserById(id: number): Promise<User | undefined> {
    return this.users.find(user => user.id === id);
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(user => user.username === username);
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.users.find(user => user.email === email);
  }
  
  async createUser(userData: InsertUser): Promise<User> {
    const newUser: User = {
      id: getNextId('user'),
      ...userData,
      createdAt: new Date(),
      role: userData.isSuperAdmin ? 'superadmin' : (userData.isAdmin ? 'admin' : 'company')
    };
    
    this.users.push(newUser);
    return newUser;
  }
  
  async updateUser(id: number, data: Partial<User>): Promise<User> {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      throw new Error(`User with id ${id} not found`);
    }
    
    const updatedUser = {
      ...this.users[userIndex],
      ...data,
      role: data.isSuperAdmin ? 'superadmin' : (data.isAdmin ? 'admin' : 'company')
    };
    
    this.users[userIndex] = updatedUser;
    return updatedUser;
  }
  
  async deleteUser(id: number): Promise<void> {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex !== -1) {
      this.users.splice(userIndex, 1);
    }
  }
  
  // Company Methods
  async getCompanyById(id: number): Promise<Company | undefined> {
    return this.companies.find(company => company.id === id);
  }
  
  async createCompany(companyData: InsertCompany): Promise<Company> {
    const newCompany: Company = {
      id: getNextId('company'),
      ...companyData,
      createdAt: new Date()
    };
    
    this.companies.push(newCompany);
    
    // Create a wallet for the new company
    await this.createWallet(newCompany.id);
    
    return newCompany;
  }
  
  async updateCompany(id: number, data: Partial<Company>): Promise<Company> {
    const companyIndex = this.companies.findIndex(company => company.id === id);
    if (companyIndex === -1) {
      throw new Error(`Company with id ${id} not found`);
    }
    
    const updatedCompany = {
      ...this.companies[companyIndex],
      ...data
    };
    
    this.companies[companyIndex] = updatedCompany;
    return updatedCompany;
  }
  
  async deleteCompany(id: number, forceDeletion?: boolean): Promise<void> {
    // Check if company has employees and prevent deletion if not forced
    const hasEmployees = this.employees.some(exec => exec.companyId === id);
    if (hasEmployees && !forceDeletion) {
      throw new Error("Company has employees. Use force option to delete anyway.");
    }
    
    // Delete associated data
    this.employees = this.employees.filter(exec => exec.companyId !== id);
    this.wallets = this.wallets.filter(wallet => wallet.companyId !== id);
    this.walletTransactions = this.walletTransactions.filter(tx => {
      const wallet = this.wallets.find(w => w.id === tx.walletId);
      return !wallet || wallet.companyId !== id;
    });
    
    // Finally delete the company
    const companyIndex = this.companies.findIndex(company => company.id === id);
    if (companyIndex !== -1) {
      this.companies.splice(companyIndex, 1);
    }
  }
  
  // Employee Methods
  async getEmployeeById(id: number): Promise<Employee | undefined> {
    return this.employees.find(exec => exec.id === id);
  }
  
  async getEmployeesByCompany(companyId: number): Promise<Employee[]> {
    return this.employees.filter(exec => exec.companyId === companyId);
  }
  
  async createEmployee(employeeData: InsertEmployee): Promise<Employee> {
    const newEmployee: Employee = {
      id: getNextId('employee'),
      ...employeeData,
      createdAt: new Date()
    };
    
    this.employees.push(newEmployee);
    return newEmployee;
  }
  
  async updateEmployee(id: number, data: Partial<Employee>): Promise<Employee> {
    const execIndex = this.employees.findIndex(exec => exec.id === id);
    if (execIndex === -1) {
      throw new Error(`Employee with id ${id} not found`);
    }
    
    const updatedExec = {
      ...this.employees[execIndex],
      ...data
    };
    
    this.employees[execIndex] = updatedExec;
    return updatedExec;
  }
  
  async deleteEmployee(id: number): Promise<void> {
    // First delete any purchased eSIMs for this employee
    this.purchasedEsims = this.purchasedEsims.filter(esim => esim.employeeId !== id);
    
    // Delete plan history for this employee
    this.planHistory = this.planHistory.filter(history => history.employeeId !== id);
    
    // Then delete the employee
    const execIndex = this.employees.findIndex(exec => exec.id === id);
    if (execIndex !== -1) {
      this.employees.splice(execIndex, 1);
    }
  }
  
  // eSIM Provider Methods
  async getEsimProviders(): Promise<EsimProvider[]> {
    return this.esimProviders;
  }
  
  async getEsimProviderById(id: number): Promise<EsimProvider | undefined> {
    return this.esimProviders.find(provider => provider.id === id);
  }
  
  async createEsimProvider(providerData: InsertEsimProvider): Promise<EsimProvider> {
    const newProvider: EsimProvider = {
      id: getNextId('esimProvider'),
      ...providerData,
      createdAt: new Date()
    };
    
    this.esimProviders.push(newProvider);
    return newProvider;
  }
  
  async updateEsimProvider(id: number, data: Partial<EsimProvider>): Promise<EsimProvider> {
    const providerIndex = this.esimProviders.findIndex(provider => provider.id === id);
    if (providerIndex === -1) {
      throw new Error(`eSIM provider with id ${id} not found`);
    }
    
    const updatedProvider = {
      ...this.esimProviders[providerIndex],
      ...data
    };
    
    this.esimProviders[providerIndex] = updatedProvider;
    return updatedProvider;
  }
  
  async deleteEsimProvider(id: number): Promise<void> {
    // Check if there are plans using this provider
    const hasPlans = this.esimPlans.some(plan => plan.providerId === id.toString());
    if (hasPlans) {
      throw new Error("Cannot delete provider: There are plans using this provider");
    }
    
    const providerIndex = this.esimProviders.findIndex(provider => provider.id === id);
    if (providerIndex !== -1) {
      this.esimProviders.splice(providerIndex, 1);
    }
  }
  
  // eSIM Plan Methods
  async getEsimPlans(): Promise<EsimPlan[]> {
    return this.esimPlans.filter(plan => plan.isActive === true);
  }
  
  async getAllEsimPlans(): Promise<EsimPlan[]> {
    return this.esimPlans;
  }
  
  async getEsimPlanById(id: number): Promise<EsimPlan | undefined> {
    return this.esimPlans.find(plan => plan.id === id);
  }
  
  async getEsimPlanByProviderId(providerId: string): Promise<EsimPlan | undefined> {
    return this.esimPlans.find(plan => plan.providerId === providerId);
  }
  
  async createEsimPlan(planData: InsertEsimPlan): Promise<EsimPlan> {
    const newPlan: EsimPlan = {
      id: getNextId('esimPlan'),
      ...planData,
      createdAt: new Date()
    };
    
    this.esimPlans.push(newPlan);
    return newPlan;
  }
  
  async updateEsimPlan(id: number, data: Partial<EsimPlan>): Promise<EsimPlan> {
    const planIndex = this.esimPlans.findIndex(plan => plan.id === id);
    if (planIndex === -1) {
      throw new Error(`eSIM plan with id ${id} not found`);
    }
    
    const updatedPlan = {
      ...this.esimPlans[planIndex],
      ...data
    };
    
    this.esimPlans[planIndex] = updatedPlan;
    return updatedPlan;
  }
  
  async deleteEsimPlan(id: number): Promise<void> {
    // Check if there are purchased eSIMs with this plan
    const hasPurchases = this.purchasedEsims.some(esim => esim.planId === id);
    if (hasPurchases) {
      // Mark as inactive instead of deleting
      await this.updateEsimPlan(id, { isActive: false });
      return;
    }
    
    const planIndex = this.esimPlans.findIndex(plan => plan.id === id);
    if (planIndex !== -1) {
      this.esimPlans.splice(planIndex, 1);
    }
  }
  
  // Purchased eSIM Methods
  async getPurchasedEsims(): Promise<PurchasedEsim[]> {
    return this.purchasedEsims;
  }
  
  async getPurchasedEsimById(id: number): Promise<PurchasedEsim | undefined> {
    return this.purchasedEsims.find(esim => esim.id === id);
  }
  
  async getPurchasedEsimsByEmployee(employeeId: number): Promise<PurchasedEsim[]> {
    return this.purchasedEsims.filter(esim => esim.employeeId === employeeId);
  }
  
  async getPurchasedEsimsByCompany(companyId: number): Promise<PurchasedEsim[]> {
    const companyEmployees = this.employees.filter(exec => exec.companyId === companyId);
    const employeeIds = companyEmployees.map(exec => exec.id);
    
    return this.purchasedEsims.filter(esim => 
      employeeIds.includes(esim.employeeId || 0)
    );
  }
  
  async createPurchasedEsim(esimData: InsertPurchasedEsim): Promise<PurchasedEsim> {
    // In a real system, this would initiate an API call to the eSIM provider
    // Here we'll just simulate it
    
    const newEsim: PurchasedEsim = {
      id: getNextId('purchasedEsim'),
      ...esimData,
      esimIdentifier: randomUUID().substring(0, 10),
      qrCodeData: `data:image/png;base64,${Buffer.from(randomUUID()).toString('base64')}`,
      status: "active",
      createdAt: new Date()
    };
    
    this.purchasedEsims.push(newEsim);
    
    // Add to plan history if employee is specified
    if (newEsim.employeeId) {
      const plan = this.esimPlans.find(p => p.id === newEsim.planId);
      
      if (plan) {
        this.addPlanHistory({
          employeeId: newEsim.employeeId,
          planId: plan.id,
          providerId: plan.providerId,
          planName: plan.name,
          planData: JSON.stringify(plan),
          startDate: new Date(),
          endDate: null, // Will be calculated based on plan duration
          dataUsed: "0",
          status: "active"
        });
      }
    }
    
    return newEsim;
  }
  
  async updatePurchasedEsim(id: number, data: Partial<PurchasedEsim>): Promise<PurchasedEsim> {
    const esimIndex = this.purchasedEsims.findIndex(esim => esim.id === id);
    if (esimIndex === -1) {
      throw new Error(`Purchased eSIM with id ${id} not found`);
    }
    
    const updatedEsim = {
      ...this.purchasedEsims[esimIndex],
      ...data
    };
    
    this.purchasedEsims[esimIndex] = updatedEsim;
    
    // Update plan history if status is changed to cancelled
    if (data.status === "cancelled" && this.purchasedEsims[esimIndex].employeeId) {
      const historyEntries = this.planHistory.filter(
        h => h.employeeId === this.purchasedEsims[esimIndex].employeeId &&
             h.planId === this.purchasedEsims[esimIndex].planId &&
             h.status === "active"
      );
      
      for (const entry of historyEntries) {
        const historyIndex = this.planHistory.findIndex(h => h.id === entry.id);
        if (historyIndex !== -1) {
          this.planHistory[historyIndex] = {
            ...this.planHistory[historyIndex],
            status: "cancelled",
            endDate: new Date()
          };
        }
      }
    }
    
    return updatedEsim;
  }
  
  async cancelPurchasedEsim(id: number): Promise<PurchasedEsim | null> {
    const esim = await this.getPurchasedEsimById(id);
    if (!esim) {
      return null;
    }
    
    if (esim.status === "cancelled") {
      return esim; // Already cancelled
    }
    
    const updatedEsim = await this.updatePurchasedEsim(id, {
      status: "cancelled",
      isCancelled: true
    });
    
    return updatedEsim;
  }
  
  // Wallet Methods
  async getWallet(companyId: number): Promise<Wallet | undefined> {
    return this.wallets.find(wallet => wallet.companyId === companyId);
  }
  
  async getWalletById(id: number): Promise<Wallet | undefined> {
    return this.wallets.find(wallet => wallet.id === id);
  }
  
  async getAllWallets(): Promise<Wallet[]> {
    return this.wallets;
  }
  
  async createWallet(companyId: number): Promise<Wallet> {
    // Check if wallet already exists
    const existingWallet = await this.getWallet(companyId);
    if (existingWallet) {
      return existingWallet;
    }
    
    const newWallet: Wallet = {
      id: getNextId('wallet'),
      companyId,
      balance: 0,
      currency: "USD",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.wallets.push(newWallet);
    return newWallet;
  }
  
  async updateWalletBalance(walletId: number, newBalance: number, description?: string): Promise<Wallet> {
    const walletIndex = this.wallets.findIndex(wallet => wallet.id === walletId);
    if (walletIndex === -1) {
      throw new Error(`Wallet with id ${walletId} not found`);
    }
    
    const oldBalance = this.wallets[walletIndex].balance;
    const updatedWallet = {
      ...this.wallets[walletIndex],
      balance: newBalance,
      updatedAt: new Date()
    };
    
    this.wallets[walletIndex] = updatedWallet;
    
    // Record transaction
    const amount = newBalance - oldBalance;
    if (amount !== 0) {
      await this.createWalletTransaction({
        walletId,
        amount,
        type: amount > 0 ? "deposit" : "withdrawal",
        description: description || (amount > 0 ? "Deposit" : "Withdrawal"),
        status: "completed"
      });
    }
    
    return updatedWallet;
  }
  
  async deductWalletBalance(companyId: number, amount: number, description: string): Promise<any> {
    const wallet = await this.getWallet(companyId);
    if (!wallet) {
      throw new Error(`Wallet for company ${companyId} not found`);
    }
    
    if (wallet.balance < amount) {
      throw new Error(`Insufficient funds. Required: ${amount}, Available: ${wallet.balance}`);
    }
    
    return this.updateWalletBalance(wallet.id, wallet.balance - amount, description);
  }
  
  async createMissingWallets(): Promise<number> {
    let created = 0;
    
    for (const company of this.companies) {
      const wallet = await this.getWallet(company.id);
      if (!wallet) {
        await this.createWallet(company.id);
        created++;
      }
    }
    
    return created;
  }
  
  // Wallet Transaction Methods
  async createWalletTransaction(txData: InsertWalletTransaction): Promise<WalletTransaction> {
    const newTx: WalletTransaction = {
      id: getNextId('walletTransaction'),
      ...txData,
      createdAt: new Date()
    };
    
    this.walletTransactions.push(newTx);
    return newTx;
  }
  
  async getWalletTransactionsByWallet(walletId: number): Promise<WalletTransaction[]> {
    return this.walletTransactions
      .filter(tx => tx.walletId === walletId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async getWalletTransactionsByCompany(companyId: number): Promise<any> {
    const wallet = await this.getWallet(companyId);
    if (!wallet) {
      return [];
    }
    
    return this.getWalletTransactionsByWallet(wallet.id);
  }
  
  async getAllWalletTransactions(): Promise<any> {
    return this.walletTransactions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  // Plan History Methods
  async getPlanHistory(employeeId: number): Promise<PlanHistory[]> {
    return this.planHistory
      .filter(history => history.employeeId === employeeId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async addPlanHistory(historyData: Omit<PlanHistory, "id">): Promise<PlanHistory> {
    const newHistory: PlanHistory = {
      id: getNextId('planHistory'),
      ...historyData,
      createdAt: new Date()
    };
    
    this.planHistory.push(newHistory);
    return newHistory;
  }
  
  // Email Templates
  async getTemplates(): Promise<Template[]> {
    return this.emailTemplates;
  }
  
  async getTemplateById(id: number): Promise<Template | undefined> {
    return this.emailTemplates.find(template => template.id === id);
  }
  
  async getTemplateByType(type: string): Promise<Template | undefined> {
    return this.emailTemplates.find(template => template.type === type);
  }
  
  async createTemplate(templateData: InsertTemplate): Promise<Template> {
    const newTemplate: Template = {
      id: getNextId('template'),
      ...templateData,
      createdAt: new Date()
    };
    
    this.emailTemplates.push(newTemplate);
    return newTemplate;
  }
  
  async updateTemplate(id: number, data: Partial<Template>): Promise<Template> {
    const templateIndex = this.emailTemplates.findIndex(template => template.id === id);
    if (templateIndex === -1) {
      throw new Error(`Template with id ${id} not found`);
    }
    
    const updatedTemplate = {
      ...this.emailTemplates[templateIndex],
      ...data
    };
    
    this.emailTemplates[templateIndex] = updatedTemplate;
    return updatedTemplate;
  }
  
  async deleteTemplate(id: number): Promise<void> {
    const templateIndex = this.emailTemplates.findIndex(template => template.id === id);
    if (templateIndex !== -1) {
      this.emailTemplates.splice(templateIndex, 1);
    }
  }
  
  // Stripe payment methods
  async createStripeCheckoutSession(
    companyId: number,
    amount: number,
    description?: string
  ): Promise<{ sessionId: string; transactionId: number }> {
    // Create a unique session ID
    const sessionId = `sim_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // Create a pending transaction
    const walletId = (await this.getWallet(companyId))?.id;
    if (!walletId) {
      throw new Error(`No wallet found for company ${companyId}`);
    }
    
    const transaction = await this.createWalletTransaction({
      walletId,
      amount,
      type: "deposit",
      description: description || "Stripe payment",
      status: "pending",
      stripeSessionId: sessionId
    });
    
    // Store the mapping of session to transaction
    this.stripeSessionMap[sessionId] = {
      transactionId: transaction.id,
      companyId,
      amount,
      description
    };
    
    return {
      sessionId,
      transactionId: transaction.id
    };
  }
  
  async updateTransactionStatus(
    transactionId: number,
    status: string,
    stripeData?: {
      stripePaymentId?: string;
      stripePaymentIntentId?: string;
      paymentMethod?: string;
    }
  ): Promise<any> {
    const txIndex = this.walletTransactions.findIndex(tx => tx.id === transactionId);
    if (txIndex === -1) {
      throw new Error(`Transaction with id ${transactionId} not found`);
    }
    
    const updatedTx = {
      ...this.walletTransactions[txIndex],
      status,
      ...stripeData
    };
    
    this.walletTransactions[txIndex] = updatedTx;
    
    // If status is completed, update wallet balance
    if (status === "completed" && updatedTx.type === "deposit") {
      const wallet = await this.getWalletById(updatedTx.walletId);
      if (wallet) {
        await this.updateWalletBalance(
          wallet.id,
          wallet.balance + updatedTx.amount,
          "Payment completed: " + (updatedTx.description || "")
        );
      }
    }
    
    return updatedTx;
  }
  
  async getTransactionByStripeSessionId(sessionId: string): Promise<any> {
    return this.walletTransactions.find(tx => tx.stripeSessionId === sessionId);
  }
  
  async processStripePayment(sessionId: string): Promise<any> {
    const sessionData = this.stripeSessionMap[sessionId];
    if (!sessionData) {
      throw new Error(`No session data found for session ${sessionId}`);
    }
    
    // Update transaction status to completed
    const updatedTx = await this.updateTransactionStatus(
      sessionData.transactionId,
      "completed",
      {
        stripePaymentId: `pi_${Date.now()}`,
        stripePaymentIntentId: `pi_${Date.now()}`,
        paymentMethod: "card"
      }
    );
    
    return updatedTx;
  }
  
  async refundTransaction(transactionId: number, reason?: string): Promise<any> {
    const tx = this.walletTransactions.find(t => t.id === transactionId);
    if (!tx) {
      throw new Error(`Transaction with id ${transactionId} not found`);
    }
    
    if (tx.status !== "completed") {
      throw new Error(`Cannot refund transaction: Status is ${tx.status}`);
    }
    
    // Create a new refund transaction
    const refundTx = await this.createWalletTransaction({
      walletId: tx.walletId,
      amount: -tx.amount, // Negative amount for refund
      type: "refund",
      description: `Refund: ${reason || "Customer request"}`,
      status: "completed",
      relatedTransactionId: tx.id
    });
    
    // Update original transaction
    const txIndex = this.walletTransactions.findIndex(t => t.id === transactionId);
    this.walletTransactions[txIndex] = {
      ...tx,
      isRefunded: true,
      refundReason: reason
    };
    
    // Update wallet balance
    const wallet = await this.getWalletById(tx.walletId);
    if (wallet && wallet.balance >= tx.amount) {
      await this.updateWalletBalance(wallet.id, wallet.balance - tx.amount, "Refund");
    }
    
    return {
      originalTransaction: this.walletTransactions[txIndex],
      refundTransaction: refundTx
    };
  }
}