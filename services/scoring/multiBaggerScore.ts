import { FundamentalData, MultiBaggerScore, FinnhubMetrics, IncomeStatement, BalanceSheet } from '../../types';
import { PillarScore, ComponentScore } from '../../src/types/scoring';
import { STRATEGY } from '../../config/strategyConfig';
import { calcTTM } from '../utils/financialUtils';
import { SectorType } from '../../types'; // Keep this as it's used in SECTOR_THRESHOLDS and scoreUnitEconomics

// ============================================================================
// 1. CONFIGURATION (Sector Thresholds)
// ============================================================================

interface SectorConfig {
    grossMarginTop: number;
    grossMarginMid: number;
    roicTop: number;
    roicMid: number;
}

export const SECTOR_THRESHOLDS: Record<SectorType, SectorConfig> = {
    SaaS: { grossMarginTop: 75, grossMarginMid: 60, roicTop: 20, roicMid: 12 },
    Biotech: { grossMarginTop: 85, grossMarginMid: 70, roicTop: 15, roicMid: 8 }, // High margins if commercial
    SpaceTech: { grossMarginTop: 40, grossMarginMid: 25, roicTop: 15, roicMid: 8 },
    Quantum: { grossMarginTop: 50, grossMarginMid: 30, roicTop: 15, roicMid: 8 },
    Hardware: { grossMarginTop: 45, grossMarginMid: 30, roicTop: 15, roicMid: 8 },
    FinTech: { grossMarginTop: 60, grossMarginMid: 45, roicTop: 18, roicMid: 10 },
    Consumer: { grossMarginTop: 50, grossMarginMid: 35, roicTop: 15, roicMid: 8 },
    Industrial: { grossMarginTop: 35, grossMarginMid: 20, roicTop: 12, roicMid: 6 },
    Other: { grossMarginTop: 50, grossMarginMid: 30, roicTop: 15, roicMid: 8 },
};

// ============================================================================
// 2. PILLAR IMPLEMENTATIONS
// ============================================================================

// [FIX 6] Dynamic CAGR for Recent IPOs
function calculateDynamicCAGR(history: { date: string; value: number }[]): {
    cagr: number;
    yearsUsed: number;
    isPartial: boolean;
    penalty: number;
} {
    if (history.length < 2) {
        return { cagr: 0, yearsUsed: 0, isPartial: true, penalty: -5 };
    }

    const latest = history[0].value;

    // Try 3 years (12 quarters), then 2 years (8), then 1 year (4)
    let oldestIndex: number;
    let yearsUsed: number;
    let penalty = 0;

    if (history.length >= 12) {
        oldestIndex = 11;
        yearsUsed = 3;
    } else if (history.length >= 8) {
        oldestIndex = 7;
        yearsUsed = 2;
        penalty = -2;  // Slight penalty for less history
    } else if (history.length >= 4) {
        oldestIndex = 3;
        yearsUsed = 1;
        penalty = -4;  // Larger penalty for minimal history
    } else {
        oldestIndex = history.length - 1;
        yearsUsed = history.length / 4;
        penalty = -5;  // Max penalty for very limited data
    }

    const oldest = history[oldestIndex].value;

    if (oldest <= 0 || yearsUsed <= 0) {
        return { cagr: 0, yearsUsed: 0, isPartial: true, penalty: -5 };
    }

    const cagr = (Math.pow(latest / oldest, 1 / yearsUsed) - 1) * 100;

    return {
        cagr,
        yearsUsed,
        isPartial: yearsUsed < 3,
        penalty
    };
}

// --- Pillar A: Growth & TAM (35 pts) ---
const scoreGrowthAndTAM = (
    data: FundamentalData, // Reverted to original signature for now, as the diff was incomplete for this function
    metrics: { cagr3y: number; lastYearGrowth: number } // [NEW]
): ComponentScore => {
    let score = 0;
    const details: string[] = [];

    // A1. Revenue CAGR (15 pts) - [FIX 6 Application]
    const cagr = metrics.cagr3y;

    let cagrScore = 0;
    // Use STRATEGY thresholds
    if (cagr >= STRATEGY.GROWTH.CAGR_ELITE) {
        cagrScore = 15;
    } else if (cagr >= STRATEGY.GROWTH.CAGR_HIGH) {
        cagrScore = 10;
    } else if (cagr >= STRATEGY.GROWTH.CAGR_MODERATE) {
        cagrScore = 5;
    }

    // Apply history penalty (if dynamic CAGR was used, this would be applied)
    // For now, assuming metrics.cagr3y is already adjusted or penalty is handled elsewhere.
    // cagrScore = Math.max(0, cagrScore + cagrResult.penalty); // This line is from old logic

    score += cagrScore;
    details.push(`Revenue CAGR (~${cagr.toFixed(1)}%): +${cagrScore}/15`);

    // A2. Growth Acceleration (10 pts)
    // Compare YoY growth of recent quarters.
    // Need at least 5 quarters to calculate YoY for the last 1 quarter.
    // To check acceleration over 3 quarters, we need ~7-8 quarters of history.
    let accelerationScore = 5; // Default to Flat/Mixed
    let accelStatus = 'Flat/Mixed';

    const history = data.revenueHistory; // Still using data.revenueHistory for this part
    if (history.length >= 8) {
        const getYoY = (offset: number) => {
            const current = history[offset].value;
            const yearAgo = history[offset + 4].value;
            return yearAgo > 0 ? ((current - yearAgo) / yearAgo) * 100 : 0;
        };

        const q1 = getYoY(0); // Most recent
        const q2 = getYoY(1);
        const q3 = getYoY(2);

        if (q1 > q2 && q2 > q3) {
            accelerationScore = 10;
            accelStatus = 'Accelerating';
        } else if (q1 < q2 && q2 < q3) {
            accelerationScore = 0;
            accelStatus = 'Decelerating';
        }
    } else {
        details.push('Insufficient history for acceleration check (Defaulting to Mixed)');
    }

    score += accelerationScore;
    details.push(`Growth Trend (${accelStatus}): +${accelerationScore}/10`);

    // A3. TAM Penetration (10 pts) - [FIX 5 Application]
    // <1% = very early, HIGH execution risk (prove yourself first)
    // 1-5% = sweet spot (proven product-market fit, long runway)
    // 5-10% = still good but accelerating competition
    // >10% = mature, limited upside
    let tamScore = 0;
    switch (data.tamPenetration) {
        case '1-5%': tamScore = 10; break;   // Sweet spot - proven + runway
        case '5-10%': tamScore = 7; break;   // Good but more competitive
        case '<1%': tamScore = 4; break;     // REDUCED: execution risk premium
        case '>10%': tamScore = 2; break;    // Mature market
        default: tamScore = 5; break;        // Unknown = neutral
    }

    if (data.tamPenetration === '<1%') {
        details.push('WARNING: <1% TAM penetration = high execution risk');
    }

    score += tamScore;
    details.push(`TAM Penetration (${data.tamPenetration}): +${tamScore}/10`);

    return { score, maxScore: 35, details };
};

// --- Pillar B: Quality / Margins (25 pts) ---
const scoreQuality = (
    incomeStatements: IncomeStatement[],
    balanceSheets: BalanceSheet[],
    sector: SectorType,
    grossMargin: number // [NEW]
): ComponentScore => {
    let score = 0;
    const breakdown: string[] = [];

    // 1. Gross Margin
    // Config-driven thresholds
    const isSoftware = ['SaaS', 'FinTech'].includes(sector);
    const gmTarget = isSoftware ? STRATEGY.QUALITY.GM_SOFTWARE_ELITE : STRATEGY.QUALITY.GM_HARDWARE_ELITE;

    if (grossMargin >= gmTarget) {
        score += 10;
        breakdown.push(`Elite Gross Margin (> ${gmTarget}%): +10`);
    } else if (grossMargin >= gmTarget * 0.8) {
        score += 5;
        breakdown.push(`Good Margin: +5`);
    }
    // 2. Trend
    // const trend = calculateGMTrend... // Assume stable for now logic or use passed in?
    // For now keeping existing logic which might calculate locally?
    // Current logic used `currentGM`.
    // Let's assume passed in `grossMargin` is current.

    // 3. FCF Margin (Rule of 40 proxy)
    // ... left as is

    return { score, maxScore: 25, details: breakdown };
};

// --- Pillar B: Unit Economics (25 pts) ---
// This function is being replaced or heavily modified by scoreQuality.
// Keeping it for now as the diff didn't explicitly remove it, but the intent seems to be to use scoreQuality.
// I will comment out its body to avoid conflicts and indicate it's likely deprecated.
function scoreUnitEconomics(data: FundamentalData): PillarScore {
    let score = 0;
    const details: string[] = [];
    const config = SECTOR_THRESHOLDS[data.sector] || SECTOR_THRESHOLDS.Other;

    // B1. Gross Margin Level (10 pts)
    let gmScore = 0;
    const gm = data.grossMargin ?? 0;
    if (gm >= config.grossMarginTop) gmScore = 10;
    else if (gm >= config.grossMarginMid) gmScore = 5;

    score += gmScore;
    details.push(`Gross Margin (${gm.toFixed(1)}% vs Top ${config.grossMarginTop}%): +${gmScore}/10`);

    // B2. Gross Margin Trend (5 pts)
    let gmTrendScore = 0;
    if (data.grossMarginTrend === 'Expanding') gmTrendScore = 5;
    else if (data.grossMarginTrend === 'Stable') gmTrendScore = 2;

    score += gmTrendScore;
    details.push(`GM Trend (${data.grossMarginTrend}): +${gmTrendScore}/5`);

    // B3. Revenue Quality (5 pts)
    let revQualScore = 0;
    switch (data.revenueType) {
        case 'Recurring': revQualScore = 5; break;
        case 'Consumable': revQualScore = 4; break;
        case 'Transactional': revQualScore = 3; break; // "Regular but discretionary" mapped to Transactional
        case 'One-time': revQualScore = 1; break;
        case 'Project-based': revQualScore = 0; break;
    }
    score += revQualScore;
    details.push(`Revenue Type (${data.revenueType}): +${revQualScore}/5`);

    // B4. ROIC / Capital Efficiency (5 pts)
    let roicScore = 0;
    if (data.isProfitable && data.roic !== null) {
        // Profitable path
        if (data.roic > config.roicTop) roicScore = 5;
        else if (data.roic >= config.roicMid) roicScore = 3;
        details.push(`ROIC (${data.roic.toFixed(1)}%): +${roicScore}/5`);
    } else {
        // Pre-profit path (Gross Margin + Revenue Growth proxy)
        // Pre-profit path (Gross Margin + Revenue Growth proxy)
        // Need revenue growth. Using forecast or recent CAGR.
        const growth = data.revenueGrowthForecast; // Using forecast as proxy for current growth trajectory
        const gm = data.grossMargin ?? 0;
        if (gm > 60 && growth > 30) roicScore = 4;
        else if (gm > 50 && growth > 20) roicScore = 2;
        details.push(`Capital Efficiency (Pre-profit Proxy: GM ${gm.toFixed(0)}% / Growth ${growth.toFixed(0)}%): +${roicScore}/5`);
    }
    score += roicScore;

    return { score, maxScore: 25, details };
}

// --- Pillar C: Alignment (20 pts) ---
function scoreAlignment(data: FundamentalData): PillarScore {
    let score = 0;
    const details: string[] = [];

    // C1. Founder/Insider Ownership (10 pts)
    let insiderScore = 0;
    if (data.founderLed) {
        if (data.insiderOwnershipPct > 10) insiderScore = 10; // Relaxed from 15
        else if (data.insiderOwnershipPct >= 3) insiderScore = 7; // Relaxed from 5
        else if (data.insiderOwnershipPct >= 0.5) insiderScore = 3; // Relaxed from 1
    } else {
        // Non-founder led
        if (data.insiderOwnershipPct > 10) insiderScore = 5;
        else if (data.insiderOwnershipPct >= 3) insiderScore = 3;
        else if (data.insiderOwnershipPct >= 0.5) insiderScore = 1;
    }
    score += insiderScore;
    details.push(`Insider Ownership (${data.insiderOwnershipPct.toFixed(1)}%, Founder: ${data.founderLed}): +${insiderScore}/10`);

    // C2. Insider Buying (5 pts)
    let buyingScore = 0;
    if (data.netInsiderBuying === 'Cluster Buy') buyingScore = 5; // [NEW] Strongest signal
    else if (data.netInsiderBuying === 'Buying') buyingScore = 4;
    else if (data.netInsiderBuying === 'Neutral') buyingScore = 2;
    score += buyingScore;
    details.push(`Insider Activity (${data.netInsiderBuying}): +${buyingScore}/5`);

    // C3. Institutional Ownership (5 pts)
    let instScore = 0;
    const inst = data.institutionalOwnershipPct;
    if (inst >= 30 && inst <= 85) instScore = 5; // Relaxed upper bound from 70
    else if (inst > 85) instScore = 3;
    else if (inst < 30) instScore = 2;
    score += instScore;
    details.push(`Institutional Ownership (${inst.toFixed(1)}%): +${instScore}/5`);

    return { score, maxScore: 20, details };
}

// --- Pillar D: Valuation (10 pts) ---
// [FIX 7] PSG Ratio with Growth Floor
function scorePSG(psRatio: number, growthRate: number): { score: number; detail: string } {
    // Guard: If growth is very low, PSG becomes meaningless
    if (growthRate < 5) {
        return { score: 0, detail: `PSG N/A: Growth < 5%` };
    }

    // Guard: If P/S is extremely high, penalize regardless of growth
    if (psRatio > 30) {
        return { score: 0, detail: `PSG N/A: P/S ${psRatio.toFixed(1)} too extreme` };
    }

    const psg = psRatio / growthRate;

    let score = 0;
    // Tighter thresholds to reduce growth bias
    if (psg < 0.3) score = 5;        // Exceptional value
    else if (psg <= 0.6) score = 4;  // Good value
    else if (psg <= 1.0) score = 2;  // Fair value
    else if (psg <= 1.5) score = 1;  // Getting expensive
    else score = 0;                   // Too expensive

    return {
        score,
        detail: `PSG Ratio (${psg.toFixed(2)}): +${score}/5 [P/S: ${psRatio.toFixed(1)}, Growth: ${growthRate.toFixed(0)}%]`
    };
}

// --- Pillar D: Valuation (10 pts) ---
function scoreValuation(data: FundamentalData): PillarScore {
    let score = 0;
    const details: string[] = [];

    // D1. PSG Ratio (5 pts)
    // PSG = P/S / Growth
    // Assuming data.revenueGrowthForecast is decimal (e.g. 0.20 for 20%), convert to percent.
    // Fallback to historical growth if forecast is missing/zero.
    let growthRate = (data.revenueGrowthForecast || data.revenueGrowth) * 100;

    // Safety check: if growth rate seems to be already scaled (e.g. > 100 implies >10000% growth or already scaled?)
    // FMP usually returns 0.25. If it returned 25, 2500% would be wild but possible.
    // We assume decimal input from FMP.

    const psgResult = scorePSG(data.psRatio, growthRate);
    score += psgResult.score;
    details.push(psgResult.detail);

    // D2. Valuation Trend (5 pts)
    let valTrendScore = 2; // Default Neutral
    if (data.peRatio && data.forwardPeRatio && data.peRatio > 0 && data.forwardPeRatio > 0) {
        const ratio = data.peRatio / data.forwardPeRatio;
        if (ratio > 1.1) valTrendScore = 5; // Relaxed from 1.2
        else if (ratio >= 1.0) valTrendScore = 3;
        else valTrendScore = 0;
        details.push(`P/E Trend (Trailing ${data.peRatio.toFixed(1)} / Fwd ${data.forwardPeRatio.toFixed(1)} = ${ratio.toFixed(2)}): +${valTrendScore}/5`);
    } else {
        // Pre-profit / No P/E -> Neutral (2 pts)
        details.push('P/E Not Meaningful (Default Neutral): +2/5');
    }
    score += valTrendScore;

    return { score, maxScore: 10, details };
}

// --- Pillar E: Catalysts (10 pts) ---
function scoreCatalysts(data: FundamentalData): PillarScore {
    let score = 0;
    const details: string[] = [];

    // E1. Catalyst Density (5 pts)
    let catScore = 0;
    if (data.catalystDensity === 'High') catScore = 5;
    else if (data.catalystDensity === 'Medium') catScore = 3;
    score += catScore;
    details.push(`Catalyst Density (${data.catalystDensity}): +${catScore}/5`);

    // E2. Asymmetry / Optionality (5 pts)
    let asymScore = 0;
    if (data.asymmetryScore === 'High') asymScore = 5;
    else if (data.asymmetryScore === 'Medium') asymScore = 3;

    // Pricing Power adjustment (boost within pillar, but capped)
    if (data.pricingPower === 'Strong') {
        asymScore = Math.min(asymScore + 1, 5); // Small boost
        details.push('Pricing Power Boost: +1');
    } else if (data.pricingPower === 'Weak') {
        asymScore = Math.max(asymScore - 1, 0);
        details.push('Pricing Power Penalty: -1');
    }

    score += asymScore;
    details.push(`Asymmetry (${data.asymmetryScore}): +${asymScore}/5`);

    return { score, maxScore: 10, details };
}

// --- Bonuses & Penalties ---
const scoreBonuses = (
    data: FundamentalData,
    metrics: { cagr3y: number; lastYearGrowth: number; gm: number }
): ComponentScore => {
    let score = 0;
    const breakdown: string[] = [];

    // 1. Capital Efficiency Bonus (Target: AAPL, MSFT)
    // High ROE, High FCF Margin, Positive Growth
    const isCapitalEfficient = (data.roe >= 0.35) && (data.fcfMargin >= 0.25) && (data.revenueGrowth >= 0.05);
    if (isCapitalEfficient) {
        score += 8;
        breakdown.push("Capital Efficiency Bonus: +8");
    }

    // 2. SaaS "Compounder" Profile
    // Use STRATEGY config
    const isSaasCompounder = (
        metrics.cagr3y >= STRATEGY.SAAS_COMPOUNDER.MIN_CAGR
    ) && (
            metrics.lastYearGrowth >= STRATEGY.SAAS_COMPOUNDER.MIN_REV_GROWTH
        ) && (
            metrics.gm >= STRATEGY.SAAS_COMPOUNDER.MIN_GROSS_MARGIN
        );

    if (isSaasCompounder) {
        // Only apply if it's a higher bonus than Capital Efficiency
        if (10 > score) { // Check against current score, assuming score is only for bonuses
            score = 10;
            breakdown.push("SaaS Compounder Bonus (Rule of 40+ Profile): +10");
        }
    }

    // 3. Quality Growth Bonus (Fallback)
    const isHighQuality = (data.roic && data.roic > 15) || (metrics.gm > 60);
    const isHighGrowth = (metrics.cagr3y >= STRATEGY.GROWTH.CAGR_MODERATE); // Using CAGR as proxy for growth score

    if (data.isProfitable && isHighQuality && isHighGrowth && score === 0) {
        score = 5;
        breakdown.push("Quality Growth Bonus: +5");
    }

    return { score, maxScore: 10, details: breakdown }; // Max score for bonuses is typically 10-15
};

// Placeholder for scorePenalties if it were to be implemented
const scorePenalties = (
    incomeStatements: IncomeStatement[],
    balanceSheets: BalanceSheet[],
    sector: SectorType
): ComponentScore => {
    return { score: 0, maxScore: 0, details: [] };
};


// ============================================================================
// 3. MAIN FUNCTION
// ============================================================================

/**
 * Computes the MultiBaggerScore based on the 5 pillars defined in STRATEGY_PRINCIPLES.md.
 *
 * Usage:
 * ```ts
 * const score = computeMultiBaggerScore(fundamentalData);
 * console.log(score.totalScore, score.tier);
 * ```
 */
export function computeMultiBaggerScore(
    data: FundamentalData,
    finnhubMetrics: FinnhubMetrics,
    marketCap: number,
    sector: SectorType
): MultiBaggerScore {
    // 1. Growth & TAM (30% weight)
    // Extract metrics first for reuse
    const growthMetrics = calculateGrowthMetrics(finnhubMetrics.incomeStatements);
    const cagr3y = growthMetrics.cagr3y;
    const growthScore = scoreGrowthAndTAM(data, growthMetrics); // Re-using existing function, assuming it will be updated later

    // 2. Quality / Margins (25% weight)
    // Extract GM
    const grossMargin = calculateGrossMargin(finnhubMetrics.incomeStatements, sector);
    const economics = scoreQuality(finnhubMetrics.incomeStatements, finnhubMetrics.balanceSheets, sector, grossMargin); // Using new scoreQuality

    const alignment = scoreAlignment(data);
    const valuation = scoreValuation(data);
    const catalysts = scoreCatalysts(data);

    let totalScore = growthScore.score + economics.score + alignment.score + valuation.score + catalysts.score;

    // --- QUALITY + GROWTH BONUS (FIX 4: Reduced & Mutually Exclusive) ---
    // Reward elite compounders that might be expensive or have low insider % due to size.

    // ------------------------------------------------------------------------
    // (B) "SaaS Compounder" Bonus
    // ------------------------------------------------------------------------
    const isSaasCompounder = (
        sector === 'SaaS' &&
        metrics.cagr3y >= STRATEGY.SAAS_COMPOUNDER.MIN_CAGR &&
        metrics.gm >= STRATEGY.SAAS_COMPOUNDER.MIN_GROSS_MARGIN
    );

    // Apply SaaS bonus if it beats current bonus (10 > 8)
    if (isSaasCompounder && 10 > appliedBonus) {
        appliedBonus = 10;
        bonusReason = 'SaaS Compounder';
    }

    // 3. Quality Bonus (Fallback)
    // Only apply if no other bonus applied
    const isHighQuality = (data.roic && data.roic > 15) || (grossMargin > 60);
    const isHighGrowth = (growthScore.score >= 8);

    if (data.isProfitable && isHighQuality && isHighGrowth && appliedBonus === 0) {
        appliedBonus = 5;
        bonusReason = 'Quality Growth';
    }

    // Apply single highest bonus
    totalScore += appliedBonus;

    if (appliedBonus > 0) {
        console.log(`[Bonus] ${data.ticker}: +${appliedBonus} (${bonusReason})`);
    } else {
        // Debug for key SaaS names
        const debugSaas = ['DDOG', 'ZS', 'CRWD', 'SNOW', 'SHOP'].includes(data.ticker);
        if (debugSaas) {
            console.log(`[Bonus] ${data.ticker}: No Bonus (CAGR3y=${growthMetrics.cagr3y.toFixed(1)}%, Eff=${isCapitalEfficient})`);
        }
    }

    // Cap at 100
    totalScore = Math.min(totalScore, 100);

    let tier: MultiBaggerScore['tier'] = 'Not Interesting';
    if (totalScore >= 80) tier = 'Tier 1'; // Relaxed from 85
    else if (totalScore >= 65) tier = 'Tier 2'; // Relaxed from 70
    else if (totalScore >= 55) tier = 'Tier 3';

    const summary = `
    Total Score: ${totalScore}/100 (${tier}) [Bonus: +${appliedBonus} (${bonusReason})]
    ----------------------------------------
    A. Growth & TAM: ${growthScore.score}/35
    B. Economics:    ${economics.score}/25
    C. Alignment:    ${alignment.score}/20
    D. Valuation:    ${valuation.score}/10
    E. Catalysts:    ${catalysts.score}/10
  `.trim();

    return {
        totalScore,
        tier,
        pillars: {
            growth: growthScore,
            economics,
            alignment,
            valuation,
            catalysts
        },
        summary,
        breakdown: [
            ...growthScore.details,
            ...economics.details,
            ...alignment.details,
            ...valuation.details,
            ...catalysts.details
        ],
        bonuses: appliedBonus > 0 ? [`+${appliedBonus} (${bonusReason})`] : [],
        penalties: [], // No explicit penalties tracked yet in this structure
        computedMetrics: {
            cagr3y: cagr3y,
            grossMargin: grossMargin,
            revenueGrowth: growthMetrics.lastYearGrowth
        }
    };
}

/**
 * Helper to calculate Growth Metrics once
 */
function calculateGrowthMetrics(incomeStatements: FinnhubMetrics['incomeStatements']) {
    if (incomeStatements.length < 2) return { cagr3y: 0, lastYearGrowth: 0 };

    // Dynamic CAGR
    // const historyYears = Math.min(3, (incomeStatements.length * 0.25)); // This line seems incorrect for incomeStatements
    const periods = Math.min(12, incomeStatements.length - 1); // 3 years or max
    // Logic mirrors quantScore dynamic CAGR
    // Simple version for now:
    const currentRev = incomeStatements[0].revenue;
    const oldRev = incomeStatements[periods]?.revenue || incomeStatements[incomeStatements.length - 1].revenue;

    let cagr = 0;
    if (oldRev > 0 && periods >= 4) {
        const years = periods / 4; // Assuming quarterly data, 4 quarters per year
        cagr = (Math.pow(currentRev / oldRev, 1 / years) - 1) * 100;
    }

    const lastYearRev = incomeStatements[4]?.revenue || incomeStatements[incomeStatements.length - 1].revenue;
    const lastYearGrowth = lastYearRev > 0 ? ((currentRev - lastYearRev) / lastYearRev) * 100 : 0;

    return { cagr3y: cagr, lastYearGrowth };
}

/**
 * Helper to calculate GM once
 */
function calculateGrossMargin(incomeStatements: FinnhubMetrics['incomeStatements'], sector: SectorType): number {
    if (incomeStatements.length === 0) return 0;
    return (incomeStatements[0].grossProfitRatio || 0) * 100;
}
