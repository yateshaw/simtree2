/**
 * Secure Logging Utility
 * Minimizes console output and encrypts sensitive data
 */

// Simple encryption for sensitive data
function encryptSensitive(data: any): string {
  if (!data) return '[EMPTY]';
  
  const str = typeof data === 'object' ? JSON.stringify(data) : String(data);
  // Simple base64 encoding for basic obfuscation
  const encoded = btoa(str).slice(0, 12) + '...';
  return `[ENCRYPTED:${encoded}]`;
}

// Production-safe logger
class SecureLogger {
  private isDev = import.meta.env.DEV;
  private isProduction = import.meta.env.PROD;
  
  // Only log critical errors in production
  error(message: string, data?: any) {
    if (this.isProduction) {
      console.error(message); // No sensitive data
    } else {
      console.error(message, data);
    }
  }
  
  // Only log warnings in development
  warn(message: string, data?: any) {
    if (this.isDev) {
      console.warn(message, data);
    }
  }
  
  // Minimal info logging
  info(message: string) {
    if (this.isDev) {
      if (import.meta.env.DEV) { console.log(message); }
    }
  }
  
  // Encrypted debug logging for sensitive data
  debug(message: string, sensitiveData?: any) {
    if (this.isDev) {
      if (sensitiveData) {
        if (import.meta.env.DEV) { console.log(message, encryptSensitive(sensitiveData)); }
      } else {
        if (import.meta.env.DEV) { console.log(message); }
      }
    }
  }
  
  // Auth-specific logging with encryption
  auth(message: string, userData?: any) {
    if (this.isDev) {
      if (userData) {
        if (import.meta.env.DEV) { console.log(`[AUTH] ${message}`, encryptSensitive(userData)); }
      } else {
        if (import.meta.env.DEV) { console.log(`[AUTH] ${message}`); }
      }
    }
  }
  
  // Silent mode - no output at all
  silent() {
    // Intentionally empty
  }
}

export const logger = new SecureLogger();

// Override console methods to prevent excessive logging
if (import.meta.env.PROD) {
  // Completely silent console in production
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  // Keep only critical error logging
}