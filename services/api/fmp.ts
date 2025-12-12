
/**
 * Financial Modeling Prep API Client
 * Free tier: 250 requests/day
 * Docs: https://site.financialmodelingprep.com/developer/docs
 */

import type {
  CompanyProfile,
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
  KeyMetrics,
  InsiderTrade,
  FinancialGrowth,
  StockQuote,
  HistoricalPrice,
  KeyExecutive
} from '../../types';
import { fetchWithRetry, ApiError } from '../utils/retry';
import { getCache, setCache } from '../utils/cache';

export interface CompanyMeta {
  symbol: string;
  name: string | null;
  marketCap: number | null;
  currency: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
}

const FMP_BASE = process.env.FMP_BASE_URL || 'https://financialmodelingprep.com/stable';
const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_FMP_API_KEY : undefined) || process.env.VITE_FMP_API_KEY || process.env.FMP_API_KEY;

// Cache TTLs
const TTL_PROFILE = 30 * 24 * 60 * 60 * 1000; // 30 days
const TTL_FINANCIALS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TTL_DEFAULT = 24 * 60 * 60 * 1000; // 24 hours

const validateApiKey = () => {
  if (!API_KEY) {
    console.error("FMP API Key is missing or empty.");
    throw new ApiError('MISSING_KEY', 'FMP_API_KEY not configured');
  }
};

const getTtlForEndpoint = (endpoint: string): number => {
  if (endpoint.includes('/profile')) return TTL_PROFILE;
  if (endpoint.includes('/income-statement') ||
    endpoint.includes('/balance-sheet') ||
    endpoint.includes('/cash-flow') ||
    endpoint.includes('/key-metrics') ||
    endpoint.includes('/financial-growth')) return TTL_FINANCIALS;
  if (endpoint.includes('/quote')) return 0; // Do not cache quotes
  return TTL_DEFAULT;
};

const fetchData = async <T>(endpoint: string): Promise<T> => {
  validateApiKey();

  const cacheKey = `fmp_${endpoint}`;
  const ttl = getTtlForEndpoint(endpoint);

  // Try cache first (if TTL > 0)
  if (ttl > 0) {
    const cached = await getCache<T>(cacheKey);
    if (cached) return cached;
  }

  return fetchWithRetry(async () => {
    const hasQuery = endpoint.includes('?');
    const isAbsolute = endpoint.startsWith('http');
    const base = isAbsolute ? '' : FMP_BASE;
    const url = `${base}${endpoint}${hasQuery ? '&' : '?'}apikey=${API_KEY}`;
    console.log(`Fetching FMP: ${endpoint} with key length: ${API_KEY?.length}`);
    // console.log('[FMP FULL URL]', url); // Debug log

    const res = await fetch(url);

    if (res.status === 429) {
      console.error("FMP Rate Limit Hit");
      throw new ApiError('RATE_LIMIT', 'FMP API rate limit exceeded');
    }

    if (res.status === 402) {
      console.warn(`[FMP] Payment Required (402) for ${endpoint}. Feature may not be in plan.`);
      return null as T;
    }

    if (res.status === 403) {
      console.warn(`[FMP] Access Restricted (403) for ${endpoint}. Feature likely not in plan.`);
      return null as T;
    }

    if (res.status === 401) {
      console.warn("FMP Invalid Key (401) - Check your API key.");
      return null as T;
    }

    if (res.status === 404) {
      console.warn(`[FMP] Resource not found: ${endpoint}`);
      return null as T;
    }

    if (!res.ok) {
      throw new ApiError('NETWORK', `FMP API Error: ${res.status}`);
    }

    const data = await res.json();

    // FMP sometimes returns error messages in 200 OK responses
    if (data && data['Error Message']) {
      // If "Limit Reach" or similar, maybe treat as rate limit or restricted?
      if (data['Error Message'].includes('Limit') || data['Error Message'].includes('Premium')) {
        console.warn(`[FMP] API Limit/Premium Restriction: ${data['Error Message']}`);
        return null as T;
      }
      throw new ApiError('UNKNOWN', data['Error Message']);
    }

    // Write to cache if TTL > 0
    if (ttl > 0 && data) {
      await setCache(cacheKey, data, ttl);
    }

    return data as T;
  }, {
    maxRetries: 2,
    delayMs: 1000,
    backoffMultiplier: 2
  });
};

// ============ ENDPOINTS ============

export const getCompanyProfile = async (symbol: string): Promise<CompanyProfile | null> => {
  if (API_KEY === 'dummy_key') {
    return {
      symbol,
      companyName: "Apple Inc.",
      description: "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories.",
      sector: "Technology",
      industry: "Consumer Electronics",
      ceo: "Tim Cook",
      ipoDate: "1980-12-12",
      website: "https://www.apple.com",
      currency: "USD",
      exchange: "NASDAQ",
      country: "US",
      isEtf: false,
      isActivelyTrading: true,
      mktCap: 2500000000000,
      price: 150,
      changes: 2.5,
      changesPercentage: "(+1.7%)",
      image: ""
    } as unknown as CompanyProfile;
  }
  try {
    const data = await fetchData<CompanyProfile[]>(`/profile?symbol=${symbol}`);
    return data?.[0] || null;
  } catch (error) {
    console.error(`Error fetching profile for ${symbol}:`, error);
    if (error instanceof ApiError && (error.code === 'MISSING_KEY' || error.code === 'RATE_LIMIT')) throw error;
    return null;
  }
};

export const getQuote = async (symbol: string): Promise<StockQuote | null> => {
  if (API_KEY === 'dummy_key') {
    return {
      symbol,
      price: 150,
      changes: 2.5,
      change: 2.5,
      changesPercentage: 1.7,
      marketCap: 2500000000000,
      pe: 25,
      yearHigh: 160,
      yearLow: 120,
      dayHigh: 152,
      dayLow: 148,
      priceAvg50: 145,
      priceAvg200: 140,
      volume: 50000000,
      avgVolume: 60000000,
      open: 148,
      previousClose: 147.5,
      eps: 6,
      earningsAnnouncement: "2025-01-28",
      sharesOutstanding: 16000000000,
      timestamp: Date.now(),
      name: "Apple Inc.",
      priceToSalesRatio: 7 // Added for scoring
    } as unknown as StockQuote;
  }
  try {
    const data = await fetchData<StockQuote[]>(`/quote?symbol=${symbol}`);
    return data?.[0] || null;
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    if (error instanceof ApiError && (error.code === 'MISSING_KEY' || error.code === 'RATE_LIMIT')) throw error;
    return null;
  }
};

// FMP returns { symbol: "AAPL", historical: [...] }
export async function getHistoricalPrice(symbol: string, days: number = 365): Promise<HistoricalPrice[]> {
  try {
    const data = await fetchData<{ historical: HistoricalPrice[] }>(
      `/historical-price-eod/full?symbol=${symbol}`
    );
    return data?.historical || [];
  } catch (error) {
    console.error(`Error fetching historical price for ${symbol}:`, error);
    return [];
  }
}

export const getIncomeStatements = async (symbol: string, limit = 12): Promise<IncomeStatement[]> => {
  if (API_KEY === 'dummy_key') {
    return Array(5).fill(null).map((_, i) => ({
      date: `2024-0${5 - i}-01`, symbol,
      revenue: 1000000000 * (1 + i * 0.1), // Growing revenue
      grossProfit: 400000000, grossProfitRatio: 0.4,
      operatingIncome: 200000000, operatingIncomeRatio: 0.2,
      netIncome: 150000000, netIncomeRatio: 0.15,
      ebitda: 250000000, ebitdaratio: 0.25,
      eps: 1.5, epsdiluted: 1.5,
      weightedAverageShsOut: 100000000, weightedAverageShsOutDil: 100000000,
      filingDate: `2024-0${5 - i}-15`, acceptedDate: `2024-0${5 - i}-15`,
      period: 'Q' + (4 - i), link: '', finalLink: '',
      depreciationAndAmortization: 50000000, sellingGeneralAndAdministrativeExpenses: 100000000
    }));
  }
  try {
    const data = await fetchData<IncomeStatement[]>(`/income-statement?symbol=${symbol}&period=quarter&limit=${limit}`);
    return data || [];
  } catch (error) {
    console.error(`Error fetching income stmt for ${symbol}:`, error);
    if (error instanceof ApiError && error.code === 'MISSING_KEY') throw error;
    return [];
  }
};

export const getBalanceSheets = async (symbol: string, limit = 12): Promise<BalanceSheet[]> => {
  if (API_KEY === 'dummy_key') {
    return Array(5).fill(null).map((_, i) => ({
      date: `2024-0${5 - i}-01`, symbol,
      cashAndCashEquivalents: 500000000, shortTermInvestments: 100000000,
      totalCurrentAssets: 1000000000, totalAssets: 2000000000,
      totalCurrentLiabilities: 500000000, totalLiabilities: 1000000000,
      totalStockholdersEquity: 1000000000, retainedEarnings: 500000000,
      totalDebt: 400000000, netDebt: -200000000,
      filingDate: `2024-0${5 - i}-15`, acceptedDate: `2024-0${5 - i}-15`,
      period: 'Q' + (4 - i), link: '', finalLink: '',
      netReceivables: 200000000, propertyPlantEquipmentNet: 300000000
    }));
  }
  try {
    const data = await fetchData<BalanceSheet[]>(`/balance-sheet-statement?symbol=${symbol}&period=quarter&limit=${limit}`);
    return data || [];
  } catch (error) {
    console.error(`Error fetching balance sheet for ${symbol}:`, error);
    if (error instanceof ApiError && error.code === 'MISSING_KEY') throw error;
    return [];
  }
};

export const getCashFlowStatements = async (symbol: string, limit = 12): Promise<CashFlowStatement[]> => {
  if (API_KEY === 'dummy_key') {
    return Array(5).fill(null).map((_, i) => ({
      date: `2024-0${5 - i}-01`, symbol,
      operatingCashFlow: 200000000, capitalExpenditure: -50000000,
      freeCashFlow: 150000000, stockBasedCompensation: 20000000,
      netIncome: 150000000,
      fillingDate: `2024-0${5 - i}-15`, acceptedDate: `2024-0${5 - i}-15`,
      period: 'Q' + (4 - i), link: '', finalLink: ''
    }));
  }
  try {
    const data = await fetchData<CashFlowStatement[]>(`/cash-flow-statement?symbol=${symbol}&period=quarter&limit=${limit}`);
    return data || [];
  } catch (error) {
    console.error(`Error fetching cash flow for ${symbol}:`, error);
    if (error instanceof ApiError && error.code === 'MISSING_KEY') throw error;
    return [];
  }
};

export const getKeyMetrics = async (symbol: string): Promise<KeyMetrics | null> => {
  try {
    const data = await fetchData<KeyMetrics[]>(`/key-metrics-ttm?symbol=${symbol}`);
    return data?.[0] || null;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'MISSING_KEY') throw error;
    return null;
  }
};

export const getFinancialGrowth = async (symbol: string): Promise<FinancialGrowth | null> => {
  try {
    const data = await fetchData<FinancialGrowth[]>(`/financial-growth?symbol=${symbol}&limit=1`);
    return data?.[0] || null;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'MISSING_KEY') throw error;
    return null;
  }
};

export const getInsiderTrades = async (symbol: string): Promise<InsiderTrade[]> => {
  try {
    const data = await fetchData<InsiderTrade[]>(`/insider-trading/search?symbol=${symbol}&limit=50`);
    return data || [];
  } catch (error) {
    return [];
  }
};

// Bulk fetch for screener
export const getKeyExecutives = async (symbol: string): Promise<KeyExecutive[]> => {
  try {
    // [FIX] Explicitly force v3 endpoint to bypass stable base which might lack this resource
    return await fetchData<KeyExecutive[]>(`https://financialmodelingprep.com/api/v3/key-executives/${symbol}`);
  } catch (error) {
    console.error(`Error fetching key executives for ${symbol}:`, error);
    return [];
  }
};

export const getKeyStatistics = async (symbol: string): Promise<any | null> => {
  try {
    // TTM Key Metrics often has 'marketCap', 'pe', etc.
    // 'Key Statistics' specifically usually means Yahoo-style stats.
    // FMP has `/quote` which we use.
    // But for 'heldPercentInsiders', it's often in `/company-outlook` (Deep object) OR `/profile` (sometimes?)
    // Let's try `/key-metrics-ttm`? No, that's valuation.
    // Correct endpoint for ownership: `/institutional-holder/symbol` (List)
    // BUT user wants single number.
    // Let's look for "Key Statistics" endpoint?
    // /score?
    // Let's try to fetch `/enterprise-values`? No.
    // FMP v3/profile often has it?
    // Let's assume we use `/key-executives` for management.
    // For Ownership, if `/quote` doesn't have it, we might have to stick to manual OR use `/outlook` which is huge.
    // Wait, `/mp/key-statistics/{symbol}`?
    // I will use a known endpoint for "scores" or ratios.
    // Actually, I'll stick to `getKeyExecutives` for now (Management) and investigate Ownership further.
    // User mentioned: "Use Form 4 + DEF 14A proxy data".
    // I'll add `getInsiderStatistics` which might be a custom aggregation if API fails.
    // But wait, user said "Fix: Use Form 4...".
    // I will add `getKeyStatistics` attempting to hit `/key-executives` (done) and `/insider-trading/rss_feed`?
    // No, let's look for a specialized endpoint.
    // `v4/insider-roaster-statistic`

    // I will add `getInsiderStatistics` using the v4 endpoint which provides aggregated stats.
    const url = `/v4/insider-roaster-statistic?symbol=${symbol}`;
    // This usually returns { buys, sells, total, averageSecuritiesOwned... }
    return await fetchData<any>(url);
  } catch (error) {
    console.warn(`Error fetching insider stats for ${symbol}:`, error);
    return null;
  }
};

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

    // Screener might still be on v3 or have a different stable path, assuming stable for now or v3 fallback if needed.
    // Checking docs: Screener is usually /stock-screener.
    return await fetchData<any[]>(`/stock-screener?${query.toString()}`);
  } catch (error) {
    console.error('Screener fetch error:', error);
    return [];
  }
};

export const getCompanyMetaFromFmp = async (symbol: string): Promise<CompanyMeta | null> => {
  try {
    // Prefer /profile; fall back to /quote if profile is empty.
    const profile = await fetchData<CompanyProfile[]>(`/profile?symbol=${symbol}`);
    if (profile && profile.length > 0) {
      const p = profile[0];
      return {
        symbol: p.symbol ?? symbol,
        name: p.companyName ?? null,
        marketCap: typeof p.mktCap === "number" ? p.mktCap : null,
        currency: p.currency ?? null,
        exchange: p.exchangeShortName ?? p.exchange ?? null,
        sector: p.sector ?? null,
        industry: p.industry ?? null,
      };
    }

    // Optional fallback to quote
    const quote = await fetchData<StockQuote[]>(`/quote?symbol=${symbol}`);
    if (quote && quote.length > 0) {
      const q = quote[0];
      return {
        symbol: q.symbol ?? symbol,
        name: q.name ?? null,
        marketCap: typeof q.marketCap === "number" ? q.marketCap : null,
        currency: null, // Quote doesn't usually have currency
        exchange: q.exchange ?? null,
        sector: null, // Quote doesn't have sector
        industry: null,
      };
    }

    return null;
  } catch (err) {
    console.error(`[FMP] getCompanyMetaFromFmp error for ${symbol}:`, err);
    return null;
  }
};
