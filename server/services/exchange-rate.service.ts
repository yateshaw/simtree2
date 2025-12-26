import { db } from '../db';
import { exchangeRates } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { updateExchangeRates } from '@shared/utils/currency';
import type { Currency } from '@shared/utils/currency';

export class ExchangeRateService {
  private static instance: ExchangeRateService;
  private ratesCache: Record<string, number> = {};
  private lastUpdated: Date | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  static getInstance(): ExchangeRateService {
    if (!ExchangeRateService.instance) {
      ExchangeRateService.instance = new ExchangeRateService();
    }
    return ExchangeRateService.instance;
  }

  /**
   * Initialize exchange rates on startup
   */
  async initialize(): Promise<void> {
    try {
      console.log('[ExchangeRateService] Initializing exchange rates...');
      await this.refreshRates();
      console.log('[ExchangeRateService] Exchange rates initialized successfully');
    } catch (error) {
      console.error('[ExchangeRateService] Failed to initialize exchange rates:', error);
    }
  }

  /**
   * Get current exchange rate between currencies
   */
  async getRate(fromCurrency: Currency, toCurrency: Currency): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    // Check if cache is fresh
    if (this.isCacheStale()) {
      await this.refreshRates();
    }

    const rateKey = `${fromCurrency}-${toCurrency}`;
    const rate = this.ratesCache[rateKey];

    if (!rate) {
      console.warn(`[ExchangeRateService] Rate not found for ${fromCurrency} to ${toCurrency}`);
      return 1; // Fallback to 1:1 rate
    }

    return rate;
  }

  /**
   * Get all current exchange rates
   */
  async getAllRates(): Promise<Record<string, number>> {
    if (this.isCacheStale()) {
      await this.refreshRates();
    }
    return { ...this.ratesCache };
  }

  /**
   * Update exchange rate
   */
  async updateRate(
    fromCurrency: Currency, 
    toCurrency: Currency, 
    rate: number, 
    source: string = 'manual'
  ): Promise<void> {
    try {
      // Update in database
      await db.insert(exchangeRates)
        .values({
          fromCurrency,
          toCurrency,
          rate: rate.toString(),
          source,
          updatedAt: new Date(),
          isActive: true
        })
        .onConflictDoUpdate({
          target: [exchangeRates.fromCurrency, exchangeRates.toCurrency],
          set: {
            rate: rate.toString(),
            source,
            updatedAt: new Date(),
            isActive: true
          }
        });

      // Update cache
      const rateKey = `${fromCurrency}-${toCurrency}`;
      this.ratesCache[rateKey] = rate;
      this.lastUpdated = new Date();

      // Update the shared utilities cache
      updateExchangeRates(this.ratesCache);

      console.log(`[ExchangeRateService] Updated rate ${fromCurrency} to ${toCurrency}: ${rate}`);
    } catch (error) {
      console.error('[ExchangeRateService] Failed to update rate:', error);
      throw error;
    }
  }

  /**
   * Refresh rates from database
   */
  async refreshRates(): Promise<void> {
    try {
      const rates = await db.select()
        .from(exchangeRates)
        .where(eq(exchangeRates.isActive, true))
        .orderBy(desc(exchangeRates.updatedAt));

      // Build rates cache
      const newRatesCache: Record<string, number> = {};
      
      for (const rate of rates) {
        const rateKey = `${rate.fromCurrency}-${rate.toCurrency}`;
        newRatesCache[rateKey] = Number(rate.rate);
      }

      this.ratesCache = newRatesCache;
      this.lastUpdated = new Date();

      // Update the shared utilities cache
      updateExchangeRates(this.ratesCache);

      console.log('[ExchangeRateService] Refreshed exchange rates from database');
    } catch (error) {
      console.error('[ExchangeRateService] Failed to refresh rates:', error);
      throw error;
    }
  }

  /**
   * Convert amount between currencies
   */
  async convertAmount(
    amount: number, 
    fromCurrency: Currency, 
    toCurrency: Currency
  ): Promise<number> {
    if (fromCurrency === toCurrency) return amount;

    const rate = await this.getRate(fromCurrency, toCurrency);
    return Number((amount * rate).toFixed(2));
  }

  /**
   * Fetch rates from external API (placeholder for future implementation)
   */
  async fetchRatesFromAPI(): Promise<void> {
    try {
      // TODO: Implement fetching from external exchange rate API
      // For now, we'll use fixed rates
      console.log('[ExchangeRateService] External API fetching not implemented yet');
      
      // Update with current market rates (these would come from API)
      await this.updateRate('USD', 'AED', 3.67, 'api');
      await this.updateRate('AED', 'USD', 0.27, 'api');
    } catch (error) {
      console.error('[ExchangeRateService] Failed to fetch rates from API:', error);
    }
  }

  /**
   * Schedule periodic rate updates
   */
  startPeriodicUpdates(): void {
    // Update rates every hour
    setInterval(async () => {
      try {
        console.log('[ExchangeRateService] Running periodic rate update...');
        await this.fetchRatesFromAPI();
      } catch (error) {
        console.error('[ExchangeRateService] Periodic update failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    console.log('[ExchangeRateService] Periodic updates started');
  }

  /**
   * Check if cache is stale
   */
  private isCacheStale(): boolean {
    if (!this.lastUpdated) return true;
    return Date.now() - this.lastUpdated.getTime() > this.CACHE_DURATION;
  }

  /**
   * Get cache status for debugging
   */
  getCacheInfo(): { lastUpdated: Date | null; cacheSize: number; rates: Record<string, number> } {
    return {
      lastUpdated: this.lastUpdated,
      cacheSize: Object.keys(this.ratesCache).length,
      rates: { ...this.ratesCache }
    };
  }
}

// Export singleton instance
export const exchangeRateService = ExchangeRateService.getInstance();