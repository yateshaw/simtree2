import { monitoringService } from './services/monitoring.service';
import { storage } from './storage';
import axios from 'axios';
import * as emailService from './services/email.service';
import { esimAccessService } from './services/esim-access';

/**
 * Initialize the monitoring service and register all the services to be monitored
 */
export function initializeMonitoring() {
  console.log('Initializing connection monitoring service...');

  try {
    // Register eSIM Access API - reduced frequency
    monitoringService.registerService({
      name: 'esim-access-api',
      checkFunction: async () => {
        try {
          return await esimAccessService.checkStatus();
        } catch (error) {
          console.error('Error checking eSIM Access API:', error);
          return false;
        }
      },
      interval: 60 * 60 * 1000 // 1 hour - minimal connectivity check
    });

    // Register Email Service - reduced frequency
    monitoringService.registerService({
      name: 'email-service',
      checkFunction: async () => {
        try {
          return emailService.isConfigured();
        } catch (error) {
          console.error('Error checking Email Service:', error);
          return false;
        }
      },
      interval: 60 * 60 * 1000 // 1 hour - email service rarely fails
    });

    // Register Stripe API - reduced frequency
    monitoringService.registerService({
      name: 'stripe-api',
      checkFunction: async () => {
        try {
          // Simple check using a no-op call to Stripe's API
          if (!process.env.STRIPE_SECRET_KEY) {
            return false;
          }
          
          // Just check if the API key is valid without making an actual API call
          return process.env.STRIPE_SECRET_KEY.startsWith('sk_');
        } catch (error) {
          console.error('Error checking Stripe API:', error);
          return false;
        }
      },
      interval: 30 * 60 * 1000 // 30 minutes (reduced from 15)
    });

    // Register Database connection - reduced frequency
    monitoringService.registerService({
      name: 'database',
      checkFunction: async () => {
        try {
          // Simple database ping
          await storage.getCompany(1);
          return true;
        } catch (error) {
          console.error('Error checking Database connection:', error);
          return false;
        }
      },
      interval: 15 * 60 * 1000 // 15 minutes (reduced from 5)
    });

    // Start monitoring
    monitoringService.startMonitoring();
    console.log('Connection monitoring service started.');
  } catch (error) {
    console.error('Failed to initialize connection monitoring service:', error);
  }
}