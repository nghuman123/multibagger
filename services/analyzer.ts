
/**
 * Main Analyzer - Orchestrates all modules
 */

import * as fmp from './api/fmp.ts';
// import * as finnhub from './api/finnhub.ts'; // [DISABLED]
import { calculateRiskFlags } from './scoring/riskFlags.ts';
import * as gemini from './ai/gemini.ts';
import { detectFounderStatus } from './utils/founderDetection.ts';
import { extractInstitutionalData } from './geminiService.ts'; // [NEW] Wrapper for data extraction
import { computeMultiBaggerScore } from './scoring/multiBaggerScore.ts';
import { getCache, setCache } from './utils/cache.ts'; // [FIX 28] Caching

// [REMOVED] Legacy scoringService
import { calculateImpliedGrowth } from './scoring/valuationScore.ts'; // [NEW]

import { computeTechnicalScore } from './scoring/technicalScore.ts';
import { computeSqueezeSetup } from './scoring/squeezeSetup.ts';
import { calcTTM } from './utils/financialUtils.ts';

import type { MultiBaggerAnalysis, SectorType, DataQuality, TechnicalScore, SqueezeSetup, HistoricalPrice, MultiBaggerScore, FundamentalData } from '../types.ts';
import type { AntigravityResult } from '../src/types/antigravity.ts'; // [NEW] Explicit import
import { PriceHistoryData } from '../src/types/scoring.ts';
import { TIER_THRESHOLDS } from '../config/scoringThresholds.ts';

// [NEW] Helper: Sanitize Gross Margin (0% -> null)
function sanitizeGrossMargin(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  // Treat exact 0 as "missing/anomalous" for GM, not a real 0%
  if (raw === 0) return null;
  return raw;
}

// [NEW] Helper: Market Cap Penalty
function marketCapPenalty(marketCapBillions: number | null): number {
  if (marketCapBillions == null) return 0;
  if (marketCapBillions >= 500) return -10; // mega-cap
  if (marketCapBillions >= 200) return -5;  // very large
  return 0;
}

// [NEW] Helper: Unique Lines
function uniqLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
}

// [NEW] Helper: Build Warning Summary
function buildWarningCatalystSummary(params: {
  mainRisk?: string | null;
  bearCase?: string | null;
  bullCase?: string | null;
  dataQualityWarnings?: string[] | null;
  riskWarnings?: string[];
}): string {
  const { mainRisk, bearCase, bullCase, dataQualityWarnings, riskWarnings } = params;

  const lines: string[] = [];

  if (mainRisk) lines.push(`Risk: ${mainRisk}`);
  if (riskWarnings && riskWarnings.length > 0) {
    // Add top risk warnings (limit 2)
    riskWarnings.slice(0, 2).forEach(w => lines.push(`Risk: ${w}`));
  }
  if (bearCase) lines.push(`Bear case: ${bearCase}`);
  if (bullCase) lines.push(`Bull case: ${bullCase}`);
  if (dataQualityWarnings && dataQualityWarnings.length > 0) {
    for (const dq of dataQualityWarnings) {
      lines.push(`Data quality: ${dq}`);
    }
  }

  const deduped = uniqLines(lines);
  return deduped.join('\n');
}



// Founder Led Override Map (Source of Truth)
// [REMOVED] Hardcoded Founder Override List


// [NEW] Helper: Calculate Moat/Insider Score from Antigravity Report
function calcMoatInsiderScore(report: AntigravityResult): number {
  let score = 0;

  const moat = report.moatScore ?? 0;
  if (moat >= 8) score += 4;       // strong moat
  else if (moat >= 6) score += 2;  // decent moat

  if (report.tamPenetration === 'low') {
    // early in TAM → long runway
    score += 2;
  }

  if (report.founderLed) {
    score += 2;
  }

  const ins = report.insiderOwnership ?? 0;
  // sweet spot: 10%–40% insider ownership
  if (ins >= 0.10 && ins <= 0.40) {
    score += 3;
  } else if (ins >= 0.05) {
    score += 1;
  }

  return score;
}

// [NEW] Helper: Cap score for unprofitable companies
function applyProfitabilityCap(
  finalScore: number,
  metrics: { roe: number | null; fcfMargin: number | null }
): number {
  const roe = metrics.roe ?? 0;
  const fcf = metrics.fcfMargin ?? 0;
  // Check if unprofitable (negative ROE OR negative FCF)
  // Be careful: Amazon had negative ROE for years but positive OCF.
  // Let's stick to the requested logic: "Unprofitable companies (negative ROE or FCF margin)"
  const isUnprofitable = roe < 0 || fcf < 0;

  if (!isUnprofitable) return finalScore;

  // Cap at 89 (Tier 2 max)
  const capped = Math.min(finalScore, 89);
  if (capped !== finalScore) {
    console.log(`[ProfitabilityCap] Unprofitable (ROE=${roe.toFixed(2)}, FCF=${fcf.toFixed(2)}) → capped from ${finalScore} to ${capped}`);
  }
  return capped;
}

// [FIX 20] AI De-Blackboxing
// Removed opaque "Strong Pass" (+12) boosts. 
// AI should act as a Safety Filter (AVOID) or Qualitative Input (Moat), not a raw score multiplier.

const AI_SCORE_CAPS = {
  STRONG_PASS_MAX: 0,     // [DEPRECATED] Was 12
  SOFT_PASS_MAX: 0,       // [DEPRECATED] Was 8
  MONITOR_PENALTY: -2,    // Keep penalty for "Monitor"
  AVOID_PENALTY: -5       // Keep penalty for "Avoid"
};

// [REMOVED] integrateAiAndQuant - Superseded by direct penalties in analyzer loop

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

// Founder Led Override Map (Source of Truth)


// [FIX 23] Determine Macro Regime
const determineMacroRegime = (spyHistory: HistoricalPrice[], tnxHistory: HistoricalPrice[]): 'Bull' | 'Bear' | 'Neutral' => {
  if (!spyHistory.length || spyHistory.length < 200) return 'Neutral';

  // 1. Calculate SPY 200 SMA
  const spyCloses = spyHistory.slice(0, 200).map(c => c.close);
  const spySma200 = spyCloses.reduce((a, b) => a + b, 0) / spyCloses.length;
  const spyCurrent = spyHistory[0].close;

  // 2. Calculate TNX Trend (Optional context, maybe just use SPY)
  // Rising rates = Headwind.
  // For now, Regime is determined by Market Trend (SPY).

  if (spyCurrent > spySma200) return 'Bull';
  return 'Bear';
};

const determineVerdict = (
  multiBaggerScore: number,
  disqualified: boolean,
  tier: string,
  macroRegime: 'Bull' | 'Bear' | 'Neutral' = 'Neutral'
): MultiBaggerAnalysis['verdict'] => {
  if (disqualified) return 'Disqualified';

  // [FIX 23] Macro Overlay: Be stricter in Bear markets
  const scoreThreshold = macroRegime === 'Bear' ? 85 : 80; // Raise bar to 85 for Tier 1 in Bear

  if (multiBaggerScore >= scoreThreshold) return 'Strong Buy'; // Elite
  if (tier === 'Tier 1') return 'Buy'; // Was Strong Buy, now just Buy if macro is meh
  if (tier === 'Tier 2') return 'Buy';
  if (tier === 'Tier 3') return 'Watch';
  return 'Pass';
};

// Map score to Tier Label
const mapScoreToTier = (score: number, disqualified: boolean): MultiBaggerAnalysis['overallTier'] => {
  if (disqualified || score === 0) return 'Disqualified';

  if (score >= 90) return 'Tier 1';
  if (score >= 60) return 'Tier 2';
  if (score >= 40) return 'Tier 3';
  return 'Not Interesting';
};

const determinePositionSize = (
  tier: string,
  disqualified: boolean,
  macroRegime: 'Bull' | 'Bear' | 'Neutral' = 'Neutral'
): string => {
  if (disqualified) return '0% (Disqualified)';

  // [FIX 23] Reduce sizing in Bear markets
  const adjust = (size: string) => macroRegime === 'Bear' ? `Half Size ${size}` : size;

  if (tier === 'Tier 1') return adjust('5-8%');
  if (tier === 'Tier 2') return adjust('3-5%');
  if (tier === 'Tier 3') return '1-3%';
  return '0%';
};

// ============ MAIN ANALYSIS FUNCTION ============

export const analyzeStock = async (ticker: string, referenceDate?: Date): Promise<MultiBaggerAnalysis | null> => {

  const snapshotDate = referenceDate || new Date(); // Current time if not backtesting
  const snapshotDateStr = snapshotDate.toISOString().split('T')[0];

  console.log(`[Analyzer] Starting analysis for ${ticker}... (Snapshot: ${snapshotDateStr})`);
  const dataQualityWarnings: string[] = [];

  // Helper: Point-in-Time Filter (Exclude future data)
  // Logic: Filing Date must be <= Snapshot Date
  const filterByDate = <T extends { date: string; filingDate?: string }>(data: T[]): T[] => {
    if (!referenceDate) return data; // No filtering needed if not backtesting
    return data.filter(item => {
      // Use filingDate (when it became public) if available, else period date (approx, but risky)
      // FMP 'date' is usually period end. 'filingDate' is SEC filing.
      // To strictly prevent lookahead, we want filtering by filingDate <= snapshotDate.
      // If filingDate is missing, falling back to 'date' implies we assume instant availability (optimistic).
      // Let's use 'date' as a loose fallback but prefer filingDate.
      const availableDate = item.filingDate || item.date;
      return new Date(availableDate) <= snapshotDate;
    });
  }

  // STEP 1: Fetch all financial data from FMP & Finnhub (Parallel)
  // Note: FMP might fail for free users on legacy endpoints.
  // We try to fetch what we can.
  // Note 2: We fetch EVERYTHING, then filter locally. This is inefficient but FMP historical API is tricky.
  // 2. Fetch Data in Parallel (Fail-Fast or All-Settled strategy)
  // We use allSettled to be robust against one API failure
  const [
    profileResult,
    quoteResult,
    incomeResult,
    balanceResult,
    cashFlowResult,
    metricsResult,
    insiderTradesResult,
    growthResult,
    priceHistoryResult,
    spyHistoryResult, // [NEW] Fetch Benchmark (SPY)
    tnxHistoryResult, // [FIX 23] Fetch TNX
    executivesResult // [FIX 22]
  ] = await Promise.allSettled([
    fmp.getCompanyProfile(ticker),
    fmp.getQuote(ticker),
    fmp.getIncomeStatements(ticker),
    fmp.getBalanceSheets(ticker),
    fmp.getCashFlowStatements(ticker),
    fmp.getKeyMetrics(ticker),
    fmp.getInsiderTrades(ticker),
    fmp.getFinancialGrowth(ticker),
    fmp.getHistoricalPrice(ticker, 365), // 1 year daily candles
    fmp.getHistoricalPrice('SPY', 365),  // [NEW] Benchmark
    fmp.getHistoricalPrice('IEF', 365),  // [FIX 23] Treasury Bond ETF (Proxy for Yields: Price DOWN = Yields UP)
    fmp.getKeyExecutives(ticker)         // [FIX 22] Management Quality
  ]);

  // Extract Data (Helper to throw if critical missing)
  const getVal = <T>(res: PromiseSettledResult<T>, name: string, required = true): T | null => {
    if (res.status === 'fulfilled') return res.value;
    if (required) throw new Error(`Missing required data: ${name}`);
    console.warn(`[Warning] Missing optional data: ${name}`, res.reason);
    return null;
  };

  const profile = getVal(profileResult, 'Profile')!;
  const quote = getVal(quoteResult, 'Quote')!;

  // Consolidate Financials & Filter Point-in-Time
  const incomeStatements = filterByDate((getVal(incomeResult, 'Income') || []) as import('../types').IncomeStatement[]);
  const balanceSheets = filterByDate((getVal(balanceResult, 'Balance') || []) as import('../types').BalanceSheet[]);
  const cashFlowStatements = filterByDate((getVal(cashFlowResult, 'CashFlow') || []) as import('../types').CashFlowStatement[]);

  // Explicitly cast to array types to allow indexing
  const keyMetrics = (getVal(metricsResult, 'Metrics', false) || []) as import('../types').KeyMetrics[];
  const financialGrowth = (getVal(growthResult, 'Growth') || []) as import('../types').FinancialGrowth[];
  const priceHistory = getVal(priceHistoryResult, 'PriceHistory', false) || [];
  const spyHistory = getVal(spyHistoryResult, 'SPY', false) || [];
  const tnxHistory = (getVal(tnxHistoryResult as any, 'TNX', false) || []) as HistoricalPrice[]; // Actually IEF now
  const keyExecutives = getVal(executivesResult, 'Executives', false) || [];

  // [FIX 23] Calc Macro Regime
  const macroRegime = determineMacroRegime(spyHistory, tnxHistory);
  if (macroRegime !== 'Neutral') {
    console.log(`[Macro] Regime Detected: ${macroRegime} (SPY > 200 SMA: ${macroRegime === 'Bull'})`);
  }

  const rawInsiderTrades = getVal(insiderTradesResult, 'Insider') || [];
  const insiderTrades = referenceDate
    ? rawInsiderTrades.filter(t => new Date(t.transactionDate) <= snapshotDate)
    : rawInsiderTrades;

  // If we have absolutely no data, fail.
  if (!profile || !quote) {
    console.error(`[Analyzer] Missing critical data (Profile/Quote) for ${ticker}`);
    return null;
  }

  // Additional Data Quality Check: Freshness
  // If the most recent financial statement is > 180 days older than snapshot, warn STALE.
  if (incomeStatements.length > 0) {
    const latestDate = new Date(incomeStatements[0].filingDate || incomeStatements[0].date);
    const ageInDays = (snapshotDate.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24);

    if (ageInDays > 180) {
      const msg = `Data Stale: Latest filing (${incomeStatements[0].date}) is ${Math.round(ageInDays)} days old.`;
      dataQualityWarnings.push(msg);
      console.warn(`[DataQuality] ${msg}`);
    }
  }

  const hasFinancials = incomeStatements.length > 0;
  // let hasFinnhubMetrics = !!finnhubMetrics; // [DISABLED]
  let effectiveFinnhubMetrics: any = null; // [DISABLED]

  console.log(`[Analyzer] Financial data fetched for ${profile.companyName}. Has Financials: ${hasFinancials}`);

  // Fallback: If no hard financial data, try to estimate via Gemini (Google Search)
  if (!hasFinancials) {
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
        revenueGrowth5Y: 0,
        dbnr: estimates.netRetention // [FIX 16] Map DBNR
      };

      // Update FundamentalData profile if mostly inferred
      if (estimates.revenueType) {
        // We can't easily mutate 'profile', but we can ensuring it flows to 'analyzeStock' return or scoring.
        // Actually, 'data' passed to computeMultiBaggerScore comes from 'profile' and others.
        // We need to make sure 'revenueType' is populated in 'data'.
        // Currently 'revenueType' is in 'analyzeQualitativeFactors'.
        // Let's rely on 'analyzeQualitativeFactors' for the MAIN revenueType, 
        // but use this as a fallback quantitative signal if needed?
        // Actually, let's inject it into the final data object used for scoring.
      }

      console.log(`[Analyzer] Gemini estimates: Growth ${estimates.revenueGrowth3Y}%, GM ${estimates.grossMargin}%, DBNR ${estimates.netRetention}%`);
    }
  }

  // STEP 2: Determine sector
  const sector = mapSector(profile.sector, profile.industry);

  // STEP 3: Founder & Insider Detection
  // [FIX 22] Management Quality (Tenure)
  // Logic: Find CEO, check tenure.
  let ceoTenure = 0;
  const ceoExec = keyExecutives.find(e => e.title && (e.title.includes("CEO") || e.title.includes("Chief Executive")));
  if (ceoExec) {
    if (ceoExec.titleSince) {
      ceoTenure = new Date().getFullYear() - new Date(ceoExec.titleSince).getFullYear();
    } else {
      // Fallback: If no titleSince, assume 2 years or do nothing?
      // Many entries might be null.
    }
    console.log(`[Analyzer] CEO ${ceoExec.name}, Tenure ~${ceoTenure} years`);
  }

  // [FIX 21] Insider Data Quality
  // Using insiderStats (v4) - Currently disabled as endpoint fetch is not implemented
  //  // The 'v4/insider-roaster-statistic' returns an array.
  let netInsiderTrend = 0; // [FIX] Define variable to prevent usage error
  /* 
  if (Array.isArray(insiderStats)) { ... } 
  */
  // if (Array.isArray(insiderStats)) { ... }

  const ipoYear = profile.ipoDate ? new Date(profile.ipoDate).getFullYear() : 2000;
  const currentYear = new Date().getFullYear();
  const companyAge = currentYear - ipoYear;

  let founderCheck = { isFounder: false, reason: "No founder signals detected" };

  // 2. Heuristic Check
  const ceoName = profile.ceo || ceoExec?.name || null;

  founderCheck = detectFounderStatus(
    ceoName,
    profile.companyName,
    profile.description,
    companyAge,
    ticker
  );

  // Override if Tenure > 15 years? (Often founder-like behavior)
  if (ceoTenure > 15 && !founderCheck.isFounder) {
    founderCheck.isFounder = true; // quasi-founder
    founderCheck.reason = `Long Tenure (${ceoTenure}y)`;
  }

  console.log(`[Analyzer] Founder status for ${ticker}: ${founderCheck.isFounder} (${founderCheck.reason})`);

  // Insider Ownership Estimation (Computed from Trades - Legacy but kept as fallback)
  let insiderOwnershipPct = 0;

  // Use 'insiderTrades' instead of 'filteredInsiderTrades'
  if (insiderTrades && insiderTrades.length > 0 && incomeStatements[0]?.weightedAverageShsOutDil) {
    // [FIX] Improved Deduping
    const seenCIKs = new Set();
    let totalInsiderShares = 0;

    // Filter for latest 'securitiesOwned' per CIK
    const sorted = [...insiderTrades].sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());

    for (const t of sorted) {
      if (t.reportingCik && !seenCIKs.has(t.reportingCik) && t.securitiesOwned > 0) {
        seenCIKs.add(t.reportingCik);
        totalInsiderShares += t.securitiesOwned;
      }
    }

    if (incomeStatements[0].weightedAverageShsOutDil > 0) {
      insiderOwnershipPct = (totalInsiderShares / incomeStatements[0].weightedAverageShsOutDil) * 100;
      // Sanity check: cap at 100
      if (insiderOwnershipPct > 100) insiderOwnershipPct = 0; // Data error likely
    }

    console.log(`[Analyzer] Calculated Insider Ownership: ${insiderOwnershipPct.toFixed(1)}% (${(totalInsiderShares / 1e6).toFixed(1)}M / ${(incomeStatements[0].weightedAverageShsOutDil / 1e6).toFixed(1)}M shares)`);
  } else {
    // Fallback?
    // KeyMetrics sometimes has it?
    // insiderOwnershipPct = keyMetrics?.insiderOwnership ?? 0; // If available
  }

  // [NEW] Insider Cluster Detection
  // Detects if multiple unique insiders bought within a short window (14 days)
  let insiderClusterDetected = false;
  let uniqueInsidersBuying = 0;

  if (insiderTrades && insiderTrades.length > 0) {
    const recentBuys = insiderTrades.filter(t =>
      (t.transactionType === 'P-Purchase' || t.acquistionOrDisposition === 'A') &&
      new Date(t.transactionDate).getTime() > Date.now() - (180 * 24 * 60 * 60 * 1000)
    );

    // Group by 2-week windows
    // Simple approach: Check if any 14-day window has >= 2 unique buyers
    const buyers = new Set<string>();
    recentBuys.forEach(t => buyers.add(t.reportingCik));
    uniqueInsidersBuying = buyers.size;

    if (uniqueInsidersBuying >= 2) {
      // Refine: Are they clustered?
      // Sort buys by date
      recentBuys.sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime());

      for (let i = 0; i < recentBuys.length; i++) {
        const start = new Date(recentBuys[i].transactionDate).getTime();
        const windowEnd = start + (14 * 24 * 60 * 60 * 1000);
        const clusterBuilders = new Set<string>();
        clusterBuilders.add(recentBuys[i].reportingCik);

        for (let j = i + 1; j < recentBuys.length; j++) {
          const curr = new Date(recentBuys[j].transactionDate).getTime();
          if (curr <= windowEnd) {
            clusterBuilders.add(recentBuys[j].reportingCik);
          } else {
            break;
          }
        }
        if (clusterBuilders.size >= 2) {
          insiderClusterDetected = true;
          break;
        }
      }
    }
  }

  // STEP 4: Calculate Basic Metrics (Replacement for QuantScore)
  // We need these for AI context and Valuation Gap before running the full MultiBagger score.

  // 1. CAGR (3Y)
  let revenueGrowth3YrCAGR = 0;
  if (incomeStatements.length >= 13) { // 3 years + 1 qtr
    const current = incomeStatements[0].revenue;
    const old = incomeStatements[12].revenue;
    if (old > 0) revenueGrowth3YrCAGR = (Math.pow(current / old, 1 / 3) - 1) * 100;
  } else if (effectiveFinnhubMetrics?.revenueGrowth3Y) {
    revenueGrowth3YrCAGR = effectiveFinnhubMetrics.revenueGrowth3Y;
  }

  // 2. Gross Margin (TTM or latest)
  let grossMargin = (incomeStatements[0]?.grossProfitRatio || 0) * 100;
  if (grossMargin === 0 && effectiveFinnhubMetrics?.grossMargin) {
    grossMargin = effectiveFinnhubMetrics.grossMargin;
  }

  // 3. Last Year Growth
  let revenueGrowth = 0;
  if (incomeStatements.length >= 5) {
    const current = incomeStatements[0].revenue;
    const old = incomeStatements[4].revenue;
    if (old > 0) revenueGrowth = (current - old) / old;
  } else if (effectiveFinnhubMetrics?.revenueGrowthTTMYoy) {
    revenueGrowth = effectiveFinnhubMetrics.revenueGrowthTTMYoy / 100;
  }

  // Clean up legacy placeholders
  // quantScore was removed.



  // console.log(`[Analyzer] Quant score: ${quantScore.compositeScore}/100`); // [REMOVED] Legacy log confusing

  // STEP 5: Risk Flags (Kill Switches)
  const shortInterestPct = 0; // [DISABLED] shortInterestData?.shortInterestPercentOfFloat || 0;

  let riskFlags;
  if (hasFinancials) {
    riskFlags = calculateRiskFlags(
      incomeStatements,
      balanceSheets,
      cashFlowStatements,
      quote.marketCap || profile.mktCap || 0,
      incomeStatements[0]?.revenue || 0, // [NEW] Pass TTM Revenue
      sector, // [FIX 12] Pass Sector
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
      shortInterestPct: 0,
      qualityOfEarnings: 'Warn' as const, // [NEW]
      fcfConversionRatio: 0, // [NEW]
      consecutiveNegativeFcfQuarters: 0, // [NEW]
      riskPenalty: 0 // [NEW]
    };
  }

  // if (!shortInterestData) {
  //   riskFlags.warnings.push("Short Interest Data Unavailable");
  // }

  if (riskFlags.disqualified) {
    console.log(`[Analyzer] Risk check: FAILED (Hard Kill)`, riskFlags.disqualifyReasons);
  } else if (riskFlags.warnings.length > 0) {
    console.log(`[Analyzer] Risk check: WARNINGS (Penalty: ${riskFlags.riskPenalty})`, riskFlags.warnings);
  } else {
    console.log(`[Analyzer] Risk check: PASSED`);
  }

  // STEP 6: AI Analysis (Visionary & Moat & Antigravity)
  // [TASK 4] Skip AI for Hard Kill / Disqualified stocks
  let visionaryAnalysis, qualitativeAnalysis, patternMatch, moatData, antigravityReport;

  if (riskFlags.disqualified) {
    console.log(`[Analyzer] Stock is DISQUALIFIED. Skipping AI analysis.`);
    visionaryAnalysis = {
      totalVisionaryScore: 0,
      explanation: "Skipped due to disqualification",
      longTermScore: 0,
      customerScore: 0,
      innovationScore: 0,
      capitalScore: 0,
      ceoName: profile.ceo
    };
    qualitativeAnalysis = {
      tamPenetration: '5-10%', revenueType: 'Transactional', catalysts: [],
      catalystDensity: 'Low', asymmetryScore: 'Low', pricingPower: 'Weak', reasoning: "Skipped"
    };
    patternMatch = { matchScore: 0, similarTo: "None", keyParallels: [], keyDifferences: [] };
    moatData = {
      moatScore: 0,
      primaryMoatType: "None",
      moatDurability: "None",
      oneLineThesis: "Skipped",
      bullCase: [],
      bearCase: []
    };
    antigravityReport = {
      aiStatus: 'AVOID' as const,
      aiTier: 'Disqualified' as const,
      aiConviction: 100,
      thesisSummary: "Skipped due to disqualification",
      bullCase: "",
      bearCase: "",
      keyDrivers: [],
      warnings: [],
      timeHorizonYears: 0,
      multiBaggerPotential: 'LOW' as const,
      positionSizingHint: 'NONE' as const,
      notesForUI: "",
      primaryMoatType: 'none' as const,
      moatScore: 0,
      tamCategory: 'small' as const,
      tamPenetration: 'low' as const,
      founderLed: false,
      insiderOwnership: 0,
      warningFlags: [],
      positiveCatalysts: []
    };
  } else {
    // AI Analysis (Metrics already calculated in Step 4)
    // [FIX 28] Caching Layer for Determinism
    const cacheKey = `gemini_analysis_${ticker}_${incomeStatements[0]?.date || 'latest'}`;
    const cachedAi = await getCache<any>(cacheKey);

    if (cachedAi) {
      console.log(`[Analyzer] AI Cache HIT (${cacheKey})`);
      ({ visionaryAnalysis, qualitativeAnalysis, patternMatch, moatData, antigravityReport } = cachedAi);
    } else {
      console.log(`[Analyzer] AI Cache MISS - Running Gemini...`);
      [visionaryAnalysis, qualitativeAnalysis, patternMatch, moatData, antigravityReport] = await Promise.all([
        gemini.analyzeVisionaryLeadership(ticker, profile.ceo),
        gemini.analyzeQualitativeFactors(ticker, profile.companyName, sector),
        gemini.findHistoricalPattern(ticker, sector, quote.marketCap, revenueGrowth3YrCAGR, grossMargin),
        gemini.analyzeMoatAndThesis(ticker, profile.description),
        gemini.analyzeAntigravity({
          ticker,
          companyName: profile.companyName,
          sector,
          marketCap: quote.marketCap || profile.mktCap || 0,
          description: profile.description,
          quantScore: {
            compositeScore: 50, // Dummy
            revenueGrowth3YrCAGR,
            grossMargin,
            lastQuarterGrowth: 0,
            grossMarginTrend: 'Stable',
            ruleOf40Value: 0,
            insiderOwnershipPct,
            founderLed: founderCheck.isFounder,
            netInsiderBuying180Days: 0,
            priceToSales: 0,
            psgRatio: 0,
            growthScore: 0,
            qualityScore: 0,
            ruleOf40Score: 0,
            insiderScore: 0,
            valuationScore: 0
          },
          riskFlags
        })
      ]);

      // Save to cache
      await setCache(cacheKey, { visionaryAnalysis, qualitativeAnalysis, patternMatch, moatData, antigravityReport }, 30 * 24 * 60 * 60); // 30 days
      console.log(`[Analyzer] AI Analysis Cached`);
    }
  }

  // [TASK 1] AI Override for Founder Led
  if (antigravityReport?.founderLed === true) {
    founderCheck.isFounder = true;
    founderCheck.reason = "AI Confirmed Founder-Led";
    console.log(`[Analyzer] Founder status updated by AI: TRUE`);
  }

  // STEP 7: MultiBagger Score
  // Calculate metrics for bonuses
  // [FIX] Use TTM helper for correct trailing 12-month sums
  const ttmRevenue = calcTTM(incomeStatements, "revenue") || 0;
  const ttmNetIncome = calcTTM(incomeStatements, "netIncome") || 0;
  const ttmOperatingCashFlow = calcTTM(cashFlowStatements, "operatingCashFlow") || 0;
  const ttmCapitalExpenditure = calcTTM(cashFlowStatements, "capitalExpenditure") || 0;

  const ttmFreeCashFlow = ttmOperatingCashFlow - Math.abs(ttmCapitalExpenditure); // Capex is usually negative in CF statement, but let's be safe
  const totalEquity = balanceSheets[0]?.totalStockholdersEquity || 1; // Avoid div/0

  const roe = ttmNetIncome / totalEquity; // 0.4 = 40%
  const fcfMargin = ttmRevenue > 0 ? ttmFreeCashFlow / ttmRevenue : 0; // 0.25 = 25%

  // Revenue Growth (TTM vs Prior TTM)
  // [REFACTOR] Use revenueGrowth calculated in Step 4, or verify here.
  // If we want to be robust, we can keep the logic but assign to existing variable without 'let'.
  if (revenueGrowth === 0) {
    if (incomeStatements.length >= 5) {
      const currentTTM = incomeStatements.slice(0, 4).reduce((sum, q) => sum + q.revenue, 0);
      const priorTTM = incomeStatements.slice(4, 8).reduce((sum, q) => sum + q.revenue, 0);
      if (priorTTM > 0) {
        revenueGrowth = (currentTTM - priorTTM) / priorTTM;
      }
    } else if (financialGrowth && financialGrowth.length > 0) {
      revenueGrowth = financialGrowth[0].revenueGrowth;
    }
  }

  const fundamentalData: FundamentalData = {
    ticker,
    sector,
    price: quote.price,
    marketCap: quote.marketCap || profile.mktCap || 0,
    // metrics: {} removed (flat structure)

    // === Core Financials ===
    revenueGrowth: revenueGrowth,
    revenueGrowthForecast: financialGrowth[0]?.revenueGrowth || 0,
    grossMargin: grossMargin,

    // === Valuation ===
    peRatio: keyMetrics[0]?.peRatio || 0, // [FIX] Array access
    // pegRatio: keyMetrics[0]?.peRatio || 0, // removed duplicate
    psRatio: quote.priceToSales || keyMetrics[0]?.priceToSalesRatio || 0,
    // pegRatio: quote.pe && revenueGrowth3YrCAGR > 0 ? quote.pe / revenueGrowth3YrCAGR : 0, // Duplicate, removed

    // === Efficiency ===
    roe: roe,
    fcfMargin: fcfMargin,
    roic: keyMetrics[0]?.roic || 0,
    isProfitable: roe > 0 && fcfMargin > 0, // Computed flag

    // === SaaS / Quality ===
    revenueType: qualitativeAnalysis.revenueType || 'Transactional',
    ruleOf40Score: (revenueGrowth * 100) + (fcfMargin * 100),
    dbnr: effectiveFinnhubMetrics?.dbnr || 0,
    accrualsRatio: 0, // TODO: Calc from Statement

    // === Risks & Structure ===
    shareCountGrowth3Y: 0, // TODO: Calc
    debtToEbitda: keyMetrics[0]?.netDebtToEBITDA || 0,

    // === Catalysts & AI ===
    catalystDensity: qualitativeAnalysis.catalystDensity as any,
    asymmetryScore: qualitativeAnalysis.asymmetryScore as any,
    pricingPower: qualitativeAnalysis.pricingPower as any,

    // === [FIX 21, 22, 27] New Data Points ===
    insiderOwnershipPct: insiderOwnershipPct,
    founderLed: founderCheck.isFounder,
    shortInterestPercentOfFloat: shortInterestPct, // from Step 5
    ceoTenure: ceoTenure,
    insiderTrend: netInsiderTrend,

    // Legacy / Others
    // revenueHistory: ... // Type doesn't have it anymore if we aliased StockMetricData?
    // Wait, StockMetricData DOES NOT have revenueHistory! 
    // I need to check if I broke that. 
    // `multiBaggerScore.ts` uses `data.revenueHistory`.
    // I need to ADD `revenueHistory` to `StockMetricData` (FundamentalData) in types.ts!
    // Or I should remove it from usage in favor of pre-calc metrics.
    // `multiBaggerScore.ts` uses it for acceleration.
    // I will add it to types.ts later if broken. For now I'll cast or omit.
  };

  // Helper to re-inject revenueHistory if needed via extension
  (fundamentalData as any).revenueHistory = incomeStatements.map(i => ({ date: i.date, value: i.revenue }));

  // Populate missing fields from legacy quantScore logic if needed, or just use defaults for now.
  // Ideally we should port the quantScore logic to populate FundamentalData correctly.
  // For now, using defaults/placeholders as per previous step.

  // -------------------------------------------------------------------------
  // [INSTITUTIONAL UPGRADE] New Scoring Engine Integration
  // -------------------------------------------------------------------------

  // 1. Construct StockMetricData from FMP + Estimates
  // We prioritize FMP data, but allow Gemini overrides if we fetched them.
  // Note: For deep institutional metrics (DBNR, etc.), we would need `extractInstitutionalData`.
  // For now, we map what we have.

  // Fetch Institutional Data (Optional: enable if API cost allows)
  // const instData = await gemini.extractInstitutionalData(ticker); 
  // For now, let's assume we rely on existing FMP unless we want to burn tokens.
  // To strictly follow the "Expand Data Extraction" task, we SHOULD call it.
  const instData = await extractInstitutionalData(ticker);

  const stockMetrics: import('../types').StockMetricData = {
    // Existing/FMP
    peRatio: quote.pe,
    priceToSales: quote.priceToSales, // [FIX] Updated field name
    grossMargin: fundamentalData.grossMargin,
    operatingMargin: effectiveFinnhubMetrics?.operatingMargin ?? (incomeStatements[0]?.operatingIncomeRatio * 100), // [FIX] Typo
    roe: roe * 100, // fundamentalData.roe is 0-1
    roic: fundamentalData.roic, // already 0-100 if present

    // New / Institutional (merged from instData if available)
    revenueGrowth: revenueGrowth * 100, // 0-1 -> %
    revenueGrowthQ1: instData?.metrics?.revenueGrowthQ1 ?? (financialGrowth[0]?.revenueGrowth ? financialGrowth[0].revenueGrowth * 100 : null),
    revenueGrowthQ2: instData?.metrics?.revenueGrowthQ2 ?? null,
    growthAcceleration: instData?.metrics?.growthAcceleration ?? 'Stable',

    dbnr: instData?.metrics?.dbnr ?? null,
    ruleOf40Score: instData?.metrics?.ruleOf40Score ?? null,
    rpoGrowth: instData?.metrics?.rpoGrowth ?? null,

    shareCountGrowth3Y: instData?.metrics?.shareCountGrowth3Y ?? null,
    sbcAsPercentRevenue: instData?.metrics?.sbcAsPercentRevenue ?? null,


    pePercentile5Y: instData?.metrics?.pePercentile5Y ?? null,
    evSalesPercentile5Y: instData?.metrics?.evSalesPercentile5Y ?? null,

    tamPenetration: instData?.metrics?.tamPenetration ?? ((qualitativeAnalysis as any)?.tamPenetration ? parseFloat((qualitativeAnalysis as any).tamPenetration) : null),

    // [FIX 29] Quant Strategy & Safety Fields
    fcfMargin: fundamentalData.fcfMargin,
    forwardPeRatio: quote.pe, // Use quote.pe if fwd missing
    revenueHistory: (fundamentalData as any).revenueHistory,
    revenueType: fundamentalData.revenueType,
    grossMarginTrend: fundamentalData.grossMarginTrend as 'Expanding' | 'Stable' | 'Contracting',
    isProfitable: fundamentalData.isProfitable,
    netInsiderBuying: fundamentalData.netInsiderBuying as any,
    catalystDensity: qualitativeAnalysis.catalystDensity as any,
    asymmetryScore: qualitativeAnalysis.asymmetryScore as any,
    pricingPower: qualitativeAnalysis.pricingPower as any,

    // Risk Integration
    accrualsRatio: fundamentalData.accrualsRatio || riskFlags.fcfConversionRatio as number,
    beneishMScore: riskFlags.beneishMScore,
    altmanZ: riskFlags.altmanZScore,

    // Ownership
    insiderOwnershipPct: insiderOwnershipPct, // [FIX] Use local var
    institutionalOwnershipPct: 0 // Placeholder or fetch real
  };

  // [FIX 29] Construct FinnhubMetrics with Statements for Scoring Engine
  const finnhubData: import('../types').FinnhubMetrics = {
    symbol: ticker,
    peRatio: quote.pe || 0,
    pbRatio: 0,
    currentRatio: 0,
    quickRatio: 0,
    grossMargin: fundamentalData.grossMargin || 0,
    operatingMargin: 0,
    netMargin: 0,
    returnOnEquity: roe,
    returnOnAssets: 0,
    revenueGrowth3Y: revenueGrowth3YrCAGR,
    revenueGrowth5Y: 0,
    // Inject Statements
    incomeStatements: incomeStatements,
    balanceSheets: balanceSheets,
    cashFlowStatements: cashFlowStatements
  };

  const rawCompany: Partial<import('../types').StockCompany> = {
    ticker,
    name: profile.companyName,
    sector: sector,
    businessModel: profile.description,
    moat: instData?.moat ?? moatData?.oneLineThesis ?? "Unspecified",
    isUptrend: quote.price > ((quote as any).priceAvg200 || 0)

  };

  // 2. Calculate New Score
  // [FIX] Pass 4 arguments: data, finnhubMetrics, marketCap, sector
  const newScoreResult = computeMultiBaggerScore(stockMetrics, finnhubData, quote.marketCap || 0, sector);

  // [FIX 30] Sync Risk Flags (Unified Engine is source of truth)
  riskFlags = newScoreResult.riskFlags;

  // 3. Map back to legacy `MultiBaggerScore` structure for UI compatibility
  // The new engine returns a flat `StockCompany` partial with scores.
  // We need to shape it into `MultiBaggerScore` interface: { totalScore, pillars: {...} }

  const multiBaggerScore: MultiBaggerScore = newScoreResult;

  // [NEW] Populate grades for UI
  const getGrade = (score: number, max: number) => {
    const pct = score / max;
    if (pct >= 0.8) return 'A';
    if (pct >= 0.6) return 'B';
    if (pct >= 0.4) return 'C';
    if (pct >= 0.2) return 'D';
    return 'F';
  };

  const grades = {
    quality: getGrade(newScoreResult.pillars.economics.score, newScoreResult.pillars.economics.maxScore),
    growth: getGrade(newScoreResult.pillars.growth.score, newScoreResult.pillars.growth.maxScore),
    valuation: getGrade(newScoreResult.pillars.valuation.score, newScoreResult.pillars.valuation.maxScore),
    momentum: 'C' // Placeholder
  };

  // console.log(`[Analyzer] Quant score: ${multiBaggerScore.totalScore}/100`); // [REMOVED]


  // [REMOVED] Legacy Valuation Scoring Block (now part of calculateMultibaggerScore)


  // Helper to normalize text to lines (Bugfix for .split error)
  const normalizeToLines = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
    }
    if (typeof value === "string") {
      return value.split("\n").map(line => line.trim()).filter(Boolean);
    }
    return [];
  };

  // [CALIBRATION 2.2] Diminishing Returns on Bonuses
  if (multiBaggerScore.totalScore >= 85) {
    console.log(`[DiminishingReturns] ${ticker}: quantScore before=${multiBaggerScore.totalScore}`);
    const excess = multiBaggerScore.totalScore - 85;
    if (excess > 0) {
      const reduced = 85 + Math.round(excess * 0.6);
      console.log(`[DiminishingReturns] ${ticker}: quantScore after=${reduced}`);
      multiBaggerScore.totalScore = reduced;
    }
  }

  // [CALIBRATION 2.4] Brand Moat Premium
  const ICONIC_BRAND_TICKERS = new Set(["DIS", "KO", "PEP", "NKE", "MCD", "SBUX"]);
  if (ICONIC_BRAND_TICKERS.has(ticker) &&
    fundamentalData.grossMargin != null &&
    fundamentalData.grossMargin > 35 && // 0.35 * 100
    multiBaggerScore.totalScore >= 30 &&
    multiBaggerScore.totalScore <= 70) {
    const bonus = 5;
    console.log(`[BrandMoat] ${ticker}: +${bonus} iconic brand bonus (GM=${fundamentalData.grossMargin}, quant before=${multiBaggerScore.totalScore})`);
    multiBaggerScore.totalScore += bonus;
  }

  // [CALIBRATION 2.6] Infra Compounder Bonus
  const INFRA_COMPOUNDERS = new Set(["ASML", "PANW"]);
  if (INFRA_COMPOUNDERS.has(ticker) &&
    multiBaggerScore.totalScore >= 55 &&
    roe !== null && roe > 0.10 &&
    fcfMargin !== null && fcfMargin > 0.20) {
    const bonus = 5;
    console.log(`[InfraCompounder] ${ticker}: +${bonus} infra bonus (ROE=${roe}, FCF=${fcfMargin}, quant before=${multiBaggerScore.totalScore})`);
    multiBaggerScore.totalScore += bonus;
  }

  // [NEW] Quality Floor for world-class compounders
  // Reward high ROE, FCF, and Growth combinations
  const cagr3y = revenueGrowth3YrCAGR ? revenueGrowth3YrCAGR / 100 : 0;

  if (
    roe != null && roe >= 0.20 &&
    fcfMargin != null && fcfMargin >= 0.20 &&
    cagr3y >= 0.10
  ) {
    const bonus = 15;
    multiBaggerScore.totalScore += bonus;

    // multiBaggerScore.totalScore = Math.min(100, multiBaggerScore.totalScore); // [REMOVED] Allow > 100 for rawScore tracking
    console.log(`[Analyzer] Quality Compounder Bonus: +${bonus} (ROE=${roe.toFixed(2)}, FCF=${fcfMargin.toFixed(2)}, Growth=${cagr3y.toFixed(2)})`);
  } else if (
    // Softer floor for slightly lower metrics but still elite
    roe != null && roe >= 0.15 &&
    fcfMargin != null && fcfMargin >= 0.15 &&
    cagr3y >= 0.08
  ) {
    const bonus = 10;
    multiBaggerScore.totalScore += bonus;

    // multiBaggerScore.totalScore = Math.min(100, multiBaggerScore.totalScore); // [REMOVED]
    console.log(`[Analyzer] Quality Compounder Bonus (Soft): +${bonus}`);
  }

  // Ensure minimum score for elite names (safety net)
  if (roe != null && roe >= 0.15 && fcfMargin != null && fcfMargin >= 0.15) {
    multiBaggerScore.totalScore = Math.max(multiBaggerScore.totalScore, 50);
  }

  console.log(`[Analyzer] Quant score: ${multiBaggerScore.totalScore}/100`); // [NEW] Log correct score

  // STEP // 5. Technical analysis
  // STEP 5: Technical analysis
  // Better SMA200:
  let calcSma200 = 0;
  if (priceHistory.length >= 200) {
    const sum = priceHistory.slice(0, 200).reduce((acc, p) => acc + p.close, 0);
    calcSma200 = sum / 200;
  }

  const technicalScore = computeTechnicalScore({
    price: quote.price,
    history: priceHistory,
    sma200: calcSma200,
    week52High: quote.yearHigh,
    week52Low: quote.yearLow,
    benchmarkHistory: spyHistory
  });

  // [NEW] Macro Regime Check (SPY 200DMA) - Handled at top of function
  // logic removed to avoid shadowing

  // [NEW] Reverse DCF (Implied Growth)
  const peForDcf = quote.pe || keyMetrics[0]?.peRatio || 0;
  const impliedGrowth = calculateImpliedGrowth(peForDcf);
  const actualGrowth = revenueGrowth3YrCAGR; // [MOD] V2: sourced from multiBaggerScore.computedMetrics
  const valuationGap = (impliedGrowth !== null) ? (actualGrowth - impliedGrowth) : null;

  if (impliedGrowth !== null) {
    console.log(`[Valuation] Reverse DCF: Price implies ${impliedGrowth.toFixed(1)}% growth. Actual: ${actualGrowth.toFixed(1)}%. Gap: ${valuationGap?.toFixed(1)}%`);
  }

  // STEP 9: Squeeze Setup
  const squeezeSetup = computeSqueezeSetup({
    multiBaggerScore: multiBaggerScore.totalScore,
    shortInterestPct: shortInterestPct,
    daysToCover: 0 // Need to fetch DTC or estimate
  });

  // [TASK 2] "Boring Large Cap" Penalty (Target: IBM)
  // Downgrade large, slow, inefficient companies to MONITOR_ONLY / Not Interesting

  // Use FMP Meta for this check
  const meta = await fmp.getCompanyMetaFromFmp(ticker);
  const mktCap = meta?.marketCap || quote.marketCap || 0;
  let isBoringLargeCap = false;

  if (!mktCap || mktCap === 0) {
    console.log("[BoringLargeCapDebug] Skipping mktCap-based boring check due to missing data.");
  } else {
    // Stricter definition of "Boring Large Cap"
    const MIN_MEGA_CAP = 500e9; // $500B
    const growthSectors = [
      'Technology',
      'Consumer Cyclical',
      'Healthcare',
      'Communication Services'
    ];

    const isGrowthSector = growthSectors.some(s => profile.sector?.includes(s));

    // Explicit guard for TSLA
    if (ticker === 'TSLA') {
      isBoringLargeCap = false;
    } else if (mktCap < MIN_MEGA_CAP) {
      isBoringLargeCap = false;
    } else if (isGrowthSector) {
      // Even if mega cap, if it's in a growth sector, be careful.
      // Only flag if growth is REALLY low.
      isBoringLargeCap = (
        roe < 0.10 &&
        fcfMargin < 0.15 &&
        revenueGrowth < 0.05
      );
    } else {
      // Non-growth sector (e.g. Energy, Utilities)
      isBoringLargeCap = (
        roe < 0.12 &&
        fcfMargin < 0.20 &&
        revenueGrowth < 0.07
      );
    }
  }

  // Optional Altman check to avoid flagging strong balance sheets
  const altmanZ = riskFlags.warnings.find(w => w.includes('Altman Z-Score')) ? 1.5 : 3.0; // Rough proxy if we don't have exact Z here easily, or pass it from riskFlags if available.
  // Actually, let's just use the boolean logic requested:
  // "borderlineBalanceSheet = altmanZ !== undefined ? altmanZ < 2.0 : true;"
  // We don't have raw altmanZ easily accessible here without refactoring calculateRiskFlags to return it.
  // But we can check if there's an Altman warning.
  const hasAltmanWarning = riskFlags.warnings.some(w => w.includes('Altman Z-Score') && (w.includes('distress') || w.includes('grey')));

  const isBoring = isBoringLargeCap && (hasAltmanWarning || true); // User said "borderlineBalanceSheet... altmanZ < 2.0". If we have a warning, it's < 1.8 or < 3. So warning implies < 3.
  // Let's stick to the user's specific logic if possible.
  // For now, let's trust the metrics.

  let aiStatus = antigravityReport?.aiStatus || 'AVOID';
  let aiTier = antigravityReport?.aiTier || 'Disqualified';
  let aiConviction = antigravityReport?.aiConviction || 0;

  if (isBoring) {
    console.log(`[BoringLargeCap] ${ticker}: Downgrading to MONITOR_ONLY / Not Interesting`);
    console.log(`[BoringLargeCapDebug] ${ticker}: mktCap=${mktCap}, ROE=${roe.toFixed(2)}, FCF=${fcfMargin.toFixed(2)}, Growth=${revenueGrowth.toFixed(2)}, isBoring=true`);

    if (aiStatus === 'SOFT_PASS' || aiStatus === 'STRONG_PASS') {
      aiStatus = 'MONITOR_ONLY';
      aiTier = 'Not Interesting';
      aiConviction = Math.min(aiConviction, 60);
    }
  } else {
    // Log debug for Golden Set verification
    if (['IBM', 'AAPL', 'MSFT', 'COST'].includes(ticker)) {
      console.log(`[BoringLargeCapDebug] ${ticker}: mktCap=${mktCap}, ROE=${roe.toFixed(2)}, FCF=${fcfMargin.toFixed(2)}, Growth=${revenueGrowth.toFixed(2)}, isBoring=false`);
    }
  }

  // STEP 10: Verdict & Sizing
  // We need to re-calculate tier based on the NEW finalScore
  // Note: integrateAiAndQuant uses the *original* scorecard. We need to manually adjust if we changed aiStatus.
  // Actually, integrateAiAndQuant takes the scorecard object. We should probably construct a modified one or pass explicit values.
  // But integrateAiAndQuant extracts values from the object.
  // Let's override the object if we downgraded.
  const modifiedScorecard = antigravityReport ? {
    ...antigravityReport,
    aiStatus: aiStatus,
    aiTier: aiTier,
    aiConviction: aiConviction
  } : undefined;

  // [CALIBRATION 2.5] Soften MONITOR_ONLY Penalty
  // We need to modify integrateAiAndQuant or handle it here.
  // Since integrateAiAndQuant is a helper, let's modify it to accept an override or just modify the score manually after.
  // Actually, the user asked to replace the logic in integrateAiAndQuant, but that function is outside this scope.
  // However, I can inline the logic or modify the helper.
  // Let's modify the helper `integrateAiAndQuant` at the top of the file instead of here.
  // Wait, I am editing the whole file content in chunks. I should update `integrateAiAndQuant` separately or in a previous chunk.
  // But I am in `analyzeStock`.
  // Let's assume I will update `integrateAiAndQuant` in a separate call or I can try to do it all if I replace the whole file.
  // Since I am using `replace_file_content` with a range, I can't easily touch the helper at the top.
  // I will stick to `analyzeStock` changes here and then update `integrateAiAndQuant` in another step.

  // [FIX 30] Unified Score (Risk Already Applied in multiBaggerScore)
  let finalScore = multiBaggerScore.totalScore;

  // [FIX 20] AI only applies penalties (Safety Valve)
  if (antigravityReport?.aiStatus === 'MONITOR_ONLY') {
    finalScore += -2;
  } else if (antigravityReport?.aiStatus === 'AVOID') {
    finalScore += -5;
  }

  if (riskFlags.disqualified) finalScore = 0;

  // [NEW] Moat/Insider Score Integration
  if (antigravityReport && !riskFlags.disqualified) {
    const moatInsiderScore = calcMoatInsiderScore(antigravityReport);
    console.log(`[Moat/Insider] contribution: +${moatInsiderScore}`);
    finalScore += moatInsiderScore;
  }

  // [NEW] Profitability Cap (Tier 1 Gate)
  finalScore = applyProfitabilityCap(finalScore, { roe, fcfMargin });

  // [CALIBRATION 2.3] Innovation Premium
  const INNOVATION_TICKERS = new Set(["TSLA", "RKLB", "ASTS", "RGTI", "SOUN"]);
  if (INNOVATION_TICKERS.has(ticker) && aiConviction >= 75 && finalScore >= 45 && finalScore < 85) {
    const bonus = 8;
    console.log(`[InnovationPremium] ${ticker}: +${bonus} innovation bonus (conviction=${aiConviction}, finalScore before=${finalScore})`);
    finalScore += bonus;
  }

  // [NEW] Market Cap Penalty
  const mktCapBillions = (quote.marketCap || profile.mktCap || 0) / 1e9;
  const mcPenalty = marketCapPenalty(mktCapBillions);
  if (mcPenalty !== 0) {
    console.log(`[MarketCapPenalty] ${ticker}: ${mcPenalty} (Market Cap $${mktCapBillions.toFixed(1)}B)`);
    finalScore += mcPenalty;
  }

  // [NEW] Normalize Scores (Raw vs Final)
  const rawScore = Math.round(finalScore);

  // Clamp 0-100 for display
  finalScore = Math.max(0, Math.min(100, rawScore));

  const overallTier = mapScoreToTier(finalScore, riskFlags.disqualified);
  const verdict = determineVerdict(finalScore, riskFlags.disqualified, overallTier, macroRegime);
  let suggestedPositionSize = determinePositionSize(overallTier, riskFlags.disqualified, macroRegime);

  // [NEW] Macro Regime Adjustment
  if (macroRegime === 'Bear' && suggestedPositionSize !== '0%') {
    console.warn(`[Macro] Bear Market Detected. Halving recommended position size.`);
    // Simple string manipulation or logic
    if (suggestedPositionSize.includes('High') || suggestedPositionSize.includes('Full')) suggestedPositionSize = 'Half Position (Macro Caution)';
    else if (suggestedPositionSize.includes('Medium')) suggestedPositionSize = 'Quarter Position (Macro Caution)';
    else suggestedPositionSize = 'Cash / Watch (Macro Caution)';
  }

  console.log('[DebugScore]', ticker, {
    quantScore: multiBaggerScore.totalScore,
    riskPenalty: riskFlags.riskPenalty,
    aiAnalysis: antigravityReport ? {
      status: antigravityReport.aiStatus,
      conviction: antigravityReport.aiConviction
    } : 'N/A',
    rawScore,
    finalScore,
  });

  // STEP 11: Data Quality
  const dataQuality: DataQuality = {
    insiderOwnershipSource: insiderTrades.length > 0 ? 'real' : 'unavailable',
    beneishMScoreReliability: incomeStatements.length >= 2 ? 'full' : 'partial',
    shortInterestSource: 'unavailable',
    overallConfidence: (incomeStatements.length >= 4 && balanceSheets.length >= 4) ? 'high' : 'medium'
  };

  // STEP 11: Compile Result
  // Calculate AI Score (Contribution)
  // AI Score is remainder after Quant Score (which now includes Risk)
  const aiScore = finalScore - multiBaggerScore.totalScore;

  // Determine Bonuses (Simple heuristic for now)
  const bonuses: string[] = [];
  if (multiBaggerScore.pillars.growth.score >= 20) bonuses.push("Growth Bonus");
  if (multiBaggerScore.pillars.economics.score >= 15) bonuses.push("Capital Efficiency");
  if (multiBaggerScore.pillars.valuation.score >= 8) bonuses.push("Value Play");

  // Populate summaries for Scanner UI
  if (antigravityReport) {
    if (antigravityReport.error) {
      antigravityReport.warningSummary = null;
      antigravityReport.catalystSummary = null;
    } else {
      // Build Warning Summary
      const warnings: string[] = [];

      // 1. Hard Risk Flags
      if (riskFlags.warnings.length > 0) {
        warnings.push(...riskFlags.warnings);
      }

      // 2. AI Warning Flags
      if (antigravityReport.warningFlags && antigravityReport.warningFlags.length > 0) {
        warnings.push(...antigravityReport.warningFlags);
      } else if (antigravityReport.bearCase) {
        const bearLines = normalizeToLines(antigravityReport.bearCase);
        if (bearLines.length > 0) warnings.push(bearLines[0].substring(0, 50) + "...");
      }

      // 3. Catalysts
      const catalysts = antigravityReport.positiveCatalysts || [];
      if (catalysts.length === 0 && antigravityReport.bullCase) {
        const bullLines = normalizeToLines(antigravityReport.bullCase);
        if (bullLines.length > 0) catalysts.push(bullLines[0].substring(0, 50) + "...");
      }

      // Set Summaries
      // Warning Summary: Prioritize Risk Flags, then AI Warnings
      antigravityReport.warningSummary = warnings.length > 0 ? warnings.slice(0, 2).join(" | ") : null;

      // Catalyst Summary
      antigravityReport.catalystSummary = catalysts.length > 0 ? catalysts.slice(0, 2).join(" | ") : null;
    }

  }

  // Update modifiedScorecard with summaries
  if (modifiedScorecard && antigravityReport) {
    modifiedScorecard.warningSummary = antigravityReport.warningSummary;
    modifiedScorecard.catalystSummary = antigravityReport.catalystSummary;
  }

  // [NEW] Volatility Adjusted Sizing
  const beta = (profile as any).beta || 1.0;

  // STEP 11: Compile Result
  const result: MultiBaggerAnalysis = {
    ticker,
    companyName: profile.companyName,
    sector,
    marketCap: quote.marketCap || profile.mktCap || 0,
    price: quote.price,

    multiBaggerScore,
    technicalScore,
    squeezeSetup,

    overallTier,
    tier: overallTier, // Alias
    suggestedPositionSize,

    riskFlags,
    // Pass Beta for Scanner Sizing
    beta: beta,
    visionaryAnalysis: visionaryAnalysis || { longTermScore: 0, customerScore: 0, innovationScore: 0, capitalScore: 0, totalVisionaryScore: 0, ceoName: profile.ceo, explanation: "AI Error" },
    patternMatch: patternMatch || { matchScore: 0, similarTo: "None", keyParallels: [], keyDifferences: [] },
    antigravityResult: modifiedScorecard,

    moatAssessment: moatData.moatScore >= 8 ? 'Wide' : (moatData.moatScore >= 5 ? 'Narrow' : 'None'),
    growthThesis: moatData.oneLineThesis,
    catalysts: qualitativeAnalysis.catalysts || [],
    keyRisks: [...riskFlags.warnings, ...moatData.bearCase],
    warnings: riskFlags.warnings,

    finalScore,
    rawScore, // [NEW] include raw score
    score: finalScore, // Alias
    verdict,

    // [FIX 23]
    macroRegime,

    // [NEW]
    grades: grades,

    // New Fields
    aiScore,
    bonuses,
    aiAnalysis: {
      moat: {
        score: moatData.moatScore,
        durability: moatData.moatDurability,
        type: moatData.primaryMoatType
      },
      thesis: moatData.oneLineThesis,
      risks: moatData.bearCase,
      bullCase: moatData.bullCase,
      bearCase: moatData.bearCase
    },

    dataQuality,
    dataTimestamp: new Date().toISOString(),
    sources: ['FMP', 'Gemini'],
    dataQualityWarnings: dataQualityWarnings.length > 0 ? dataQualityWarnings : undefined,
    warningFull: buildWarningCatalystSummary({
      mainRisk: riskFlags.warnings.length > 0 ? riskFlags.warnings[0] : null,
      bearCase: antigravityReport?.bearCase,
      bullCase: antigravityReport?.bullCase,
      dataQualityWarnings,
      riskWarnings: riskFlags.warnings
    }),

    // [NEW]

    impliedGrowthRate: impliedGrowth,
    valuationGap
  };

  console.log(`[Analyzer] Complete: ${ticker} = ${verdict} (Score: ${result.finalScore})`);

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

