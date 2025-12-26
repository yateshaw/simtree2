/**
 * Environment utilities for the application
 */

/**
 * Get the actual URL that Replit is serving the application on
 * @returns The base URL for the application
 */
export const getBaseUrl = (): string => {
  // Only use production URL when actually deployed to production (NODE_ENV === 'production')
  if (process.env.NODE_ENV === 'production') {
    console.log(`[ENV] Using production URL: https://panel.simtree.co`);
    return 'https://panel.simtree.co';
  }

  // In development, use Replit dev domain if available
  if (process.env.REPLIT_DEV_DOMAIN) {
    const devUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    console.log(`[ENV] Using Replit dev URL: ${devUrl}`);
    return devUrl;
  }

  // Check for specific local Replit domain
  if (process.env.REPL_ID && process.env.REPL_OWNER) {
    const localReplitUrl = 'https://ccc0aeb5-e840-49c6-ac51-192b2f3a98d7-00-3k4n0obw12i9n.kirk.replit.dev';
    console.log(`[ENV] Using local Replit URL: ${localReplitUrl}`);
    return localReplitUrl;
  }

  // Fallback to localhost for local development
  const localUrl = process.env.BASE_URL || "http://localhost:5000";
  console.log(`[ENV] Using local URL: ${localUrl}`);

  return localUrl;
};

// Stripe configuration
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const FRONTEND_URL = getBaseUrl();
export const DEVELOPMENT_MODE = process.env.NODE_ENV !== "production";
export const isStripeConfigured = !!STRIPE_SECRET_KEY;

/**
 * Get the deployment environment (development, production, etc.)
 * @returns The current environment
 */
export const getEnvironment = (): string => {
  return process.env.NODE_ENV || "development";
};

/**
 * Determine if the application is running in Replit
 * @returns true if running in Replit, false otherwise
 */
export const isReplitEnvironment = (): boolean => {
  return Boolean(process.env.REPL_ID && process.env.REPL_OWNER);
};

/**
 * Get the domain of the application
 * @returns The domain
 */
export const getDomain = (): string => {
  const baseUrl = getBaseUrl();
  try {
    const url = new URL(baseUrl);
    return url.hostname;
  } catch (error) {
    console.error("Error parsing base URL:", error);
    return "localhost";
  }
};
