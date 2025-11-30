
/**
 * Financial Modeling Prep API Client
 * Free tier: 250 requests/day
 * Docs: https://site.financialmodelingprep.com/developer/docs
 */

import type {
  CompanyProfile,
  IncomeStatement,
  BalanceSheet,
  KeyMetrics,
  InsiderTrade,
  FinancialGrowth,
  StockQuote
} from '../../types';
import { fetchWithRetry, ApiError } from '../utils/retry';

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';
const API_KEY = import.meta.env.VITE_FMP_API_KEY;

// Simple in-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const validateApiKey = () => {
  if (!API_KEY) {
    console.error("FMP API Key is missing or empty.");
    throw new ApiError('MISSING_KEY', 'FMP_API_KEY not configured');
  }
};

const fetchData = async <T>(endpoint: string): Promise<T> => {
  validateApiKey();

  const cacheKey = endpoint;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }

  return fetchWithRetry(async () => {
    const url = `${FMP_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${API_KEY}`;
    console.log(`Fetching FMP: ${endpoint} with key length: ${API_KEY?.length}`);
    const res = await fetch(url);

    if (res.status === 429) {
      console.error("FMP Rate Limit Hit");
      throw new ApiError('RATE_LIMIT', 'FMP API rate limit exceeded');
    }

    if (res.status === 401 || res.status === 403) {
      console.warn("FMP Invalid Key - Falling back to mock data");
      // Do not throw, just return null to allow app to function with mock data
      return null as T;
    }

    if (res.status === 404) {
      throw new ApiError('NOT_FOUND', 'Resource not found');
    }

    if (!res.ok) {
      throw new ApiError('NETWORK', `FMP API Error: ${res.status}`);
    }

    const data = await res.json();

    // FMP sometimes returns error messages in 200 OK responses
    if (data && data['Error Message']) {
      throw new ApiError('UNKNOWN', data['Error Message']);
    }

    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data as T;
  }, {
    maxRetries: 2,
    delayMs: 1000,
    backoffMultiplier: 2
  });
};

// ============ ENDPOINTS ============

export const getCompanyProfile = async (symbol: string): Promise<CompanyProfile | null> => {
  try {
    const data = await fetchData<CompanyProfile[]>(`/profile/${symbol}`);
    return data?.[0] || null;
  } catch (error) {
    console.error(`Error fetching profile for ${symbol}:`, error);
    if (error instanceof ApiError && (error.code === 'MISSING_KEY' || error.code === 'RATE_LIMIT')) throw error;
    return null;
  }
};

export const getQuote = async (symbol: string): Promise<StockQuote | null> => {
  try {
    const data = await fetchData<StockQuote[]>(`/quote/${symbol}`);
    return data?.[0] || null;
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    if (error instanceof ApiError && (error.code === 'MISSING_KEY' || error.code === 'RATE_LIMIT')) throw error;
    return null;
  }
};

export const getIncomeStatements = async (symbol: string, limit = 12): Promise<IncomeStatement[]> => {
  try {
    const data = await fetchData<IncomeStatement[]>(`/income-statement/${symbol}?period=quarter&limit=${limit}`);
    return data || [];
  } catch (error) {
    console.error(`Error fetching income stmt for ${symbol}:`, error);
    if (error instanceof ApiError && error.code === 'MISSING_KEY') throw error;
    return [];
  }
};

export const getBalanceSheets = async (symbol: string, limit = 12): Promise<BalanceSheet[]> => {
  try {
    const data = await fetchData<BalanceSheet[]>(`/balance-sheet-statement/${symbol}?period=quarter&limit=${limit}`);
    return data || [];
  } catch (error) {
    console.error(`Error fetching balance sheet for ${symbol}:`, error);
    if (error instanceof ApiError && error.code === 'MISSING_KEY') throw error;
    return [];
  }
};

export const getKeyMetrics = async (symbol: string): Promise<KeyMetrics | null> => {
  try {
    const data = await fetchData<KeyMetrics[]>(`/key-metrics-ttm/${symbol}`);
    return data?.[0] || null;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'MISSING_KEY') throw error;
    return null;
  }
};

export const getFinancialGrowth = async (symbol: string): Promise<FinancialGrowth | null> => {
  try {
    const data = await fetchData<FinancialGrowth[]>(`/financial-growth/${symbol}?limit=1`);
    return data?.[0] || null;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'MISSING_KEY') throw error;
    return null;
  }
};

export const getInsiderTrades = async (symbol: string): Promise<InsiderTrade[]> => {
  try {
    const data = await fetchData<InsiderTrade[]>(`/insider-trading?symbol=${symbol}&limit=50`);
    return data || [];
  } catch (error) {
    return [];
  }
};

// Bulk fetch for screener
export const getStockScreener = async (params: {
  marketCapMoreThan?: number;
  marketCapLowerThan?: number;
  sector?: string;
  exchange?: string;
  limit?: number;
}) => {
  try {
    const query = new URLSearchParams();
    if (params.marketCapMoreThan) query.set('marketCapMoreThan', params.marketCapMoreThan.toString());
    if (params.marketCapLowerThan) query.set('marketCapLowerThan', params.marketCapLowerThan.toString());
    if (params.sector) query.set('sector', params.sector);
    if (params.exchange) query.set('exchange', params.exchange);
    query.set('limit', (params.limit || 100).toString());

    return await fetchData<any[]>(`/stock-screener?${query.toString()}`);
  } catch (error) {
    console.error('Screener fetch error:', error);
    return [];
  }
};
