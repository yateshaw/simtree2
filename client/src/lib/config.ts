/**
 * Frontend configuration for URL generation
 * Ensures all URLs use the correct base URL in production
 */

// Get the base URL from environment or current origin
export const getBaseUrl = (): string => {
  // Check for production domain in current URL
  if (window.location.hostname === 'panel.simtree.co') {
    return 'https://panel.simtree.co';
  }
  
  // Check for the specific local Replit URL
  if (window.location.hostname === 'ccc0aeb5-e840-49c6-ac51-192b2f3a98d7-00-3k4n0obw12i9n.kirk.replit.dev') {
    return 'https://ccc0aeb5-e840-49c6-ac51-192b2f3a98d7-00-3k4n0obw12i9n.kirk.replit.dev';
  }
  
  // For other environments, use current origin
  return window.location.origin;
};

// Configuration object
export const config = {
  baseUrl: getBaseUrl(),
  apiUrl: '/api',
  
  // Helper methods for URL generation
  getFullUrl: (path: string) => {
    const base = getBaseUrl();
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  },
  
  getApiUrl: (endpoint: string) => {
    return `${config.apiUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  }
};

export default config;