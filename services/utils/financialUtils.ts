
type Statement = {
    date?: string;
    [key: string]: any;
};

/**
 * Calculates Trailing Twelve Months (TTM) sum for a given key from a list of quarterly statements.
 * Sorts by date (newest first) and sums the latest 4 quarters.
 */
export function calcTTM(
    statements: any[] | undefined,
    key: string,
    maxQuarters = 4
): number | null {
    if (!statements || statements.length === 0) return null;

    // Sort newest first
    const sorted = [...statements].sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
    });

    const slice = sorted.slice(0, maxQuarters);

    // If we have fewer than 4 quarters, should we return null or partial sum?
    // Usually for TTM we want 4 quarters. If we have less, it's not a full year.
    // But for young companies we might want what we have. 
    // The prompt implies just summing what we have in the slice.

    const total = slice.reduce((sum, s) => {
        const raw = s[key];
        const val = typeof raw === "number" ? raw : Number(raw ?? 0);
        return sum + (isNaN(val) ? 0 : val);
    }, 0);

    return total;
}

/**
 * Calculates growth metrics (CAGR, YoY) from income statements
 */
export function calculateGrowthMetrics(
    statements: any[] | undefined
): { cagr3y: number; lastYearGrowth: number; revenueGrowth: number } {
    if (!statements || statements.length < 5) {
        return { cagr3y: 0, lastYearGrowth: 0, revenueGrowth: 0 };
    }

    const currentRevenue = statements[0]?.revenue || 0;
    const prevRevenue = statements[4]?.revenue || 0; // YoY (4 quarters ago)
    const threeYearAgoRevenue = statements[12]?.revenue || 0; // 3 years ago

    let cagr3y = 0;
    if (threeYearAgoRevenue > 0 && currentRevenue > 0) {
        cagr3y = (Math.pow(currentRevenue / threeYearAgoRevenue, 1 / 3) - 1) * 100;
    }

    let lastYearGrowth = 0;
    let revenueGrowth = 0; // Usually same as lastYearGrowth in this context (TTM vs TTM-1)

    // TTM Calculation for growth
    const currentTTM = calcTTM(statements, 'revenue', 4) || 0;
    const prevTTM = calcTTM(statements.slice(4), 'revenue', 4) || 0;

    if (prevTTM > 0) {
        lastYearGrowth = (currentTTM - prevTTM) / prevTTM;
        revenueGrowth = lastYearGrowth;
    }

    return { cagr3y, lastYearGrowth, revenueGrowth };
}

/**
 * Calculates Gross Margin (TTM)
 */
export function calculateGrossMargin(
    statements: any[] | undefined,
    sector?: string
): number {
    const grossProfitTTM = calcTTM(statements, 'grossProfit', 4);
    const revenueTTM = calcTTM(statements, 'revenue', 4);

    if (revenueTTM && revenueTTM > 0 && grossProfitTTM != null) {
        return (grossProfitTTM / revenueTTM) * 100;
    }
    return 0;
}

/**
 * Calculates Net Debt / EBITDA Ratio
 * Formula: (Total Debt - Cash & Equivalents) / EBITDA (TTM)
 * Returns null if EBITDA is <= 0 or data missing.
 */
export function calculateNetDebtEbitda(
    balanceSheets: any[] | undefined,
    incomeStatements: any[] | undefined
): number | null {
    if (!balanceSheets?.length || !incomeStatements?.length) return null;

    const latestBS = balanceSheets[0];
    const totalDebt = (latestBS.longTermDebt || 0) + (latestBS.shortTermDebt || 0);
    const cash = (latestBS.cashAndCashEquivalents || 0) + (latestBS.shortTermInvestments || 0);
    const netDebt = totalDebt - cash;

    const ebitdaTTM = calcTTM(incomeStatements, 'ebitda', 4);

    if (ebitdaTTM && ebitdaTTM > 0) {
        return netDebt / ebitdaTTM;
    }
    return null;
}

/**
 * Calculates R&D Intensity (R&D / Revenue)
 * Returns percentage (0-100)
 */
export function calculateRndIntensity(
    incomeStatements: any[] | undefined
): number {
    const rndTTM = calcTTM(incomeStatements, 'researchAndDevelopmentExpenses', 4);
    const revTTM = calcTTM(incomeStatements, 'revenue', 4);

    if (revTTM && revTTM > 0 && rndTTM != null) {
        return (rndTTM / revTTM) * 100;
    }
    return 0;
}
