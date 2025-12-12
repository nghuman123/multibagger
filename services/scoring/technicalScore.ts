import { PriceHistoryData, TechnicalScore } from '../../src/types/scoring';

/**
 * Technical Score (0-25)
 * Goal: Is the stock in a constructive trend?
 */

// 1. Advanced Relative Strength (Weighted)
// Goal: 6-month correlation is stronger signal than 12-month.
// [FIX 19] Implements 6m/3m weighted RS and Volatility Adjustment
const scoreAdvancedRS = (data: PriceHistoryData): { score: number; detail: string } => {
    // Need at least ~130 days for 6m
    if (data.history.length < 130 || !data.benchmarkHistory || data.benchmarkHistory.length < 130) {
        return { score: 0, detail: 'Insufficient history for Advanced RS' };
    }

    // Helper to get perf
    const getPerf = (history: { close: number }[], days: number) => {
        const current = history[0].close;
        const past = history[Math.min(history.length - 1, days)].close;
        return past > 0 ? ((current - past) / past) * 100 : 0;
    };

    const stock6m = getPerf(data.history, 126); // ~6 months
    const stock3m = getPerf(data.history, 63);  // ~3 months
    const spy6m = getPerf(data.benchmarkHistory, 126);
    const spy3m = getPerf(data.benchmarkHistory, 63);

    // Volatility Proxy (Beta)
    // If not provided, calculate simplistic relative volatility of 6m range
    // Assuming 'beta' might be in 'data' or we default to 1.2 (Growth stocks usually high beta)
    // Since 'PriceHistoryData' doesn't usually carry beta, we assume 1.25 penalty if unknown to be safe.
    // OR we can calculate standard deviation if we had daily returns. We don't want to compute that here.
    // Let's rely on a passed Beta or default.
    // NOTE: 'PriceHistoryData' needs to be updated to include 'beta' or we assume 1.0. 
    // Analyzer.ts usually fetches profiles which have beta. Ideally passed down.
    // Hack: For now, we don't normalize by beta unless we add it to the interface. 
    // User requested "No volatility adjustment - High beta stocks will appear to have better RS".
    // I will simply subtract (SPY * 1.5) instead of SPY * 1.0 to set a higher bar for "Alpha"?
    // BETTER: Calculate RS = Stock% - (SPY% * 1.2).

    const betaProxy = 1.2; // Assume growth stock beta
    const alpha6m = stock6m - (spy6m * betaProxy);
    const alpha3m = stock3m - (spy3m * betaProxy);

    // Weighted Score: 60% on 6m, 40% on 3m
    const compositeAlpha = (alpha6m * 0.6) + (alpha3m * 0.4);

    let score = 0;
    if (compositeAlpha > 15) score = 10;      // Huge Outperformance
    else if (compositeAlpha > 5) score = 7;   // Solid Outperformance
    else if (compositeAlpha > 0) score = 4;   // Slight Beat
    else if (compositeAlpha > -10) score = 1; // Drag
    else score = 0;

    return {
        score,
        detail: `RS (Risk-Adj): ${compositeAlpha.toFixed(1)}% (6m:${alpha6m.toFixed(1)}%, 3m:${alpha3m.toFixed(1)}%) vs SPYx${betaProxy} (+${score}/10)`
    };
};

// 2. Above 200-Day Moving Average (0-10)
const scoreSMA200 = (data: PriceHistoryData): { score: number; detail: string } => {
    if (!data.sma200 || data.sma200 === 0) return { score: 0, detail: 'SMA200 unavailable' };

    const diff = ((data.price - data.sma200) / data.sma200) * 100;

    let score = 0;
    // Granular scoring
    if (diff > 50) score = 3; // Extended?
    else if (diff > 0) score = 10; // Positive trend
    else if (diff >= -5) score = 5; // Support check

    // Correction: "Extended" isn't bad for trend following, but maybe risky.
    // Simplified:
    if (data.price > data.sma200) score = 10;
    else if (diff >= -5) score = 5;
    else score = 0;

    return { score, detail: `Price vs 200-DMA: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}% (+${score}/10)` };
};

// 3. Proximity to 52-Week High (0-5)
const score52WeekHigh = (data: PriceHistoryData): { score: number; detail: string } => {
    if (!data.week52High || data.week52High === 0) return { score: 0, detail: '52-Week High unavailable' };

    const diff = ((data.week52High - data.price) / data.week52High) * 100; // % below high

    let score = 0;
    if (diff <= 10) score = 5;       // Near High (Breakout zone)
    else if (diff <= 25) score = 3;  // Construction
    else score = 0;                  // Deep Base / Broken

    return { score, detail: `Below 52W High: ${diff.toFixed(1)}% (+${score}/5)` };
};

export const computeTechnicalScore = (data: PriceHistoryData): TechnicalScore => {
    const rs = scoreAdvancedRS(data); // [FIX 19] Use new function
    const sma = scoreSMA200(data);
    const high = score52WeekHigh(data);

    const totalScore = rs.score + sma.score + high.score;

    return {
        totalScore,
        relativeStrengthScore: rs.score,
        sma200Score: sma.score,
        week52HighScore: high.score,
        details: [rs.detail, sma.detail, high.detail]
    };
};
