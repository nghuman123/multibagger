import { SectorType } from '../../types';

export interface FundamentalData {
    // Basic Info
    ticker: string;
    sector: SectorType;
    price: number;
    marketCap: number;

    // Pillar A: Growth & TAM
    revenueHistory: { date: string; value: number }[]; // Quarterly revenue for CAGR & acceleration
    tamPenetration: '1-5%' | '<1%' | '5-10%' | '>10%'; // AI estimated bucket

    // Pillar B: Unit Economics
    grossMargin: number | null; // Percentage (0-100)
    grossMarginTrend: 'Expanding' | 'Stable' | 'Contracting';
    revenueType: 'Recurring' | 'Consumable' | 'Transactional' | 'One-time' | 'Project-based';
    roic: number | null; // Return on Invested Capital (null if not meaningful/pre-profit)
    isProfitable: boolean; // To decide between ROIC vs Rule of 40 logic

    // Pillar C: Alignment
    insiderOwnershipPct: number;
    founderLed: boolean;
    netInsiderBuying: 'Buying' | 'Neutral' | 'Selling'; // Last 6-12 months
    institutionalOwnershipPct: number;

    // Pillar D: Valuation
    psRatio: number;
    peRatio: number | null;
    forwardPeRatio: number | null;
    revenueGrowthForecast: number; // Forward growth or CAGR for PSG calc

    // Pillar E: Catalysts (AI Derived)
    catalystDensity: 'High' | 'Medium' | 'Low'; // 3+, 1-2, 0
    asymmetryScore: 'High' | 'Medium' | 'Low';
    pricingPower: 'Strong' | 'Neutral' | 'Weak'; // Used to adjust optionality

    // New fields for Capital Efficiency & SaaS Bonuses
    roe: number;           // Return on Equity (0-1 range, e.g. 0.4 = 40%)
    fcfMargin: number;     // Free Cash Flow Margin (0-1 range)
    revenueGrowth: number; // TTM Revenue Growth (0-1 range)
}

export interface PillarScore {
    score: number;
    maxScore: number;
    details: string[]; // Explanations for the score
}

export interface MultiBaggerScore {
    totalScore: number; // 0-100
    tier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Not Interesting' | 'Disqualified';

    pillars: {
        growth: PillarScore;       // A (35)
        economics: PillarScore;    // B (25)
        alignment: PillarScore;    // C (20)
        valuation: PillarScore;    // D (10)
        catalysts: PillarScore;    // E (10)
    };

    summary: string;

    // [NEW] Detailed Feedback
    breakdown: string[];
    bonuses: string[];
    penalties: string[];
    computedMetrics: {
        cagr3y: number;
        grossMargin: number;
        revenueGrowth: number;
    };
}

export interface PriceHistoryData {
    price: number;
    history: { date: string; close: number }[]; // Need at least 1 year for RS
    sma200: number;
    week52High: number;
    week52Low: number;
    benchmarkHistory?: { date: string; close: number }[]; // [NEW] SPY/QQQ
}

export interface TechnicalScore {
    totalScore: number; // 0-25
    details: string[];

    relativeStrengthScore: number; // 0-10
    sma200Score: number;           // 0-10
    week52HighScore: number;       // 0-5
}

export interface SqueezeSetup {
    squeezeScore: 'Strong' | 'Moderate' | 'Watch' | 'None';
    details: string[];
}
