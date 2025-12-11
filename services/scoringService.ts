import { StockMetricData, StockCompany, MultiBaggerScore, PillarScore } from '../types';
import { calculateQuantitativeScore } from './scoring/quantScore';
import { SECTOR_THRESHOLDS } from './scoring/multiBaggerScore';

// Helper: Get thresholds safely
const getThresholds = (sector: string, _subSector: string) => {
    // Map string sector to SectorType keys if needed, or use 'Other'
    const key = (Object.keys(SECTOR_THRESHOLDS).find(k => k.toLowerCase() === sector.toLowerCase()) || 'Other') as keyof typeof SECTOR_THRESHOLDS;
    return SECTOR_THRESHOLDS[key];
};

// 2.1 Add Growth Acceleration Detection
const calculateGrowthAcceleration = (
    q1: number | null,
    q2: number | null,
    q3: number | null
): { acceleration: 'Accelerating' | 'Stable' | 'Decelerating', score: number } => {
    if (q1 === null || q2 === null) {
        return { acceleration: 'Stable', score: 0 };
    }

    const delta1 = q1 - q2;  // Most recent change
    const delta2 = q3 !== null ? q2 - q3 : 0;

    // Consecutive acceleration = strongest signal
    if (delta1 > 2 && delta2 > 0) {
        return { acceleration: 'Accelerating', score: 15 };  // STRONG BUY SIGNAL
    } else if (delta1 > 2) {
        return { acceleration: 'Accelerating', score: 10 };
    } else if (delta1 < -3 && delta2 < 0) {
        return { acceleration: 'Decelerating', score: -15 }; // STRONG SELL SIGNAL
    } else if (delta1 < -3) {
        return { acceleration: 'Decelerating', score: -10 };
    }

    return { acceleration: 'Stable', score: 0 };
};

// 2.2 Add Quantitative Moat Scoring
const calculateMoatScore = (
    metrics: StockMetricData,
    sector: string,
    qualitativeText: string
): { score: number, sources: NonNullable<StockCompany['moatSources']> } => {
    let sources = {
        networkEffects: 0,
        switchingCosts: 0,
        intangibleAssets: 0,
        costAdvantage: 0,
        efficientScale: 0
    };

    // 1. Network Effects (0-3): User growth outpacing revenue = network effects
    const dbnr = metrics.dbnr;
    if (dbnr && dbnr > 130) sources.networkEffects = 3;
    else if (dbnr && dbnr > 120) sources.networkEffects = 2;
    else if (dbnr && dbnr > 110) sources.networkEffects = 1;

    // 2. Switching Costs (0-2): High retention = switching costs
    const nrr = metrics.nrr;
    if (nrr && nrr > 95) sources.switchingCosts = 2;
    else if (nrr && nrr > 90) sources.switchingCosts = 1;

    // 3. Intangible Assets (0-2): R&D intensity
    const grossMargin = parseFloat(String(metrics.grossMargin || '0'));
    if (grossMargin > 75) sources.intangibleAssets = 2;
    else if (grossMargin > 60) sources.intangibleAssets = 1;

    // 4. Cost Advantage (0-2): Margin superiority
    // Compare to sector thresholds
    const thresholds = getThresholds(sector, '');
    if (grossMargin > thresholds.grossMarginTop + 15) sources.costAdvantage = 2;
    else if (grossMargin > thresholds.grossMarginTop + 8) sources.costAdvantage = 1;

    // 5. Efficient Scale (0-1): Market share
    const marketShare = metrics.marketSharePct;
    if (marketShare && marketShare > 30) sources.efficientScale = 1;

    // Qualitative boost from text analysis
    const moatLower = qualitativeText.toLowerCase();
    if (moatLower.includes('monopoly') || moatLower.includes('duopoly')) {
        sources.efficientScale = Math.min(1, sources.efficientScale + 1);
    }
    if (moatLower.includes('network effect')) {
        sources.networkEffects = Math.min(3, sources.networkEffects + 1);
    }

    const totalScore =
        sources.networkEffects +
        sources.switchingCosts +
        sources.intangibleAssets +
        sources.costAdvantage +
        sources.efficientScale;

    return { score: totalScore, sources };
};

// 2.3 Add SaaS-Specific Scoring
const calculateSaaSScore = (metrics: StockMetricData): number => {
    let score = 0;

    // Rule of 40: Growth + FCF Margin
    const ruleOf40 = metrics.ruleOf40Score;
    if (ruleOf40 !== null && ruleOf40 !== undefined) {
        if (ruleOf40 >= 60) score += 20;      // Elite
        else if (ruleOf40 >= 40) score += 15; // Passing
        else if (ruleOf40 >= 30) score += 5;  // Borderline
        else score -= 10;                      // Failing
    }

    // DBNR (Dollar-Based Net Retention)
    const dbnr = metrics.dbnr;
    if (dbnr !== null && dbnr !== undefined) {
        if (dbnr >= 140) score += 20;         // World-class (Snowflake-tier)
        else if (dbnr >= 130) score += 15;    // Excellent
        else if (dbnr >= 120) score += 10;    // Good
        else if (dbnr >= 100) score += 0;     // Neutral
        else score -= 15;                      // Churn problem
    }

    // RPO Growth (forward indicator)
    const rpoGrowth = metrics.rpoGrowth;
    if (rpoGrowth !== null && rpoGrowth !== undefined) {
        if (rpoGrowth > 40) score += 10;
        else if (rpoGrowth > 25) score += 5;
        else if (rpoGrowth < 10) score -= 5;
    }

    // Capital Efficiency
    const capEff = metrics.capitalEfficiencyRatio;
    if (capEff !== null && capEff !== undefined) {
        if (capEff > 1.5) score += 10;        // Efficient growth
        else if (capEff > 1.0) score += 5;
        else if (capEff < 0.5) score -= 10;   // Burning cash inefficiently
    }

    return score;
};

// 2.4 Add Dilution Risk Assessment
const calculateDilutionRisk = (metrics: StockMetricData): {
    risk: 'Low' | 'Medium' | 'High',
    penalty: number
} => {
    const shareGrowth = metrics.shareCountGrowth3Y;
    const sbcPct = metrics.sbcAsPercentRevenue;

    let penalty = 0;
    let risk: 'Low' | 'Medium' | 'High' = 'Low';

    // Share dilution assessment
    if (shareGrowth !== null && shareGrowth !== undefined) {
        if (shareGrowth > 8) {
            risk = 'High';
            penalty = -15;
        } else if (shareGrowth > 4) {
            risk = 'Medium';
            penalty = -8;
        } else if (shareGrowth > 2) {
            penalty = -3;
        } else if (shareGrowth < 0) {
            // Buybacks = positive
            penalty = 5;
        }
    }

    // SBC assessment (especially bad for "profitable" companies)
    if (sbcPct !== null && sbcPct !== undefined && sbcPct > 25) {
        penalty -= 10;
        risk = 'High';
    } else if (sbcPct !== null && sbcPct !== undefined && sbcPct > 15) {
        penalty -= 5;
        if (risk === 'Low') risk = 'Medium';
    }

    return { risk, penalty };
};

// 2.5 Add Relative Valuation Scoring
const calculateRelativeValuation = (metrics: StockMetricData): number => {
    let score = 0;

    // P/E vs historical range
    const pePercentile = metrics.pePercentile5Y;
    if (pePercentile !== null && pePercentile !== undefined) {
        if (pePercentile < 20) score += 15;       // Historically cheap
        else if (pePercentile < 40) score += 8;
        else if (pePercentile > 80) score -= 10;  // Historically expensive
        else if (pePercentile > 90) score -= 20;  // Extreme
    }

    // EV/Sales vs historical
    const evSalesPercentile = metrics.evSalesPercentile5Y;
    if (evSalesPercentile !== null && evSalesPercentile !== undefined) {
        if (evSalesPercentile < 25) score += 10;
        else if (evSalesPercentile > 75) score -= 10;
    }

    // Price vs Analyst Target
    const upside = metrics.priceTargetUpside;
    if (upside !== null && upside !== undefined) {
        if (upside > 50) score += 10;
        else if (upside > 25) score += 5;
        else if (upside < -10) score -= 10;
    }

    return score;
};

// 2.6 Add TAM Analysis
const calculateTAMScore = (metrics: StockMetricData): number => {
    const penetration = metrics.tamPenetration;

    if (penetration === null || penetration === undefined) return 0;

    // Sweet spot: 2-15% TAM penetration = maximum runway
    if (penetration >= 2 && penetration <= 5) return 15;   // Early, huge runway
    if (penetration > 5 && penetration <= 15) return 10;   // Growing, good runway
    if (penetration > 15 && penetration <= 30) return 5;   // Maturing
    if (penetration > 30) return -5;                        // Limited expansion
    if (penetration < 2) return 5;                          // Very early (risky but high potential)

    return 0;
};

// 2.7 Add Earnings Quality (Accruals)
const calculateEarningsQuality = (metrics: StockMetricData): number => {
    let score = 0;

    // Accruals Ratio: Low = high quality earnings
    const accruals = metrics.accrualsRatio;
    if (accruals !== null && accruals !== undefined) {
        if (accruals < 0.05) score += 10;        // Cash earnings
        else if (accruals < 0.10) score += 5;
        else if (accruals > 0.20) score -= 10;   // Aggressive accounting
        else if (accruals > 0.30) score -= 20;   // Red flag
    }

    // Piotroski F-Score
    const fScore = metrics.fScore;
    if (fScore !== null && fScore !== undefined) {
        if (fScore >= 8) score += 15;            // Strong
        else if (fScore >= 6) score += 8;
        else if (fScore <= 3) score -= 15;       // Weak fundamentals
    }

    return score;
};

// 2.8 Master Composite Score Calculator
export const calculateMultibaggerScore = (
    raw: Partial<StockCompany>,
    metrics: StockMetricData
): Partial<StockCompany> => {

    const sector = raw.sector || "Unclassified";
    const isSaaS = sector.toLowerCase().includes('software') ||
        sector.toLowerCase().includes('saas') ||
        (raw.businessModel || '').toLowerCase().includes('saas');

    // === COMPONENT SCORES ===

    // 1. Growth Score (0-40 points)
    let growthScore = 0;
    const growthVal = parseFloat(String(metrics.revenueGrowth || '0'));
    if (growthVal >= 50) growthScore += 20;
    else if (growthVal >= 30) growthScore += 15;
    else if (growthVal >= 20) growthScore += 10;
    else if (growthVal >= 10) growthScore += 5;

    const accel = calculateGrowthAcceleration(
        metrics.revenueGrowthQ1 ?? null,
        metrics.revenueGrowthQ2 ?? null,
        metrics.revenueGrowthQ3 ?? null
    );
    growthScore += accel.score;
    growthScore = Math.max(0, Math.min(40, growthScore));

    // 2. Quality Score (0-30 points)
    let qualityScore = 0;

    // Use existing logic for base quality if possible, but map fields carefully
    // Assuming calculateQuantitativeScore is available but metrics object might differ
    // We'll trust new metrics primarily.

    qualityScore += calculateEarningsQuality(metrics);
    if (metrics.roic && metrics.roic > 20) qualityScore += 10;
    else if (metrics.roic && metrics.roic > 10) qualityScore += 5;

    qualityScore = Math.max(0, Math.min(30, qualityScore));

    // 3. Moat Score (0-20 points)
    const moatResult = calculateMoatScore(metrics, sector, raw.moat || '');
    const moatScore = Math.min(20, moatResult.score * 2);

    // 4. Valuation Score (0-30 points)
    let valuationScore = 15; // Start neutral
    valuationScore += calculateRelativeValuation(metrics);

    // PEG-based adjustment
    const peg = metrics.pegRatio;
    if (peg !== null && peg !== undefined && peg > 0) {
        if (peg < 0.8) valuationScore += 15;
        else if (peg < 1.2) valuationScore += 10;
        else if (peg < 1.8) valuationScore += 5;
        else if (peg > 3.0) valuationScore -= 10;
    }
    valuationScore = Math.max(0, Math.min(30, valuationScore));

    // 5. SaaS Bonus (0-20 points for SaaS companies)
    let saasBonus = 0;
    if (isSaaS) {
        saasBonus = Math.max(0, Math.min(20, calculateSaaSScore(metrics)));
    }

    // 6. TAM Bonus (0-15 points)
    const tamScore = Math.max(0, Math.min(15, calculateTAMScore(metrics)));

    // 7. Dilution Penalty
    const dilution = calculateDilutionRisk(metrics);

    // === COMPOSITE MULTIBAGGER SCORE ===
    let multibaggerScore =
        growthScore +      // Max 40
        qualityScore +     // Max 30
        moatScore +        // Max 20
        valuationScore +   // Max 30
        saasBonus +        // Max 20
        tamScore +         // Max 15
        dilution.penalty;  // -15 to +5

    // Normalize to 0-100
    multibaggerScore = Math.round(Math.max(0, Math.min(100, multibaggerScore * 0.65)));

    // === LETTER GRADES ===
    const toGrade = (score: number, max: number): 'A' | 'B' | 'C' | 'D' | 'F' => {
        const pct = (score / max) * 100;
        if (pct >= 85) return 'A';
        if (pct >= 70) return 'B';
        if (pct >= 55) return 'C';
        if (pct >= 40) return 'D';
        return 'F';
    };

    // === FINAL VERDICT BASED ON COMPOSITE ===
    let recommendation: StockCompany['recommendation'] = 'Avoid'; // Default
    if (multibaggerScore >= 80 && moatScore >= 12) {
        recommendation = 'Strong Buy';
    } else if (multibaggerScore >= 65) {
        recommendation = 'Buy';
    } else if (multibaggerScore >= 50) {
        recommendation = 'Hold';
    } else if (multibaggerScore >= 35) {
        recommendation = 'Watchlist';
    } else {
        recommendation = 'Avoid';
    }

    // Override: Decelerating growth = never Strong Buy
    if (accel.acceleration === 'Decelerating' && recommendation === 'Strong Buy') {
        recommendation = 'Buy';
    }

    // Override: High dilution risk = cap at Hold
    if (dilution.risk === 'High' && (recommendation === 'Strong Buy' || recommendation === 'Buy')) {
        recommendation = 'Hold';
    }

    const verdictReason = generateVerdictReason(multibaggerScore, growthScore, moatScore, valuationScore, accel.acceleration);

    return {
        // ...existingScores, // Need to merge if existingScores passed
        recommendation,
        multibaggerScore,
        qualityGrade: toGrade(qualityScore, 30),
        growthGrade: toGrade(growthScore, 40),
        valuationGrade: toGrade(valuationScore, 30),
        momentumGrade: raw.isUptrend ? 'B' : 'D',
        moatScore: moatResult.score,
        moatSources: moatResult.sources,
        exitRisks: dilution.risk, // Mapping dilutionRisk to exitRisks or similar if needed, or just extend type
        dilutionRisk: dilution.risk,
        verdictReason
    };
};

const generateVerdictReason = (
    total: number,
    growth: number,
    moat: number,
    valuation: number,
    accel: string
): string => {
    const parts: string[] = [];

    if (total >= 75) {
        parts.push(`Elite Score (${total}/100)`);
    }

    if (accel === 'Accelerating') {
        parts.push('Revenue Accelerating');
    } else if (accel === 'Decelerating') {
        parts.push('Growth Decelerating ⚠️');
    }

    if (moat >= 15) {
        parts.push('Wide Moat Verified');
    } else if (moat < 5) {
        parts.push('Weak Competitive Position');
    }

    if (valuation >= 25) {
        parts.push('Attractive Valuation');
    } else if (valuation < 10) {
        parts.push('Expensive');
    }

    return parts.join(' | ') || 'Standard Analysis';
};

// 5. Validation & Safeguards
export const validateMetrics = (metrics: StockMetricData): { valid: boolean, warnings: string[] } => {
    const warnings: string[] = [];

    // Check for impossible values
    if (metrics.grossMargin && parseFloat(String(metrics.grossMargin)) > 100) {
        warnings.push('Gross margin > 100% is invalid');
    }

    if (metrics.pegRatio && metrics.pegRatio < 0) {
        warnings.push('Negative PEG indicates negative earnings or growth');
    }

    if (metrics.dbnr && metrics.dbnr > 200) {
        warnings.push('DBNR > 200% is unusual, verify data');
    }

    if (metrics.shareCountGrowth3Y && metrics.shareCountGrowth3Y > 20) {
        warnings.push('Extreme dilution detected');
    }

    return {
        valid: warnings.length === 0,
        warnings
    };
};

// Safe division helper
export const safeDivide = (a: number, b: number, fallback: number = 0): number => {
    if (b === 0 || !isFinite(a) || !isFinite(b)) return fallback;
    const result = a / b;
    return isFinite(result) ? result : fallback;
};
