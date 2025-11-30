
/**
 * Risk Flag / Kill Switch Calculator
 * Calculates Beneish M-Score, Altman Z-Score, dilution rate
 * Auto-disqualifies stocks that fail safety checks
 */

import type { IncomeStatement, BalanceSheet, RiskFlags } from '../../types';

/**
 * Beneish M-Score Components
 * Score > -1.78 indicates high probability of earnings manipulation
 */
const calculateBeneishMScore = (
  currentIncome: IncomeStatement,
  priorIncome: IncomeStatement,
  currentBalance: BalanceSheet,
  priorBalance: BalanceSheet
): number => {
  
  // Safely handle division
  const safeDivide = (a: number, b: number) => b === 0 ? 0 : a / b;
  
  // DSRI: Days Sales in Receivables Index
  // (Receivables_t / Sales_t) / (Receivables_t-1 / Sales_t-1)
  // FMP doesn't provide receivables directly, estimate from current assets
  const dsri = 1.0; // Simplified - would need receivables data
  
  // GMI: Gross Margin Index
  const gm_prior = priorIncome.grossProfitRatio || 0;
  const gm_current = currentIncome.grossProfitRatio || 0;
  const gmi = gm_prior > 0 ? safeDivide(gm_prior, gm_current) : 1.0;
  
  // AQI: Asset Quality Index
  const aqi = 1.0; // Simplified
  
  // SGI: Sales Growth Index
  const sgi = safeDivide(currentIncome.revenue, priorIncome.revenue);
  
  // DEPI: Depreciation Index
  const depi = 1.0; // Simplified
  
  // SGAI: SG&A Index
  const sgai = 1.0; // Simplified
  
  // TATA: Total Accruals to Total Assets
  const tata = safeDivide(
    (currentIncome.netIncome - (currentBalance.cashAndCashEquivalents - priorBalance.cashAndCashEquivalents)),
    currentBalance.totalAssets
  );
  
  // LVGI: Leverage Index
  const leverage_current = safeDivide(currentBalance.totalLiabilities, currentBalance.totalAssets);
  const leverage_prior = safeDivide(priorBalance.totalLiabilities, priorBalance.totalAssets);
  const lvgi = leverage_prior > 0 ? safeDivide(leverage_current, leverage_prior) : 1.0;
  
  // M-Score Formula
  const mScore = -4.84 
    + (0.92 * dsri) 
    + (0.528 * gmi) 
    + (0.404 * aqi) 
    + (0.892 * sgi) 
    + (0.115 * depi) 
    - (0.172 * sgai) 
    + (4.679 * tata) 
    - (0.327 * lvgi);
  
  return mScore;
};

/**
 * Altman Z-Score for bankruptcy risk
 * Z > 2.99: Safe
 * 1.81 < Z < 2.99: Grey zone
 * Z < 1.81: Distress
 */
const calculateAltmanZScore = (
  income: IncomeStatement,
  balance: BalanceSheet,
  marketCap: number
): number => {
  
  const safeDivide = (a: number, b: number) => b === 0 ? 0 : a / b;
  
  const totalAssets = balance.totalAssets || 1;
  
  // X1: Working Capital / Total Assets
  const workingCapital = balance.totalCurrentAssets - balance.totalCurrentLiabilities;
  const x1 = safeDivide(workingCapital, totalAssets);
  
  // X2: Retained Earnings / Total Assets
  const x2 = safeDivide(balance.retainedEarnings, totalAssets);
  
  // X3: EBIT / Total Assets
  const x3 = safeDivide(income.operatingIncome, totalAssets);
  
  // X4: Market Cap / Total Liabilities
  const x4 = safeDivide(marketCap, balance.totalLiabilities || 1);
  
  // X5: Sales / Total Assets
  const x5 = safeDivide(income.revenue, totalAssets);
  
  // Z-Score formula
  const zScore = (1.2 * x1) + (1.4 * x2) + (3.3 * x3) + (0.6 * x4) + (1.0 * x5);
  
  return zScore;
};

/**
 * Calculate dilution rate (YoY share count increase)
 */
const calculateDilutionRate = (
  currentIncome: IncomeStatement,
  priorYearIncome: IncomeStatement
): number => {
  const currentShares = currentIncome.weightedAverageShsOutDil || 0;
  const priorShares = priorYearIncome.weightedAverageShsOutDil || 0;
  
  if (priorShares === 0) return 0;
  
  return ((currentShares - priorShares) / priorShares) * 100;
};

/**
 * Calculate cash runway in quarters
 */
const calculateCashRunway = (
  balance: BalanceSheet,
  income: IncomeStatement
): number => {
  const cash = (balance.cashAndCashEquivalents || 0) + (balance.shortTermInvestments || 0);
  const quarterlyBurn = income.netIncome < 0 ? Math.abs(income.netIncome) : 0;
  
  if (quarterlyBurn === 0) return 999; // Profitable company
  
  return cash / quarterlyBurn;
};

// ============ MAIN RISK FUNCTION ============

export const calculateRiskFlags = (
  incomeStatements: IncomeStatement[],
  balanceSheets: BalanceSheet[],
  marketCap: number,
  shortInterestPct: number = 0
): RiskFlags => {
  
  const disqualifyReasons: string[] = [];
  const warnings: string[] = [];
  
  // Get current and prior periods
  const currentIncome = incomeStatements[0];
  const priorIncome = incomeStatements[4] || incomeStatements[1]; // 1 year ago or prior quarter
  const currentBalance = balanceSheets[0];
  const priorBalance = balanceSheets[4] || balanceSheets[1];
  
  // Calculate scores
  const beneishMScore = calculateBeneishMScore(currentIncome, priorIncome, currentBalance, priorBalance);
  const altmanZScore = calculateAltmanZScore(currentIncome, currentBalance, marketCap);
  const dilutionRate = calculateDilutionRate(currentIncome, priorIncome);
  const cashRunwayQuarters = calculateCashRunway(currentBalance, currentIncome);
  
  // Check kill switches & warnings
  
  // 1. Beneish M-Score (Fraud)
  if (beneishMScore > -1.78) {
    disqualifyReasons.push(`Beneish M-Score ${beneishMScore.toFixed(2)} > -1.78 (manipulation risk)`);
  }
  
  // 2. Dilution
  if (dilutionRate > 10) {
    disqualifyReasons.push(`Dilution rate ${dilutionRate.toFixed(1)}% > 10% (excessive shareholder dilution)`);
  } else if (dilutionRate > 5) {
    warnings.push(`Dilution elevated at ${dilutionRate.toFixed(1)}%`);
  }
  
  // 3. Cash Runway
  if (cashRunwayQuarters < 4 && cashRunwayQuarters !== 999) {
    disqualifyReasons.push(`Cash runway ${cashRunwayQuarters.toFixed(1)} quarters < 4 (near-term financing risk)`);
  }
  
  // 4. Altman Z-Score
  if (altmanZScore < 1.8) {
    disqualifyReasons.push(`Altman Z-Score ${altmanZScore.toFixed(2)} < 1.8 (distress zone)`);
  }
  
  // 5. Short Interest
  if (shortInterestPct > 25) {
    disqualifyReasons.push(`Short interest ${shortInterestPct.toFixed(1)}% > 25% (extreme bearish sentiment)`);
  } else if (shortInterestPct > 15) {
    warnings.push(`High Short Interest: ${shortInterestPct.toFixed(1)}%`);
  }
  
  return {
    beneishMScore,
    dilutionRate,
    cashRunwayQuarters,
    altmanZScore,
    shortInterestPct,
    disqualified: disqualifyReasons.length > 0,
    disqualifyReasons,
    warnings
  };
};
