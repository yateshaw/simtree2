// Currency utilities for multi-currency support
export type Currency = 'USD' | 'AED';

export const CURRENCIES = {
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    decimals: 2
  },
  AED: {
    code: 'AED', 
    symbol: 'AED',
    name: 'UAE Dirham',
    decimals: 2
  }
} as const;

// Exchange rates (these will be fetched from database in production)
let exchangeRates: Record<string, number> = {
  'USD-AED': 3.67,
  'AED-USD': 0.27
};

/**
 * Get currency for a company based on country
 */
export function getCurrencyForCountry(country?: string): Currency {
  if (!country) return 'USD';
  
  // UAE companies use AED, all others default to USD
  return country.toLowerCase() === 'ae' || country.toLowerCase() === 'uae' ? 'AED' : 'USD';
}

/**
 * Convert amount from one currency to another
 */
export function convertCurrency(
  amount: number, 
  fromCurrency: Currency, 
  toCurrency: Currency,
  rates?: Record<string, number>
): number {
  if (fromCurrency === toCurrency) return amount;
  
  const rateKey = `${fromCurrency}-${toCurrency}`;
  const currentRates = rates || exchangeRates;
  const rate = currentRates[rateKey];
  
  if (!rate) {
    console.warn(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
    return amount; // Return original amount if rate not found
  }
  
  return Number((amount * rate).toFixed(2));
}

/**
 * Format amount with currency symbol and proper formatting
 * USD: $123.45 (symbol prefix)
 * AED: 123.45 AED (suffix)
 */
export function formatCurrency(amount: number, currency: Currency): string {
  const currencyInfo = CURRENCIES[currency];
  
  if (currency === 'AED') {
    // AED format: 123.45 AED (suffix)
    return `${amount.toFixed(currencyInfo.decimals)} AED`;
  } else {
    // USD format: $123.45 (prefix)
    return `${currencyInfo.symbol}${amount.toFixed(currencyInfo.decimals)}`;
  }
}

/**
 * Parse currency amount from string
 */
export function parseCurrencyAmount(value: string, currency: Currency): number {
  // Remove currency symbols and parse the number
  const cleaned = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Update exchange rates (used by exchange rate service)
 */
export function updateExchangeRates(newRates: Record<string, number>): void {
  exchangeRates = { ...exchangeRates, ...newRates };
}

/**
 * Get current exchange rate between two currencies
 */
export function getExchangeRate(fromCurrency: Currency, toCurrency: Currency): number {
  if (fromCurrency === toCurrency) return 1;
  
  const rateKey = `${fromCurrency}-${toCurrency}`;
  return exchangeRates[rateKey] || 1;
}

/**
 * Validate currency code
 */
export function isValidCurrency(currency: string): currency is Currency {
  return currency === 'USD' || currency === 'AED';
}

/**
 * Get all available currencies
 */
export function getAvailableCurrencies(): Currency[] {
  return ['USD', 'AED'];
}

/**
 * Convert amount to display currency with proper formatting
 */
export function formatAmountForDisplay(
  amount: number,
  fromCurrency: Currency,
  displayCurrency: Currency,
  rates?: Record<string, number>
): string {
  const convertedAmount = convertCurrency(amount, fromCurrency, displayCurrency, rates);
  return formatCurrency(convertedAmount, displayCurrency);
}

/**
 * Format currency for export (Excel, PDF, CSV) - uses plain text symbols only
 * This prevents encoding issues with special currency symbols
 */
export function formatCurrencyForExport(amount: number, currency: Currency): string {
  const currencyInfo = CURRENCIES[currency];
  
  if (currency === 'AED') {
    // AED format for export: AED 123.45 (plain text only)
    return `AED ${amount.toFixed(currencyInfo.decimals)}`;
  } else {
    // USD format for export: USD 123.45 (plain text for consistency)
    return `USD ${amount.toFixed(currencyInfo.decimals)}`;
  }
}