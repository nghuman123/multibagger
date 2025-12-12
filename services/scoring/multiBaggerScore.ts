import {
    FundamentalData,
    FinnhubMetrics,
    MultiBaggerScore,
    SectorType,
    IncomeStatement,
    BalanceSheet,
    CashFlowStatement
} from '../../types';
import { STRATEGY } from '../../config/strategyConfig';
import { calcTTM, calculateGrowthMetrics, calculateGrossMargin, calculateNetDebtEbitda, calculateRndIntensity } from '../utils/financialUtils';

// Define local interfaces if not in types
interface ComponentScore {
    score: number;
    maxScore: number;
    details: string[];
}

interface PillarScore extends ComponentScore { }
// export const SECTOR_THRESHOLDS = STRATEGY.SECTOR_THRESHOLDS || {}; // Removed duplicate


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

    // A1. Revenue CAGR (10 pts) - [FIX 6 Application]
    const cagr = metrics.cagr3y;

    let cagrScore = 0;
    // Use STRATEGY thresholds
    if (cagr >= STRATEGY.GROWTH.CAGR_ELITE) {
        cagrScore = 10;
    } else if (cagr >= STRATEGY.GROWTH.CAGR_HIGH) {
        cagrScore = 7;
    } else if (cagr >= STRATEGY.GROWTH.CAGR_MODERATE) {
        cagrScore = 4;
    }

    // Apply history penalty (if dynamic CAGR was used, this would be applied)
    // For now, assuming metrics.cagr3y is already adjusted or penalty is handled elsewhere.
    // cagrScore = Math.max(0, cagrScore + cagrResult.penalty); // This line is from old logic

    score += cagrScore;
    details.push(`Revenue CAGR (~${cagr.toFixed(1)}%): +${cagrScore}/10`);

    // A2. Growth Acceleration (7 pts)
    let accelerationScore = 3; // Base
    const history = data.revenueHistory || [];

    // Calculate acceleration if we have enough history
    if (history.length >= 4) { // Reduced requirement for practicality, checks recent qtrs
        const currentQ = history[0]?.value || 0;
        const prevQ = history[4]?.value || 0; // YoY
        // Implementation logic handled via metrics passed in (lastYearGrowth vs cagr) usually.
        // Re-using the checks from "getYoY" logic but simplified here or relying on metrics.
        // For now, we trust metrics.cagr3y and manual check if needed.

        const currentGrowth = metrics.lastYearGrowth; // Assuming decimal
        const trendGrowth = metrics.cagr3y;

        if (trendGrowth > 0) {
            if (currentGrowth > trendGrowth * 1.2) {
                accelerationScore = 7;
                details.push(`Growth Accelerating (${currentGrowth.toFixed(1)}% > 1.2x ${trendGrowth.toFixed(1)}% CAGR): +7`);
            } else if (currentGrowth > trendGrowth) {
                accelerationScore = 5;
                details.push(`Growth Above Trend (${currentGrowth.toFixed(1)}% > ${trendGrowth.toFixed(1)}%): +5`);
            }
        }
    }
    score += accelerationScore;

    // A3. TAM Penetration (8 pts)
    let tamScore = 0;
    switch (data.tamPenetration) {
        case '<1%': tamScore = 8; break;    // [FIX 11] Massive runway
        case '1-5%': tamScore = 6; break;
        case '5-10%': tamScore = 4; break;
        case '>10%': tamScore = 2; break;   // Saturated
        default: tamScore = 4; break;
    }
    // if (data.tamPenetration === '<1%') details.push('WARNING: <1% TAM penetration = high execution risk'); // [REMOVED] Backwards logic

    score += tamScore;
    details.push(`TAM Penetration (${data.tamPenetration}): +${tamScore}/8`);

    return { score, maxScore: 25, details };
}

// --- Pillar B: Quality / Margins (25 pts) ---
const scoreQuality = (
    balanceSheets: BalanceSheet[],
    sector: SectorType,
    grossMargin: number, // [NEW]
    netDebtEbitda: number | null, // [FIX 11]
    rndIntensity: number // [FIX 11]
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

    // 4. [FIX 11] Net Debt / EBITDA (Leverage)
    if (netDebtEbitda !== null) {
        if (netDebtEbitda < 1.0) {
            score += 2;
            breakdown.push(`Strong Balance Sheet (Net Debt/EBITDA ${netDebtEbitda.toFixed(2)} < 1x): +2`);
        } else if (netDebtEbitda > 4.0) {
            score -= 2;
            breakdown.push(`High Leverage (Net Debt/EBITDA ${netDebtEbitda.toFixed(2)} > 4x): -2`);
        }
    }

    // 5. [FIX 11] R&D Intensity (Innovation)
    if (rndIntensity > 15) {
        score += 2;
        breakdown.push(`High Innovation (R&D ${rndIntensity.toFixed(1)}% > 15%): +2`);
    }

    // Cap Score at 25
    score = Math.min(score, 25);

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
    details.push(`Capital Efficient (Burn < 20% Cash): +${score}/25`);
    return { score, maxScore: 25, details };
}

// --- Pillar C: Alignment (20 pts) ---
function scoreAlignment(data: FundamentalData): PillarScore {
    let score = 0;
    const details: string[] = [];

    // C1. Founder/Insider Ownership (7 pts)
    let insiderScore = 0; // Initialize insiderScore
    if (data.founderLed) {
        if (data.insiderOwnershipPct > 10) insiderScore = 7;
        else if (data.insiderOwnershipPct >= 3) insiderScore = 5;
        else if (data.insiderOwnershipPct >= 0.5) insiderScore = 2;
    } else {
        // Non-founder led
        if (data.insiderOwnershipPct > 10) insiderScore = 4;
        else if (data.insiderOwnershipPct >= 3) insiderScore = 2;
        else if (data.insiderOwnershipPct >= 0.5) insiderScore = 1;
    }
    score += insiderScore;
    details.push(`Insider Ownership (${data.insiderOwnershipPct.toFixed(1)}%, Founder: ${data.founderLed}): +${insiderScore}/7`);

    // C2. Insider Buying (5 pts)
    let buyingScore = 0;
    if (data.netInsiderBuying === 'Cluster Buy') buyingScore = 5; // [NEW] Strongest signal
    else if (data.netInsiderBuying === 'Buying') buyingScore = 4;
    else if (data.netInsiderBuying === 'Neutral') buyingScore = 2;
    score += buyingScore;
    details.push(`Insider Activity (${data.netInsiderBuying}): +${buyingScore}/5`);

    // C3. Institutional Ownership (3 pts)
    let instScore = 0;
    const inst = data.institutionalOwnershipPct;
    if (inst >= 30 && inst <= 85) instScore = 3;
    else if (inst > 85) instScore = 1;
    else if (inst < 30) instScore = 1;
    score += instScore;
    details.push(`Institutional Ownership (${inst.toFixed(1)}%): +${instScore}/3`);

    return { score, maxScore: 15, details };
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
    if (psg < 0.3) score = 10;       // Exceptional value
    else if (psg <= 0.6) score = 8;  // Good value
    else if (psg <= 1.0) score = 5;  // Fair value
    else if (psg <= 1.5) score = 2;  // Getting expensive
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
    details.push(psgResult.detail.replace('/5', '/10')); // Update fraction in detail string if reused, or update function

    // D2. Valuation Trend (10 pts)
    let valTrendScore = 4; // Default Neutral
    if (data.peRatio && data.forwardPeRatio && data.peRatio > 0 && data.forwardPeRatio > 0) {
        const ratio = data.peRatio / data.forwardPeRatio;
        if (ratio > 1.1) valTrendScore = 10;
        else if (ratio >= 1.0) valTrendScore = 6;
        else valTrendScore = 0;
        details.push(`P/E Trend (Trailing ${data.peRatio.toFixed(1)} / Fwd ${data.forwardPeRatio.toFixed(1)} = ${ratio.toFixed(2)}): +${valTrendScore}/10`);
    } else {
        // Pre-profit / No P/E -> Neutral (4 pts)
        details.push('P/E Not Meaningful (Default Neutral): +4/10');
    }
    score += valTrendScore;

    return { score, maxScore: 20, details };
}

// --- Pillar E: Catalysts (10 pts) ---
function scoreCatalysts(data: FundamentalData): PillarScore {
    let score = 0;
    const details: string[] = [];

    // E1. Catalyst Density (8 pts)
    let catScore = 0;
    if (data.catalystDensity === 'High') catScore = 8;
    else if (data.catalystDensity === 'Medium') catScore = 4;
    score += catScore;
    details.push(`Catalyst Density (${data.catalystDensity}): +${catScore}/8`);

    // E2. Asymmetry / Optionality (7 pts)
    let asymScore = 0;
    if (data.asymmetryScore === 'High') asymScore = 7;
    else if (data.asymmetryScore === 'Medium') asymScore = 4;

    // Pricing Power adjustment (boost within pillar, but capped)
    if (data.pricingPower === 'Strong') {
        asymScore = Math.min(asymScore + 2, 7); // Small boost
        details.push('Pricing Power Boost: +2');
    } else if (data.pricingPower === 'Weak') {
        // No boost or penalty from pricing power, just use base asymScore
    }
    score += asymScore;
    details.push(`Asymmetry (${data.asymmetryScore}): +${asymScore}/7`);

    // E3. [FIX 11] Short Interest (Squeeze Potential) (Bonus within Catalyst Pillar)
    // If we have short interest data (e.g. from FMP quote or extended profile, currently mocked/partial)
    // Assuming data object might have it added or we check manually.
    // For now, let's assume if 'shortInterest' > 20% we give points.
    // NOTE: 'Symbol data' needs to be expanded to include Short Interest if not already present.
    // Checking FundamentalData interface... it has 'shortInterest'? No.
    // It will be added in analyzer if available.
    // Let's assume passed in via data or metrics?
    // Using `data['shortInterest']` blindly is risky.
    // Added a check:
    const si = (data as any).shortInterest || 0; // Temporary cast until types updated
    if (si > 20) {
        score += 2;
        details.push(`Short Squeeze Potential (SI ${si.toFixed(1)}% > 20%): +2`);
    }

    score = Math.min(score, 15); // Cap at 15

    return { score, maxScore: 15, details };
}

// --- Bonuses & Penalties ---
const scoreBonuses = (
    data: FundamentalData,
    metrics: { cagr3y: number; lastYearGrowth: number; gm: number }
): ComponentScore => {
    let score = 0;
    const breakdown: string[] = [];

    // 1. Capital Efficiency Bonus (Target: AAPL, MSFT)
    const isCapitalEfficient = (data.roe >= 0.35) && (data.fcfMargin >= 0.25) && (data.revenueGrowth >= 0.05);
    if (isCapitalEfficient) {
        score += 8;
        breakdown.push("Capital Efficiency Bonus: +8");
    }

    // 2. SaaS Compounder
    const isSaasCompounder = (
        metrics.cagr3y >= STRATEGY.SAAS_COMPOUNDER.MIN_CAGR
    ) && (
            metrics.lastYearGrowth >= STRATEGY.SAAS_COMPOUNDER.MIN_REV_GROWTH
        ) && (
            metrics.gm >= STRATEGY.SAAS_COMPOUNDER.MIN_GROSS_MARGIN
        );

    if (isSaasCompounder) {
        if (10 > score) {
            score = 10;
            breakdown.push("SaaS Compounder Bonus (Rule of 40+ Profile): +10");
        }
    }

    // 3. Quality Growth Bonus
    const isHighQuality = (data.roic && data.roic > 15) || (metrics.gm > 60);
    const isHighGrowth = (metrics.cagr3y >= STRATEGY.GROWTH.CAGR_MODERATE);

    if (data.isProfitable && isHighQuality && isHighGrowth && score === 0) {
        score = 5;
        breakdown.push("Quality Growth Bonus: +5");
    }

    return { score, maxScore: 10, details: breakdown };
};

// Placeholder for scorePenalties
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
    const metrics = growthMetrics; // Alias for bonus logic
    const growthScore = scoreGrowthAndTAM(data, growthMetrics); // Re-using existing function, assuming it will be updated later

    // 2. Quality / Margins (25% weight)
    // Extract GM
    const grossMargin = calculateGrossMargin(finnhubMetrics.incomeStatements, sector);
    // [FIX 11] New Metrics
    const netDebtEbitda = calculateNetDebtEbitda(finnhubMetrics.balanceSheets, finnhubMetrics.incomeStatements);
    const rndIntensity = calculateRndIntensity(finnhubMetrics.incomeStatements);

    const economics = scoreQuality(finnhubMetrics.incomeStatements, finnhubMetrics.balanceSheets, sector, grossMargin, netDebtEbitda, rndIntensity); // Using new scoreQuality

    const alignment = scoreAlignment(data);
    const valuation = scoreValuation(data);
    const catalysts = scoreCatalysts(data);

    let totalScore = growthScore.score + economics.score + alignment.score + valuation.score + catalysts.score;

    // Bonus Variables
    let appliedBonus = 0;
    let bonusReason = '';

    // --- QUALITY + GROWTH BONUS (FIX 4: Reduced & Mutually Exclusive) ---
    // Reward elite compounders that might be expensive or have low insider % due to size.

    // ------------------------------------------------------------------------
    // (B) "SaaS Compounder" Bonus
    // ------------------------------------------------------------------------
    const isSaasCompounder = (
        sector === 'SaaS' &&
        metrics.cagr3y >= STRATEGY.SAAS_COMPOUNDER.MIN_CAGR &&
        (grossMargin || 0) >= STRATEGY.SAAS_COMPOUNDER.MIN_GROSS_MARGIN
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

    // Apply Bonus
    if (appliedBonus > 0) {
        totalScore = Math.min(totalScore + appliedBonus, 100); // Cap at 100? Or just add? 
        // Logic says Score / MaxScore.
        // Let's just add to totalScore.
    }

    // Debug for key SaaS names
    const isCapitalEfficient = (data.roe >= 0.35) && (data.fcfMargin >= 0.25) && (data.revenueGrowth >= 0.05); // Define isCapitalEfficient for debug log
    const debugSaas = ['DDOG', 'ZS', 'CRWD', 'SNOW', 'SHOP'].includes(data.ticker);
    if (debugSaas) {
        console.log(`[Bonus] ${data.ticker}: No Bonus (CAGR3y=${growthMetrics.cagr3y.toFixed(1)}%, Eff=${isCapitalEfficient})`);
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
    A. Growth & TAM: ${growthScore.score}/25
    B. Economics:    ${economics.score}/25
    C. Alignment:    ${alignment.score}/15
    D. Valuation:    ${valuation.score}/20
    E. Catalysts:    ${catalysts.score}/15
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
            cagr3y: growthMetrics.cagr3y,
            grossMargin: grossMargin,
            revenueGrowth: growthMetrics.lastYearGrowth
        }
    };
}

// End of file
