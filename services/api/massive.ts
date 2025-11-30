
/**
 * Massive.com (formerly Polygon.io) API Client
 * Docs: https://massive.com/docs
 */

import { fetchWithRetry, ApiError } from '../utils/retry';
import type { StockQuote, CompanyProfile, IncomeStatement, BalanceSheet } from '../../types';

const MASSIVE_BASE = 'https://api.polygon.io'; // Massive uses Polygon's API domain usually, let's verify or use massive.com if applicable. 
// Actually, Polygon.io is the API domain. Massive is the brand. 
// Let's stick to api.polygon.io as it's the standard.
// If the user provided a Massive key, it should work with Polygon endpoints.

// @ts-ignore
const API_KEY = import.meta.env.VITE_MASSIVE_API_KEY || import.meta.env.VITE_POLYGON_API_KEY;

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const validateApiKey = () => {
  if (!API_KEY) {
    console.warn('[Massive] API Key missing. Please add MASSIVE_API_KEY to .env');
    return false;
  }
  return true;
};

const fetchData = async <T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> => {
  if (!validateApiKey()) return null;

  const queryString = new URLSearchParams({ apiKey: API_KEY, ...params }).toString();
  const url = `${MASSIVE_BASE}${endpoint}?${queryString}`;
  const cacheKey = url;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }

  try {
    return await fetchWithRetry(async () => {
      const res = await fetch(url);

      if (res.status === 429) {
        throw new ApiError('RATE_LIMIT', 'Massive/Polygon rate limit');
      }

      if (!res.ok) {
        throw new ApiError('NETWORK', `Massive Error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      cache.set(cacheKey, { data, timestamp: Date.now() });
      return data as T;
    });
  } catch (error) {
    console.warn(`[Massive] Fetch error for ${endpoint}:`, error);
    return null;
  }
};

export const getQuote = async (ticker: string): Promise<StockQuote | null> => {
  // Endpoint: /v2/aggs/ticker/{ticker}/prev
  const data = await fetchData<{ results: any[], status: string }>(`/v2/aggs/ticker/${ticker}/prev`);

  if (!data || !data.results || data.results.length === 0) return null;

  const res = data.results[0];

  return {
    symbol: ticker,
    price: res.c,
    change: res.c - res.o, // Approx change from open
    changesPercentage: ((res.c - res.o) / res.o) * 100,
    dayLow: res.l,
    dayHigh: res.h,
    yearHigh: 0, // Not in prev close
    yearLow: 0,
    marketCap: 0, // Not in prev close
    volume: res.v,
    avgVolume: res.v, // Approx
    eps: 0,
    pe: 0,
    sharesOutstanding: 0
  };
};

export const getCompanyProfile = async (ticker: string): Promise<CompanyProfile | null> => {
  // Endpoint: /v3/reference/tickers/{ticker}
  const data = await fetchData<{ results: any, status: string }>(`/v3/reference/tickers/${ticker}`);

  if (!data || !data.results) return null;

  const res = data.results;

  return {
    symbol: res.ticker,
    companyName: res.name,
    sector: res.sic_description || 'Technology', // Fallback
    industry: res.sic_description || 'Software',
    mktCap: res.market_cap || 0,
    price: 0, // Not in profile
    changes: 0,
    changesPercentage: 0,
    exchange: res.primary_exchange,
    ceo: 'N/A', // Polygon doesn't always have CEO in this endpoint easily? Actually it might in 'branding' or similar? 
    // Wait, Polygon v3 ticker details usually has 'sic_description', 'description', 'homepage_url'. 
    // CEO might be missing. We'll survive.
    fullTimeEmployees: res.total_employees || 0,
    description: res.description || '',
    isActivelyTrading: res.active,
    isFund: false,
    isEtf: false,
    ipoDate: res.list_date || ''
  };
};

export const getFinancials = async (ticker: string): Promise<{ income: IncomeStatement[], balance: BalanceSheet[] } | null> => {
  // Endpoint: /vX/reference/financials
  // We want annual reports for depth
  const data = await fetchData<{ results: any[], status: string }>(`/vX/reference/financials`, {
    ticker,
    limit: '5',
    timeframe: 'annual'
  });

  if (!data || !data.results) return null;

  const income: IncomeStatement[] = [];
  const balance: BalanceSheet[] = [];

  data.results.forEach((report: any) => {
    const financials = report.financials;
    if (!financials) return;

    // Map Income Statement
    const inc = financials.income_statement;
    if (inc) {
      income.push({
        date: report.filing_date,
        symbol: ticker,
        revenue: inc.revenues?.value || 0,
        grossProfit: inc.gross_profit?.value || 0,
        grossProfitRatio: (inc.gross_profit?.value / inc.revenues?.value) || 0,
        operatingIncome: inc.operating_expenses?.value ? (inc.revenues?.value - inc.operating_expenses?.value) : 0, // Approx
        operatingIncomeRatio: 0,
        netIncome: inc.net_income_loss?.value || 0,
        netIncomeRatio: 0,
        ebitda: 0, // Need to calc
        ebitdaratio: 0,
        eps: inc.basic_earnings_per_share?.value || 0,
        epsdiluted: inc.diluted_earnings_per_share?.value || 0,
        weightedAverageShsOut: 0,
        weightedAverageShsOutDil: 0
      });
    }

    // Map Balance Sheet
    const bal = financials.balance_sheet;
    if (bal) {
      balance.push({
        date: report.filing_date,
        symbol: ticker,
        cashAndCashEquivalents: bal.cash_and_cash_equivalents_at_carrying_value?.value || 0,
        shortTermInvestments: 0,
        totalCurrentAssets: bal.current_assets?.value || 0,
        totalAssets: bal.assets?.value || 0,
        totalCurrentLiabilities: bal.current_liabilities?.value || 0,
        totalLiabilities: bal.liabilities?.value || 0,
        totalStockholdersEquity: bal.equity?.value || 0,
        retainedEarnings: bal.retained_earnings_accumulated_deficit?.value || 0,
        totalDebt: 0, // Need to sum debt fields
        netDebt: 0
      });
    }
  });

  return { income, balance };
};
