import { computeMultiBaggerScore } from '../../services/scoring/multiBaggerScore';
import { FundamentalData } from '../../src/types/scoring';

const tier1Data: FundamentalData = {
    ticker: 'BEST',
    sector: 'SaaS',
    price: 100,
    marketCap: 1000000000,
    revenueHistory: [
        { date: '2025-01-01', value: 100 },
        { date: '2024-01-01', value: 60 }, // High growth
        { date: '2023-01-01', value: 35 },
        { date: '2022-01-01', value: 20 },
        { date: '2021-01-01', value: 10 },
        { date: '2020-01-01', value: 5 },
        { date: '2019-01-01', value: 2 },
        { date: '2018-01-01', value: 1 },
    ],
    tamPenetration: '1-5%',
    grossMargin: 80,
    grossMarginTrend: 'Expanding',
    revenueType: 'Recurring',
    roic: 25,
    isProfitable: true,
    insiderOwnershipPct: 20,
    founderLed: true,
    netInsiderBuying: 'Buying',
    institutionalOwnershipPct: 40,
    psRatio: 10,
    peRatio: 50,
    forwardPeRatio: 30, // Ratio > 1.2
    revenueGrowthForecast: 40,
    catalystDensity: 'High',
    asymmetryScore: 'High',
    pricingPower: 'Strong',
    // [FIX] Added missing fields
    roe: 0.25,
    fcfMargin: 0.30,
    revenueGrowth: 0.60
};

const tier3Data: FundamentalData = {
    ticker: 'MID',
    sector: 'Hardware',
    price: 50,
    marketCap: 500000000,
    revenueHistory: [
        { date: '2025-01-01', value: 100 },
        { date: '2024-01-01', value: 90 }, // Slow growth
        { date: '2023-01-01', value: 80 },
        { date: '2022-01-01', value: 70 },
        { date: '2021-01-01', value: 60 },
    ],
    tamPenetration: '>10%',
    grossMargin: 35, // Low for hardware? No, mid.
    grossMarginTrend: 'Stable',
    revenueType: 'One-time',
    roic: 10,
    isProfitable: true,
    insiderOwnershipPct: 2,
    founderLed: false,
    netInsiderBuying: 'Neutral',
    institutionalOwnershipPct: 80, // Crowded
    psRatio: 2,
    peRatio: 15,
    forwardPeRatio: 14,
    revenueGrowthForecast: 10,
    catalystDensity: 'Low',
    asymmetryScore: 'Low',
    pricingPower: 'Neutral',
    // [FIX] Added missing fields
    roe: 0.10,
    fcfMargin: 0.05,
    revenueGrowth: 0.05
};

console.log('--- Tier 1 Test ---');
const score1 = computeMultiBaggerScore(tier1Data, {} as any, tier1Data.marketCap, tier1Data.sector);
console.log(score1.summary);

console.log('\n--- Tier 3 Test ---');
const score3 = computeMultiBaggerScore(tier3Data, {} as any, tier3Data.marketCap, tier3Data.sector);
console.log(score3.summary);
