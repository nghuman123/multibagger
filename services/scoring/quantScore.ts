/**
 * Quantitative Scoring Engine
 * Calculates scores programmatically from raw financial data
 * NO AI INVOLVED - Pure math
 */

import type {
  IncomeStatement,
  BalanceSheet,
  InsiderTrade,
  KeyMetrics,
  FinancialGrowth,
  QuantitativeScore,
  SectorType,
  SectorType,
  FinnhubMetrics
} from '../../types';
import { STRATEGY } from '../../config/strategyConfig';

// ============ HELPER FUNCTIONS ============

/**
 * Calculate CAGR from a series of values
 */
const calculateCAGR = (startValue: number, endValue: number, years: number): number => {
  if (startValue <= 0 || endValue <= 0 || years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
};

/**
 * Calculate trend direction from array of values (oldest to newest)
 */
const calculateTrend = (values: number[]): 'Expanding' | 'Stable' | 'Contracting' => {
  if (values.length < 2) return 'Stable';

  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const change = ((avgSecond - avgFirst) / Math.abs(avgFirst)) * 100;

  if (change > 2) return 'Expanding';
  if (change < -2) return 'Contracting';
  return 'Stable';
};

// ============ SCORING FUNCTIONS ============

/**
 * Growth Score (0-30 points)
 * - Revenue CAGR > 30%: 30 points
 * - Revenue CAGR 20-30%: 20 points
 * - Revenue CAGR 15-20%: 10 points
 * - Below 15%: 0 points
 * - Bonus +5 if last quarter growth > 3-year CAGR (acceleration)
 */
export const calculateGrowthScore = (
  incomeStatements: IncomeStatement[],
  financialGrowth: FinancialGrowth | null,
  finnhubMetrics?: FinnhubMetrics | null
): { score: number; cagr3yr: number; lastQuarterGrowth: number; accelerating: boolean } => {

  // Use FMP's pre-calculated 3-year growth if available
  let cagr3yr = financialGrowth?.threeYRevenueGrowthPerShare
    ? financialGrowth.threeYRevenueGrowthPerShare * 100
    : 0;

  // Fallback 1: Calculate from income statements
  if (!cagr3yr) {
    if (incomeStatements.length >= 12) {
      // Standard 3-Year CAGR
      const oldestRevenue = incomeStatements[11]?.revenue || 0;
      const newestRevenue = incomeStatements[0]?.revenue || 0;
      cagr3yr = calculateCAGR(oldestRevenue, newestRevenue, 3);
    } else if (incomeStatements.length >= 5) {
      // Dynamic CAGR for recent IPOs (1.25 to <3 years)
      const quarters = incomeStatements.length;
      const oldestRevenue = incomeStatements[quarters - 1]?.revenue || 0;
      const newestRevenue = incomeStatements[0]?.revenue || 0;

      // Calculate years based on quarter count (approx)
      const years = (quarters - 1) / 4;
      cagr3yr = calculateCAGR(oldestRevenue, newestRevenue, years);

      console.log(`[QuantScore] Dynamic CAGR calculated over ${years} years: ${cagr3yr.toFixed(2)}%`);
    }
  }

  // Fallback 2: Use Finnhub metrics
  if (!cagr3yr && finnhubMetrics?.revenueGrowth3Y) {
    cagr3yr = finnhubMetrics.revenueGrowth3Y;
  }

  // Calculate last quarter YoY growth
  let lastQuarterGrowth = 0;
  if (incomeStatements.length >= 5) {
    const currentQ = incomeStatements[0]?.revenue || 0;
    const yearAgoQ = incomeStatements[4]?.revenue || 0; // 4 quarters ago
    if (yearAgoQ > 0) {
      lastQuarterGrowth = ((currentQ - yearAgoQ) / yearAgoQ) * 100;
    }
  } else if (finnhubMetrics?.revenueGrowth5Y) {
    // Rough proxy if we don't have quarterly data: compare 3Y vs 5Y? 
    // Or just assume 0 for last quarter specific growth if we can't calculate it.
    // Let's just use 0 to be safe, or maybe use the 3Y average as a proxy for "current" growth state.
    lastQuarterGrowth = cagr3yr;
  }

  // Score calculation
  let score = 0;
  if (cagr3yr > STRATEGY.GROWTH.CAGR_ELITE) score = 30;
  else if (cagr3yr > STRATEGY.GROWTH.CAGR_HIGH) score = 20;
  else if (cagr3yr > STRATEGY.GROWTH.CAGR_MODERATE) score = 10;

  // Acceleration bonus
  const accelerating = lastQuarterGrowth > cagr3yr && cagr3yr > 0;
  if (accelerating) score = Math.min(30, score + 5);

  return { score, cagr3yr, lastQuarterGrowth, accelerating };
};

/**
 * Quality Score (0-25 points)
 * Based on Gross Margin level and trend
 * - Software: > 70% GM = 15 points
 * - Hardware: > 40% GM = 15 points
 * - Expanding trend: +10 points
 * - Stable trend: +5 points
 * - Contracting: -5 points
 */
export const calculateQualityScore = (
  incomeStatements: IncomeStatement[],
  sector: SectorType,
  finnhubMetrics?: FinnhubMetrics | null
): { score: number; grossMargin: number; trend: 'Expanding' | 'Stable' | 'Contracting' } => {

  let currentGM = 0;
  let trend: 'Expanding' | 'Stable' | 'Contracting' = 'Stable';

  if (incomeStatements.length > 0) {
    // Get current gross margin
    currentGM = (incomeStatements[0]?.grossProfitRatio || 0) * 100;

    // Get margin trend (last 8 quarters)
    const margins = incomeStatements
      .slice(0, 8)
      .map(s => s.grossProfitRatio * 100)
      .reverse(); // Oldest to newest

    trend = calculateTrend(margins);
  } else if (finnhubMetrics?.grossMargin) {
    currentGM = finnhubMetrics.grossMargin;
    // Cannot determine trend from single point, assume Stable
    trend = 'Stable';
  }

  // Score based on sector threshold
  let score = 0;
  const isSoftware = ['SaaS', 'FinTech', 'Other'].includes(sector);
  const threshold = isSoftware ? STRATEGY.QUALITY.GM_SOFTWARE_ELITE : STRATEGY.QUALITY.GM_HARDWARE_ELITE;

  if (currentGM >= threshold) score += 15;
  else if (currentGM >= threshold * STRATEGY.QUALITY.GM_THRESHOLD_FACTOR_HIGH) score += 10;
  else if (currentGM >= threshold * STRATEGY.QUALITY.GM_THRESHOLD_FACTOR_MODERATE) score += 5;

  // Trend adjustment
  if (trend === 'Expanding') score += 10;
  else if (trend === 'Stable') score += 5;
  else score -= 5;

  return { score: Math.max(0, Math.min(25, score)), grossMargin: currentGM, trend };
};

/**
 * Rule of 40 Score (0-20 points)
 * Rule of 40 = Revenue Growth % + EBITDA Margin %
 * - > 50: 20 points (Elite)
 * - > 40: 15 points
 * - > 30: 10 points
 * - > 20: 5 points
 * - < 20: 0 points
 */
export const calculateRuleOf40Score = (
  incomeStatements: IncomeStatement[],
  financialGrowth: FinancialGrowth | null,
  finnhubMetrics?: FinnhubMetrics | null
): { score: number; value: number; revenueGrowth: number; ebitdaMargin: number } => {

  // Get revenue growth (YoY)
  let revenueGrowth = (financialGrowth?.revenueGrowth || 0) * 100;

  // Get EBITDA margin
  let ebitdaMargin = (incomeStatements[0]?.ebitdaratio || 0) * 100;

  // Fallback to Finnhub
  if (!revenueGrowth && finnhubMetrics?.revenueGrowth3Y) {
    revenueGrowth = finnhubMetrics.revenueGrowth3Y;
  }
  if (!ebitdaMargin && finnhubMetrics?.operatingMargin) {
    // Operating Margin is a decent proxy for EBITDA margin if EBITDA isn't available
    ebitdaMargin = finnhubMetrics.operatingMargin;
  }

  const ruleOf40Value = revenueGrowth + ebitdaMargin;

  let score = 0;
  if (ruleOf40Value > STRATEGY.RULE_OF_40.ELITE) score = 20;
  else if (ruleOf40Value > STRATEGY.RULE_OF_40.HIGH) score = 15;
  else if (ruleOf40Value > STRATEGY.RULE_OF_40.MODERATE) score = 10;
  else if (ruleOf40Value > STRATEGY.RULE_OF_40.ACCEPTABLE) score = 5;

  return { score, value: ruleOf40Value, revenueGrowth, ebitdaMargin };
};

/**
 * Insider Score (0-15 points)
 * - Founder-led: +10 points
 * - Ownership > 10%: +5 points
 * - Net insider buying > $500k in 90 days: +5 points (capped at 15 total)
 */
export const calculateInsiderScore = (
  insiderTrades: InsiderTrade[],
  founderLed: boolean,
  insiderOwnershipPct: number
): { score: number; netBuying180Days: number } => {

  // Calculate net buying in last 90 days
  const oneEightyDaysAgo = new Date();
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);

  let netBuying = 0;
  insiderTrades.forEach(trade => {
    const tradeDate = new Date(trade.transactionDate);
    if (tradeDate >= oneEightyDaysAgo) {
      if (trade.transactionType.includes('P')) {
        netBuying += trade.value || 0;
      } else if (trade.transactionType.includes('S')) {
        netBuying -= trade.value || 0;
      }
    }
  });

  let score = 0;
  if (founderLed) score += 10;
  if (insiderOwnershipPct > 10) score += 5;
  if (netBuying > 500000) score += 5;

  return { score: Math.min(15, score), netBuying180Days: netBuying };
};

/**
 * Valuation Score (0-10 points)
 * PSG Ratio = Price-to-Sales / Growth Rate
 * - PSG < 0.3: 10 points (Undervalued)
 * - PSG 0.3-0.5: 7 points
 * - PSG 0.5-1.0: 4 points
 * - PSG > 1.0: 0 points (Overvalued relative to growth)
 */
export const calculateValuationScore = (
  priceToSales: number,
  revenueGrowthPct: number
): { score: number; psgRatio: number } => {

  // Avoid division by zero
  if (revenueGrowthPct <= 0) {
    return { score: 0, psgRatio: Infinity };
  }

  // Convert growth to decimal for ratio
  const psgRatio = priceToSales / revenueGrowthPct;

  let score = 0;
  if (psgRatio < STRATEGY.VALUATION.PSG_CHEAP) score = 10;
  else if (psgRatio < STRATEGY.VALUATION.PSG_ATTRACTIVE) score = 7; // Note: config has 0.6, old code had 0.5. I'll stick to config names but Logic had 0.5. Let's use config.
  else if (psgRatio < STRATEGY.VALUATION.PSG_FAIR) score = 4;

  return { score, psgRatio };
};

// ============ MAIN SCORING FUNCTION ============

export const calculateQuantitativeScore = (
  incomeStatements: IncomeStatement[],
  financialGrowth: FinancialGrowth | null,
  keyMetrics: KeyMetrics | null,
  insiderTrades: InsiderTrade[],
  sector: SectorType,
  founderLed: boolean,
  insiderOwnershipPct: number,
  finnhubMetrics?: FinnhubMetrics | null
): QuantitativeScore => {

  const growth = calculateGrowthScore(incomeStatements, financialGrowth, finnhubMetrics);
  const quality = calculateQualityScore(incomeStatements, sector, finnhubMetrics);
  const ruleOf40 = calculateRuleOf40Score(incomeStatements, financialGrowth, finnhubMetrics);
  const insider = calculateInsiderScore(insiderTrades, founderLed, insiderOwnershipPct);

  const priceToSales = keyMetrics?.priceToSalesRatio || 0;
  // If we don't have P/S, we can't calculate valuation score accurately.
  // We could try to infer it if we had Market Cap and Revenue, but for now let's just use what we have.

  const valuation = calculateValuationScore(priceToSales, growth.cagr3yr);

  const compositeScore = growth.score + quality.score + ruleOf40.score + insider.score + valuation.score;

  return {
    growthScore: growth.score,
    qualityScore: quality.score,
    ruleOf40Score: ruleOf40.score,
    insiderScore: insider.score,
    valuationScore: valuation.score,
    compositeScore,

    revenueGrowth3YrCAGR: growth.cagr3yr,
    lastQuarterGrowth: growth.lastQuarterGrowth,
    grossMargin: quality.grossMargin,
    grossMarginTrend: quality.trend,
    ruleOf40Value: ruleOf40.value,
    insiderOwnershipPct,
    founderLed,
    netInsiderBuying180Days: insider.netBuying180Days,
    priceToSales,
    psgRatio: valuation.psgRatio
  };
};
