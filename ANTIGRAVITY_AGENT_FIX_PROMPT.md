# AlphaHunter Critical Fix Prompt for Gemini Antigravity Agent

**Document Version:** 1.0
**Priority:** CRITICAL
**Scope:** Risk Engine, Scoring Model, Technical Analysis, Data Handling

---

## CONTEXT FOR AI AGENT

You are an expert quantitative developer at a hedge fund. You have been given the AlphaHunter codebase - a multi-bagger stock screening system. Two senior quant analysts have reviewed the code and identified **critical implementation gaps** that make the system unreliable for real capital allocation.

Your task is to fix these issues systematically while maintaining the existing architecture and philosophy (Risk-First, 5-Pillar scoring, Compounder focus).

**Key Files to Modify:**
- `services/scoring/riskFlags.ts` - Risk Engine
- `services/scoring/multiBaggerScore.ts` - Core Scoring
- `services/scoring/technicalScore.ts` - Technical Analysis
- `services/scoring/quantScore.ts` - Quantitative Metrics
- `services/analyzer.ts` - Main Orchestrator
- `services/utils/founderDetection.ts` - Founder Detection
- `config/scoringThresholds.ts` - Centralized Configuration

---

## CRITICAL FIXES (PRIORITY 0)

### FIX 1: Complete the Beneish M-Score Implementation

**File:** `services/scoring/riskFlags.ts`
**Lines:** 14-69
**Severity:** CRITICAL - Current implementation is a "fraud detection illusion"

**Current Problem:**
```typescript
const dsri = 1.0; // Simplified - would need receivables data
const aqi = 1.0;  // Simplified
const depi = 1.0; // Simplified
const sgai = 1.0; // Simplified
```

The M-Score formula requires 8 variables. 4 are hardcoded to 1.0, making fraud detection unreliable.

**Required Fix:**

1. **DSRI (Days Sales in Receivables Index):**
```typescript
// DSRI = (Receivables_t / Sales_t) / (Receivables_t-1 / Sales_t-1)
const receivables_t = currentBalance.netReceivables || 0;
const receivables_t1 = priorBalance.netReceivables || 0;
const sales_t = currentIncome.revenue || 1;
const sales_t1 = priorIncome.revenue || 1;

const dsri = (receivables_t1 > 0 && sales_t1 > 0)
  ? ((receivables_t / sales_t) / (receivables_t1 / sales_t1))
  : 1.0;
```

2. **AQI (Asset Quality Index):**
```typescript
// AQI = (1 - (CurrentAssets + PPE + Securities) / TotalAssets)_t
//     / (1 - (CurrentAssets + PPE + Securities) / TotalAssets)_t-1
const hardAssets_t = (currentBalance.totalCurrentAssets || 0) +
                     (currentBalance.propertyPlantEquipmentNet || 0);
const hardAssets_t1 = (priorBalance.totalCurrentAssets || 0) +
                      (priorBalance.propertyPlantEquipmentNet || 0);
const totalAssets_t = currentBalance.totalAssets || 1;
const totalAssets_t1 = priorBalance.totalAssets || 1;

const softAssetRatio_t = 1 - (hardAssets_t / totalAssets_t);
const softAssetRatio_t1 = 1 - (hardAssets_t1 / totalAssets_t1);
const aqi = softAssetRatio_t1 > 0 ? (softAssetRatio_t / softAssetRatio_t1) : 1.0;
```

3. **DEPI (Depreciation Index):**
```typescript
// DEPI = (Depreciation_t-1 / (Depreciation_t-1 + PPE_t-1))
//      / (Depreciation_t / (Depreciation_t + PPE_t))
const depr_t = currentIncome.depreciationAndAmortization || 0;
const depr_t1 = priorIncome.depreciationAndAmortization || 0;
const ppe_t = currentBalance.propertyPlantEquipmentNet || 1;
const ppe_t1 = priorBalance.propertyPlantEquipmentNet || 1;

const deprRate_t = depr_t / (depr_t + ppe_t);
const deprRate_t1 = depr_t1 / (depr_t1 + ppe_t1);
const depi = deprRate_t > 0 ? (deprRate_t1 / deprRate_t) : 1.0;
```

4. **SGAI (SG&A Index):**
```typescript
// SGAI = (SGA_t / Sales_t) / (SGA_t-1 / Sales_t-1)
const sga_t = currentIncome.sellingGeneralAndAdministrativeExpenses || 0;
const sga_t1 = priorIncome.sellingGeneralAndAdministrativeExpenses || 0;

const sgai = (sga_t1 > 0 && sales_t1 > 0)
  ? ((sga_t / sales_t) / (sga_t1 / sales_t1))
  : 1.0;
```

**Data Requirements:**
- Ensure FMP API fetches include: `netReceivables`, `propertyPlantEquipmentNet`, `depreciationAndAmortization`, `sellingGeneralAndAdministrativeExpenses`
- Update `types.ts` interfaces for `BalanceSheet` and `IncomeStatement` if these fields are missing

**Validation:**
- Add data quality warning if any required field returns null/0
- Log which M-Score components are using fallback values

---

### FIX 2: Implement True Relative Strength (vs SPY)

**File:** `services/scoring/technicalScore.ts`
**Lines:** 15-40
**Severity:** CRITICAL - Current "RS" is actually Absolute Momentum

**Current Problem:**
```typescript
const perf = ((current - oneYearAgo) / oneYearAgo) * 100;
// This is ABSOLUTE momentum, not RELATIVE strength
```

In a bull market where SPY is up 30%, a stock up 20% should have NEGATIVE relative strength, but current code gives it 10/10.

**Required Fix:**

1. **Update `PriceHistoryData` interface to include benchmark:**
```typescript
interface PriceHistoryData {
  price: number;
  history: HistoricalPrice[];
  sma200: number;
  week52High: number;
  week52Low: number;
  // NEW
  benchmarkHistory?: HistoricalPrice[];  // SPY price history
}
```

2. **Modify `scoreRelativeStrength` function:**
```typescript
const scoreRelativeStrength = (data: PriceHistoryData): { score: number; detail: string } => {
    if (data.history.length < 250) {
        return { score: 0, detail: 'Insufficient history for RS check' };
    }

    const stockCurrent = data.price;
    const stockYearAgo = data.history[Math.min(data.history.length - 1, 250)].close;
    const stockPerf = stockYearAgo > 0 ? ((stockCurrent - stockYearAgo) / stockYearAgo) * 100 : 0;

    // Calculate benchmark performance
    let benchmarkPerf = 0;
    if (data.benchmarkHistory && data.benchmarkHistory.length >= 250) {
        const spyCurrent = data.benchmarkHistory[0].close;
        const spyYearAgo = data.benchmarkHistory[Math.min(data.benchmarkHistory.length - 1, 250)].close;
        benchmarkPerf = spyYearAgo > 0 ? ((spyCurrent - spyYearAgo) / spyYearAgo) * 100 : 0;
    }

    // TRUE Relative Strength = Stock Performance - Benchmark Performance
    const relativeStrength = stockPerf - benchmarkPerf;

    let score = 0;
    if (relativeStrength > 20) score = 10;       // Crushing the market
    else if (relativeStrength >= 5) score = 7;   // Solid outperformance
    else if (relativeStrength >= 0) score = 3;   // Matching market
    else if (relativeStrength >= -10) score = 1; // Slight underperformance
    else score = 0;                               // Significant underperformance

    return {
        score,
        detail: `RS vs SPY: ${relativeStrength.toFixed(1)}% (Stock: ${stockPerf.toFixed(1)}%, SPY: ${benchmarkPerf.toFixed(1)}%) (+${score}/10)`
    };
};
```

3. **Update `analyzer.ts` to fetch SPY history:**
```typescript
// In analyzeStock function, add SPY fetch to Promise.allSettled:
const fmpSpyHistoryResult = await fmp.getHistoricalPrice('SPY', 365);

// When constructing priceHistoryData:
const priceHistoryData: PriceHistoryData = {
    price: quote.price,
    history: priceHistory,
    sma200: ...,
    week52High: quote.yearHigh,
    week52Low: quote.yearLow,
    benchmarkHistory: getVal(fmpSpyHistoryResult) || []  // NEW
};
```

---

### FIX 3: Cap AI Score Contribution

**File:** `services/analyzer.ts`
**Lines:** 143-231
**Severity:** CRITICAL - AI can swing scores by 30+ points

**Current Problem:**
```typescript
const maxBoost = 30; // Max boost points - TOO HIGH
if (aiStatus === 'STRONG_PASS') {
    const boost = Math.round((aiConviction / 100) * maxBoost);
    finalScore += boost;
}
```

A 30-point AI boost can promote a Tier 3 (55) to Tier 1 (85). This is dangerous given AI hallucination risks.

**Required Fix:**
```typescript
// Replace maxBoost with capped, graduated system
const AI_SCORE_CAPS = {
    STRONG_PASS_MAX: 12,    // Was 30
    SOFT_PASS_MAX: 8,       // Was ~21
    MONITOR_PENALTY: -5,    // Keep
    AVOID_PENALTY: -10      // Keep
};

function integrateAiAndQuant(
  quantScore: number,
  riskPenalty: number,
  ai: AntigravityResult | undefined,
  ticker?: string,
  marketCap?: number
): number {
  let finalScore = quantScore + (riskPenalty || 0);

  if (!ai) return Math.max(0, Math.min(100, finalScore));

  const { aiStatus, aiConviction = 0 } = ai;

  // Graduated AI boost with hard caps
  if (aiStatus === 'STRONG_PASS') {
    // Conviction 100% = +12, 50% = +6
    const boost = Math.round((aiConviction / 100) * AI_SCORE_CAPS.STRONG_PASS_MAX);
    finalScore += boost;
    console.log(`[AI] STRONG_PASS boost: +${boost} (capped at ${AI_SCORE_CAPS.STRONG_PASS_MAX})`);
  }

  if (aiStatus === 'SOFT_PASS') {
    const boost = Math.round((aiConviction / 100) * AI_SCORE_CAPS.SOFT_PASS_MAX);
    finalScore += boost;
    console.log(`[AI] SOFT_PASS boost: +${boost} (capped at ${AI_SCORE_CAPS.SOFT_PASS_MAX})`);
  }

  // Penalties remain the same
  if (aiStatus === 'MONITOR_ONLY') {
    finalScore += AI_SCORE_CAPS.MONITOR_PENALTY;
  }
  if (aiStatus === 'AVOID') {
    finalScore += AI_SCORE_CAPS.AVOID_PENALTY;
  }

  return Math.round(finalScore);
}
```

---

### FIX 4: Reduce Bonus Stacking

**File:** `services/scoring/multiBaggerScore.ts`
**Lines:** 305-361
**Severity:** HIGH - Bonuses can add 40+ points

**Current Problem:**
```typescript
capitalEfficiencyBonus = 15;  // +15
saasBonus = 20;               // +20
qualityBonus = 5;             // +5
// Total possible: +40 on top of 100-point system
```

**Required Fix:**
```typescript
// 1. Reduce individual bonuses
// 2. Make bonuses mutually exclusive (pick highest)
// 3. Cap total bonus contribution

let appliedBonus = 0;
let bonusReason = '';

// Check for Capital Efficiency Bonus (Target: AAPL, MSFT)
if (isCapitalEfficient) {
    appliedBonus = 8;  // Reduced from 15
    bonusReason = 'Capital Efficiency';
}

// Check for SaaS/Cloud Compounder Bonus (Target: DDOG, ZS, CRWD)
// Only apply if higher than current bonus
if (isSaasCompounder && 10 > appliedBonus) {  // Reduced from 20
    appliedBonus = 10;
    bonusReason = 'SaaS Compounder';
}

// Quality Bonus only if no other bonus applied
if (data.isProfitable && isHighQuality && isHighGrowth && appliedBonus === 0) {
    appliedBonus = 5;
    bonusReason = 'Quality Growth';
}

// Apply single highest bonus
totalScore += appliedBonus;

// Hard cap at 100
totalScore = Math.min(totalScore, 100);

console.log(`[Bonus] ${data.ticker}: +${appliedBonus} (${bonusReason || 'None'})`);
```

---

## HIGH PRIORITY FIXES (PRIORITY 1)

### FIX 5: Correct TAM Penetration Scoring

**File:** `services/scoring/multiBaggerScore.ts`
**Lines:** 97-107
**Severity:** HIGH - <1% penetration should NOT score higher than 1-5%

**Current Problem:**
```typescript
case '<1%': tamScore = 6;   // Too high for execution risk
case '1-5%': tamScore = 10; // Sweet spot
```

**Required Fix:**
```typescript
// A3. TAM Penetration (10 pts)
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

// Add warning for <1% penetration
if (data.tamPenetration === '<1%') {
    details.push('WARNING: <1% TAM penetration = high execution risk');
}
```

---

### FIX 6: Implement Dynamic CAGR for Recent IPOs

**File:** `services/scoring/multiBaggerScore.ts` and `services/scoring/quantScore.ts`
**Severity:** HIGH - Current logic filters out fresh IPOs

**Current Problem:**
```typescript
if (history.length >= 5) { // Need at least 5 quarters
    // ...calculate CAGR over 3 years max
}
// Companies with < 5 quarters get 0 CAGR score
```

**Required Fix:**
```typescript
// A1. Revenue CAGR - Dynamic based on available history
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

// Usage in scoreGrowthAndTAM:
const cagrResult = calculateDynamicCAGR(history);
let cagrScore = 0;
if (cagrResult.cagr >= 40) cagrScore = 15;
else if (cagrResult.cagr >= 25) cagrScore = 12;
else if (cagrResult.cagr >= 15) cagrScore = 8;
else if (cagrResult.cagr >= 10) cagrScore = 4;

// Apply history penalty
cagrScore = Math.max(0, cagrScore + cagrResult.penalty);

score += cagrScore;
details.push(`Revenue CAGR (~${cagrResult.cagr.toFixed(1)}% over ${cagrResult.yearsUsed}yr${cagrResult.isPartial ? ' [PARTIAL]' : ''}): +${cagrScore}/15`);
```

---

### FIX 7: Fix PSG Growth Bias with Sector Percentile

**File:** `services/scoring/multiBaggerScore.ts`
**Lines:** 207-232
**Severity:** MEDIUM - Creates "growth at any price" bias

**Current Problem:**
```typescript
if (psg < 0.5) psgScore = 5;  // P/S 10 with 20% growth = 0.5 = Full points!
```

**Required Fix:**
```typescript
// D1. PSG Ratio with Growth Floor
// Prevent "growth at any price" by requiring minimum quality

function scorePSG(psRatio: number, growthRate: number): { score: number; detail: string } {
    // Guard: If growth is very low, PSG becomes meaningless
    if (growthRate < 5) {
        return { score: 0, detail: 'PSG N/A: Growth < 5%' };
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
```

---

### FIX 8: Improve Founder Detection

**File:** `services/utils/founderDetection.ts`
**Severity:** MEDIUM - Current regex misses many founders

**Current Problem:**
Simple regex matching on description text. Misses founders if company description doesn't explicitly say "founded by".

**Required Fix:**
```typescript
interface FounderCheckResult {
    isFounder: boolean;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
}

// Known founder-led companies (manual override for accuracy)
const KNOWN_FOUNDER_LED: Record<string, string> = {
    'TSLA': 'Elon Musk',
    'NVDA': 'Jensen Huang',
    'META': 'Mark Zuckerberg',
    'AMZN': 'Andy Jassy (Bezos successor)',
    'NFLX': 'Reed Hastings',
    'CRM': 'Marc Benioff',
    'SHOP': 'Tobi Lutke',
    'SQ': 'Jack Dorsey',
    'PLTR': 'Alex Karp',
    'ZM': 'Eric Yuan',
    'DDOG': 'Olivier Pomel',
    'CRWD': 'George Kurtz',
    'ZS': 'Jay Chaudhry',
    'SNOW': 'Frank Slootman (Operator CEO)',
    'RKLB': 'Peter Beck',
};

export function detectFounderStatus(
    ceoName: string | null,
    companyName: string,
    description: string,
    companyAgeYears: number,
    ticker?: string
): FounderCheckResult {

    // 1. Check manual override list first
    if (ticker && KNOWN_FOUNDER_LED[ticker]) {
        return {
            isFounder: true,
            reason: `Known founder-led: ${KNOWN_FOUNDER_LED[ticker]}`,
            confidence: 'high'
        };
    }

    // 2. Check description for founder signals
    const descLower = (description || '').toLowerCase();
    const ceoLower = (ceoName || '').toLowerCase();

    const founderPatterns = [
        /founded by/i,
        /co-founded by/i,
        /founder and ceo/i,
        /founder,? ceo/i,
        /founding team/i,
        new RegExp(`${ceoLower}.*founded`, 'i'),
        new RegExp(`founded.*${ceoLower}`, 'i'),
    ];

    for (const pattern of founderPatterns) {
        if (pattern.test(descLower)) {
            return {
                isFounder: true,
                reason: `Description mentions founder: "${ceoName}"`,
                confidence: 'medium'
            };
        }
    }

    // 3. Heuristic: Young company + CEO name in company name
    if (companyAgeYears <= 15 && ceoName) {
        const nameParts = ceoName.toLowerCase().split(' ');
        const companyLower = companyName.toLowerCase();

        if (nameParts.some(part => part.length > 3 && companyLower.includes(part))) {
            return {
                isFounder: true,
                reason: `CEO name "${ceoName}" appears in company name`,
                confidence: 'medium'
            };
        }
    }

    // 4. Age heuristic: Very young company likely still founder-led
    if (companyAgeYears <= 5) {
        return {
            isFounder: true,
            reason: `Company age ${companyAgeYears} years (likely founder-led)`,
            confidence: 'low'
        };
    }

    return {
        isFounder: false,
        reason: 'No founder signals detected',
        confidence: 'medium'
    };
}
```

---

## MEDIUM PRIORITY FIXES (PRIORITY 2)

### FIX 9: Centralize Magic Numbers

**File:** `config/scoringThresholds.ts`
**Severity:** MEDIUM - Scattered constants make regime changes difficult

**Required Fix:**
Create a comprehensive config file:

```typescript
// config/scoringThresholds.ts

export const SCORING_CONFIG = {
    // Tier Thresholds
    tiers: {
        TIER_1: 85,
        TIER_2: 65,
        TIER_3: 50,
        NOT_INTERESTING: 0
    },

    // Growth Pillar (35 pts)
    growth: {
        cagr: {
            EXCEPTIONAL: { threshold: 40, points: 15 },
            HIGH: { threshold: 25, points: 12 },
            MODERATE: { threshold: 15, points: 8 },
            LOW: { threshold: 10, points: 4 },
        },
        acceleration: {
            ACCELERATING: 10,
            STABLE: 5,
            DECELERATING: 0
        }
    },

    // Unit Economics Pillar (25 pts)
    economics: {
        grossMargin: {
            TOP_TIER: 10,
            MID_TIER: 5,
            LOW_TIER: 0
        },
        roic: {
            EXCELLENT: { threshold: 15, points: 5 },
            GOOD: { threshold: 8, points: 3 },
        }
    },

    // Risk Thresholds
    risk: {
        beneish: {
            FRAUD_LIKELY: -1.78,
            EXTREME_RISK: -0.5
        },
        altman: {
            SAFE: 2.99,
            GREY_ZONE: 1.81,
            DISTRESS: 0
        },
        dilution: {
            EXTREME: 300,
            HIGH: 25,
            MODERATE: 10
        },
        cashRunway: {
            CRITICAL: 1,
            WARNING: 4
        }
    },

    // AI Integration
    ai: {
        STRONG_PASS_MAX_BOOST: 12,
        SOFT_PASS_MAX_BOOST: 8,
        MONITOR_PENALTY: -5,
        AVOID_PENALTY: -10,
        TOTAL_PENALTY_CAP: -20
    },

    // Bonus Caps
    bonuses: {
        CAPITAL_EFFICIENCY: 8,
        SAAS_COMPOUNDER: 10,
        QUALITY_GROWTH: 5,
        MAX_TOTAL_BONUS: 10  // Only highest applies
    },

    // Technical Analysis
    technicals: {
        relativeStrength: {
            CRUSHING: { threshold: 20, points: 10 },
            STRONG: { threshold: 5, points: 7 },
            MATCHING: { threshold: 0, points: 3 },
            LAGGING: { threshold: -10, points: 1 },
        }
    }
};

// Sector-specific overrides
export const SECTOR_THRESHOLDS: Record<string, object> = {
    SaaS: {
        grossMarginTop: 75,
        grossMarginMid: 60,
        roicTop: 20,
        roicMid: 12,
    },
    Biotech: {
        grossMarginTop: 85,
        grossMarginMid: 70,
        cashRunwayMinQuarters: 8,
    },
    Hardware: {
        grossMarginTop: 45,
        grossMarginMid: 30,
        roicTop: 15,
        roicMid: 8,
    },
    // ... etc
};
```

---

### FIX 10: Add Insider Ownership Data

**File:** `services/analyzer.ts` and `services/api/fmp.ts`
**Severity:** MEDIUM - Currently hardcoded to 0

**Required Fix:**

1. **Add FMP endpoint for institutional holders:**
```typescript
// services/api/fmp.ts
export async function getInstitutionalOwnership(ticker: string): Promise<{
    institutionalOwnership: number;
    insiderOwnership: number;
    topHolders: { name: string; shares: number; change: number }[];
}> {
    const url = `${FMP_BASE_URL}/institutional-holder/${ticker}?apikey=${FMP_API_KEY}`;
    const response = await fetchWithRetry(url);

    // Parse and calculate percentages
    // Return structured data
}
```

2. **Update analyzer.ts to use real data:**
```typescript
// In analyzeStock, add to Promise.allSettled:
const institutionalResult = await fmp.getInstitutionalOwnership(ticker);

// Use in fundamentalData:
insiderOwnershipPct: institutionalResult?.insiderOwnership || 0,
institutionalOwnershipPct: institutionalResult?.institutionalOwnership || 50,
```

---

## VALIDATION REQUIREMENTS

After implementing all fixes, run the **Golden Test Set** and verify:

| Ticker | Expected Tier | Key Check |
|--------|---------------|-----------|
| NVDA | Tier 1 | Should pass with TRUE Relative Strength |
| TSLA | Tier 1/2 | Founder detection should work |
| WKHS | Disqualified | M-Score should flag it (not just dilution) |
| RIDE | Disqualified | Quality of Earnings should fail |
| ASTS | Tier 3 | Dynamic CAGR should work (recent IPO) |
| IBM | Not Interesting | Should NOT get AI boost to higher tier |
| DDOG | Tier 1/2 | SaaS bonus should apply (capped at +10) |

---

## IMPLEMENTATION ORDER

1. **Week 1:** FIX 1 (M-Score) + FIX 2 (Relative Strength) - Foundation
2. **Week 2:** FIX 3 (AI Caps) + FIX 4 (Bonus Stacking) - Score Calibration
3. **Week 3:** FIX 5-8 (TAM, CAGR, PSG, Founder) - Accuracy
4. **Week 4:** FIX 9-10 (Config, Insider Data) + Validation

---

## SUCCESS CRITERIA

- [ ] Beneish M-Score uses all 8 real variables (no hardcoded 1.0)
- [ ] Relative Strength compares to SPY/QQQ, not absolute returns
- [ ] AI contribution capped at ±12 points
- [ ] Bonus stacking eliminated (single highest bonus applies)
- [ ] TAM <1% scores lower than 1-5% (execution risk)
- [ ] Dynamic CAGR works for IPOs with 1-2 years history
- [ ] Golden test set passes with correct tier assignments
- [ ] All magic numbers moved to centralized config

---

**END OF PROMPT**
