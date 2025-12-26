import { db } from '../db';
import { companies } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getCurrencyForCountry } from '@shared/utils/currency';
import type { Currency } from '@shared/utils/currency';

export class CompanyCurrencyService {
  private static instance: CompanyCurrencyService;
  private companyCurrencyCache: Map<number, Currency> = new Map();
  
  static getInstance(): CompanyCurrencyService {
    if (!CompanyCurrencyService.instance) {
      CompanyCurrencyService.instance = new CompanyCurrencyService();
    }
    return CompanyCurrencyService.instance;
  }

  /**
   * Get currency for a company by ID
   */
  async getCurrencyForCompany(companyId: number): Promise<Currency> {
    // Check cache first
    if (this.companyCurrencyCache.has(companyId)) {
      return this.companyCurrencyCache.get(companyId)!;
    }

    try {
      // Fetch company from database
      const company = await db.select({ country: companies.country })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (company.length === 0) {
        console.warn(`[CompanyCurrencyService] Company ${companyId} not found, defaulting to USD`);
        return 'USD';
      }

      // Determine currency based on country
      const currency = getCurrencyForCountry(company[0].country || undefined);
      
      // Cache the result
      this.companyCurrencyCache.set(companyId, currency);
      
      console.log(`[CompanyCurrencyService] Company ${companyId} (${company[0].country}) uses ${currency}`);
      return currency;
    } catch (error) {
      console.error(`[CompanyCurrencyService] Error getting currency for company ${companyId}:`, error);
      return 'USD'; // Default fallback
    }
  }

  /**
   * Get currency for multiple companies
   */
  async getCurrencyForCompanies(companyIds: number[]): Promise<Map<number, Currency>> {
    const result = new Map<number, Currency>();
    const uncachedIds: number[] = [];

    // Check cache for each company
    for (const companyId of companyIds) {
      if (this.companyCurrencyCache.has(companyId)) {
        result.set(companyId, this.companyCurrencyCache.get(companyId)!);
      } else {
        uncachedIds.push(companyId);
      }
    }

    // Fetch uncached companies
    if (uncachedIds.length > 0) {
      try {
        const companiesData = await db.select({ 
          id: companies.id, 
          country: companies.country 
        })
        .from(companies)
        .where(eq(companies.id, uncachedIds[0])); // Simplified for now

        for (const company of companiesData) {
          const currency = getCurrencyForCountry(company.country || undefined);
          result.set(company.id, currency);
          this.companyCurrencyCache.set(company.id, currency);
        }
      } catch (error) {
        console.error('[CompanyCurrencyService] Error fetching multiple companies:', error);
        // Fallback: set USD for all uncached companies
        for (const companyId of uncachedIds) {
          result.set(companyId, 'USD');
        }
      }
    }

    return result;
  }

  /**
   * Update company currency when country changes
   */
  async updateCompanyCurrency(companyId: number, newCountry?: string): Promise<Currency> {
    // Remove from cache to force refresh
    this.companyCurrencyCache.delete(companyId);
    
    // Get updated currency
    if (newCountry !== undefined) {
      // If we already know the new country, use it directly
      const currency = getCurrencyForCountry(newCountry);
      this.companyCurrencyCache.set(companyId, currency);
      
      console.log(`[CompanyCurrencyService] Updated company ${companyId} currency to ${currency} (country: ${newCountry})`);
      return currency;
    } else {
      // Otherwise, fetch from database
      return await this.getCurrencyForCompany(companyId);
    }
  }

  /**
   * Check if company is UAE-based (uses AED)
   */
  async isUAECompany(companyId: number): Promise<boolean> {
    const currency = await this.getCurrencyForCompany(companyId);
    return currency === 'AED';
  }

  /**
   * Get currency with company details for context
   */
  async getCurrencyWithContext(companyId: number): Promise<{
    currency: Currency;
    country: string | null;
    companyId: number;
  }> {
    try {
      const company = await db.select({ 
        id: companies.id,
        country: companies.country,
        name: companies.name
      })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (company.length === 0) {
        return {
          currency: 'USD',
          country: null,
          companyId
        };
      }

      const currency = getCurrencyForCountry(company[0].country || undefined);
      
      return {
        currency,
        country: company[0].country,
        companyId
      };
    } catch (error) {
      console.error(`[CompanyCurrencyService] Error getting currency context for company ${companyId}:`, error);
      return {
        currency: 'USD',
        country: null,
        companyId
      };
    }
  }

  /**
   * Clear cache for specific company
   */
  clearCompanyCache(companyId: number): void {
    this.companyCurrencyCache.delete(companyId);
  }

  /**
   * Clear entire cache
   */
  clearAllCache(): void {
    this.companyCurrencyCache.clear();
  }

  /**
   * Get cache stats for debugging
   */
  getCacheStats(): { size: number; companies: { [key: number]: Currency } } {
    return {
      size: this.companyCurrencyCache.size,
      companies: Object.fromEntries(this.companyCurrencyCache)
    };
  }
}

// Export singleton instance
export const companyCurrencyService = CompanyCurrencyService.getInstance();