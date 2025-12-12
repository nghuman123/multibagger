
/**
 * Risk Flag / Kill Switch Calculator
 * Calculates Beneish M-Score, Altman Z-Score, dilution rate
 * Auto-disqualifies stocks that fail safety checks
 */

import type { IncomeStatement, BalanceSheet, CashFlowStatement, RiskFlags, SectorType } from '../../types';

const BENEISH_THRESHOLDS = {
  SaaS: -1.2,      // Higher tolerance for SaaS accounting (deferred rev)
  Biotech: -1.5,   // R&D capitalization
  Manufacturing: -1.78,
  SpaceTech: -1.2, // Similar to SaaS/R&D heavy
  Quantum: -1.2,
  Hardware: -1.78,
  FinTech: -1.5,
  Consumer: -1.78,
  Industrial: -1.78,
  Other: -1.78,
  default: -1.78
};

/**
 * Beneish M-Score Components
 * Score > -1.78 indicates high probability of earnings manipulation
 */
export const calculateBeneishMScore = (
  currentIncome: IncomeStatement,
  priorIncome: IncomeStatement,
  currentBalance: BalanceSheet,
  priorBalance: BalanceSheet,
  currentCashFlow?: CashFlowStatement,
  priorCashFlow?: CashFlowStatement
): number => {

  // Safely handle division
  const safeDivide = (a: number, b: number) => b === 0 ? 0 : a / b;

  // 1. DSRI: Days Sales in Receivables Index
  const receivables_t = currentBalance.netReceivables || 0;
  const receivables_t1 = priorBalance.netReceivables || 0;
  // Use explicit fallback for sales to avoid division by zero issues in logic below if referenced
  const sales_t = currentIncome.revenue || 1;
  const sales_t1 = priorIncome.revenue || 1;

  // If prior receivables are 0, DSRI defaults to 1.0 (neutral) to avoid false spikes
  // Formula: (Rec_t / Sales_t) / (Rec_t-1 / Sales_t-1)
  const dsri = (receivables_t1 > 0 && sales_t1 > 0)
    ? ((receivables_t / sales_t) / (receivables_t1 / sales_t1))
    : 1.0;

  // 2. GMI: Gross Margin Index
  const gm_prior = priorIncome.grossProfitRatio || 0;
  const gm_current = currentIncome.grossProfitRatio || 0;
  // If margins are deteriorating (prior > current), GMI > 1 (Flag)
  const gmi = gm_current > 0 ? safeDivide(gm_prior, gm_current) : 1.0;

  // 3. AQI: Asset Quality Index
  // Formula: (1 - (CurrentAssets + PPE) / TotalAssets)_t / (1 - ...) _t-1
  const hardAssets_t = (currentBalance.totalCurrentAssets || 0) + (currentBalance.propertyPlantEquipmentNet || 0);
  const hardAssets_t1 = (priorBalance.totalCurrentAssets || 0) + (priorBalance.propertyPlantEquipmentNet || 0);
  const totalAssets_t = currentBalance.totalAssets || 1;
  const totalAssets_t1 = priorBalance.totalAssets || 1;

  const softAssetRatio_t = 1 - (hardAssets_t / totalAssets_t);
  const softAssetRatio_t1 = 1 - (hardAssets_t1 / totalAssets_t1);

  const aqi = (softAssetRatio_t1 > 0 && softAssetRatio_t1 < 1)
    ? (softAssetRatio_t / softAssetRatio_t1)
    : 1.0;

  // 4. SGI: Sales Growth Index
  const sgi = safeDivide(currentIncome.revenue, priorIncome.revenue);

  // 5. DEPI: Depreciation Index
  // Formula: (Depr_t-1 / (Depr_t-1 + PPE_t-1)) / (Depr_t / (Depr_t + PPE_t))

  const depr_t = currentCashFlow?.depreciationAndAmortization || currentIncome.depreciationAndAmortization || 0;
  const depr_t1 = priorCashFlow?.depreciationAndAmortization || priorIncome.depreciationAndAmortization || 0;
  const ppe_t = currentBalance.propertyPlantEquipmentNet || 0;
  const ppe_t1 = priorBalance.propertyPlantEquipmentNet || 0;

  const deprRate_t = safeDivide(depr_t, depr_t + ppe_t);
  const deprRate_t1 = safeDivide(depr_t1, depr_t1 + ppe_t1);

  const depi = deprRate_t > 0 ? (deprRate_t1 / deprRate_t) : 1.0;

  // 6. SGAI: SG&A Index
  // Formula: (SGA_t / Sales_t) / (SGA_t-1 / Sales_t-1)
  const sga_t = currentIncome.sellingGeneralAndAdministrativeExpenses || 0;
  const sga_t1 = priorIncome.sellingGeneralAndAdministrativeExpenses || 0;

  const sgai = (sga_t1 > 0 && sales_t1 > 0)
    ? ((sga_t / sales_t) / (sga_t1 / sales_t1))
    : 1.0;

  // 7. TATA: Total Accruals to Total Assets
  // Correct Formula: (Net Income - Operating Cash Flow) / Total Assets
  // High positive accruals (NI > OCF) -> Higher M-Score (Risk)
  const netIncome = currentIncome.netIncome;
  const ocf = currentCashFlow?.operatingCashFlow || currentIncome.netIncome; // Fallback to NI (0 accruals) or 0? 
  // If no OCF, assume Accruals = 0 implies OCF = NI. This is conservative (TATA = 0).

  const tata = safeDivide(
    (netIncome - ocf),
    currentBalance.totalAssets
  );

  // 8. LVGI: Leverage Index
  const leverage_current = safeDivide(currentBalance.totalLiabilities, currentBalance.totalAssets);
  const leverage_prior = safeDivide(priorBalance.totalLiabilities, priorBalance.totalAssets);
  const lvgi = leverage_prior > 0 ? safeDivide(leverage_current, leverage_prior) : 1.0;

  // M-Score Formula (Traditional 8-variable model)
  const mScore = -4.84
    + (0.92 * dsri)
    + (0.528 * gmi)
    + (0.404 * aqi)
    + (0.892 * sgi)
    + (0.115 * depi)
    - (0.172 * sgai)
    + (4.679 * tata)
    - (0.327 * lvgi);

  // Debug log for M-Score components if score is alarming
  if (mScore > -2.22) { // "Grey" or "Fraud" zone start
    // We can't log easily inside pure function without clutter, but useful for dev
    // console.log(`[Beneish Debug] DSRI:${dsri.toFixed(2)} GMI:${gmi.toFixed(2)} AQI:${aqi.toFixed(2)} SGI:${sgi.toFixed(2)} DEPI:${depi.toFixed(2)} SGAI:${sgai.toFixed(2)} LVGI:${lvgi.toFixed(2)}`);
  }

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
  marketCap: number,
  sector: SectorType // [FIX 13]
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
  // Original (Manufacturing): Z = 1.2X1 + 1.4X2 + 3.3X3 + 0.6X4 + 1.0X5
  // Z'' (Non-Manufacturing/Emerging): Z'' = 6.56X1 + 3.26X2 + 6.72X3 + 1.05X4 (No X5)

  const isManufacturing = sector === 'Industrial' || sector === 'Hardware' || sector === 'Consumer'; // Rough mapping

  if (isManufacturing) {
    return (1.2 * x1) + (1.4 * x2) + (3.3 * x3) + (0.6 * x4) + (1.0 * x5);
  } else {
    // Use Z'' for Tech, SaaS, Biotech, Services
    return (6.56 * x1) + (3.26 * x2) + (6.72 * x3) + (1.05 * x4);
  }
};

/**
 * Evaluate Altman Z-Score with Market Cap context
 * Hard kill only for small/mid caps (<$20B) with negative Z-Score
 */
const evaluateAltmanZ = (
  altmanZScore: number,
  marketCap: number,
  addWarning: (msg: string) => void,
  hardKill: (msg: string) => void
) => {
  const isSmallOrMidCap = marketCap < 20_000_000_000; // 20B cutoff
  if (altmanZScore < 0) {
    console.log(`[RiskDebug] Altman Check: Z=${altmanZScore}, Cap=${marketCap}, IsSmall=${isSmallOrMidCap}`);
  }

  // HARD KILL only if Altman < 0 AND small/mid cap
  if (altmanZScore < 0 && isSmallOrMidCap) {
    hardKill(`Altman Z-Score ${altmanZScore.toFixed(2)} < 0 (severe distress)`);
    return;
  }

  // Otherwise treat as a warning
  // Note: Z'' thresholds are different (Safe > 2.6, Grey 1.1-2.6, Distress < 1.1)
  // Standard Z: Safe > 2.99, Grey 1.81-2.99, Distress < 1.81
  // We'll use a conservative warning threshold of 1.8 for both for now to avoid complexity overload
  if (altmanZScore < 1.8) {
    addWarning(`Altman Z-Score ${altmanZScore.toFixed(2)} < 1.8 (distress zone)`);
  }
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
 * Formula: (Cash + ST Investments) / Avg Quarterly Burn
 * Burn = -(OCF - CapEx)
 */
const calculateCashRunway = (
  balance: BalanceSheet,
  cashFlows: CashFlowStatement[]
): number => {
  const cash = (balance.cashAndCashEquivalents || 0) + (balance.shortTermInvestments || 0);

  // Need at least 1 quarter of cash flow to estimate, ideally 4
  if (cashFlows.length === 0) return 0; // Unknown/Risk

  // Calculate burn for last 4 quarters (or fewer if not available)
  const quarters = Math.min(cashFlows.length, 4);

  // [FIX 13] Correct Average Burn Logic
  // Sum ALL FCF (positive and negative) over the period to get Net FCF.
  // If Net FCF is positive, they are self-funding.

  let netFCF = 0;
  for (let i = 0; i < quarters; i++) {
    netFCF += cashFlows[i].freeCashFlow; // FMP freeCashFlow is OCF + CapEx
  }

  const avgQuarterlyFCF = netFCF / quarters;

  if (avgQuarterlyFCF >= 0) {
    return 999; // Generating cash on average
  }

  const avgBurnRate = Math.abs(avgQuarterlyFCF);

  if (avgBurnRate === 0) return 999; // Should be covered by >= 0 but safety check

  return cash / avgBurnRate;
};

/**
 * Quality of Earnings (FCF vs Net Income)
 * Flag if Net Income > 0 but OCF < 0 (or much lower) for >= 2 years
 */
const calculateQualityOfEarnings = (
  incomes: IncomeStatement[],
  cashFlows: CashFlowStatement[]
): { status: 'Pass' | 'Fail' | 'Warn'; consecutiveNegative: number; conversionRatio: number; paperTiger: boolean } => {

  if (incomes.length < 4 || cashFlows.length < 4) {
    return { status: 'Warn', consecutiveNegative: 0, conversionRatio: 1, paperTiger: false };
  }

  // Check last 2 years (8 quarters)
  const periods = Math.min(incomes.length, cashFlows.length, 8);
  let paperTigerCount = 0;

  for (let i = 0; i < periods; i++) {
    const ni = incomes[i].netIncome;
    const ocf = cashFlows[i].operatingCashFlow;

    // "Paper Tiger" Logic: Net Income > 0 BUT OCF < 0
    if (ni > 0 && ocf < 0) {
      paperTigerCount++;
    }
  }

  // Calculate Conversion Ratio (TTM)
  const ttmNI = incomes.slice(0, 4).reduce((sum, i) => sum + i.netIncome, 0);
  const ttmOCF = cashFlows.slice(0, 4).reduce((sum, c) => sum + c.operatingCashFlow, 0); // Use OCF not FCF for ratio

  // User asked: earningsQualityRatio = operatingCashFlow / netIncome;
  const conversionRatio = ttmNI > 0 ? ttmOCF / ttmNI : 1;

  let status: 'Pass' | 'Fail' | 'Warn' = 'Pass';
  let paperTiger = false;

  // If "Paper Tiger" condition exists for significant portion (e.g. > 50% of periods or TTM)
  // User: "negative for 2 years -> RED FLAG". So if count >= 8? Or maybe just TTM is bad?
  // Let's be strict: if TTM NI > 0 and TTM OCF < 0, that's a Paper Tiger.
  if (ttmNI > 0 && ttmOCF < 0) {
    status = 'Fail';
    paperTiger = true;
  } else if (paperTigerCount >= 4) { // Suspicious if half the time they have no cash
    status = 'Warn';
  }

  return { status, consecutiveNegative: paperTigerCount, conversionRatio, paperTiger };
};

// ============ MAIN RISK FUNCTION ============

export const calculateRiskFlags = (
  incomeStatements: IncomeStatement[],
  balanceSheets: BalanceSheet[],
  cashFlowStatements: CashFlowStatement[],
  marketCap: number,
  ttmRevenue: number, // [NEW]
  sector: SectorType, // [FIX 12]
  shortInterestPct: number = 0
): RiskFlags => {

  const hardKillFlags: string[] = [];
  const warningFlags: string[] = [];
  let riskPenalty = 0;

  // Get current and prior periods
  const currentIncome = incomeStatements[0];
  const priorIncome = incomeStatements[4] || incomeStatements[1]; // 1 year ago or prior quarter
  const currentBalance = balanceSheets[0];
  const priorBalance = balanceSheets[4] || balanceSheets[1];

  // Calculate scores
  const beneishMScore = calculateBeneishMScore(currentIncome, priorIncome, currentBalance, priorBalance);
  const altmanZScore = calculateAltmanZScore(currentIncome, currentBalance, marketCap, sector);
  const dilutionRate = calculateDilutionRate(currentIncome, priorIncome);
  const cashRunwayQuarters = calculateCashRunway(currentBalance, cashFlowStatements);
  const qoe = calculateQualityOfEarnings(incomeStatements, cashFlowStatements);

  // Check kill switches & warnings

  // 1. Beneish M-Score (Earnings Manipulation)
  let mScore = -99;
  if (incomeStatements.length >= 2 && balanceSheets.length >= 2 && cashFlowStatements.length >= 2) {
    mScore = calculateBeneishMScore(
      incomeStatements[0],
      incomeStatements[1],
      balanceSheets[0],
      balanceSheets[1],
      cashFlowStatements[0],
      cashFlowStatements[1]
    );

    // [FIX 12] Use Sector Specific Threshold
    const threshold = BENEISH_THRESHOLDS[sector] || BENEISH_THRESHOLDS.default;

    // Evaluate M-Score Risk
    // Relax for tiny/early-stage companies (< $50M Revenue)
    const isEarlyStage = ttmRevenue < 50_000_000;

    if (mScore > -0.5) { // Extreme level
      if (isEarlyStage) {
        warningFlags.push(`Beneish M-Score ${mScore.toFixed(2)} > -0.5 (high manipulation risk, but early stage)`);
        riskPenalty -= 10;
        console.log(`[RiskDebug] Beneish: ${mScore} (WARNING - Early Stage)`);
      } else {
        hardKillFlags.push(`Beneish M-Score ${mScore.toFixed(2)} > -0.5 (extreme manipulation risk)`);
        console.log(`[RiskDebug] Beneish: ${mScore} (HARD KILL)`);
      }
    } else if (mScore > threshold) {
      warningFlags.push(`Beneish M-Score ${mScore.toFixed(2)} > ${threshold} (${sector} risk)`);
      riskPenalty -= 5;
      console.log(`[RiskDebug] Beneish: ${mScore} (WARNING)`);
    } else {
      console.log(`[RiskDebug] Beneish: ${mScore} (PASS)`);
    }
  }

  // 2. Dilution Rate
  if (dilutionRate > 300) {
    hardKillFlags.push(`Dilution rate ${dilutionRate.toFixed(1)}% > 300% (massive dilution)`);
  } else if (dilutionRate > 25) {
    warningFlags.push(`Dilution rate ${dilutionRate.toFixed(1)}% > 25% (high dilution)`);
    riskPenalty -= 10;
  } else if (dilutionRate > 10) {
    warningFlags.push(`Dilution rate ${dilutionRate.toFixed(1)}% > 10% (moderate dilution)`);
    riskPenalty -= 5;
  }

  // 3. Cash Runway
  if (cashRunwayQuarters < 4 && cashRunwayQuarters !== 999) {
    if (currentIncome.netIncome < 0) {
      if (cashRunwayQuarters < 1) {
        hardKillFlags.push(`Cash runway ${cashRunwayQuarters.toFixed(1)} quarters < 1 (imminent insolvency risk)`);
      } else {
        warningFlags.push(`Cash runway tight: ${cashRunwayQuarters.toFixed(1)} quarters`);
        riskPenalty -= 10;
      }
    } else {
      warningFlags.push(`Cash runway low: ${cashRunwayQuarters.toFixed(1)} quarters`);
      riskPenalty -= 5;
    }
  }

  // 5. Short Interest
  if (shortInterestPct > 25) {
    warningFlags.push(`Short interest ${shortInterestPct.toFixed(1)}% > 25% (extreme bearish sentiment)`);
    riskPenalty -= 5;
  } else if (shortInterestPct > 15) {
    warningFlags.push(`High Short Interest: ${shortInterestPct.toFixed(1)}%`);
    // No penalty for > 15? Maybe small? Let's leave it as warning.
  }

  // 6. Quality of Earnings (Already calculated in qoe)
  // Logic: Positive Net Income but Negative Operating Cash Flow is a major red flag (Paper Tiger)
  // Use qoe result.
  if (qoe.status === 'Fail') {
    warningFlags.push(`Paper Tiger: Net Income > 0 but OCF is Negative. Potential aggressive revenue recognition.`);
    riskPenalty += 15;
  } else if (qoe.status === 'Warn') {
    warningFlags.push(`Weak Earnings Quality: OCF lags Net Income significantly.`);
    riskPenalty += 5;
  }

  const disqualified = hardKillFlags.length > 0;

  return {
    beneishMScore: mScore,
    altmanZScore,
    dilutionRate,
    cashRunwayQuarters,
    shortInterestPct,

    disqualified,
    disqualifyReasons: hardKillFlags.length > 0 ? hardKillFlags : warningFlags.filter(w => w.includes("Paper Tiger") || w.includes("Beneish")),
    warnings: warningFlags,
    riskPenalty,

    qualityOfEarnings: qoe.status,
    fcfConversionRatio: qoe.conversionRatio,
    consecutiveNegativeFcfQuarters: qoe.consecutiveNegative
  };
};
