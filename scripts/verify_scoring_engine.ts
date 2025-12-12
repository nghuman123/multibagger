
import { computeMultiBaggerScore } from '../services/scoring/multiBaggerScore';
import { FundamentalData, FinnhubMetrics, SectorType } from '../types';

// Mock Data Builder
const createMockData = (overrides: Partial<FundamentalData> = {}): FundamentalData => ({
    ticker: 'TEST',
    sector: 'SaaS',
    price: 100,
    marketCap: 1000000000,
    peRatio: 30,
    forwardPeRatio: 25,
    psRatio: 10,
    pegRatio: 1.5,
    pbRatio: 5,
    revenueGrowth: 0.3, // 30%
    revenueGrowthForecast: 0.3,
    grossMargin: 80,
    operatingMargin: 10,
    netMargin: 5,
    fcfMargin: 0.20,
    roe: 0.15,
    roic: 0.10,
    debtToEquity: 0.5,
    currentRatio: 2.0,
    quickRatio: 1.5,
    insiderOwnershipPct: 15,
    founderLed: true,
    netInsiderBuying: 'Neutral',
    institutionalOwnershipPct: 60,
    shortInterestPct: 2,
    daysToCover: 1,
    scannerScore: 0,
    historicalPriceAnalysis: { trend: 'Uptrend', volatility: 0.2, rsRating: 80 },
    revenueHistory: [],
    tamPenetration: 2, // 2%
    catalystDensity: 'Medium',
    asymmetryScore: 'Medium',
    pricingPower: 'Strong',
    isProfitable: true,
    accrualsRatio: 0.02,
    beneishMScore: -2.5,
    shareCountGrowth3Y: 1,
    grossMarginTrend: 'Stable',
    revenueType: 'Recurring',
    dbnr: 110,
    ...overrides
});

const createMockFinnhub = (): FinnhubMetrics => ({
    symbol: 'TEST',
    peRatio: 30,
    pbRatio: 5,
    currentRatio: 2,
    quickRatio: 1.5,
    grossMargin: 80,
    operatingMargin: 10,
    netMargin: 5,
    returnOnEquity: 15,
    returnOnAssets: 5,
    revenueGrowth3Y: 30,
    revenueGrowth5Y: 25,
    incomeStatements: [],
    balanceSheets: []
});

function runTest(name: string, data: FundamentalData, expectedScoreRange: [number, number], expectedDetails: string[]) {
    console.log(`\nRunning Test: ${name}`);
    const score = computeMultiBaggerScore(data, createMockFinnhub(), data.marketCap, data.sector as SectorType);
    console.log(`Total Score: ${score.totalScore}/100`);

    // Validate Score
    if (score.totalScore >= expectedScoreRange[0] && score.totalScore <= expectedScoreRange[1]) {
        console.log(`[PASS] Score in range ${expectedScoreRange[0]}-${expectedScoreRange[1]}`);
    } else {
        console.error(`[FAIL] Score ${score.totalScore} outside range ${expectedScoreRange[0]}-${expectedScoreRange[1]}`);
    }

    // Validate Details
    expectedDetails.forEach(detail => {
        const found = score.breakdown.some(d => d.includes(detail));
        // Also check raw pillar details if needed, but breakdown aggregates them
        if (found) {
            console.log(`[PASS] Found detail: "${detail}"`);
        } else {
            console.error(`[FAIL] Missing detail: "${detail}"`);
            console.log("Details found:", score.breakdown);
        }
    });

    // Check specifically for Rule of X detail
    const valuationDetail = score.pillars.valuation.details.find(d => d.includes("Rule of X Valuation"));
    if (valuationDetail) console.log(`Valuation Detail: ${valuationDetail}`);
}

// Case 1: The "Perfect" SaaS Stock
runTest('Perfect SaaS (Grow 30%, GM 80%, FCF 25%, P/S 10)', createMockData({
    revenueGrowth: 0.3,
    grossMargin: 80,
    fcfMargin: 0.25,
    psRatio: 10,
    evToSales: 10,
    insiderOwnershipPct: 20,
    founderLed: true
}), [80, 100], ['Valuation (Adj PEG', 'Sector Leader Bonus']);

// Case 2: Value Trap (Low Growth)
runTest('Value Trap (Grow 4%, GM 60%, P/S 1.5)', createMockData({
    revenueGrowth: 0.04,
    revenueGrowthForecast: 0.04,
    grossMargin: 60,
    fcfMargin: 0.10,
    psRatio: 1.5,
    evToSales: 1.5,
}), [40, 65], ['Valuation: Low Growth Value']);

// Case 3: Risk Flag (Accruals)
runTest('Accruals Risk', createMockData({
    accrualsRatio: 0.15, // > 10%
}), [0, 80], ['Poor Earnings Quality']);

// Case 4: Risk Flag (Beneish)
runTest('Beneish Manipulation Risk', createMockData({
    beneishMScore: -1.0, // > -1.78
}), [0, 80], ['Beneish M-Score Warning']);

