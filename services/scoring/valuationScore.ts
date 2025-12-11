
/**
 * Valuation Scoring Module
 * 
 * Implements PEG (Price/Earnings to Growth) and PSG (Price/Sales to Growth) scoring.
 * 
 * Philosophy:
 * - Growth is the denominator. High growth justifies higher multiples.
 * - PEG < 1.0 is the gold standard for growth at a reasonable price (GARP).
 * - PSG is a fallback for high-growth companies that are not yet optimized for earnings.
 */

import { STRATEGY } from '../../config/strategyConfig';

export interface ValuationMetrics {
    pe: number | null;
    ps: number | null;
    revenueCagr3y: number | null; // e.g. 0.25 for 25%
    epsCagr3y?: number | null;
}

function calcGrowthRateForValuation(metrics: {
    revenueCagr3y: number | null;
    epsCagr3y?: number | null;
}): number {
    // Prefer EPS growth if available and positive, as it's the "E" in PEG
    const eps = metrics.epsCagr3y ?? null;
    if (eps && eps > 0) return eps;

    // Fallback to revenue growth
    return metrics.revenueCagr3y ?? 0;
}

export function calcValuationScore(metrics: ValuationMetrics): number {
    // [TASK 3] Safety Valve for Bubble Valuations
    if (metrics.ps && metrics.ps > STRATEGY.VALUATION.PS_SAFETY_Valve) {
        console.log(`[Valuation] Safety Valve: P/S ${metrics.ps} > ${STRATEGY.VALUATION.PS_SAFETY_Valve} -> Score: -10`);
        return -10;
    }

    const growth = calcGrowthRateForValuation(metrics); // 0.20 = 20%

    if (!growth || growth <= 0.05) {
        // No growth / very low growth → multiples are hard to justify
        return -10;
    }

    let score = 0;

    // 1) PEG: P/E divided by Growth Rate (as integer, e.g. 20 for 20%)
    // PEG = PE / (Growth * 100)
    if (metrics.pe && metrics.pe > 0) {
        const peg = metrics.pe / (growth * 100);

        if (peg < STRATEGY.VALUATION.PEG_CHEAP) score += 15;    // “Screaming cheap”
        else if (peg < STRATEGY.VALUATION.PEG_ATTRACTIVE) score += 10; // Attractive
        else if (peg < STRATEGY.VALUATION.PEG_FAIR) score += 5;  // Fair
        else if (peg < STRATEGY.VALUATION.PEG_FULL) score += 0;  // Full
        else if (peg < STRATEGY.VALUATION.PEG_EXPENSIVE) score -= 5;  // Expensive
        else score -= 10;                // Very Expensive

        console.log(`[Valuation] PEG=${peg.toFixed(2)} (PE=${metrics.pe}, Growth=${(growth * 100).toFixed(1)}%) -> Score: ${score}`);
        return score;
    }

    // 2) PSG fallback: P/S divided by growth if PE not meaningful
    if ((!metrics.pe || metrics.pe <= 0) && metrics.ps && metrics.ps > 0) {
        const psg = metrics.ps / (growth * 100);

        if (psg < STRATEGY.VALUATION.PSG_CHEAP) score += 10;    // Very attractive
        else if (psg < STRATEGY.VALUATION.PSG_ATTRACTIVE) score += 5;
        else if (psg < STRATEGY.VALUATION.PSG_FAIR) score += 0;
        else if (psg < STRATEGY.VALUATION.PSG_EXPENSIVE) score -= 5;
        else score -= 10;

        console.log(`[Valuation] PSG=${psg.toFixed(2)} (PS=${metrics.ps}, Growth=${(growth * 100).toFixed(1)}%) -> Score: ${score}`);
        return score;
    }

    return 0; // No valid valuation metrics
}
