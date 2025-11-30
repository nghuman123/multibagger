
/**
 * Finnhub API Client
 * Free tier: 60 calls/minute
 * Docs: https://finnhub.io/docs/api
 */

import type { ShortInterestData, NewsItem, FinnhubMetrics, StockQuote, CompanyProfile } from '../../types';
import { fetchWithRetry, ApiError } from '../utils/retry';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_SHORT = 5 * 60 * 1000;
const CACHE_TTL_LONG = 60 * 60 * 1000;

const validateApiKey = () => {
  if (!API_KEY) {
    // Don't throw fatal error for Finnhub as it's secondary data
    // Just return false so we can gracefully degrade
    return false;
  }
  return true;
};

const fetchData = async <T>(endpoint: string, ttl: number = CACHE_TTL_SHORT): Promise<T | null> => {
  if (!validateApiKey()) return null;

  const cacheKey = `finnhub:${endpoint}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }

  try {
    return await fetchWithRetry(async () => {
      const url = `${FINNHUB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${API_KEY}`;
      const res = await fetch(url);

      if (res.status === 429) {
        throw new ApiError('RATE_LIMIT', 'Finnhub rate limit');
      }

      if (!res.ok) {
        throw new ApiError('NETWORK', `Finnhub Error ${res.status}`);
      }

      const data = await res.json();
      cache.set(cacheKey, { data, timestamp: Date.now() });
      return data as T;
    });
  } catch (error) {
    console.warn('[Finnhub] Fetch warning:', error);
    return null; // Gracefully degrade for Finnhub
  }
};

export const getCompanyProfile2 = async (symbol: string): Promise<CompanyProfile | null> => {
  const data = await fetchData<any>(`/stock/profile2?symbol=${symbol}`, CACHE_TTL_LONG);
  if (!data || !data.name) return null;

  return {
    symbol: data.ticker,
    price: 0, // Not in profile
    // beta: 0,
    // volAvg: 0,
    mktCap: data.marketCapitalization * 1000000, // Finnhub returns in millions
    // lastDiv: 0,
    // range: '',
    changes: 0,
    companyName: data.name,
    // currency: data.currency,
    // cik: '',
    // isin: '',
    // cusip: '',
    // exchange: data.exchange,
    // exchangeShortName: data.exchange,
    industry: data.finnhubIndustry,
    // website: data.weburl,
    description: 'Description unavailable via Finnhub Basic', // Finnhub basic profile doesn't have description
    ceo: 'N/A',
    sector: data.finnhubIndustry,
    // country: data.country,
    fullTimeEmployees: parseInt(data.fullTimeEmployees) || 0,
    // phone: '',
    // address: '',
    // city: '',
    // state: '',
    // zip: '',
    // dcfDiff: 0,
    // dcf: 0,
    // image: data.logo,
    ipoDate: data.ipo,
    // defaultImage: false,
    // isEtf: false,
    isActivelyTrading: true,
    // isAdr: false,
    isFund: false,
    changesPercentage: 0,
    exchange: data.exchange,
    isEtf: false
  };
};

export const getQuote = async (symbol: string): Promise<StockQuote | null> => {
  // Finnhub Quote Response: { c: current, d: change, dp: percent, h: high, l: low, o: open, pc: prev_close }
  const data = await fetchData<{ c: number, d: number, dp: number, h: number, l: number, o: number, pc: number }>(`/quote?symbol=${symbol}`);

  if (!data) return null;

  return {
    symbol: symbol,
    // name: symbol, // Finnhub quote doesn't return name, we'll use symbol or fetch profile separately if needed
    price: data.c,
    changesPercentage: data.dp,
    change: data.d,
    dayLow: data.l,
    dayHigh: data.h,
    yearHigh: 0, // Not in basic quote
    yearLow: 0,  // Not in basic quote
    marketCap: 0, // Not in basic quote
    // priceAvg50: 0,
    // priceAvg200: 0,
    volume: 0, // Not in basic quote
    avgVolume: 0,
    // exchange: 'US',
    // open: data.o,
    // previousClose: data.pc,
    eps: 0,
    pe: 0,
    // earningsAnnouncement: '',
    sharesOutstanding: 0,
    // timestamp: Date.now()
  };
};

export const getShortInterest = async (symbol: string): Promise<ShortInterestData | null> => {
  const data = await fetchData<{ data: ShortInterestData[] }>(`/stock/short-interest?symbol=${symbol}`);
  return data?.data?.[0] || null;
};

export const getCompanyNews = async (symbol: string, days: number = 30): Promise<NewsItem[]> => {
  const to = new Date().toISOString().split('T')[0];
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const from = fromDate.toISOString().split('T')[0];

  const data = await fetchData<NewsItem[]>(`/company-news?symbol=${symbol}&from=${from}&to=${to}`, CACHE_TTL_LONG);
  return data || [];
};

export const getBasicFinancials = async (symbol: string): Promise<FinnhubMetrics | null> => {
  const data = await fetchData<{ metric: any }>(`/stock/metric?symbol=${symbol}&metric=all`);
  if (!data?.metric) return null;

  return {
    symbol,
    peRatio: data.metric.peBasicExclExtraTTM,
    pbRatio: data.metric.pbAnnual,
    currentRatio: data.metric.currentRatioQuarterly,
    quickRatio: data.metric.quickRatioQuarterly,
    grossMargin: data.metric.grossMarginTTM,
    operatingMargin: data.metric.operatingMarginTTM,
    netMargin: data.metric.netProfitMarginTTM,
    returnOnEquity: data.metric.roeTTM,
    returnOnAssets: data.metric.roaTTM,
    revenueGrowth3Y: data.metric.revenueGrowth3Y,
    revenueGrowth5Y: data.metric.revenueGrowth5Y
  };
};
