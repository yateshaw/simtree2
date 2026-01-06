import { pgTable, text, serial, integer, boolean, date, decimal, timestamp, primaryKey, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Server and API connection monitoring
export const serverConnections = pgTable("server_connections", {
  id: serial("id").primaryKey(),
  serviceName: text("service_name").notNull(),
  status: text("status").notNull(),
  responseTime: integer("response_time"),
  lastChecked: timestamp("last_checked").notNull().defaultNow(),
  message: text("message"),
  metadata: jsonb("metadata"),
});

export const connectionLogs = pgTable("connection_logs", {
  id: serial("id").primaryKey(),
  serviceName: text("service_name").notNull(),
  status: text("status").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  message: text("message"),
  responseTime: integer("response_time"),
  metadata: jsonb("metadata"),
});

// System configuration table for dynamic settings
export const systemConfig = pgTable("system_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  category: text("category").notNull(), // 'email', 'currency', 'business', 'server'
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Contact form counter for sequential numbering
export const contactCounter = pgTable("contact_counter", {
  id: serial("id").primaryKey(),
  currentNumber: integer("current_number").notNull().default(0),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

// Company-specific configuration table
export const companyConfig = pgTable("company_config", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  key: text("key").notNull(),
  value: text("value").notNull(),
  category: text("category").notNull(), // 'currency', 'wallets', 'business'
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => {
  return {
    companyKeyIdx: uniqueIndex("company_config_company_key_idx").on(table.companyId, table.key)
  };
});

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  taxNumber: text("tax_number").unique(),
  address: text("address"),
  country: text("country"),
  currency: text("currency").default("USD"), // Direct currency selection, independent of country
  entityType: text("entity_type"),
  contactName: text("contact_name"),
  phoneCountryCode: text("phone_country_code"),
  phoneNumber: text("phone_number"),
  contactPhone: text("contact_phone"), // Keeping for backward compatibility
  contactEmail: text("contact_email"),
  verified: boolean("verified").notNull().default(false),
  active: boolean("active").notNull().default(true),
  logo: text("logo"),
  website: text("website"),
  industry: text("industry"),
  description: text("description"),
  lastActivityDate: timestamp("last_activity_date").notNull().defaultNow(), // Track when the company was last active
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable(
  "users", 
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    email: text("email").notNull(), // Not globally unique, only unique per company
    password: text("password").notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    companyId: integer("company_id").references(() => companies.id),
    isVerified: boolean("is_verified").notNull().default(false),
    verificationToken: text("verification_token"),
    verificationTokenExpiry: timestamp("verification_token_expiry", { mode: 'string' }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      // Create composite unique constraint to make emails unique within a company
      // but allow the same email across different companies
      emailCompanyIdx: uniqueIndex("users_email_company_idx").on(table.email, table.companyId)
    };
  }
);

export const employees = pgTable("executives", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phoneNumber: text("phone_number").notNull(),
  position: text("position").notNull(),
  // currentPlan field removed - plan information now derived from purchased_esims table
  dataUsage: decimal("data_usage", { precision: 10, scale: 2 }).notNull().default("0"),
  dataLimit: decimal("data_limit", { precision: 10, scale: 2 }).notNull().default("0"),
  planStartDate: timestamp("plan_start_date", { mode: 'string' }),
  planEndDate: timestamp("plan_end_date", { mode: 'string' }),
  planValidity: integer("plan_validity"),
  autoRenewEnabled: boolean("auto_renew_enabled").notNull().default(false),
});

export const dataPackages = pgTable("data_packages", {
  id: serial("id").primaryKey(),
  employeeId: integer("executive_id").references(() => employees.id),
  gb: decimal("gb", { precision: 10, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  purchaseDate: date("purchase_date").notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  plan: text("plan").notNull(),
  status: text("status").notNull().default("active"),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull(),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  paymentMethod: text("payment_method"),
});

export const esimPlans = pgTable("esim_plans", {
  id: serial("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  data: decimal("data", { precision: 10, scale: 2 }).notNull(),
  validity: integer("validity").notNull(),
  providerPrice: decimal("provider_price", { precision: 10, scale: 2 }).notNull(),
  sellingPrice: decimal("selling_price", { precision: 10, scale: 2 }).notNull(),
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }).notNull(),
  margin: decimal("margin", { precision: 10, scale: 2 }).notNull().default("100"),
  countries: text("countries").array(),
  speed: text("speed"),
  isActive: boolean("is_active").notNull().default(true),
});

export const purchasedEsims = pgTable("purchased_esims", {
  id: serial("id").primaryKey(),
  employeeId: integer("executive_id").references(() => employees.id),
  planId: integer("plan_id").references(() => esimPlans.id),
  orderId: text("order_id").notNull(),
  iccid: text("iccid").notNull(),
  activationCode: text("activation_code"),
  qrCode: text("qr_code"),
  status: text("status").notNull(),
  purchaseDate: timestamp("purchase_date").notNull().defaultNow(),
  activationDate: timestamp("activation_date"),
  expiryDate: timestamp("expiry_date"),
  dataUsed: decimal("data_used", { precision: 10, scale: 2 }).default("0"),
  metadata: jsonb("metadata"),
  invoicedAt: timestamp("invoiced_at"),
  billId: integer("bill_id").references(() => bills.id),
  autoRenewEnabled: boolean("auto_renew_enabled").notNull().default(false),
  cancelledAt: timestamp("cancelled_at"),
  creditNoteId: integer("credit_note_id"),
});

export const planHistory = pgTable("plan_history", {
  id: serial("id").primaryKey(),
  employeeId: integer("executive_id").references(() => employees.id),
  planName: text("plan_name").notNull(),
  planData: decimal("plan_data", { precision: 10, scale: 2 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  dataUsed: decimal("data_used", { precision: 10, scale: 2 }).default("0"),
  status: text("status").notNull(),
  providerId: text("provider_id").notNull(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  employees: many(employees), 
  subscriptions: many(subscriptions),
  payments: many(payments),
  wallets: many(wallets)
}));

export const usersRelations = relations(users, ({ one }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id]
  })
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  company: one(companies, {
    fields: [employees.companyId],
    references: [companies.id],
  }),
  dataPackages: many(dataPackages),
  purchasedEsims: many(purchasedEsims),
  planHistory: many(planHistory),
}));

export const dataPackagesRelations = relations(dataPackages, ({ one }) => ({
  employee: one(employees, {
    fields: [dataPackages.employeeId],
    references: [employees.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  company: one(companies, {
    fields: [subscriptions.companyId],
    references: [companies.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  company: one(companies, {
    fields: [payments.companyId],
    references: [companies.id],
  }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const esimPlansRelations = relations(esimPlans, ({ many }) => ({
  purchases: many(purchasedEsims),
}));

export const purchasedEsimsRelations = relations(purchasedEsims, ({ one }) => ({
  employee: one(employees, {
    fields: [purchasedEsims.employeeId],
    references: [employees.id],
  }),
  plan: one(esimPlans, {
    fields: [purchasedEsims.planId],
    references: [esimPlans.id],
  }),
  bill: one(bills, {
    fields: [purchasedEsims.billId],
    references: [bills.id],
  }),
}));

export const planHistoryRelations = relations(planHistory, ({ one }) => ({
  employee: one(employees, {
    fields: [planHistory.employeeId],
    references: [employees.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  companyId: true,
  isAdmin: true,
  isSuperAdmin: true,
  isVerified: true,
  verificationToken: true,
  verificationTokenExpiry: true,
});

export const insertEmployeeSchema = createInsertSchema(employees).pick({
  name: true,
  email: true,
  phoneNumber: true,
  position: true,
});

export const insertDataPackageSchema = createInsertSchema(dataPackages).pick({
  gb: true,
  cost: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).pick({
  plan: true,
  amount: true,
});

export const insertPaymentSchema = createInsertSchema(payments).pick({
  subscriptionId: true,
  amount: true,
  status: true,
  paymentMethod: true,
});

export const insertEsimPlanSchema = createInsertSchema(esimPlans).pick({
  providerId: true,
  name: true,
  description: true,
  data: true,
  validity: true,
  providerPrice: true,
  sellingPrice: true,
  retailPrice: true,
  margin: true,
  countries: true,
  speed: true,
});

export const insertPurchasedEsimSchema = createInsertSchema(purchasedEsims).pick({
  employeeId: true,
  planId: true,
  orderId: true,
  iccid: true,
  activationCode: true,
  qrCode: true,
  status: true,
  purchaseDate: true,
  activationDate: true,
  expiryDate: true,
  dataUsed: true,
  metadata: true,
});

export const insertPlanHistorySchema = createInsertSchema(planHistory).pick({
  employeeId: true,
  planName: true,
  planData: true,
  startDate: true,
  endDate: true,
  dataUsed: true,
  status: true,
  providerId: true,
});

export const insertSystemConfigSchema = createInsertSchema(systemConfig).pick({
  key: true,
  value: true,
  category: true,
  description: true,
  isActive: true,
});

export const insertCompanyConfigSchema = createInsertSchema(companyConfig).pick({
  companyId: true,
  key: true,
  value: true,
  category: true,
  description: true,
  isActive: true,
});

export const insertCompanySchema = createInsertSchema(companies).pick({
  name: true,
  taxNumber: true,
  address: true,
  country: true,
  entityType: true,
  contactName: true,
  contactPhone: true,
  contactEmail: true,
  website: true,
  industry: true,
  description: true,
  logo: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type User = typeof users.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type DataPackage = typeof dataPackages.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type EsimPlan = typeof esimPlans.$inferSelect;
export type PurchasedEsim = typeof purchasedEsims.$inferSelect;

// Define EsimMetadata interface to properly type the metadata field
export interface EsimMetadata {
  isCancelled?: boolean;
  cancelRequestTime?: string;
  previousStatus?: string;
  status?: string;
  refunded?: boolean;
  pendingRefund?: boolean;
  cancelledInProvider?: boolean;
  refundAmount?: number;
  refundDate?: string;
  refundedToCompany?: number;
  refundError?: string;
  refundAttemptDate?: string;
  cancelReason?: string;
  cancelledAt?: string;
  rawData?: {
    obj?: {
      esimList?: Array<{
        iccid?: string;
        esimTranNo?: string;
        ac?: string;
        qrCodeUrl?: string;
      }>;
    };
  };
}
export type PlanHistory = typeof planHistory.$inferSelect;

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  // User info
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  
  // Company info
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  taxNumber: z.string().optional().or(z.literal("")),
  country: z.string().min(2, "Country is required"),
  address: z.string().min(5, "Address must be at least 5 characters"),
  entityType: z.string().min(1, "Entity type is required"),
  contactName: z.string().min(2, "Contact name must be at least 2 characters"),
  contactPhone: z.string().min(5, "Valid phone number is required"),
  contactEmail: z.string().email("Please enter a valid email address"),
  website: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  description: z.string().optional().nullable()
});

export const companyInfoSchema = z.object({
  country: z.string().min(2, "Country is required"),
  address: z.string().min(5, "Address is required"),
  taxNumber: z.string().optional().or(z.literal("")),
  entityType: z.string().min(2, "Entity type is required"),
  contactName: z.string().min(2, "Contact name is required"),
  // Keep contactPhone for backward compatibility
  contactPhone: z.string().optional(),
  // New fields for split phone input
  phoneCountryCode: z.string().min(1, "Country code is required"),
  phoneNumber: z.string()
    .min(5, "Phone number must be at least 5 digits")
    .max(15, "Phone number must not exceed 15 digits")
    .regex(/^[0-9\s\-()]+$/, "Phone number can only contain digits, spaces, and the following characters: ()-"),
  contactEmail: z.string().email("Please enter a valid email address"),
  website: z.string().url("Please enter a valid website URL").optional().or(z.literal("")),
  industry: z.string().min(2, "Industry is required"),
  description: z.string().optional().or(z.literal("")),
  companyName: z.string().min(2, "Company name is required"),
});

export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;
export type CompanyInfoData = z.infer<typeof companyInfoSchema>;

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  // New field to mark wallet type: 'general', 'profit', or 'provider'
  walletType: text("wallet_type").notNull().default("general"),
  // Reference to the provider if this is a provider wallet
  providerId: text("provider_id"),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").references(() => wallets.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  type: text("type").notNull(), // 'credit' or 'debit'
  description: text("description"),
  stripePaymentId: text("stripe_payment_id"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  status: text("status").notNull().default("completed"),
  paymentMethod: text("payment_method"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // New fields for tracking related transactions
  relatedTransactionId: integer("related_transaction_id"), // For linking transactions (e.g., profit and cost for same eSIM)
  esimPlanId: integer("esim_plan_id").references(() => esimPlans.id), // Link to eSIM plan if this transaction is related to an eSIM
  esimOrderId: text("esim_order_id"), // The order ID if this is related to an eSIM purchase
  // Track if this transaction has been invoiced
  invoicedAt: timestamp("invoiced_at"),
  billId: integer("bill_id").references(() => bills.id),
});

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  company: one(companies, {
    fields: [wallets.companyId],
    references: [companies.id]
  }),
  transactions: many(walletTransactions)
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  wallet: one(wallets, {
    fields: [walletTransactions.walletId],
    references: [wallets.id]
  }),
  esimPlan: one(esimPlans, {
    fields: [walletTransactions.esimPlanId],
    references: [esimPlans.id],
    relationName: "esimPlanTransactions"
  })
}));

// Coupon system
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  isUsed: boolean("is_used").notNull().default(false),
  usedBy: integer("used_by").references(() => users.id),
  usedAt: timestamp("used_at"),
  description: text("description"),
  recipientEmail: text("recipient_email")
});

// Exchange rates system
export const exchangeRates = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  rate: decimal("rate", { precision: 10, scale: 6 }).notNull(),
  source: text("source").notNull().default("manual"), // 'manual', 'api', etc.
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => {
  return {
    currencyPairIdx: uniqueIndex("exchange_rates_currency_pair_idx").on(table.fromCurrency, table.toCurrency)
  };
});

// Billing and receipts system
export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  receiptNumber: text("receipt_number").notNull().unique(),
  type: text("type").notNull(), // 'credit_addition', 'payment', 'refund'
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  description: text("description"),
  paymentMethod: text("payment_method"),
  stripePaymentId: text("stripe_payment_id"),
  transactionId: integer("transaction_id").references(() => walletTransactions.id),
  emailSent: boolean("email_sent").notNull().default(false),
  emailSentAt: timestamp("email_sent_at"),
  driveFileId: text("drive_file_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  billNumber: text("bill_number").notNull().unique(),
  billingDate: date("billing_date").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  emailSent: boolean("email_sent").notNull().default(false),
  emailSentAt: timestamp("email_sent_at"),
  driveFileId: text("drive_file_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const billItems = pgTable("bill_items", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").references(() => bills.id),
  esimPlanId: integer("esim_plan_id").references(() => esimPlans.id),
  planName: text("plan_name").notNull(),
  planDescription: text("plan_description"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  countries: text("countries").array(),
  dataAmount: decimal("data_amount", { precision: 10, scale: 2 }),
  validity: integer("validity"),
  itemType: text("item_type").notNull().default("esim"),
  customDescription: text("custom_description"),
});

export const creditNotes = pgTable("credit_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  creditNoteNumber: text("credit_note_number").notNull().unique(),
  originalBillId: integer("original_bill_id").references(() => bills.id),
  creditDate: date("credit_date").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  reason: text("reason").notNull().default("eSIM cancellation"),
  emailSent: boolean("email_sent").notNull().default(false),
  emailSentAt: timestamp("email_sent_at"),
  driveFileId: text("drive_file_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const creditNoteItems = pgTable("credit_note_items", {
  id: serial("id").primaryKey(),
  creditNoteId: integer("credit_note_id").references(() => creditNotes.id),
  purchasedEsimId: integer("purchased_esim_id").references(() => purchasedEsims.id),
  esimPlanId: integer("esim_plan_id").references(() => esimPlans.id),
  planName: text("plan_name").notNull(),
  planDescription: text("plan_description"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  countries: text("countries").array(),
  dataAmount: decimal("data_amount", { precision: 10, scale: 2 }),
  validity: integer("validity"),
  itemType: text("item_type").notNull().default("esim"),
  customDescription: text("custom_description"),
});

export const paymentStatuses = ["pending", "completed", "failed", "refunded", "canceled"] as const;
export const subscriptionStatuses = ["active", "cancelled", "expired"] as const;
export const esimStatuses = ["pending", "active", "expired"] as const;
export const transactionTypes = ["credit", "debit", "refund", "cancellation"] as const;
export const couponStatuses = ["active", "redeemed", "expired"] as const;
export const walletTypeValues = ["general", "profit", "provider", "stripe_fees", "tax"] as const;
export const receiptTypes = ["credit_addition", "payment", "refund"] as const;
export type WalletType = typeof walletTypeValues[number];
export type ReceiptType = typeof receiptTypes[number];

// Type definitions
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;
export type ExchangeRate = typeof exchangeRates.$inferSelect;

// Exchange rates insert schema
export const insertExchangeRateSchema = createInsertSchema(exchangeRates).pick({
  fromCurrency: true,
  toCurrency: true,
  rate: true,
  source: true,
  isActive: true,
});

// Coupon insert schema
export const insertCouponSchema = createInsertSchema(coupons).pick({
  code: true,
  amount: true,
  currency: true,
  createdBy: true,
  expiresAt: true,
  description: true,
  recipientEmail: true,
});

// Coupon relations
export const couponsRelations = relations(coupons, ({ one }) => ({
  creator: one(users, {
    fields: [coupons.createdBy],
    references: [users.id]
  }),
  user: one(users, {
    fields: [coupons.usedBy],
    references: [users.id]
  })
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  company: one(companies, {
    fields: [receipts.companyId],
    references: [companies.id]
  }),
  transaction: one(walletTransactions, {
    fields: [receipts.transactionId],
    references: [walletTransactions.id]
  })
}));

export const billsRelations = relations(bills, ({ one, many }) => ({
  company: one(companies, {
    fields: [bills.companyId],
    references: [companies.id]
  }),
  items: many(billItems),
  purchasedEsims: many(purchasedEsims)
}));

export const billItemsRelations = relations(billItems, ({ one }) => ({
  bill: one(bills, {
    fields: [billItems.billId],
    references: [bills.id]
  }),
  esimPlan: one(esimPlans, {
    fields: [billItems.esimPlanId],
    references: [esimPlans.id]
  })
}));

export const creditNotesRelations = relations(creditNotes, ({ one, many }) => ({
  company: one(companies, {
    fields: [creditNotes.companyId],
    references: [companies.id]
  }),
  originalBill: one(bills, {
    fields: [creditNotes.originalBillId],
    references: [bills.id]
  }),
  items: many(creditNoteItems),
}));

export const creditNoteItemsRelations = relations(creditNoteItems, ({ one }) => ({
  creditNote: one(creditNotes, {
    fields: [creditNoteItems.creditNoteId],
    references: [creditNotes.id]
  }),
  purchasedEsim: one(purchasedEsims, {
    fields: [creditNoteItems.purchasedEsimId],
    references: [purchasedEsims.id]
  }),
  esimPlan: one(esimPlans, {
    fields: [creditNoteItems.esimPlanId],
    references: [esimPlans.id]
  })
}));

export type Wallet = typeof wallets.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type ServerConnection = typeof serverConnections.$inferSelect;
export type ConnectionLog = typeof connectionLogs.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type BillItem = typeof billItems.$inferSelect;
export type CreditNote = typeof creditNotes.$inferSelect;
export type CreditNoteItem = typeof creditNoteItems.$inferSelect;

// Insert schemas for connection monitoring
export const insertServerConnectionSchema = createInsertSchema(serverConnections).pick({
  serviceName: true,
  status: true,
  responseTime: true,
  message: true,
  metadata: true,
});

export const insertConnectionLogSchema = createInsertSchema(connectionLogs).pick({
  serviceName: true,
  status: true,
  message: true,
  responseTime: true,
  metadata: true,
});

export type InsertServerConnection = z.infer<typeof insertServerConnectionSchema>;
export type InsertConnectionLog = z.infer<typeof insertConnectionLogSchema>;

export const serverStatusValues = ["online", "offline", "degraded", "warning", "unknown"] as const;
export type ServerStatus = typeof serverStatusValues[number];

// Using wallet type values defined above

// Insert schema for wallets
export const insertWalletSchema = createInsertSchema(wallets).pick({
  companyId: true,
  balance: true,
  walletType: true,
  providerId: true,
});

export type InsertWallet = z.infer<typeof insertWalletSchema>;

export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).pick({
  walletId: true,
  amount: true,
  type: true,
  description: true,
  stripePaymentId: true,
  stripeSessionId: true,
  stripePaymentIntentId: true,
  status: true,
  paymentMethod: true,
  relatedTransactionId: true,
  esimPlanId: true,
  esimOrderId: true,
});

export const stripePaymentSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  currency: z.string().default("usd"),
  paymentMethod: z.string().optional(),
  description: z.string().optional(),
});

export const refundRequestSchema = z.object({
  transactionId: z.number(),
  reason: z.string().optional(),
});

// Schema already defined above

export const redeemCouponSchema = z.object({
  code: z.string().min(6, "Coupon code must be at least 6 characters")
});

// Insert schemas for billing system
export const insertReceiptSchema = createInsertSchema(receipts).pick({
  companyId: true,
  receiptNumber: true,
  type: true,
  amount: true,
  description: true,
  paymentMethod: true,
  stripePaymentId: true,
  transactionId: true,
});

export const insertBillSchema = createInsertSchema(bills).pick({
  companyId: true,
  billNumber: true,
  billingDate: true,
  totalAmount: true,
  currency: true,
});

export const insertBillItemSchema = createInsertSchema(billItems).pick({
  billId: true,
  esimPlanId: true,
  planName: true,
  planDescription: true,
  unitPrice: true,
  quantity: true,
  totalAmount: true,
  countries: true,
  dataAmount: true,
  validity: true,
  itemType: true,
  customDescription: true,
});

export const insertCreditNoteSchema = createInsertSchema(creditNotes).pick({
  companyId: true,
  creditNoteNumber: true,
  originalBillId: true,
  creditDate: true,
  totalAmount: true,
  currency: true,
  reason: true,
});

export const insertCreditNoteItemSchema = createInsertSchema(creditNoteItems).pick({
  creditNoteId: true,
  purchasedEsimId: true,
  esimPlanId: true,
  planName: true,
  planDescription: true,
  unitPrice: true,
  quantity: true,
  totalAmount: true,
  countries: true,
  dataAmount: true,
  validity: true,
  itemType: true,
  customDescription: true,
});

export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type InsertBill = z.infer<typeof insertBillSchema>;
export type InsertBillItem = z.infer<typeof insertBillItemSchema>;
export type InsertCreditNote = z.infer<typeof insertCreditNoteSchema>;
export type InsertCreditNoteItem = z.infer<typeof insertCreditNoteItemSchema>;

export type StripePaymentRequest = z.infer<typeof stripePaymentSchema>;
export type RefundRequest = z.infer<typeof refundRequestSchema>;

export const planLimits = {
  "Basic": 5,
  "Premium": 10,
  "Enterprise": 20,
} as const;

export const availablePlans = ["Basic", "Premium", "Enterprise"] as const;

export const planDetails = {
  Basic: { gb: "10", cost: "50" },
  Standard: { gb: "50", cost: "200" },
  Pro: { gb: "100", cost: "350" }
} as const;

export const additionalGBCosts = {
  Basic: 20,
  Standard: 15,
  Pro: 10
} as const;

export const additionalGBCost = 15;

// Additional Stripe validation schemas for PCI-compliant integration
export const createPaymentIntentSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  currency: z.string().default("usd"),
  metadata: z.record(z.string()).optional(),
});

export const confirmPaymentSchema = z.object({
  paymentIntentId: z.string().min(1, "Payment intent ID is required"),
  amount: z.number().positive("Amount must be greater than 0"),
});

export type CreatePaymentIntentRequest = z.infer<typeof createPaymentIntentSchema>;
export type ConfirmPaymentRequest = z.infer<typeof confirmPaymentSchema>;

// Database backups table for tracking automated backups
export const backups = pgTable("backups", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  filename: text("filename").notNull(),
  sizeBytes: integer("size_bytes"),
  driveFileId: text("drive_file_id"),
  status: text("status").notNull(),
  type: text("type").notNull().default("daily"),
  error: text("error"),
});

export const insertBackupSchema = createInsertSchema(backups).omit({
  id: true,
  createdAt: true,
});

export type InsertBackup = z.infer<typeof insertBackupSchema>;
export type Backup = typeof backups.$inferSelect;

// Processed webhooks table for duplicate detection
export const processedWebhooks = pgTable("processed_webhooks", {
  id: serial("id").primaryKey(),
  webhookId: text("webhook_id").notNull().unique(),
  provider: text("provider").notNull(), // 'esim-access', 'stripe'
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

export const insertProcessedWebhookSchema = createInsertSchema(processedWebhooks).omit({
  id: true,
});

export type InsertProcessedWebhook = z.infer<typeof insertProcessedWebhookSchema>;
export type ProcessedWebhook = typeof processedWebhooks.$inferSelect;

// Failed emails table for retry tracking
export const failedEmails = pgTable("failed_emails", {
  id: serial("id").primaryKey(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  template: text("template").notNull(),
  templateData: text("template_data").notNull(), // JSON string
  attemptCount: integer("attempt_count").notNull(),
  lastError: text("last_error"),
  priority: text("priority").default("normal"), // 'critical', 'high', 'normal', 'low'
  retried: boolean("retried").default(false),
  retriedAt: timestamp("retried_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFailedEmailSchema = createInsertSchema(failedEmails).omit({
  id: true,
  createdAt: true,
});

export type InsertFailedEmail = z.infer<typeof insertFailedEmailSchema>;
export type FailedEmail = typeof failedEmails.$inferSelect;