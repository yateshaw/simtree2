import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Currency } from '@shared/utils/currency';

// Global currency manager to handle state across the entire app
class CurrencyManager {
  private static instance: CurrencyManager;
  private listeners: ((currency: Currency) => void)[] = [];
  private _currency: Currency = 'USD';

  static getInstance(): CurrencyManager {
    if (!CurrencyManager.instance) {
      CurrencyManager.instance = new CurrencyManager();
    }
    return CurrencyManager.instance;
  }

  constructor() {
    // Load from localStorage on initialization
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('adminCurrency');
      if (saved && (saved === 'USD' || saved === 'AED')) {
        this._currency = saved as Currency;
      }
    }
  }

  get currency(): Currency {
    return this._currency;
  }

  setCurrency(currency: Currency) {
    if (this._currency === currency) {
      return;
    }
    this._currency = currency;
    if (typeof window !== 'undefined') {
      localStorage.setItem('adminCurrency', currency);
    }
    this.notifyListeners(currency);
  }

  addListener(listener: (currency: Currency) => void) {
    this.listeners.push(listener);
  }

  removeListener(listener: (currency: Currency) => void) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private notifyListeners(currency: Currency) {
    this.listeners.forEach(listener => listener(currency));
  }
}

const currencyManager = CurrencyManager.getInstance();

// Admin Currency Context
interface AdminCurrencyContextValue {
  adminCurrency: Currency;
  setAdminCurrency: (currency: Currency) => void;
}

export const AdminCurrencyContext = createContext<AdminCurrencyContextValue | null>(null);

export const useAdminCurrency = () => {
  const context = useContext(AdminCurrencyContext);
  
  // Whether we have context or not, use the global currency manager
  const [adminCurrency, setAdminCurrencyState] = useState<Currency>(currencyManager.currency);
  
  useEffect(() => {
    const handleCurrencyChange = (currency: Currency) => {
      setAdminCurrencyState(currency);
    };

    currencyManager.addListener(handleCurrencyChange);
    return () => currencyManager.removeListener(handleCurrencyChange);
  }, []);
  
  const setAdminCurrency = useCallback((currency: Currency) => {
    currencyManager.setCurrency(currency);
  }, []);
  
  return {
    adminCurrency,
    setAdminCurrency
  };
};