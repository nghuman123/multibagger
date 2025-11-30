/**
 * Gemini AI Module
 * ONLY used for qualitative analysis that requires NLP:
 * - Visionary CEO scoring
 * - Catalyst extraction
 * - Sentiment analysis
 * - Pattern matching explanation
 * - Financial Data Estimation (Fallback)
 */

import { GoogleGenAI } from "@google/genai";
import type { VisionaryAnalysis, PatternMatch, SectorType } from '../../types';

// Initialize safely to prevent crash if API key is missing
let ai: any;
try {
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'dummy_key' });
} catch (e) {
  console.warn("Gemini AI initialization failed:", e);
}

// ============ VISIONARY ANALYSIS ============

export const analyzeVisionaryLeadership = async (
  ticker: string,
  ceoName: string
): Promise<VisionaryAnalysis> => {
  
  const prompt = `
    Analyze the leadership communication style for ${ticker} (CEO: ${ceoName}).
    
    Search for: CEO letters to shareholders, earnings call transcripts, investor presentations, interviews.
    
    Using the "Bezos Test" framework, score each dimension 1-10:
    
    1. **Long-Term Orientation**: Does leadership use "years/decades" or "quarters/guidance"?
    2. **Customer Obsession**: Focus on customers vs competitors?
    3. **Innovation Focus**: R&D emphasis, new product vision?
    4. **Capital Allocation Clarity**: Clear philosophy on reinvestment vs dividends/buybacks?
    
    Return ONLY valid JSON:
    {
      "longTermScore": number,
      "customerScore": number,
      "innovationScore": number,
      "capitalScore": number,
      "totalVisionaryScore": number,
      "ceoName": "${ceoName}",
      "explanation": "Brief summary of findings"
    }
  `;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "You are analyzing CEO communication patterns. Be objective and data-driven. Return only JSON.",
      },
    });
    
    const text = response.text || "{}";
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Visionary Analysis Error:", error);
    return {
      longTermScore: 5,
      customerScore: 5,
      innovationScore: 5,
      capitalScore: 5,
      totalVisionaryScore: 5,
      ceoName,
      explanation: "Analysis unavailable"
    };
  }
};

// ============ CATALYST EXTRACTION ============

export const extractCatalysts = async (ticker: string): Promise<string[]> => {
  const prompt = `
    Find specific upcoming catalysts for ${ticker} stock in the next 12 months.
    
    Search for:
    - Earnings dates
    - FDA approval dates (PDUFA)
    - Product launch dates
    - Contract announcements
    - Conference presentations
    - Regulatory decisions
    
    Return ONLY a JSON array of strings with specific dates where possible:
    ["Q4 2024 Earnings: Jan 28, 2025", "FDA PDUFA Date: March 15, 2025", ...]
    
    If no catalysts found, return: ["No specific catalysts identified"]
  `;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    
    const text = response.text || "[]";
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Catalyst Extraction Error:", error);
    return ["Catalyst data unavailable"];
  }
};

// ============ PATTERN MATCHING ============

export const findHistoricalPattern = async (
  ticker: string,
  sector: SectorType,
  marketCap: number,
  revenueGrowth: number,
  grossMargin: number
): Promise<PatternMatch> => {
  
  const prompt = `
    Compare ${ticker} to historical 100-baggers at a similar stage.
    
    Current Profile:
    - Sector: ${sector}
    - Market Cap: $${(marketCap / 1e9).toFixed(1)}B
    - Revenue Growth: ${revenueGrowth.toFixed(1)}%
    - Gross Margin: ${grossMargin.toFixed(1)}%
    
    Historical comparisons to consider:
    - Amazon (2001): E-commerce, negative earnings, massive TAM
    - Tesla (2012): Hardware with software margins, visionary CEO
    - Apple (2003): Product pivot, ecosystem building
    - Monster Beverage (2005): Consumer, high margins, niche dominance
    - Nvidia (2016): AI/GPU infrastructure
    
    Return ONLY valid JSON:
    {
      "similarTo": "Company Name (Year)",
      "matchScore": number 0-100,
      "keyParallels": ["parallel 1", "parallel 2"],
      "keyDifferences": ["difference 1", "difference 2"]
    }
  `;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    
    const text = response.text || "{}";
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Pattern Match Error:", error);
    return {
      similarTo: "Unknown",
      matchScore: 0,
      keyParallels: [],
      keyDifferences: []
    };
  }
};

// ============ MOAT & THESIS ============

export const analyzeMoatAndThesis = async (
  ticker: string,
  companyDescription: string
): Promise<{ moat: 'Wide' | 'Narrow' | 'None'; thesis: string; risks: string[] }> => {
  
  const prompt = `
    Analyze the economic moat and investment thesis for ${ticker}.
    
    Company: ${companyDescription.substring(0, 500)}
    
    Search for recent information about:
    1. Competitive advantages (network effects, switching costs, patents, brand)
    2. Pricing power evidence
    3. Key risks and threats
    
    Return ONLY valid JSON:
    {
      "moat": "Wide" | "Narrow" | "None",
      "thesis": "2-3 sentence growth thesis",
      "risks": ["risk 1", "risk 2", "risk 3"]
    }
  `;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    
    const text = response.text || "{}";
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Moat Analysis Error:", error);
    return {
      moat: 'None',
      thesis: "Analysis unavailable",
      risks: ["Unknown risks"]
    };
  }
};

// ============ FINANCIAL ESTIMATION (FALLBACK) ============

export const getFinancialEstimates = async (ticker: string): Promise<{
  revenueGrowth3Y: number;
  grossMargin: number;
  operatingMargin: number;
  returnOnEquity: number;
}> => {
  const prompt = `
    Search for the latest financial metrics for ${ticker} stock.
    I need estimates for:
    1. 3-Year Revenue CAGR (Growth Rate)
    2. Gross Margin %
    3. Operating Margin %
    4. Return on Equity (ROE) %
    
    Return ONLY valid JSON with numeric values (no % signs):
    {
      "revenueGrowth3Y": number,
      "grossMargin": number,
      "operatingMargin": number,
      "returnOnEquity": number
    }
    
    If data is unavailable, use 0.
  `;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    
    const text = response.text || "{}";
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Financial Estimation Error:", error);
    return {
      revenueGrowth3Y: 0,
      grossMargin: 0,
      operatingMargin: 0,
      returnOnEquity: 0
    };
  }
};
