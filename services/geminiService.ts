// import { GoogleGenAI } from "@google/genai";
import { getQuote as getFmpQuote } from "./api/fmp";
import { getQuote as getFinnhubQuote } from "./api/finnhub";
import { analyzeStock } from "./analyzer";
import { AnalysisResult, StockQuote, MultiBaggerAnalysis } from "../types";
import { parseJSON, safeGenerateContent } from "./ai/gemini";
import { generateOllamaResponse } from "./ai/ollama";

// Initialize Gemini Client for Chat operations
// const apiKey = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GEMINI_API_KEY : undefined) || process.env.VITE_GEMINI_API_KEY;
// const ai = new GoogleGenAI({ apiKey });

const dataReqs = `
DATA EXTRACTION RULES (INSTITUTIONAL GRADE):

=== PRICE & SIZE ===
1. Current Share Price (last 3 trading days)
2. Market Capitalization (e.g., "$45.2B")
3. 52-Week High and Low
4. Price vs 200-Day SMA (isUptrend: true/false)

=== GROWTH DYNAMICS (CRITICAL FOR MULTIBAGGERS) ===
5. Revenue Growth % - LAST 3 QUARTERS (YoY for each):
   - revenueGrowthQ1: Most recent quarter YoY %
   - revenueGrowthQ2: Previous quarter YoY %
   - revenueGrowthQ3: Two quarters ago YoY %
6. Classify growthAcceleration: "Accelerating" if Q1 > Q2 > Q3, "Decelerating" if Q1 < Q2 < Q3, else "Stable"

=== SAAS METRICS (If Software/SaaS company) ===
7. Dollar-Based Net Retention (DBNR or NRR) - e.g., 125 for 125%
8. Annual Recurring Revenue (ARR) in $M
9. Remaining Performance Obligations (RPO) in $M and YoY growth %
10. Rule of 40 Score = Revenue Growth % + FCF Margin %

=== VALUATION (MULTIPLE ANGLES) ===
11. Forward P/E (NTM)
12. Forward PEG Ratio
13. EV/EBITDA (Forward)
14. EV/Sales (Forward)
15. EV/Gross Profit (evGpRatio) - Critical for SaaS
16. P/E Percentile vs 5-Year Range (0-100, where 0 = cheapest historically)
17. EV/Sales Percentile vs 5-Year Range (0-100)

=== PROFITABILITY & QUALITY ===
18. Gross Margin %
19. Operating Margin %
20. ROIC % (Return on Invested Capital)
21. Free Cash Flow Conversion (FCF / Net Income)
22. Accruals Ratio: (Net Income - Operating Cash Flow) / Total Assets
23. Piotroski F-Score (0-9)

=== BALANCE SHEET & RISK ===
24. Debt/EBITDA
25. Interest Coverage Ratio
26. Altman Z-Score (if available)
27. Current Ratio

=== DILUTION ANALYSIS (CRITICAL) ===
28. 3-Year Share Count CAGR % (shareCountGrowth3Y) - Negative = buybacks
29. Stock-Based Compensation as % of Revenue (sbcAsPercentRevenue)
30. Capital Efficiency Ratio: (Net New ARR / Cash Burned) - for growth companies

=== MARKET POSITION ===
31. Total Addressable Market (TAM) estimate in $B
32. Current Market Share %
33. TAM Penetration = (Annual Revenue / TAM) * 100

=== OWNERSHIP & SENTIMENT ===
34. Insider Ownership %
35. Recent Insider Activity: "Cluster Buying", "Cluster Selling", "Mixed", "None"
36. Institutional Ownership %
37. 13F Filing Change (QoQ change in institutional ownership %)
38. Short Interest %
39. EPS Revision Trend: "Up", "Down", "Mixed"
40. Analyst Count and Average Price Target
41. Price Target Upside % = (Avg PT - Current Price) / Current Price * 100

=== MOAT ANALYSIS (QUANTIFY SOURCES) ===
42. Moat Classification: Must start with "Wide", "Narrow", or "None"
43. Moat Sources (rate each 0-3):
    - Network Effects strength (0-3)
    - Switching Costs strength (0-2)
    - Intangible Assets/IP strength (0-2)
    - Cost Advantages (0-2)
    - Efficient Scale (0-1)

=== CYCLICAL ANALYSIS ===
44. For Cyclical sectors: Cycle Position = "Early", "Mid", "Peak", "Late", "Trough"
45. Sector relative performance vs S&P 500 (3-month)

OUTPUT JSON SCHEMA:
{
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "sector": "Technology",
  "businessModel": "Hardware + Services",
  "marketCap": "$2.8T",
  "price": 185.50,
  "isUptrend": true,
  "metrics": {
    "peRatio": 28.5,
    "pegRatio": 2.1,
    "evToEbitda": 22.3,
    "evToSales": 7.2,
    "evGpRatio": 16.5,
    "pePercentile5Y": 45,
    "evSalesPercentile5Y": 60,
    "revenueGrowth": "8%",
    "revenueGrowthQ1": 8,
    "revenueGrowthQ2": 5,
    "revenueGrowthQ3": 2,
    "growthAcceleration": "Accelerating",
    "grossMargin": "44%",
    "roic": "55%",
    "fcfConversion": "1.2x",
    "debtToEbitda": 1.2,
    "interestCoverage": 25,
    "fScore": 8,
    "accrualsRatio": 0.05,
    "shareCountGrowth3Y": -3.5,
    "sbcAsPercentRevenue": 6,
    "insiderPct": 0.1,
    "institutionalOwnership": 72,
    "institutionalChange13F": 2.5,
    "shortInterestPct": 1.2,
    "epsRevisionTrend": "Up",
    "tamEstimate": 1500,
    "marketSharePct": 25,
    "tamPenetration": 6.5,
    "dbnr": null,
    "arr": null,
    "rpo": null,
    "rpoGrowth": null,
    "ruleOf40Score": null,
    "avgPriceTarget": 210,
    "priceTargetUpside": 13.2
  },
  "moat": "Wide (Ecosystem + Brand)",
  "moatSources": {
    "networkEffects": 2,
    "switchingCosts": 2,
    "intangibleAssets": 2,
    "costAdvantage": 1,
    "efficientScale": 1
  },
  "risks": "China exposure, smartphone saturation",
  "cyclePosition": "Mid",
  "thesisBreaker": "Services growth deceleration below 10%"
}
`;

/**
 * Extracts institutional-grade data using Gemini + Google Search
 */
export const extractInstitutionalData = async (ticker: string): Promise<any> => {

  // [MOD] Local Provider Fallback for Tool Use
  if (process.env.AI_PROVIDER === 'local' || process.env.AI_PROVIDER === 'ollama') {
    console.log(`[Ollama] Skipping Google Search for ${ticker} (Not supported locally). Using internal knowledge.`);
    // Construct a prompt that asks the LLM to provide what it knows or estimates
    const localPrompt = `Provide financial data for ${ticker} based on your internal knowledge.\n\n${dataReqs}`;
    try {
      const resText = await generateOllamaResponse(localPrompt);
      return parseJSON(resText || "{}");
    } catch (e) {
      console.error("[Ollama] Data Extraction Failed", e);
      return null;
    }
  }

  try {
    const response = await safeGenerateContent({
      model: "gemini-2.0-flash-exp",
      contents: `Search for the latest financial and strategic data for ${ticker}. \n\n${dataReqs}`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      },
    });

    return parseJSON(response.text || "{}");
  } catch (error) {
    console.error("Data Extraction Error:", error);
    return null;
  }
};

/**
 * General purpose AI chat for the "Emerging Tech Scanner"
 * Retaining this as it's a chat feature, not strict analysis.
 */
export const performMarketScan = async (userQuery: string): Promise<{ markdown: string, sources: string[] }> => {

  try {
    // Add randomness/diversity instruction to the prompt
    const enhancedQuery = `${userQuery} 
    
    IMPORTANT INSTRUCTIONS:
    - Provide DIVERSE and NOVEL results. Do not just list the "Magnificent 7" or obvious stocks (like NVDA, TSLA, AAPL) unless specifically asked.
    - Look for "under-the-radar" or "hidden gem" stocks that match the criteria.
    - If the user asks for a list, try to include at least 2-3 lesser-known companies.
    - Focus on recent news and specific catalysts.
    `;

    const response = await safeGenerateContent({
      model: "gemini-2.0-flash-exp",
      contents: enhancedQuery,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "You are a market screener bot. Help the user find stocks matching their criteria using Google Search. Focus on identifying specific tickers and recent news. Prioritize finding new, undiscovered, or less obvious stocks to ensure variety in the portfolio.",
      },
    });

    return {
      markdown: response.text || "No results found.",
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((c: any) => c.web?.uri).filter((u: any) => u) || []
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { markdown: "Error performing scan.", sources: [] };
  }
};

/**
 * Fetches real-time stock data.
 * Updated to prefer Massive/Finnhub for quotes since FMP is restricted.
 */
export const getRealTimeQuote = async (ticker: string): Promise<StockQuote | null> => {

  // Try Finnhub second
  const finnhubQuote = await getFinnhubQuote(ticker);
  if (finnhubQuote) return finnhubQuote;

  // Fallback to FMP (which might fail or return null)
  const fmpQuote = await getFmpQuote(ticker);
  if (fmpQuote) return fmpQuote;

  return null;
};

/**
 * Deprecated: Use analyzeStock from analyzer.ts instead.
 * Kept for reference but redirecting logic.
 */
export const analyzeMultiBaggerPotential = async (ticker: string): Promise<MultiBaggerAnalysis | null> => {
  return await analyzeStock(ticker);
};

export type { AnalysisResult, StockQuote, MultiBaggerAnalysis };