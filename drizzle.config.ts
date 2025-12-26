import { defineConfig } from "drizzle-kit";

const nodeEnv = process.env.NODE_ENV || 'development';
const databaseUrl = nodeEnv === 'production' 
  ? process.env.PROD_DATABASE_URL 
  : (process.env.DEV_DATABASE_URL || process.env.DATABASE_URL);

if (!databaseUrl) {
  throw new Error("Database URL not configured for " + nodeEnv);
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});