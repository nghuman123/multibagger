import { GoogleGenAI } from "@google/genai";
import { getQuote as getFmpQuote } from "./api/fmp";
import { getQuote as getFinnhubQuote } from "./api/finnhub";
import { getQuote as getMassiveQuote } from "./api/massive";
import { analyzeStock } from "./analyzer";
import { AnalysisResult, StockQuote, MultiBaggerAnalysis } from "../types";

// Initialize Gemini Client for Chat operations
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

/**
 * General purpose AI chat for the "Emerging Tech Scanner"
 * Retaining this as it's a chat feature, not strict analysis.
 */
export const performMarketScan = async (userQuery: string): Promise<AnalysisResult> => {
  if (!import.meta.env.VITE_GEMINI_API_KEY) return { markdown: "API Key Missing", sources: [] };

  try {
    // Add randomness/diversity instruction to the prompt
    const enhancedQuery = `${userQuery} 
    
    IMPORTANT INSTRUCTIONS:
    - Provide DIVERSE and NOVEL results. Do not just list the "Magnificent 7" or obvious stocks (like NVDA, TSLA, AAPL) unless specifically asked.
    - Look for "under-the-radar" or "hidden gem" stocks that match the criteria.
    - If the user asks for a list, try to include at least 2-3 lesser-known companies.
    - Focus on recent news and specific catalysts.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
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
  // Try Massive first (if key exists)
  const massiveQuote = await getMassiveQuote(ticker);
  if (massiveQuote) return massiveQuote;

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