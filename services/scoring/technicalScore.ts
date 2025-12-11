import { PriceHistoryData, TechnicalScore } from '../../src/types/scoring';

/**
 * Technical Score (0-25)
 * Goal: Is the stock in a constructive trend?
 */

// 1. Relative Strength vs SPY/QQQ (0-10)
// For now, we'll assume the input 'history' is just the stock's history.
// To do true RS vs SPY, we'd need SPY history.
// Simplified Proxy: Absolute performance over 12 months.
// If > 20% -> 10.
// Ideally, the caller should provide RS metric if available.
// Let's assume the 'history' allows us to calc 12-month return.
const scoreRelativeStrength = (data: PriceHistoryData): { score: number; detail: string } => {
    if (data.history.length < 250) { // Approx 1 year trading days
        return { score: 0, detail: 'Insufficient history for RS check' };
    }

    const current = data.price;
    const oneYearAgo = data.history[Math.min(data.history.length - 1, 250)].close;

    if (oneYearAgo === 0) return { score: 0, detail: 'Invalid history data' };

    const stockPerf = ((current - oneYearAgo) / oneYearAgo) * 100;

    // [MOD] Benchmarking Logic
    let benchmarkPerf = 0;
    let hasBenchmark = false;

    if (data.benchmarkHistory && data.benchmarkHistory.length >= 250) {
        const benchCurrent = data.benchmarkHistory[0].close;
        const benchYearAgo = data.benchmarkHistory[Math.min(data.benchmarkHistory.length - 1, 250)].close;
        if (benchYearAgo > 0) {
            benchmarkPerf = ((benchCurrent - benchYearAgo) / benchYearAgo) * 100;
            hasBenchmark = true;
        }
    }

    // "True" Relative Strength = Stock Delta - Benchmark Delta
    // If no benchmark, we fall back to absolute > 20% rule but strictly (maybe assumed market is 10%?)
    // Let's rely on Relative Strength if possible.
    const relativeStrength = hasBenchmark ? (stockPerf - benchmarkPerf) : (stockPerf - 10); // Assume 10% market baseline if missing

    let score = 0;
    if (relativeStrength > 20) score = 10;      // Crushing market
    else if (relativeStrength >= 5) score = 7;  // Beating market
    else if (relativeStrength >= 0) score = 3;  // Matching
    else if (relativeStrength >= -10) score = 1;// Lagging slightly
    else score = 0;                             // Underperforming

    const detailText = hasBenchmark
        ? `RS vs SPY: ${relativeStrength.toFixed(1)}% (Stock: ${stockPerf.toFixed(1)}%, SPY: ${benchmarkPerf.toFixed(1)}%) (+${score}/10)`
        : `Rel Perf (Est): ${relativeStrength.toFixed(1)}% (Stock: ${stockPerf.toFixed(1)}%) (+${score}/10)`;

    return { score, detail: detailText };
};

// 2. Above 200-Day Moving Average (0-10)
const scoreSMA200 = (data: PriceHistoryData): { score: number; detail: string } => {
    if (!data.sma200 || data.sma200 === 0) return { score: 0, detail: 'SMA200 unavailable' };

    const diff = ((data.price - data.sma200) / data.sma200) * 100;

    let score = 0;
    if (data.price > data.sma200) score = 10;
    else if (diff >= -5) score = 5; // Within 5% below
    else score = 0;

    return { score, detail: `Price vs 200-DMA: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}% (+${score}/10)` };
};

// 3. Proximity to 52-Week High (0-5)
const score52WeekHigh = (data: PriceHistoryData): { score: number; detail: string } => {
    if (!data.week52High || data.week52High === 0) return { score: 0, detail: '52-Week High unavailable' };

    const diff = ((data.week52High - data.price) / data.week52High) * 100; // % below high

    let score = 0;
    if (diff <= 15) score = 5;
    else if (diff <= 30) score = 3;
    else score = 1; // > 30% below

    return { score, detail: `Below 52W High: ${diff.toFixed(1)}% (+${score}/5)` };
};

export const computeTechnicalScore = (data: PriceHistoryData): TechnicalScore => {
    const rs = scoreRelativeStrength(data);
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
