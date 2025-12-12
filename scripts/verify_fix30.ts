
import { analyzeStock } from '../services/analyzer';
import { MultiBaggerAnalysis } from '../types';

async function verify() {
    const ticker = 'PLTR'; // Choose a stock likely to have data/moat
    console.log(`Running verification for ${ticker}...`);

    try {
        const result = await analyzeStock(ticker);

        if (!result) {
            console.error("Analysis failed (null result)");
            return;
        }

        console.log("---------------------------------------------------");
        console.log(`Final Score: ${result.finalScore}`);
        console.log(`Quant Score: ${result.multiBaggerScore.totalScore}`);
        console.log(`Risk Penalty: ${result.riskFlags.riskPenalty}`);

        // Check if double counting happened
        // expected: final = quant [+ AI mods]
        // if AI is neutral, final should be roughly quant
        console.log(`AI Score Contribution: ${result.aiScore}`);

        console.log("---------------------------------------------------");
        console.log("Risk Flags:");
        console.log(JSON.stringify(result.riskFlags, null, 2));

        console.log("---------------------------------------------------");
        console.log("Computed Metrics (Unified):");
        console.log(JSON.stringify(result.multiBaggerScore.computedMetrics, null, 2));

        console.log("---------------------------------------------------");
        console.log("Pillars:");
        console.log(JSON.stringify(result.multiBaggerScore.pillars, null, 2));

    } catch (err) {
        console.error("Verification Error:", err);
    }
}

verify();
