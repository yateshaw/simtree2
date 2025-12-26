import { db } from "../db";
import * as schema from "../../shared/schema";
import { eq, and } from "drizzle-orm";

// In-memory cache for frequently accessed config values
const configCache = new Map<string, { value: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class ConfigService {
  private static instance: ConfigService;

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Get system configuration value
   */
  async getSystemConfig(key: string, defaultValue?: string): Promise<string | null> {
    const cacheKey = `system:${key}`;
    const cached = configCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value;
    }

    try {
      const result = await db
        .select({ value: schema.systemConfig.value })
        .from(schema.systemConfig)
        .where(and(
          eq(schema.systemConfig.key, key),
          eq(schema.systemConfig.isActive, true)
        ))
        .limit(1);

      const value = result[0]?.value || defaultValue || null;
      
      if (value) {
        configCache.set(cacheKey, { value, timestamp: Date.now() });
      }
      
      return value;
    } catch (error) {
      console.error(`Error fetching system config ${key}:`, error);
      return defaultValue || null;
    }
  }

  /**
   * Get company-specific configuration value
   */
  async getCompanyConfig(companyId: number, key: string, defaultValue?: string): Promise<string | null> {
    const cacheKey = `company:${companyId}:${key}`;
    const cached = configCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value;
    }

    try {
      const result = await db
        .select({ value: schema.companyConfig.value })
        .from(schema.companyConfig)
        .where(and(
          eq(schema.companyConfig.companyId, companyId),
          eq(schema.companyConfig.key, key),
          eq(schema.companyConfig.isActive, true)
        ))
        .limit(1);

      const value = result[0]?.value || defaultValue || null;
      
      if (value) {
        configCache.set(cacheKey, { value, timestamp: Date.now() });
      }
      
      return value;
    } catch (error) {
      console.error(`Error fetching company config ${companyId}:${key}:`, error);
      return defaultValue || null;
    }
  }

  /**
   * Get configuration with company override capability
   */
  async getConfig(key: string, companyId?: number, defaultValue?: string): Promise<string | null> {
    // First try company-specific config if companyId provided
    if (companyId) {
      const companyValue = await this.getCompanyConfig(companyId, key, undefined);
      if (companyValue !== null) {
        return companyValue;
      }
    }

    // Fall back to system config
    return this.getSystemConfig(key, defaultValue);
  }

  /**
   * Set system configuration value
   */
  async setSystemConfig(key: string, value: string, category: string, description?: string): Promise<void> {
    try {
      await db
        .insert(schema.systemConfig)
        .values({
          key,
          value,
          category,
          description,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: schema.systemConfig.key,
          set: {
            value,
            updatedAt: new Date(),
          },
        });

      // Clear cache
      configCache.delete(`system:${key}`);
    } catch (error) {
      console.error(`Error setting system config ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set company-specific configuration value
   */
  async setCompanyConfig(
    companyId: number,
    key: string,
    value: string,
    category: string,
    description?: string
  ): Promise<void> {
    try {
      await db
        .insert(schema.companyConfig)
        .values({
          companyId,
          key,
          value,
          category,
          description,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [schema.companyConfig.companyId, schema.companyConfig.key],
          set: {
            value,
            updatedAt: new Date(),
          },
        });

      // Clear cache
      configCache.delete(`company:${companyId}:${key}`);
    } catch (error) {
      console.error(`Error setting company config ${companyId}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Get platform company ID dynamically
   */
  async getPlatformCompanyId(): Promise<number | null> {
    try {
      const platformCompanyName = await this.getSystemConfig('platform_company_name', 'SimTree');
      if (!platformCompanyName) return null;

      const result = await db
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(eq(schema.companies.name, platformCompanyName))
        .limit(1);

      return result[0]?.id || null;
    } catch (error) {
      console.error('Error fetching platform company ID:', error);
      return null;
    }
  }

  /**
   * Get email configuration
   */
  async getEmailConfig() {
    const sender = await this.getSystemConfig('email_sender', 'hey@simtree.co');
    return { sender };
  }

  /**
   * Get server configuration
   */
  async getServerConfig() {
    const devPort = await this.getSystemConfig('server_port_dev', '5000');
    const prodPort = await this.getSystemConfig('server_port_prod', '5000');
    const host = await this.getSystemConfig('server_host', '0.0.0.0');
    
    return {
      devPort: parseInt(devPort || '5000'),
      prodPort: parseInt(prodPort || '5000'),
      host: host || '0.0.0.0',
    };
  }

  /**
   * Get business configuration
   */
  async getBusinessConfig() {
    const defaultMargin = await this.getSystemConfig('default_margin', '100');
    const paginationSize = await this.getSystemConfig('pagination_size', '5');
    const defaultCurrency = await this.getSystemConfig('default_currency', 'USD');
    
    return {
      defaultMargin: parseFloat(defaultMargin || '100'),
      paginationSize: parseInt(paginationSize || '5'),
      defaultCurrency: defaultCurrency || 'USD',
    };
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    configCache.clear();
  }

  /**
   * Get all system configurations for admin management
   */
  async getAllSystemConfigs() {
    try {
      return await db
        .select()
        .from(schema.systemConfig)
        .where(eq(schema.systemConfig.isActive, true))
        .orderBy(schema.systemConfig.category, schema.systemConfig.key);
    } catch (error) {
      console.error('Error fetching all system configs:', error);
      return [];
    }
  }

  /**
   * Get all company configurations for admin management
   */
  async getAllCompanyConfigs(companyId?: number) {
    try {
      let whereCondition = eq(schema.companyConfig.isActive, true);
      
      if (companyId) {
        whereCondition = and(
          eq(schema.companyConfig.isActive, true),
          eq(schema.companyConfig.companyId, companyId)
        );
      }

      return await db
        .select({
          id: schema.companyConfig.id,
          companyId: schema.companyConfig.companyId,
          key: schema.companyConfig.key,
          value: schema.companyConfig.value,
          category: schema.companyConfig.category,
          description: schema.companyConfig.description,
          companyName: schema.companies.name,
        })
        .from(schema.companyConfig)
        .leftJoin(schema.companies, eq(schema.companyConfig.companyId, schema.companies.id))
        .where(whereCondition)
        .orderBy(schema.companies.name, schema.companyConfig.category, schema.companyConfig.key);
    } catch (error) {
      console.error('Error fetching company configs:', error);
      return [];
    }
  }

  /**
   * Update system configuration value by ID
   */
  async updateSystemConfig(id: number, value: string, description?: string): Promise<void> {
    try {
      await db
        .update(schema.systemConfig)
        .set({
          value,
          description,
          updatedAt: new Date(),
        })
        .where(eq(schema.systemConfig.id, id));

      // Clear cache for this config
      const config = await db
        .select({ key: schema.systemConfig.key })
        .from(schema.systemConfig)
        .where(eq(schema.systemConfig.id, id))
        .limit(1);
        
      if (config[0]) {
        configCache.delete(`system:${config[0].key}`);
      }
    } catch (error) {
      console.error(`Error updating system config ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update company configuration value by ID
   */
  async updateCompanyConfig(id: number, value: string, description?: string): Promise<void> {
    try {
      await db
        .update(schema.companyConfig)
        .set({
          value,
          description,
          updatedAt: new Date(),
        })
        .where(eq(schema.companyConfig.id, id));

      // Clear cache for this config
      const config = await db
        .select({ 
          key: schema.companyConfig.key,
          companyId: schema.companyConfig.companyId 
        })
        .from(schema.companyConfig)
        .where(eq(schema.companyConfig.id, id))
        .limit(1);
        
      if (config[0]) {
        configCache.delete(`company:${config[0].companyId}:${config[0].key}`);
      }
    } catch (error) {
      console.error(`Error updating company config ${id}:`, error);
      throw error;
    }
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    configCache.clear();
    console.log('Configuration cache cleared');
  }
}

// Export singleton instance
export const configService = ConfigService.getInstance();