import {
    FundamentalData,
    FinnhubMetrics,
    MultiBaggerScore,
    SectorType,
    IncomeStatement,
    BalanceSheet,
    CashFlowStatement,
    RiskFlags
} from '../../types';
import { STRATEGY } from '../../config/strategyConfig';
import { calcTTM, calculateGrowthMetrics, calculateGrossMargin, calculateNetDebtEbitda, calculateRndIntensity } from '../utils/financialUtils';
import { calculateRiskFlags } from './riskFlags';

// Define local interfaces if not in types
interface ComponentScore {
    score: number;
    maxScore: number;
    details: string[];
}

interface PillarScore extends ComponentScore { }

// ============================================================================
// 1. CONFIGURATION (Sector Thresholds & Relative Scoring)
// ============================================================================

interface SectorConfig {
    grossMarginTop: number;
    grossMarginMid: number;
    roicTop: number;
    roicMid: number;
    peTop: number; // For relative valuation (Top = Lower PE is better? Or Top = Higher valuation allowed?)
    // Let's interpret as "Reasonable Max P/E" or "Premium P/E".
    // Actually, for Z-score proxy: "Top" = 80th percentile metric.
    growthTop: number;
}

export const SECTOR_THRESHOLDS: Record<SectorType, SectorConfig> = {
    // SaaS: High margins, high growth allowed, high PE allowed
    SaaS: { grossMarginTop: 75, grossMarginMid: 60, roicTop: 20, roicMid: 12, peTop: 60, growthTop: 30 },
    Biotech: { grossMarginTop: 85, grossMarginMid: 70, roicTop: 15, roicMid: 8, peTop: 40, growthTop: 20 },
    SpaceTech: { grossMarginTop: 40, grossMarginMid: 25, roicTop: 15, roicMid: 8, peTop: 50, growthTop: 40 },
    Quantum: { grossMarginTop: 50, grossMarginMid: 30, roicTop: 15, roicMid: 8, peTop: 50, growthTop: 40 },
    Hardware: { grossMarginTop: 45, grossMarginMid: 30, roicTop: 15, roicMid: 8, peTop: 25, growthTop: 15 },
    FinTech: { grossMarginTop: 60, grossMarginMid: 45, roicTop: 18, roicMid: 10, peTop: 35, growthTop: 20 },
    Consumer: { grossMarginTop: 50, grossMarginMid: 35, roicTop: 15, roicMid: 8, peTop: 30, growthTop: 15 },
    Industrial: { grossMarginTop: 35, grossMarginMid: 20, roicTop: 12, roicMid: 6, peTop: 25, growthTop: 10 },
    Other: { grossMarginTop: 50, grossMarginMid: 30, roicTop: 15, roicMid: 8, peTop: 25, growthTop: 10 },
};

// Helper: Score Relative to Sector (Proxy for Z-Score)
// Returns score 0-10
const scoreRelative = (value: number, sector: SectorType, metricKey: keyof SectorConfig, maxPoints: number = 10): number => {
    const config = SECTOR_THRESHOLDS[sector] || SECTOR_THRESHOLDS.Other;
    // @ts-ignore
    const top = config[metricKey] as number;
    // @ts-ignore
    const mid = config[metricKey.replace('Top', 'Mid')] as number || (top * 0.7);

    if (value >= top) return maxPoints;
    if (value >= mid) return Math.floor(maxPoints * 0.6); // 60% points
    return Math.floor(maxPoints * 0.2); // 20% points
};

// ============================================================================
// 2. PILLAR IMPLEMENTATIONS
// ============================================================================

// --- Pillar A: Growth & TAM (25 pts) ---
const scoreGrowthAndTAM = (
    data: FundamentalData,
    metrics: { cagr3y: number; lastYearGrowth: number },
    sector: SectorType
): ComponentScore => {
    let score = 0;
    const details: string[] = [];

    // A1. Growth vs Sector (10 pts)
    // Dynamic Weighting: If history is short, rely on Last Year Growth more.
    const historyLen = data.revenueHistory?.length || 0;
    let growthMetric = metrics.cagr3y;
    let growthLabel = `3Y CAGR`;

    if (historyLen < 3) {
        // [FIX 30] Dynamic CAGR: Prefer recent growth if history is short (IPO)
        growthMetric = metrics.lastYearGrowth;
        growthLabel = `LTM Growth (IPO Mode)`;
    }

    const growthScore = scoreRelative(growthMetric, sector, 'growthTop', 10);
    score += growthScore;
    details.push(`${growthLabel} ${growthMetric.toFixed(1)}%: +${growthScore}/10 (Sector Relative)`);

    // A2. Acceleration (7 pts)
    // If recent growth > trend
    let accelerationScore = 0;
    const trend = metrics.cagr3y > 0 ? metrics.cagr3y : metrics.lastYearGrowth;
    const current = metrics.lastYearGrowth;

    if (current > trend * 1.2) {
        accelerationScore = 7;
        details.push(`Accelerating Growth (${current.toFixed(1)}% > 1.2x Trend): +7`);
    } else if (current > trend) {
        accelerationScore = 4;
        details.push(`Growth Validated (Above Trend): +4`);
    } else if (historyLen < 3 && current > 20) {
        // Bonus for high growth IPOs lacking trend
        accelerationScore = 5;
        details.push(`High Growth IPO Bonus: +5`);
    }
    score += accelerationScore;

    // A3. TAM Penetration (8 pts)
    let tamScore = 0;
    const tam = data.tamPenetration || 50;
    if (tam < 1) tamScore = 8;
    else if (tam < 5) tamScore = 6;
    else if (tam < 10) tamScore = 4;
    else tamScore = 2;
    score += tamScore;
    details.push(`TAM Penetration (${tam.toFixed(1)}%): +${tamScore}/8`);

    return { score, maxScore: 25, details };
}

// --- Pillar B: Quality / Moat (30 pts) ---
// [FIX 30] Enhanced with Moat Logic
const scoreQualityAndMoat = (
    balanceSheets: BalanceSheet[],
    sector: SectorType,
    grossMargin: number,
    gmStdDev: number, // [NEW] Stability
    netDebtEbitda: number | null,
    rndIntensity: number,
    revenueType: string,
    dbnr: number | null
): ComponentScore => {
    let score = 0;
    const breakdown: string[] = [];

    // B1. Margins Relative to Sector (10 pts)
    const gmScore = scoreRelative(grossMargin, sector, 'grossMarginTop', 10);
    score += gmScore;
    breakdown.push(`Gross Margin ${grossMargin.toFixed(1)}%: +${gmScore}/10 (Sector Relative)`);

    // B2. Moat Indicators (10 pts)
    let moatScore = 0;

    // a. Revenue Stickiness (DBNR or Revenue Type)
    const rt = (revenueType || '').toLowerCase();
    if (dbnr && dbnr > 120) {
        moatScore += 5;
        breakdown.push(`Elite DBNR (${dbnr}%): +5`);
    } else if (rt.includes('recurring') || rt.includes('saas')) {
        moatScore += 3;
        breakdown.push(`Recurring Revenue Model: +3`);
    } else if (dbnr && dbnr > 100) {
        moatScore += 2;
        breakdown.push(`Positive Net Retention: +2`);
    }

    // b. Margin Stability (Pricing Power)
    // If GM StdDev is low (< 2%), it forces stability/power
    if (gmStdDev < 2.0 && grossMargin > 40) {
        moatScore += 5;
        breakdown.push(`Pricing Power (GM Stable +/- ${gmStdDev.toFixed(1)}%): +5`);
    } else if (gmStdDev < 5.0 && grossMargin > 40) {
        moatScore += 2;
        breakdown.push(`Stable Margins: +2`);
    }

    score += Math.min(moatScore, 10);

    // B3. Financial Health (Innovation/Leverage) (10 pts)
    let healthScore = 0;
    // Leverage
    if (netDebtEbitda !== null) {
        if (netDebtEbitda < 2.0) healthScore += 3;
        else if (netDebtEbitda > 4.0) healthScore -= 2; // Penalty logic handled elsewhere usually, but ok here
    }
    // Innovation
    if (rndIntensity > 15) healthScore += 5; // High R&D
    else if (rndIntensity > 5) healthScore += 2;

    // Profitability Check
    // If we haven't maxed out health, giving points for simple profitability
    if (healthScore < 8 && netDebtEbitda !== null && netDebtEbitda < 0) { // Net Cash
        healthScore += 2;
        breakdown.push("Net Cash Position: +2");
    }

    score += Math.min(healthScore, 10);
    if (healthScore > 0) breakdown.push(`Financial Health & Innovation: +${Math.min(healthScore, 10)}/10`);

    return { score, maxScore: 30, details: breakdown };
};

// --- Pillar C: Alignment (15 pts) ---
function scoreAlignment(data: FundamentalData): PillarScore {
    let score = 0;
    const details: string[] = [];

    // C1. Founder/Insider (7 pts)
    const insiderOwn = data.insiderOwnershipPct || 0;
    const founder = data.founderLed || false;
    let insiderScore = 0;

    if (founder) {
        if (insiderOwn > 2) insiderScore = 7; // Lower bar for founder
        else insiderScore = 5;
    } else {
        if (insiderOwn > 10) insiderScore = 5;
        else if (insiderOwn > 1) insiderScore = 2;
    }
    score += insiderScore;
    details.push(`Insider Align (${insiderOwn.toFixed(1)}%, Founder=${founder}): +${insiderScore}/7`);

    // C2. Activity (5 pts)
    const buying = data.netInsiderBuying || 'Neutral';
    if (buying === 'Cluster Buy') { score += 5; details.push('Cluster Buying: +5'); }
    else if (buying === 'Buying') { score += 3; details.push('Insider Buying: +3'); }
    else { score += 2; details.push('Neutral Activity: +2'); }

    // C3. Inst (3 pts)
    const inst = data.institutionalOwnershipPct || 0;
    if (inst > 30 && inst < 90) { score += 3; details.push(`Institutional Validation (${inst.toFixed(0)}%): +3`); }
    else { score += 1; details.push(`Inst Ownership (${inst.toFixed(0)}%): +1`); }

    return { score, maxScore: 15, details };
}

// --- Pillar D: Valuation (20 pts) ---
function scoreValuation(data: FundamentalData, metrics: { growth: number, fcf: number }): PillarScore {
    let score = 0;
    const details: string[] = [];

    // Adjusted PEG: (EV/Sales) / (Growth + FCF)
    const evS = data.evToSales || data.psRatio || 0;
    const performance = metrics.growth + (metrics.fcf * 100); // 30% + 20% = 50

    if (metrics.growth < 5) {
        // Value Trap Guard
        if (evS < 2) return { score: 5, maxScore: 20, details: ['Value Trap Guard (Low Growth): +5'] };
        return { score: 2, maxScore: 20, details: ['Stagnant & Expensive: +2'] };
    }

    const adjPeg = performance > 0 ? evS / performance : 99;

    let pegScore = 0;
    if (adjPeg < 0.2) pegScore = 15; // Elite
    else if (adjPeg < 0.5) pegScore = 10;
    else if (adjPeg < 1.0) pegScore = 5;
    else pegScore = 0;

    score += pegScore;
    details.push(`Valuation (Adj PEG ${adjPeg.toFixed(2)}): +${pegScore}/15`);

    // Trend (5 pts)
    if (data.forwardPeRatio && data.peRatio && data.peRatio > data.forwardPeRatio) {
        score += 5;
        details.push('Earnings Expansion (Fwd PE < Trailing): +5');
    }

    return { score: Math.min(score, 20), maxScore: 20, details };
}

// --- Pillar E: Catalysts (15 pts) ---
function scoreCatalysts(data: FundamentalData): PillarScore {
    const density = data.catalystDensity || 'Medium';
    let score = density === 'High' ? 10 : (density === 'Medium' ? 5 : 2);
    const details = [`Catalyst Density (${density}): +${score}`];

    // Asymmetry
    if (data.asymmetryScore === 'High') { score += 5; details.push('High Asymmetry: +5'); }

    return { score: Math.min(score, 15), maxScore: 15, details };
}

// ============================================================================
// 3. MAIN FUNCTION (UNIFIED)
// ============================================================================

export function computeMultiBaggerScore(
    data: FundamentalData,
    finnhubMetrics: FinnhubMetrics,
    marketCap: number,
    sector: SectorType
): MultiBaggerScore & { riskFlags: RiskFlags } { // [FIX 30] Return RiskFlags too

    // --- 0. UNIFIED RISK ENGINE (HARD KILL) ---
    const incomes = finnhubMetrics.incomeStatements || [];
    const balances = finnhubMetrics.balanceSheets || [];
    const cashflows = finnhubMetrics.cashFlowStatements || [];
    const ttmRev = incomes.length > 0 ? (incomes[0].revenue || 0) : 0; // Approx TTM implies using calcTTM maybe, but simple latest is ok for risk scale check

    const riskFlags = calculateRiskFlags(incomes, balances, cashflows, marketCap, ttmRev, sector, data.shortInterestPct || 0);

    // Hard Kill Check
    if (riskFlags.disqualified) {
        return {
            totalScore: 0,
            tier: 'Disqualified',
            pillars: {
                growth: { score: 0, maxScore: 25, details: [] },
                economics: { score: 0, maxScore: 30, details: [] },
                alignment: { score: 0, maxScore: 15, details: [] },
                valuation: { score: 0, maxScore: 20, details: [] },
                catalysts: { score: 0, maxScore: 15, details: [] }
            },
            summary: `Disqualified by Risk Engine: ${riskFlags.disqualifyReasons.join(', ')}`,
            breakdown: riskFlags.disqualifyReasons,
            bonuses: [],
            penalties: riskFlags.disqualifyReasons,
            computedMetrics: {
                cagr3y: 0,
                grossMargin: 0,
                revenueGrowth: 0
            },
            riskFlags // Include for analyzer
        };
    }

    // --- 1. CALCULATE CORE METRICS ---
    const growthMetrics = calculateGrowthMetrics(incomes);
    const grossMargin = calculateGrossMargin(incomes, sector);

    // GM Stability (StdDev)
    let gmStdDev = 99;
    if (incomes.length >= 4) {
        const gms = incomes.slice(0, 4).map(i => (i.grossProfitRatio || 0) * 100);
        const avg = gms.reduce((a, b) => a + b, 0) / gms.length;
        const variance = gms.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / gms.length;
        gmStdDev = Math.sqrt(variance);
    }

    const netDebtEbitda = calculateNetDebtEbitda(balances, incomes);
    const rndIntensity = calculateRndIntensity(incomes);

    // --- 2. PILLAR SCORING ---
    const growth = scoreGrowthAndTAM(data, { cagr3y: growthMetrics.cagr3y, lastYearGrowth: growthMetrics.lastYearGrowth }, sector);

    const economics = scoreQualityAndMoat(
        balances,
        sector,
        grossMargin,
        gmStdDev,
        netDebtEbitda,
        rndIntensity,
        data.revenueType || '',
        data.dbnr || null
    );

    const alignment = scoreAlignment(data);

    const valuation = scoreValuation(data, {
        growth: growthMetrics.lastYearGrowth, // use recent growth for PEG to be fair? or CAGR?
        fcf: data.fcfMargin || 0
    });

    const catalysts = scoreCatalysts(data);

    // --- 3. AGGREGATE ---
    let totalScore = growth.score + economics.score + alignment.score + valuation.score + catalysts.score;

    // Bonuses: Sector Leader
    const bonuses: string[] = [];
    const isSectorLeader = (growth.score > 15) && (economics.score > 20); // High scores in main pillars
    if (isSectorLeader) {
        totalScore += 10;
        bonuses.push("Sector Leader Bonus: +10");
    }

    // Penalties: Risk Engine (Soft Warnings)
    const penalties: string[] = [];
    if (riskFlags.riskPenalty !== 0) {
        totalScore += riskFlags.riskPenalty;
        penalties.push(`Risk Flags Penalty: ${riskFlags.riskPenalty}`);
        riskFlags.warnings.forEach(w => penalties.push(w));
    }

    totalScore = Math.max(0, Math.min(totalScore, 100));

    let tier: MultiBaggerScore['tier'] = 'Not Interesting';
    if (totalScore >= 80) tier = 'Tier 1';
    else if (totalScore >= 65) tier = 'Tier 2';
    else if (totalScore >= 55) tier = 'Tier 3';

    const summary = `
    Total Score: ${totalScore}/100 (${tier})
    ----------------------------------------
    Growth: ${growth.score} | Quality: ${economics.score} | Align: ${alignment.score}
    Valuation: ${valuation.score} | Catalysts: ${catalysts.score}
    Risk Penalty: ${riskFlags.riskPenalty}
    `.trim();

    return {
        totalScore,
        tier,
        pillars: { growth, economics, alignment, valuation, catalysts },
        summary,
        breakdown: [...growth.details, ...economics.details, ...bonuses, ...penalties],
        bonuses,
        penalties,
        computedMetrics: {
            cagr3y: growthMetrics.cagr3y,
            grossMargin,
            revenueGrowth: growthMetrics.lastYearGrowth
        },
        riskFlags // Return full risk object
    };
}
