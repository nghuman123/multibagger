
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

export interface AnalysisResult {
  markdown: string;
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
  netInsiderBuying90Days: number;
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

export interface MultiBaggerAnalysis {
  ticker: string;
  companyName: string;
  sector: SectorType;
  marketCap: number;
  price: number;
  
  quantScore: QuantitativeScore;
  riskFlags: RiskFlags;
  visionaryAnalysis: VisionaryAnalysis;
  patternMatch: PatternMatch;
  
  moatAssessment: 'Wide' | 'Narrow' | 'None';
  growthThesis: string;
  catalysts: string[];
  keyRisks: string[];
  
  finalScore: number;
  verdict: 'Strong Buy' | 'Buy' | 'Watch' | 'Pass' | 'Disqualified';
  
  dataQuality: DataQuality;
  dataTimestamp: string;
  sources: string[];
}
