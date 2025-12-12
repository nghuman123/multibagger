import 'dotenv/config';
import { analyzeStock } from '../services/analyzer.ts';

// Environment variables loaded by import 'dotenv/config'

interface TestCase {
    ticker: string;
    expectedTier: string;
    notes: string;
}

const GOLDEN_SET: TestCase[] = [
    // ═══════════════════════════════════════════════════════════════
    // TIER 1 WINNERS (Should score 85-100)
    // ═══════════════════════════════════════════════════════════════
    { ticker: 'NVDA', expectedTier: 'Tier 1', notes: 'AI chip dominance, 126% 3Y CAGR, 73% GM - the gold standard.' },
    { ticker: 'CRWD', expectedTier: 'Tier 1/2', notes: 'Security SaaS leader, 29% growth, 73% GM, strong FCF generation.' },
    { ticker: 'DDOG', expectedTier: 'Tier 1/2', notes: 'Cloud monitoring platform, 26% growth, 80% GM, elite net retention.' },
    { ticker: 'PLTR', expectedTier: 'Tier 2', notes: 'Gov/enterprise AI platform, 36% CAGR, 82% GM, proving FCF sustainability.' },
    { ticker: 'ZS', expectedTier: 'Tier 2/3', notes: 'Zero-trust security, 29% CAGR, 77% GM, but competitive intensity rising.' },

    // NEW: Mid-cap quality winners (the hunting ground)
    { ticker: 'PANW', expectedTier: 'Tier 1', notes: 'Cybersecurity platform leader, $130B cap, 25% growth, profitable scale.' },
    { ticker: 'FTNT', expectedTier: 'Tier 1/2', notes: 'Network security leader, 25% growth, high margins, strong moat.' },

    // ═══════════════════════════════════════════════════════════════
    // TIER 2 QUALITY COMPOUNDERS (Should score 60-84)
    // ═══════════════════════════════════════════════════════════════
    { ticker: 'MSFT', expectedTier: 'Tier 1/2', notes: 'Mega-cap AI beneficiary, Azure growth, Office dominance - 2-3x potential.' },
    { ticker: 'AAPL', expectedTier: 'Tier 2', notes: 'Cash fortress, 37% ROE, Services growth, but mature iPhone cycle.' },
    { ticker: 'COST', expectedTier: 'Tier 2/3', notes: 'Membership moat, steady compounder, modest multi-bagger potential.' },
    { ticker: 'SNOW', expectedTier: 'Tier 2', notes: 'Data cloud platform, 30% growth slowing, huge TAM but execution risk.' },
    { ticker: 'SHOP', expectedTier: 'Tier 2', notes: 'E-commerce OS, 30% growth, maturing but still durable franchise.' },
    { ticker: 'TSLA', expectedTier: 'Tier 1/2', notes: 'EV leader but margin pressure, competition rising - prove re-acceleration.' },
    { ticker: 'RKLB', expectedTier: 'Tier 2/3', notes: 'Space launch pure-play, 52% growth, capex heavy, binary risk/reward.' },

    // NEW: Founder-led companies
    { ticker: 'ABNB', expectedTier: 'Tier 2', notes: 'Founder-led (Chesky), travel recovery play, strong brand but cyclical.' },

    // NEW: International champion
    { ticker: 'ASML', expectedTier: 'Tier 1', notes: 'Dutch semi equipment monopoly, only EUV supplier, irreplaceable in AI chips.' },

    // ═══════════════════════════════════════════════════════════════
    // TIER 3 SPECULATIVE (Should score 45-65)
    // ═══════════════════════════════════════════════════════════════
    { ticker: 'RGTI', expectedTier: 'Tier 2/3', notes: 'Quantum computing, tiny revenue, 72% dilution - 10x or zero binary.' },
    { ticker: 'SOUN', expectedTier: 'Tier 2/3', notes: 'AI voice tech, 121% growth, negative FCF, 14% dilution - show me story.' },
    { ticker: 'ASTS', expectedTier: 'Tier 2/3', notes: 'Space-based cellular, $15M revenue, 75% dilution - massive TAM but survival risk.' },

    // ═══════════════════════════════════════════════════════════════
    // NOT INTERESTING (Should score 25-50)
    // ═══════════════════════════════════════════════════════════════
    { ticker: 'T', expectedTier: 'Not Interesting', notes: 'Telecom utility, 2% growth, high debt, dividend play not multi-bagger.' },
    { ticker: 'IBM', expectedTier: 'Not Interesting', notes: 'Legacy tech, 5% growth, Red Hat bright spot but not enough.' },
    { ticker: 'XOM', expectedTier: 'Not Interesting', notes: 'Oil major, cyclical, -4% growth, commodity exposure not structural.' },
    { ticker: 'FCX', expectedTier: 'Tier 2/3', notes: 'Copper cyclical, 4% growth, super-cycle potential but macro-driven.' },
    { ticker: 'DIS', expectedTier: 'Tier 2/3', notes: 'Streaming turnaround story, iconic IP, but prove it with 2-3 quarters.' },
    { ticker: 'PYPL', expectedTier: 'Tier 2/3', notes: 'Payments slowdown (4% growth), Altman distress, needs margin re-acceleration.' },
    { ticker: 'BABA', expectedTier: 'Tier 2/3', notes: 'Strong business (5% growth) but China regulatory overhang caps upside.' },

    // ═══════════════════════════════════════════════════════════════
    // DISQUALIFIED DISASTERS (Should score 0-15)
    // ═══════════════════════════════════════════════════════════════
    { ticker: 'WKHS', expectedTier: 'Disqualified', notes: '659% dilution, Altman Z -10.9, no viable business - textbook disaster.' },
    { ticker: 'RIDE', expectedTier: 'Disqualified', notes: 'Lordstown bankruptcy, Altman Z -32.7, post-mortem case study.' },

    // NEW: More fraud/disaster examples
    { ticker: 'NKLA', expectedTier: 'Disqualified', notes: 'Nikola fraud (fake truck demo), massive dilution, no real product.' },
    { ticker: 'SPCE', expectedTier: 'Disqualified', notes: 'Virgin Galactic cash burn, no revenue path, founder dilution machine.' },

    // ═══════════════════════════════════════════════════════════════
    // FALLEN ANGELS (Should score Tier 2/3, not Tier 1)
    // ═══════════════════════════════════════════════════════════════
    { ticker: 'PTON', expectedTier: 'Tier 3', notes: 'Post-COVID crash, inventory issues, negative FCF history. Should NOT be Tier 1.' },
    { ticker: 'ZM', expectedTier: 'Tier 2/3', notes: 'Growth crashed from 300% to single digits. Cash cow but growth trap?' },
];


// Simple p-limit implementation
function pLimit(concurrency: number) {
    const queue: (() => void)[] = [];
    let activeCount = 0;

    const next = () => {
        activeCount--;
        if (queue.length > 0) {
            queue.shift()!();
        }
    };

    return async <T>(fn: () => Promise<T>): Promise<T> => {
        if (activeCount >= concurrency) {
            await new Promise<void>(resolve => queue.push(resolve));
        }
        activeCount++;
        try {
            return await fn();
        } finally {
            next();
        }
    };
}

const run = async () => {
    console.log('Running Golden Test Set Analysis...\n');
    console.log('-----------------------------------------------------------------------------------------------------------------------------');
    console.log('| Ticker | Quant | Final | Tier            | Disqualified | Warnings                                      | Expected       |');
    console.log('-----------------------------------------------------------------------------------------------------------------------------');

    const limit = pLimit(3); // Limit to 3 concurrent requests

    const tasks = GOLDEN_SET.map(testCase =>
        limit(async () => {
            try {
                const result = await analyzeStock(testCase.ticker);

                if (!result) {
                    console.log(`| ${testCase.ticker.padEnd(6)} | N/A   | N/A   | N/A             | N/A          | Data Unavailable                              | ${testCase.expectedTier.padEnd(14)} |`);
                    return;
                }

                console.log('[DebugScore]', result.ticker, {
                    quantScore: result.multiBaggerScore.totalScore,
                    riskPenalty: result.riskFlags.riskPenalty,
                    aiStatus: result.antigravityResult?.aiStatus,
                    aiTier: result.antigravityResult?.aiTier,
                    aiConviction: result.antigravityResult?.aiConviction,
                    finalScore: result.finalScore,
                });

                const quant = result.multiBaggerScore.totalScore.toString().padEnd(5);
                const final = result.finalScore.toString().padEnd(5);
                const tier = result.overallTier.padEnd(15);
                const disqualified = (result.riskFlags.disqualified ? 'YES' : 'NO').padEnd(12);

                // Format warnings (truncate if too long)
                let warningsList = [...result.riskFlags.disqualifyReasons, ...result.riskFlags.warnings];
                if (result.antigravityResult?.error) {
                    warningsList.push("AI Error");
                } else if (result.antigravityResult?.warningSummary) {
                    warningsList.push(result.antigravityResult.warningSummary);
                }

                let warnings = warningsList.join(', ');
                if (warnings.length > 45) warnings = warnings.substring(0, 42) + '...';
                warnings = warnings.padEnd(45);

                console.log(`| ${testCase.ticker.padEnd(6)} | ${quant} | ${final} | ${tier} | ${disqualified} | ${warnings} | ${testCase.expectedTier.padEnd(14)} |`);

            } catch (error) {
                console.error(`Error analyzing ${testCase.ticker}:`, error);
            }
        })
    );

    await Promise.all(tasks);

    console.log('-----------------------------------------------------------------------------------------------------------------------------');

    // Optional: Log Cache Stats
    try {
        const { getCacheStats } = await import('../services/utils/cache.ts');
        const stats = await getCacheStats();
        console.log('\n[Cache Stats]', stats);
    } catch (e) {
        console.log('[Cache Stats] Unavailable');
    }

    console.log('\nInterpretation Guide:');
    console.log('1. Winners (NVDA, etc.) should score high (Tier 1/2). If low, check if strict rules are too harsh.');
    console.log('2. Disasters (WKHS, RIDE) MUST be Disqualified or Tier 3/Not Interesting.');
    console.log('3. Boring stocks (T, IBM) should be Not Interesting (< 55).');
};

run().catch(console.error);
