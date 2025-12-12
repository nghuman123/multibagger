import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from root
let result = dotenv.config({ path: path.resolve(__dirname, '../.env') });
if (result.error) {
    console.warn("⚠️ Failed to load .env file:", result.error);
}

// Try .env.local if FMP key missing
if (!process.env.FMP_API_KEY && !process.env.VITE_FMP_API_KEY) {
    console.log("⚠️ FMP Key not found in .env, trying .env.local...");
    const localResult = dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });
    if (localResult.error) {
        console.warn("⚠️ Failed to load .env.local file:", localResult.error);
    } else {
        console.log("✅ Environment variables loaded from .env.local");
    }
}

if (true) { // Debug block
    console.log("✅ Environment checks complete");
    const keys = Object.keys(process.env).filter(k => k.includes('FMP') || k.includes('API'));
    console.log("Available Keys:", keys);
}

import { analyzeStock } from '../services/analyzer';
import { MultiBaggerAnalysis } from '../types';

// ============================================================================
// CONFIGURATION: Historical Test Cases
// ============================================================================
interface BacktestCase {
    ticker: string;
    date: string; // YYYY-MM-DD
    expectedTier: string;
    description: string;
}

const HISTORY_CASES: BacktestCase[] = [
    // 1. THE ORIGIN STORY: NVIDIA (Jan 2016)
    // Before the massive AI/Crypto boom.
    // Price split-adj was ~$0.80. Market Cap ~$15B.
    // Should detect: High ROIC, Good Growth, but maybe "Cyclical" warning.
    // Goal: Tier 1 or Tier 2 (Quality Compounder).
    {
        ticker: 'NVDA',
        date: '2016-01-15',
        expectedTier: 'Tier 1',
        description: 'Pre-AI Boom (Gaming Cyclicality Risk?)'
    },

    // 2. THE PEAK: PELOTON (Jan 2021)
    // At the absolute top. Price ~$150.
    // Should detect: Extreme Valuation, Massive Growth but "One-time" pandemic pull-forward risk?
    // Maybe hard to catch fundamentally as numbers looked great.
    // Goal: Tier 2 (Valuation Warning) or Tier 3.
    {
        ticker: 'PTON',
        date: '2021-01-15',
        expectedTier: 'Tier 3',
        description: 'Top of Pandemic Bubble (Valuation Risk)'
    },

    // 3. THE DETERIORATION: PELOTON (Jan 2022)
    // Post-crash start.
    // Should detect: Decelerating growth, inventory issues (if visible in metrics), negative momentum.
    // Goal: Not Interesting / Tier 3.
    {
        ticker: 'PTON',
        date: '2022-01-15',
        expectedTier: 'Not Interesting',
        description: 'Post-Crash Deterioration'
    },

    // 4. EARLY SAAS: CROWDSTRIKE (Jan 2020)
    // Post-IPO, hyper growth, unprofitable.
    // Should detect: Massive Growth, High Gross Margin, High Retention (DBNR).
    // Goal: Tier 1 (Speculative/Hypergrowth).
    {
        ticker: 'CRWD',
        date: '2020-01-15',
        expectedTier: 'Tier 1',
        description: 'Early Hypergrowth SaaS'
    }
];

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runBacktest() {
    console.log(`\n🕵️  ALPHA-HUNTER HISTORICAL BACKTEST ENGINE 🕵️`);
    console.log(`===================================================\n`);

    const results: any[] = [];

    for (const testCase of HISTORY_CASES) {
        console.log(`\n👉 Testing ${testCase.ticker} @ ${testCase.date} (${testCase.description})...`);

        try {
            // PASS THE REFERENCE DATE TO ANALYZER (Point-in-Time Logic)
            const result = await analyzeStock(testCase.ticker, new Date(testCase.date));

            if (!result) {
                console.error(`❌ Failed to analyze ${testCase.ticker}`);
                continue;
            }

            const isMatch = result.overallTier === testCase.expectedTier ||
                (testCase.expectedTier.includes(result.overallTier)); // Loose matching

            const logIcon = isMatch ? '✅' : '⚠️';

            console.log(`${logIcon} RESULT: ${result.overallTier} (Expected: ${testCase.expectedTier})`);
            console.log(`   Score: ${result.finalScore}/100 | Verdict: ${result.verdict}`);
            console.log(`   Growth: ${result.multiBaggerScore?.computedMetrics?.revenueGrowth?.toFixed(1)}%`);
            console.log(`   Valuation Score: ${result.multiBaggerScore?.pillars?.valuation?.score}/20`);

            if (result.dataQualityWarnings && result.dataQualityWarnings.length > 0) {
                console.log(`   Warnings: ${result.dataQualityWarnings.length} (e.g. ${result.dataQualityWarnings[0]})`);
            }

            results.push({
                ticker: testCase.ticker,
                date: testCase.date,
                tier: result.overallTier,
                expected: testCase.expectedTier,
                pass: isMatch,
                score: result.finalScore
            });

        } catch (error) {
            console.error(`❌ Error testing ${testCase.ticker}:`, error);
        }
    }

    // SUMMARY TABLE
    console.log(`\n\n📊 BACKTEST SUMMARY 📊`);
    console.log(`-------------------------------------------------------------------------`);
    console.log(`| Ticker | Date       | Result           | Expected       | Score | Pass |`);
    console.log(`-------------------------------------------------------------------------`);
    results.forEach(r => {
        const passStr = r.pass ? '✅' : '❌';
        console.log(`| ${r.ticker.padEnd(6)} | ${r.date} | ${r.tier.padEnd(16)} | ${r.expected.padEnd(14)} | ${String(r.score).padEnd(5)} | ${passStr}   |`);
    });
    console.log(`-------------------------------------------------------------------------`);
}

import 'dotenv/config'; // Load env vars
// ... imports

// ... code ...

// Run if main (ESM compatible)
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runBacktest();
}
