
/**
 * Main Analyzer - Orchestrates all modules
 */

import * as fmp from './api/fmp';
import * as finnhub from './api/finnhub';
import * as massive from './api/massive';
import { calculateQuantitativeScore } from './scoring/quantScore';
import { calculateRiskFlags } from './scoring/riskFlags';
import * as gemini from './ai/gemini';
import { detectFounderStatus } from './utils/founderDetection';
import type { MultiBaggerAnalysis, SectorType, DataQuality } from '../types';

// Map FMP sectors to our sector types
const mapSector = (fmpSector: string, industry: string): SectorType => {
  const s = (fmpSector + ' ' + industry).toLowerCase();

  if (s.includes('software') || s.includes('saas') || s.includes('cloud')) return 'SaaS';
  if (s.includes('biotech') || s.includes('pharma') || s.includes('drug')) return 'Biotech';
  if (s.includes('aerospace') || s.includes('space') || s.includes('satellite')) return 'SpaceTech';
  if (s.includes('semiconductor') || s.includes('quantum')) return 'Quantum';
  if (s.includes('hardware') || s.includes('electronic') || s.includes('device')) return 'Hardware';
  if (s.includes('financial') || s.includes('bank') || s.includes('payment')) return 'FinTech';
  if (s.includes('consumer') || s.includes('retail') || s.includes('beverage')) return 'Consumer';
  if (s.includes('industrial') || s.includes('manufacturing')) return 'Industrial';

  return 'Other';
};

// Determine verdict based on scores
const determineVerdict = (
  compositeScore: number,
  disqualified: boolean,
  catalystsCount: number
): 'Strong Buy' | 'Buy' | 'Watch' | 'Pass' | 'Disqualified' => {

  if (disqualified) return 'Disqualified';
  if (compositeScore >= 80 && catalystsCount >= 2) return 'Strong Buy';
  if (compositeScore >= 70) return 'Buy';
  if (compositeScore >= 55) return 'Watch';
  return 'Pass';
};

// ============ MAIN ANALYSIS FUNCTION ============

export const analyzeStock = async (ticker: string): Promise<MultiBaggerAnalysis | null> => {

  console.log(`[Analyzer] Starting analysis for ${ticker}...`);

  // STEP 1: Fetch all financial data from FMP & Finnhub (Parallel)
  // Note: FMP might fail for free users on legacy endpoints.
  // We try to fetch what we can.

  // Helper to extract value from PromiseSettledResult
  const getVal = <T>(res: PromiseSettledResult<T>): T | null => res.status === 'fulfilled' ? res.value : null;

  const [
    fmpProfileResult,
    fmpQuoteResult,
    finnhubQuoteResult,
    massiveQuoteResult,
    massiveProfileResult,
    finnhubProfileResult,
    fmpIncomeResult,
    fmpBalanceResult,
    keyMetricsResult,
    financialGrowthResult,
    insiderTradesResult,
    shortInterestDataResult,
    finnhubMetricsResult,
    massiveFinancialsResult
  ] = await Promise.allSettled([
    fmp.getCompanyProfile(ticker),
    fmp.getQuote(ticker),
    finnhub.getQuote(ticker),
    massive.getQuote(ticker),
    massive.getCompanyProfile(ticker),
    finnhub.getCompanyProfile2(ticker),
    fmp.getIncomeStatements(ticker, 12),
    fmp.getBalanceSheets(ticker, 12),
    fmp.getKeyMetrics(ticker),
    fmp.getFinancialGrowth(ticker),
    fmp.getInsiderTrades(ticker),
    finnhub.getShortInterest(ticker),
    finnhub.getBasicFinancials(ticker),
    massive.getFinancials(ticker)
  ]);

  const fmpProfile = getVal(fmpProfileResult);
  const fmpQuote = getVal(fmpQuoteResult);
  const finnhubQuote = getVal(finnhubQuoteResult);
  const massiveQuote = getVal(massiveQuoteResult);
  const massiveProfile = getVal(massiveProfileResult);
  const finnhubProfile = getVal(finnhubProfileResult);
  const fmpIncome = getVal(fmpIncomeResult) || [];
  const fmpBalance = getVal(fmpBalanceResult) || [];
  const keyMetrics = getVal(keyMetricsResult) || null;
  const financialGrowth = getVal(financialGrowthResult) || null;
  const insiderTrades = getVal(insiderTradesResult) || [];
  const shortInterestData = getVal(shortInterestDataResult);
  const finnhubMetrics = getVal(finnhubMetricsResult);
  const massiveFinancials = getVal(massiveFinancialsResult);

  // Prefer Massive or Finnhub quote if FMP fails
  const quote = massiveQuote || finnhubQuote || fmpQuote;
  const profile = massiveProfile || fmpProfile || finnhubProfile;

  // If we have absolutely no data, fail.
  // But if we have at least a quote and profile (even if financials are missing), we might proceed with partial analysis?
  // For now, strict check: need profile and quote.
  if (!profile || !quote) {
    console.error(`[Analyzer] Missing critical data (Profile/Quote) for ${ticker}`);
    return null;
  }

  // Consolidate Financials
  // Use Massive financials if FMP is missing
  const incomeStatements = (fmpIncome.length > 0) ? fmpIncome : (massiveFinancials?.income || []);
  const balanceSheets = (fmpBalance.length > 0) ? fmpBalance : (massiveFinancials?.balance || []);

  // If financials are missing (FMP 403), we can't do Quant Score.
  // We will have to mock or skip quant score if incomeStatements is empty.
  const hasFinancials = incomeStatements.length > 0;
  let hasFinnhubMetrics = !!finnhubMetrics;
  let effectiveFinnhubMetrics = finnhubMetrics;

  console.log(`[Analyzer] Financial data fetched for ${profile.companyName}. Has Financials: ${hasFinancials} (Source: ${fmpIncome.length > 0 ? 'FMP' : (massiveFinancials?.income ? 'Massive' : 'None')}), Has Finnhub Metrics: ${hasFinnhubMetrics}`);

  // Fallback: If no hard financial data, try to estimate via Gemini (Google Search)
  if (!hasFinancials && !hasFinnhubMetrics) {
    console.log(`[Analyzer] No financial data found. Attempting to estimate via Gemini/Google Search...`);
    const estimates = await gemini.getFinancialEstimates(ticker);

    if (estimates.revenueGrowth3Y !== 0 || estimates.grossMargin !== 0) {
      effectiveFinnhubMetrics = {
        symbol: ticker,
        peRatio: 0,
        pbRatio: 0,
        currentRatio: 0,
        quickRatio: 0,
        grossMargin: estimates.grossMargin,
        operatingMargin: estimates.operatingMargin,
        netMargin: 0,
        returnOnEquity: estimates.returnOnEquity,
        returnOnAssets: 0,
        revenueGrowth3Y: estimates.revenueGrowth3Y,
        revenueGrowth5Y: 0
      };
      hasFinnhubMetrics = true;
      console.log(`[Analyzer] Gemini estimates retrieved: Growth ${estimates.revenueGrowth3Y}%, GM ${estimates.grossMargin}%`);
    }
  }

  // STEP 2: Determine sector
  const sector = mapSector(profile.sector, profile.industry);

  // STEP 3: Founder & Insider Detection
  // Estimate company age from IPO date (proxy)
  const ipoYear = profile.ipoDate ? new Date(profile.ipoDate).getFullYear() : 2000;
  const currentYear = new Date().getFullYear();
  const companyAge = currentYear - ipoYear;

  const founderCheck = detectFounderStatus(
    profile.ceo,
    profile.companyName,
    profile.description,
    companyAge
  );

  console.log(`[Analyzer] Founder status for ${profile.ceo}: ${founderCheck.isFounder} (${founderCheck.reason})`);

  // Insider Ownership Estimation
  const insiderOwnershipPct = 0;
  const insiderOwnershipSource: 'estimated' | 'unavailable' = insiderTrades.length > 0 ? 'estimated' : 'unavailable';

  // STEP 4: Calculate quantitative score
  let quantScore;
  if (hasFinancials || hasFinnhubMetrics) {
    quantScore = calculateQuantitativeScore(
      incomeStatements,
      financialGrowth,
      keyMetrics,
      insiderTrades,
      sector,
      founderCheck.isFounder,
      insiderOwnershipPct,
      effectiveFinnhubMetrics
    );
  } else {
    // Fallback if FMP financials failed: Return a neutral/empty score or try to infer from Finnhub metrics if we had them
    // For now, return a placeholder to prevent crash
    quantScore = {
      compositeScore: 50,
      revenueGrowth3YrCAGR: 0,
      grossMargin: 0,
      lastQuarterGrowth: 0,
      grossMarginTrend: 'Stable' as const,
      ruleOf40Value: 0,
      insiderOwnershipPct: 0,
      founderLed: false,
      netInsiderBuying90Days: 0,
      priceToSales: 0,
      psgRatio: 0,
      growthScore: 0,
      qualityScore: 0,
      ruleOf40Score: 0,
      insiderScore: 0,
      valuationScore: 0
    };
  }

  console.log(`[Analyzer] Quant score: ${quantScore.compositeScore}/100`);

  // STEP 5: Calculate risk flags
  const shortInterestPct = shortInterestData?.shortInterestPercentOfFloat || 0;

  let riskFlags;
  if (hasFinancials) {
    riskFlags = calculateRiskFlags(
      incomeStatements,
      balanceSheets,
      quote.marketCap,
      shortInterestPct
    );
  } else {
    riskFlags = {
      disqualified: false,
      disqualifyReasons: ["Financial data unavailable for risk check"],
      warnings: [],
      beneishMScore: 0,
      altmanZScore: 0,
      dilutionRate: 0,
      cashRunwayQuarters: 0,
      shortInterestPct: 0
    };
  }

  if (!shortInterestData) {
    riskFlags.warnings.push("Short Interest Data Unavailable");
  }

  console.log(`[Analyzer] Risk check: ${riskFlags.disqualified ? 'FAILED' : 'PASSED'}`);

  // STEP 6: AI-powered qualitative analysis (ONLY use AI here)
  const [visionaryAnalysis, catalysts, patternMatch, moatData] = await Promise.all([
    gemini.analyzeVisionaryLeadership(ticker, profile.ceo),
    gemini.extractCatalysts(ticker),
    gemini.findHistoricalPattern(ticker, sector, quote.marketCap, quantScore.revenueGrowth3YrCAGR, quantScore.grossMargin),
    gemini.analyzeMoatAndThesis(ticker, profile.description)
  ]);

  console.log(`[Analyzer] AI analysis complete`);

  // STEP 7: Calculate final score (weighted)
  const finalScore = riskFlags.disqualified
    ? 0
    : Math.round(
      (quantScore.compositeScore * 0.6) +
      (visionaryAnalysis.totalVisionaryScore * 2) + // Scale 1-10 to 0-20
      (patternMatch.matchScore * 0.2)
    );

  // STEP 8: Determine verdict
  const verdict = determineVerdict(finalScore, riskFlags.disqualified, catalysts.length);

  // STEP 9: Construct Data Quality Report
  const dataQuality: DataQuality = {
    insiderOwnershipSource: insiderTrades.length > 0 ? 'real' : 'unavailable', // Now we have FMP data
    beneishMScoreReliability: incomeStatements.length >= 2 ? 'full' : 'partial',
    shortInterestSource: shortInterestData ? 'real' : 'unavailable',
    overallConfidence: (incomeStatements.length >= 4 && balanceSheets.length >= 4) ? 'high' : 'medium'
  };

  // STEP 10: Compile final result
  const result: MultiBaggerAnalysis = {
    ticker,
    companyName: profile.companyName,
    sector,
    marketCap: quote.marketCap,
    price: quote.price,

    quantScore,
    riskFlags,
    visionaryAnalysis,
    patternMatch,

    moatAssessment: moatData.moat,
    growthThesis: moatData.thesis,
    catalysts,
    keyRisks: [...moatData.risks, ...riskFlags.disqualifyReasons, ...riskFlags.warnings],

    finalScore,
    verdict,

    dataQuality,
    dataTimestamp: new Date().toISOString(),
    sources: ['Financial Modeling Prep', 'Google Search (Gemini)', 'Finnhub']
  };

  console.log(`[Analyzer] Complete: ${ticker} = ${verdict} (Score: ${finalScore})`);

  return result;
};

// ============ BATCH SCREENING ============

export const screenStocks = async (params: {
  minMarketCap?: number;
  maxMarketCap?: number;
  sector?: string;
}): Promise<MultiBaggerAnalysis[]> => {

  // Get universe from FMP screener
  const universe = await fmp.getStockScreener({
    marketCapMoreThan: params.minMarketCap || 300000000, // $300M
    marketCapLowerThan: params.maxMarketCap || 5000000000, // $5B
    sector: params.sector,
    exchange: 'NASDAQ,NYSE',
    limit: 50
  });

  console.log(`[Screener] Found ${universe.length} stocks in universe`);

  const results: MultiBaggerAnalysis[] = [];

  for (const stock of universe) {
    try {
      // Rate limiting
      await new Promise(r => setTimeout(r, 1000));

      const analysis = await analyzeStock(stock.symbol);
      if (analysis && analysis.verdict !== 'Pass' && analysis.verdict !== 'Disqualified') {
        results.push(analysis);
      }
    } catch (error) {
      console.error(`[Screener] Error analyzing ${stock.symbol}:`, error);
    }
  }

  // Sort by final score
  return results.sort((a, b) => b.finalScore - a.finalScore);
};
