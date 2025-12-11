/**
 * Centralized Strategy Configuration
 * 
 * Defines all thresholds for Scoring, Risk, and Valuation.
 * Allows for easy tuning in different market regimes.
 */

export const STRATEGY = {
    // QUANTITATIVE SCORE
    GROWTH: {
        CAGR_ELITE: 30, // %
        CAGR_HIGH: 20,
        CAGR_MODERATE: 15,
        MIN_YEARS_HISTORY: 3,
        DYNAMIC_CAGR_MIN_QUARTERS: 5
    },
    QUALITY: {
        GM_SOFTWARE_ELITE: 70, // %
        GM_HARDWARE_ELITE: 40,
        GM_THRESHOLD_FACTOR_HIGH: 0.8, // 80% of elite
        GM_THRESHOLD_FACTOR_MODERATE: 0.6
    },
    RULE_OF_40: {
        ELITE: 50,
        HIGH: 40,
        MODERATE: 30,
        ACCEPTABLE: 20
    },
    VALUATION: {
        PEG_CHEAP: 0.5,
        PEG_ATTRACTIVE: 1.0,
        PEG_FAIR: 1.5,
        PEG_FULL: 2.0,
        PEG_EXPENSIVE: 3.0,

        PSG_CHEAP: 0.3, // Ratio of P/S to Growth
        PSG_ATTRACTIVE: 0.6,
        PSG_FAIR: 1.0,
        PSG_EXPENSIVE: 1.5,

        PS_SAFETY_Valve: 50 // If P/S > 50, auto-penalty
    },

    // RISK FLAGS
    RISK: {
        BENEISH_M_SCORE_THRESHOLD: -1.78, // > -1.78 is High Probability of Manipulation
        ALTMAN_Z_DISTRESS: 1.81,
        ALTMAN_Z_GREY: 2.99,

        MIN_CASH_RUNWAY_QUARTERS: 4,
        MAX_DILUTION_RATE: 5 // % per year
    },

    // TECHNICALS
    TECHNICAL: {
        RS_ALPHA_ELITE: 20, // % Outperformance vs Benchmark
        RS_ALPHA_HIGH: 5,
        RS_ALPHA_POSITIVE: 0,
        RS_ALPHA_DRAG: -10
    }
};
