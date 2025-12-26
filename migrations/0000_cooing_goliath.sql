CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tax_number" text,
	"address" text,
	"country" text,
	"entity_type" text,
	"contact_name" text,
	"phone_country_code" text,
	"phone_number" text,
	"contact_phone" text,
	"contact_email" text,
	"verified" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"logo" text,
	"website" text,
	"industry" text,
	"description" text,
	"last_activity_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_unique" UNIQUE("name"),
	CONSTRAINT "companies_tax_number_unique" UNIQUE("tax_number")
);
--> statement-breakpoint
CREATE TABLE "connection_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_name" text NOT NULL,
	"status" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"message" text,
	"response_time" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"is_used" boolean DEFAULT false NOT NULL,
	"used_by" integer,
	"used_at" timestamp,
	"description" text,
	"recipient_email" text,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "data_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"executive_id" integer,
	"gb" numeric(10, 2) NOT NULL,
	"cost" numeric(10, 2) NOT NULL,
	"purchase_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esim_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"data" numeric(10, 2) NOT NULL,
	"validity" integer NOT NULL,
	"provider_price" numeric(10, 2) NOT NULL,
	"selling_price" numeric(10, 2) NOT NULL,
	"retail_price" numeric(10, 2) NOT NULL,
	"margin" numeric(10, 2) DEFAULT '100' NOT NULL,
	"countries" text[],
	"speed" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "esim_plans_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "executives" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone_number" text NOT NULL,
	"position" text NOT NULL,
	"current_plan" text,
	"data_usage" numeric(10, 2) DEFAULT '0' NOT NULL,
	"data_limit" numeric(10, 2) DEFAULT '0' NOT NULL,
	"plan_start_date" timestamp,
	"plan_end_date" timestamp,
	"plan_validity" integer
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"subscription_id" integer,
	"amount" numeric(10, 2) NOT NULL,
	"status" text NOT NULL,
	"payment_date" timestamp DEFAULT now() NOT NULL,
	"payment_method" text
);
--> statement-breakpoint
CREATE TABLE "plan_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"executive_id" integer,
	"plan_name" text NOT NULL,
	"plan_data" numeric(10, 2) NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"data_used" numeric(10, 2) DEFAULT '0',
	"status" text NOT NULL,
	"provider_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchased_esims" (
	"id" serial PRIMARY KEY NOT NULL,
	"executive_id" integer,
	"plan_id" integer,
	"order_id" text NOT NULL,
	"iccid" text NOT NULL,
	"activation_code" text,
	"qr_code" text,
	"status" text NOT NULL,
	"purchase_date" timestamp DEFAULT now() NOT NULL,
	"activation_date" timestamp,
	"expiry_date" timestamp,
	"data_used" numeric(10, 2) DEFAULT '0',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "server_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_name" text NOT NULL,
	"status" text NOT NULL,
	"response_time" integer,
	"last_checked" timestamp DEFAULT now() NOT NULL,
	"message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"plan" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"amount" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"company_id" integer,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verification_token" text,
	"verification_token_expiry" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer,
	"amount" numeric(10, 2) NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"stripe_payment_id" text,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"payment_method" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_packages" ADD CONSTRAINT "data_packages_executive_id_executives_id_fk" FOREIGN KEY ("executive_id") REFERENCES "public"."executives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executives" ADD CONSTRAINT "executives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_history" ADD CONSTRAINT "plan_history_executive_id_executives_id_fk" FOREIGN KEY ("executive_id") REFERENCES "public"."executives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchased_esims" ADD CONSTRAINT "purchased_esims_executive_id_executives_id_fk" FOREIGN KEY ("executive_id") REFERENCES "public"."executives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchased_esims" ADD CONSTRAINT "purchased_esims_plan_id_esim_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."esim_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;