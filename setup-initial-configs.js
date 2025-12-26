/**
 * Setup Initial Configuration Values
 * Populates the database with essential system configurations
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function setupInitialConfigurations() {
  console.log('Setting up initial system configurations...');

  const systemConfigs = [
    // Email Configuration
    {
      key: 'email_sender',
      value: 'hey@simtree.co',
      category: 'email',
      description: 'Default sender email address for system notifications'
    },
    {
      key: 'email_from_name',
      value: 'SimTree',
      category: 'email',
      description: 'Display name for outgoing emails'
    },

    // Server Configuration
    {
      key: 'server_port_dev',
      value: '5000',
      category: 'server',
      description: 'Development server port'
    },
    {
      key: 'server_port_prod',
      value: '5000',
      category: 'server',
      description: 'Production server port'
    },
    {
      key: 'server_host',
      value: '0.0.0.0',
      category: 'server',
      description: 'Server host address'
    },

    // Business Configuration
    {
      key: 'default_margin',
      value: '100',
      category: 'business',
      description: 'Default profit margin percentage for eSIM plans'
    },
    {
      key: 'pagination_size',
      value: '5',
      category: 'business',
      description: 'Default number of items per page in listings'
    },
    {
      key: 'default_currency',
      value: 'USD',
      category: 'business',
      description: 'Default currency for pricing'
    },

    // Platform Configuration
    {
      key: 'platform_company_name',
      value: 'SimTree',
      category: 'general',
      description: 'Name of the platform/provider company'
    },
    {
      key: 'platform_company_id',
      value: '1',
      category: 'general',
      description: 'Database ID of the platform company'
    },

    // Security Configuration
    {
      key: 'session_timeout',
      value: '3600000',
      category: 'security',
      description: 'Session timeout in milliseconds (1 hour)'
    },
    {
      key: 'password_min_length',
      value: '8',
      category: 'security',
      description: 'Minimum password length requirement'
    },

    // API Configuration
    {
      key: 'api_rate_limit',
      value: '100',
      category: 'api',
      description: 'API requests per minute limit'
    },
    {
      key: 'webhook_timeout',
      value: '30000',
      category: 'api',
      description: 'Webhook timeout in milliseconds'
    },

    // UI Configuration
    {
      key: 'dashboard_refresh_interval',
      value: '30000',
      category: 'ui',
      description: 'Dashboard auto-refresh interval in milliseconds'
    },
    {
      key: 'notification_display_time',
      value: '5000',
      category: 'ui',
      description: 'Time to display notifications in milliseconds'
    }
  ];

  try {
    // Insert system configurations
    for (const config of systemConfigs) {
      await sql`
        INSERT INTO system_config (key, value, category, description, is_active)
        VALUES (${config.key}, ${config.value}, ${config.category}, ${config.description}, true)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          updated_at = NOW()
      `;
      console.log(`✓ Added system config: ${config.key} = ${config.value}`);
    }

    console.log(`\n✅ Successfully set up ${systemConfigs.length} system configurations`);
    
    // Display summary
    const configsByCategory = systemConfigs.reduce((acc, config) => {
      acc[config.category] = (acc[config.category] || 0) + 1;
      return acc;
    }, {});

    console.log('\nConfiguration Summary:');
    Object.entries(configsByCategory).forEach(([category, count]) => {
      console.log(`  ${category}: ${count} configurations`);
    });

    console.log('\n🎉 Dynamic configuration system is now ready!');
    console.log('📝 Administrators can manage configurations via the admin interface at /admin/configuration');

  } catch (error) {
    console.error('❌ Error setting up configurations:', error);
    process.exit(1);
  }
}

setupInitialConfigurations();