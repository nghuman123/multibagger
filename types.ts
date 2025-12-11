
// ============ LEGACY / UI TYPES ============
export interface Stock {
  ticker: string;
  name: string;
  price: number;
  changePercent: number;
  marketCap: string;
  exchange?: string;
  sector: string;
  industry: string;
  volume: string;
  avgVolume: string;
  score?: number; // Optional now
  growthScore?: number;
  catalystScore?: number;
  qualityScore?: number;
  description?: string;
  catalysts?: Catalyst[];
  metrics?: CompounderMetrics;
}

export interface CompounderMetrics {
  revenueGrowth: number;
  grossMargin: number;
  grossMarginTrend: 'Expanding' | 'Stable' | 'Contracting';
  ruleOf40: number;
  insiderOwnership: number;
  founderLed: boolean;
  dilutionRate: number;
  pegRatio: number;
  cashRunway: string;
  beneishMScore: number;
}

export interface Catalyst {
  id: string;
  date: string;
  title: string;
  type: 'FDA' | 'Earnings' | 'Product' | 'Contract' | 'M&A' | 'Macro' | 'Tech';
  impact: 'High' | 'Medium' | 'Low';
  description: string;
}

export interface MoatThesisAnalysis {
  moatScore: number;
  primaryMoatType: string;
  moatDurability: string;
  oneLineThesis: string;
  bullCase: string[];
  bearCase: string[];
}

export interface AnalysisResult {
  ticker: string;
  score: number;        // finalScore 0–100
  tier: string;         // "Tier 1" | "Tier 2" | "Tier 3" | "Not Interesting" | "Disqualified"
  verdict: string;      // "Strong Buy" | "Buy" | "Watch" | "Pass" | "Disqualified"

  price: number;

  // The quantitative + AI breakdown
  quantScore: number;   // 0–100
  aiScore: number;      // effective AI contribution (boost - penalties)

  // Flags and bonuses
  bonuses: string[];    // e.g. ["Growth Bonus", "Capital Efficiency"]
  riskFlags: {
    disqualified: boolean;
    disqualifiedReasons: string[];  // e.g. ["Altman Z-Score -10.9 < 0 (severe distress)"]
    warnings: string[];             // Beneish, dilution, Altman warning zone, etc.
    riskPenalty: number;
  };

  // Narrative from Gemini
  aiAnalysis: {
    moat: {
      score: number;                // 0–100 or 1–10
      durability: string;           // short text label from Moat agent
      type: string;                 // [NEW] primary moat type
    };
    thesis: string;                 // main investment thesis
    risks: string[];                // key risk bullets (mapped from bearCase or separate risks)
    bullCase: string[];             // [NEW]
    bearCase: string[];             // [NEW]
  };
  dataQualityWarnings?: string[];
  warningFull?: string;
}

// ... (rest of file)

export interface MultiBaggerAnalysis {
  ticker: string;
  companyName: string;
  sector: SectorType;
  marketCap: number;
  price: number;

  // New Score
  multiBaggerScore: MultiBaggerScore;
  technicalScore: TechnicalScore;
  squeezeSetup: SqueezeSetup;

  overallTier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Not Interesting' | 'Disqualified';
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Not Interesting' | 'Disqualified'; // Alias for frontend
  suggestedPositionSize: string;

  // Legacy/Other
  quantScore?: QuantitativeScore; // Optional/Deprecated
  riskFlags: RiskFlags;
  visionaryAnalysis: VisionaryAnalysis;
  patternMatch: PatternMatch;
  antigravityResult?: AntigravityResult;

  moatAssessment: 'Wide' | 'Narrow' | 'None';
  growthThesis: string;
  catalysts: string[];
  keyRisks: string[];
  warnings: string[]; // [NEW] Risk warnings

  finalScore: number;
  score: number; // Alias for frontend
  verdict: 'Strong Buy' | 'Buy' | 'Watch' | 'Pass' | 'Disqualified';

  // New fields for AnalysisResult parity
  aiScore: number;
  bonuses: string[];
  aiAnalysis: {
    moat: {
      score: number;
      durability: string;
      type: string;
    };
    thesis: string;
    risks: string[];
    bullCase: string[];
    bearCase: string[];
  };

  dataQuality: DataQuality;
  dataTimestamp: string;
  sources: string[];
}

// ============ RAW DATA TYPES (FMP) ============

export interface CompanyProfile {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  mktCap: number;
  price: number;
  changes: number;
  changesPercentage: number;
  exchange: string;
  ceo: string;
  fullTimeEmployees: number;
  description: string;
  isActivelyTrading: boolean;
  isFund: boolean;
  isEtf: boolean;
  ipoDate: string;
  currency?: string;
  exchangeShortName?: string;
}

export interface IncomeStatement {
  date: string;
  symbol: string;
  revenue: number;
  grossProfit: number;
  grossProfitRatio: number;
  operatingIncome: number;
  operatingIncomeRatio: number;
  netIncome: number;
  netIncomeRatio: number;
  ebitda: number;
  ebitdaratio: number;
  eps: number;
  epsdiluted: number;
  weightedAverageShsOut: number;
  weightedAverageShsOutDil: number;
}

export interface BalanceSheet {
  date: string;
  symbol: string;
  cashAndCashEquivalents: number;
  shortTermInvestments: number;
  totalCurrentAssets: number;
  totalAssets: number;
  totalCurrentLiabilities: number;
  totalLiabilities: number;
  totalStockholdersEquity: number;
  retainedEarnings: number;
  totalDebt: number;
  netDebt: number;
}

export interface CashFlowStatement {
  date: string;
  symbol: string;
  operatingCashFlow: number;
  capitalExpenditure: number;
  freeCashFlow: number;
  stockBasedCompensation: number;
}

export interface KeyMetrics {
  symbol: string;
  date: string;
  revenuePerShare: number;
  netIncomePerShare: number;
  operatingCashFlowPerShare: number;
  freeCashFlowPerShare: number;
  cashPerShare: number;
  peRatio: number;
  priceToSalesRatio: number;
  pbRatio: number;
  evToSales: number;
  evToEBITDA: number;
  debtToEquity: number;
  debtToAssets: number;
  currentRatio: number;
  roe: number;
  roic: number;
  grahamNumber: number;
  enterpriseValue: number;
  marketCap: number;
}

export interface InsiderTrade {
  symbol: string;
  transactionDate: string;
  reportingName: string;
  transactionType: string; // "P-Purchase", "S-Sale"
  securitiesTransacted: number;
  price: number;
  value: number;
  securityName: string;
}

export interface FinancialGrowth {
  symbol: string;
  date: string;
  revenueGrowth: number;
  grossProfitGrowth: number;
  ebitgrowth: number;
  operatingIncomeGrowth: number;
  netIncomeGrowth: number;
  epsgrowth: number;
  epsdilutedGrowth: number;
  freeCashFlowGrowth: number;
  threeYRevenueGrowthPerShare: number;
  fiveYRevenueGrowthPerShare: number;
  tenYRevenueGrowthPerShare: number;
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changesPercentage: number;
  dayHigh: number;
  dayLow: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  volume: number;
  avgVolume: number;
  pe: number | null;
  eps: number | null;
  sharesOutstanding: number;
  priceToSales?: number;
  name?: string;
  exchange?: string;
}

export interface HistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  unadjustedVolume: number;
  change: number;
  changePercent: number;
  vwap: number;
  label: string;
  changeOverTime: number;
}

// ============ FINNHUB DATA TYPES ============

export interface ShortInterestData {
  symbol: string;
  shortInterest: number;
  shortInterestPercentOfFloat: number;
  shortInterestRatioDaily: number;
  lastUpdated: string;
}

export interface NewsItem {
  category: string;
  datetime: number;
  headline: string;
  source: string;
  summary: string;
  url: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface FinnhubMetrics {
  symbol: string;
  peRatio: number;
  pbRatio: number;
  currentRatio: number;
  quickRatio: number;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  returnOnEquity: number;
  returnOnAssets: number;
  revenueGrowth3Y: number;
  revenueGrowth5Y: number;
}

// ============ SCORING TYPES ============

export type SectorType = 'SaaS' | 'Biotech' | 'SpaceTech' | 'Quantum' | 'Hardware' | 'FinTech' | 'Consumer' | 'Industrial' | 'Other';

export interface DataQuality {
  insiderOwnershipSource: 'real' | 'estimated' | 'unavailable';
  beneishMScoreReliability: 'full' | 'partial' | 'unavailable';
  shortInterestSource: 'real' | 'unavailable';
  overallConfidence: 'high' | 'medium' | 'low';
}

export interface QuantitativeScore {
  growthScore: number;        // 0-30
  qualityScore: number;       // 0-25
  ruleOf40Score: number;      // 0-20
  insiderScore: number;       // 0-15
  valuationScore: number;     // 0-10
  compositeScore: number;     // 0-100

  // Underlying data
  revenueGrowth3YrCAGR: number;
  lastQuarterGrowth: number;
  grossMargin: number;
  grossMarginTrend: 'Expanding' | 'Stable' | 'Contracting';
  ruleOf40Value: number;
  insiderOwnershipPct: number;
  founderLed: boolean;
  netInsiderBuying180Days: number;
  priceToSales: number;
  psgRatio: number;
}

export interface RiskFlags {
  beneishMScore: number;
  dilutionRate: number;
  cashRunwayQuarters: number;
  altmanZScore: number;
  shortInterestPct: number;

  disqualified: boolean;
  disqualifyReasons: string[];
  warnings: string[];
  riskPenalty: number; // New field for score deduction

  // New Fields
  qualityOfEarnings: 'Pass' | 'Fail' | 'Warn';
  fcfConversionRatio: number; // FCF / Net Income
  consecutiveNegativeFcfQuarters: number;
}

export interface VisionaryAnalysis {
  longTermScore: number;
  customerScore: number;
  innovationScore: number;
  capitalScore: number;
  totalVisionaryScore: number;
  ceoName: string;
  explanation: string;
}

export interface PatternMatch {
  similarTo: string;
  matchScore: number;
  keyParallels: string[];
  keyDifferences: string[];
}

import { MultiBaggerScore, TechnicalScore, SqueezeSetup } from './src/types/scoring';
import { AntigravityResult } from './src/types/antigravity';
export type { MultiBaggerScore, TechnicalScore, SqueezeSetup, AntigravityResult };

export interface MultiBaggerAnalysis {
  ticker: string;
  companyName: string;
  sector: SectorType;
  marketCap: number;
  price: number;

  // New Score
  multiBaggerScore: MultiBaggerScore;
  technicalScore: TechnicalScore;
  squeezeSetup: SqueezeSetup;

  overallTier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Not Interesting' | 'Disqualified';
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Not Interesting' | 'Disqualified'; // Alias for frontend
  suggestedPositionSize: string;

  // Legacy/Other
  quantScore?: QuantitativeScore; // Optional/Deprecated
  riskFlags: RiskFlags;
  visionaryAnalysis: VisionaryAnalysis;
  patternMatch: PatternMatch;
  antigravityResult?: AntigravityResult;

  moatAssessment: 'Wide' | 'Narrow' | 'None';
  growthThesis: string;
  catalysts: string[];
  keyRisks: string[];
  warnings: string[]; // [NEW] Risk warnings

  finalScore: number;
  rawScore: number; // [NEW] Unclamped score for debugging
  score: number; // Alias for frontend
  verdict: 'Strong Buy' | 'Buy' | 'Watch' | 'Pass' | 'Disqualified';

  // New fields for AnalysisResult parity
  aiScore: number;
  grades?: {
    quality: string;
    growth: string;
    valuation: string;
    momentum: string;
  };
  bonuses: string[];
  aiAnalysis: {
    moat: {
      score: number;
      durability: string;
      type: string;
    };
    thesis: string;
    risks: string[];
    bullCase: string[];
    bearCase: string[];
  };

  dataQuality: DataQuality;
  dataTimestamp: string;
  sources: string[];
  dataQualityWarnings?: string[];
  warningFull?: string;
}

// ============ INSTITUTIONAL UPGRADE TYPES ============

export interface StockMetricData {
  // === EXISTING FIELDS (keep all) ===
  peRatio?: number | null;
  pegRatio?: number | null;
  priceToSales?: number | null; // [new]
  evToEbitda?: number | null;
  evToSales?: number | null;
  pbRatio?: number | null;

  revenueGrowth?: number | null;      // YoY %
  grossMargin?: number | null;        // %
  operatingMargin?: number | null;    // %
  netMargin?: number | null;          // %

  roe?: number | null;                // %
  roic?: number | null;               // %

  debtToEquity?: number | null;
  debtToEbitda?: number | null;
  interestCoverage?: number | null;
  currentRatio?: number | null;
  quickRatio?: number | null;

  fcfYield?: number | null;
  payoutRatio?: number | null;

  insiderPct?: number | null;
  institutionalPct?: number | null;
  shortInterestPct?: number | null;

  // === NEW: GROWTH DYNAMICS ===
  revenueGrowthQ1?: number | null;      // YoY growth 1 quarter ago
  revenueGrowthQ2?: number | null;      // YoY growth 2 quarters ago
  revenueGrowthQ3?: number | null;      // YoY growth 3 quarters ago
  growthAcceleration?: 'Accelerating' | 'Stable' | 'Decelerating';

  // === NEW: SAAS METRICS ===
  dbnr?: number | null;                 // Dollar-Based Net Retention (e.g., 125 for 125%)
  nrr?: number | null;                  // Net Revenue Retention
  arr?: number | null;                  // Annual Recurring Revenue ($M)
  rpo?: number | null;                  // Remaining Performance Obligations ($M)
  rpoGrowth?: number | null;            // RPO YoY Growth %

  // === NEW: RULE OF 40 ===
  ruleOf40Score?: number | null;        // Revenue Growth % + FCF Margin %

  // === NEW: CAPITAL EFFICIENCY ===
  shareCountGrowth3Y?: number | null;   // 3-year share dilution CAGR %
  sbcAsPercentRevenue?: number | null;  // Stock-Based Comp / Revenue %
  capitalEfficiencyRatio?: number | null; // ARR Added / Cash Burned

  // === NEW: QUALITY METRICS ===
  accrualsRatio?: number | null;        // (Net Income - FCF) / Total Assets
  fScore?: number | null;               // Piotroski F-Score (0-9)
  altmanZ?: number | null;              // Altman Z-Score (bankruptcy risk)
  fcfConversion?: number | string | null;

  // === NEW: RELATIVE VALUATION ===
  pePercentile5Y?: number | null;       // Current P/E percentile vs 5-year range (0-100)
  evSalesPercentile5Y?: number | null;  // Current EV/Sales percentile (0-100)
  evGpRatio?: number | null;            // EV / Gross Profit (for SaaS)

  // === NEW: MARKET DYNAMICS ===
  tamEstimate?: number | null;          // Total Addressable Market ($B)
  marketSharePct?: number | null;       // Current market share %
  tamPenetration?: number | null;       // Revenue / TAM %

  // === NEW: INSTITUTIONAL ===
  institutionalOwnership?: number | null;
  institutionalChange13F?: number | null; // QoQ change in inst ownership %
  analystCount?: number | null;
  avgPriceTarget?: number | null;
  priceTargetUpside?: number | null;    // % upside to avg PT
  epsRevisionTrend?: string | null;
}

export interface StockCompany {
  // === EXISTING FIELDS (keep all) ===
  ticker: string;
  name: string;
  sector: string;
  businessModel?: string;
  marketCap?: string | number;
  price?: number;
  isUptrend?: boolean;
  recommendation?: string;

  metrics?: StockMetricData;
  moat?: string;
  risks?: string;

  // === NEW: COMPOSITE SCORES ===
  multibaggerScore?: number;            // 0-100 composite score
  qualityGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
  growthGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
  valuationGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
  momentumGrade?: 'A' | 'B' | 'C' | 'D' | 'F';

  // === NEW: MOAT BREAKDOWN ===
  moatScore?: number;                   // 0-10 quantitative moat score
  moatSources?: {
    networkEffects: number;             // 0-3
    switchingCosts: number;             // 0-2
    intangibleAssets: number;           // 0-2
    costAdvantage: number;              // 0-2
    efficientScale: number;             // 0-1
  };

  // === NEW: RISK METRICS ===
  riskScore?: number;                   // 0-100 (higher = riskier)
  dilutionRisk?: 'Low' | 'Medium' | 'High';
  executionRisk?: 'Low' | 'Medium' | 'High';
  competitionRisk?: 'Low' | 'Medium' | 'High';

  verdictReason?: string;
  cyclePosition?: string;
  thesisBreaker?: string;
  factorScore?: string;
}
