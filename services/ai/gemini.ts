import { GoogleGenAI } from "@google/genai";
import type { VisionaryAnalysis, PatternMatch, SectorType, MoatThesisAnalysis, AntigravityResult } from '../../types';
import { ANTIGRAVITY_SYSTEM_PROMPT } from './prompts/antigravityPrompt';
import { generateOllamaResponse } from './ollama';
import JSON5 from 'json5';

// --- CONFIGURATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
// Only warn if we are NOT in local mode
if (!GEMINI_API_KEY && process.env.AI_PROVIDER !== 'local') console.warn("GEMINI_API_KEY is not set");

// [CRITICAL FIX] Use specific stable model version, not 'latest'
const GEMINI_MODEL = "gemini-2.0-flash-exp";

let ai: any;
if (GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  } catch (e) {
    console.warn("Gemini AI initialization failed:", e);
  }
}

// --- RATE LIMITING & RETRY ---
const RATE_LIMIT_DELAY = 6000; // 6 seconds min between requests (10 RPM = 1 req/6s)
let lastRequestTime = 0;
const requestQueue: (() => Promise<void>)[] = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    const task = requestQueue.shift();
    if (task) {
      const now = Date.now();
      const timeSinceLast = now - lastRequestTime;
      const wait = Math.max(0, RATE_LIMIT_DELAY - timeSinceLast);

      if (wait > 0) {
        await new Promise(r => setTimeout(r, wait));
      }

      try {
        await task();
      } catch (e) {
        console.error("Queue task error", e);
      }
      lastRequestTime = Date.now();
    }
  }
  isProcessingQueue = false;
}

export const safeGenerateContent = async (params: any, retries = 3): Promise<any> => {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      // [MOD] OLLAMA SWITCH
      // If provider is 'ollama' OR 'local', AND we are not using tools (search)
      const useLocal = (process.env.AI_PROVIDER === 'ollama' || process.env.AI_PROVIDER === 'local');
      const hasTools = params.config?.tools && params.config.tools.length > 0;

      if (useLocal && !hasTools) {
        try {
          const systemInstruction = params.systemInstruction || "";
          // Gemini 'contents' format: [{ role: 'user', parts: [{ text: ... }] }]
          const userContent = params.contents?.[0]?.parts?.map((p: any) => p.text).join('\n') || "";

          const ollamaText = await generateOllamaResponse(userContent, systemInstruction);

          // Mock Gemini Response Structure
          resolve({
            text: ollamaText,
            candidates: [{ content: { parts: [{ text: ollamaText }] } }]
          });
          return;
        } catch (localErr) {
          console.error("[SafeGenerate] Local AI Failed, falling back to Gemini if possible:", localErr);
          // If local fails and we have no API key, we must fail here
          if (!process.env.GEMINI_API_KEY) {
            reject(localErr);
            return;
          }
        }
      }

      try {
        let attempt = 0;
        while (attempt < retries) {
          try {
            // Validate AI instance
            if (!ai) throw new Error("AI Client not initialized");

            const result = await ai.models.generateContent(params);

            // Check if we need to call .text()
            let textVal = "";
            if (typeof result.response?.text === 'function') {
              textVal = result.response.text();
            } else {
              textVal = JSON.stringify(result); // Fallback
            }

            // We return an object that HAS .text property for compatibility with our Ollama mock
            resolve({
              text: textVal,
              original: result
            });
            return;
          } catch (error: any) {
            // Check for 429
            if (error.status === 429 || (error.message && error.message.includes('429'))) {
              console.warn(`[AI] Rate Limit 429. Retrying in ${(attempt + 1) * 5}s...`);
              await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
              attempt++;
              continue;
            }
            throw error;
          }
        }
        reject(new Error("Max Retries Exceeded for AI Error"));
      } catch (err) {
        reject(err);
      }
    });
    processQueue();
  });
};

// --- HELPER: Nuclear JSON Parser ---
export function parseJSON<T = any>(raw: string): T | null {
  if (!raw) return null;

  // [DEBUG] Log raw output to catch weird formatting
  console.log("[DEBUG] Raw AI Output (First 100):", raw.substring(0, 100) + "...");

  try {
    // 1. Remove Markdown code blocks entirely (regex handles leading space)
    let text = raw.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');

    // 2. Find the first '{' or '['
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');

    let start = -1;
    let end = -1;
    let isObject = false;

    // Detect if Object or Array
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      start = firstBrace;
      isObject = true;
    } else if (firstBracket !== -1) {
      start = firstBracket;
      isObject = false;
    }

    // 3. Smart Extraction (Bracket Counting)
    // This handles cases like "{...} {...}" by stopping at the first valid closure.
    if (start !== -1) {
      let openCount = 0;
      const openChar = isObject ? '{' : '[';
      const closeChar = isObject ? '}' : ']';

      for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (char === openChar) {
          openCount++;
        } else if (char === closeChar) {
          openCount--;
          if (openCount === 0) {
            end = i;
            break;
          }
        }
      }
    }

    if (start !== -1 && end !== -1) {
      text = text.substring(start, end + 1);
    }

    // [DEBUG] Log cleaned text
    console.log("[DEBUG] Cleaned Text (First 100):", text.substring(0, 100) + "...");
    console.log("[DEBUG] Cleaned Text (Last 20):", text.substring(Math.max(0, text.length - 20)));

    // 4. Try JSON5 parse first (most permissive)
    return JSON5.parse(text) as T;
  } catch (err) {
    console.warn(`[Gemini] JSON5 Parse Failed:`, err);
    console.error(`[Gemini] Final Parse Failed. Raw Preview: ${raw.substring(0, 50)}...`);
    return null;
  }
}

// Config to enforce JSON
const JSON_CONFIG = {
  responseMimeType: "application/json"
};

// Strict JSON System Prompt
const STRICT_JSON_SYSTEM_PROMPT = `
You are a backend analysis engine used only by another program.
The program will CRASH if you do not follow these rules exactly.

Your ONLY job is to return a SINGLE VALID JSON OBJECT that matches the schema you are given.

ABSOLUTE OUTPUT RULES:

1. You MUST return exactly ONE JSON object.
   - No markdown, no prose, no comments.
   - Do NOT wrap the JSON in \`\`\` or \`\`\`json.
   - The first non-whitespace character in your entire reply MUST be "{".
   - The last non-whitespace character in your entire reply MUST be "}".

2. VALID JSON ONLY
   - Use standard JSON.
   - All keys and string values MUST use double quotes.
   - Allowed types: string, number, boolean, null, array, object.
   - Do NOT use NaN, Infinity, -Infinity, or undefined.
   - Do NOT use trailing commas.

3. SCHEMA COMPLIANCE
   - You will be given a schema in text form.
   - You MUST include ALL required keys.
   - Do NOT rename, remove, or add keys.
   - If unsure of a value, still include the key and use null, 0, false, "" or [] as appropriate.
   - Keep text fields concise and factual.
     Do NOT write meta-text like "It is difficult to say" or "As an AI model".

4. BE DECISIVE
   - Never say you "cannot answer" inside a field.
   - Always give your best estimate, even if uncertainty is high.
   - If data is truly insufficient, write "Insufficient data" in the appropriate string field, but STILL return valid JSON.

Reply with ONLY the JSON object and nothing else.
`;

// ============ AI FUNCTIONS ============

export const analyzeVisionaryLeadership = async (ticker: string, ceoName: string): Promise<VisionaryAnalysis & { error?: string }> => {
  const schema = `
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
  const task = `Analyze leadership for ${ticker} (CEO: ${ceoName}). Score 1-10 on Bezos Test dimensions.`;

  try {
    const res = await safeGenerateContent({
      model: GEMINI_MODEL,
      systemInstruction: STRICT_JSON_SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: `TASK: ${task}\n\nSCHEMA:\n${schema}` }] }],
      config: JSON_CONFIG
    });
    const parsed = parseJSON<VisionaryAnalysis>(res.text || "{}");
    return {
      longTermScore: parsed?.longTermScore ?? 5,
      customerScore: parsed?.customerScore ?? 5,
      innovationScore: parsed?.innovationScore ?? 5,
      capitalScore: parsed?.capitalScore ?? 5,
      totalVisionaryScore: parsed?.totalVisionaryScore ?? 5,
      ceoName: parsed?.ceoName || ceoName,
      explanation: parsed?.explanation || "AI Error"
    };
  } catch (e) {
    return {
      longTermScore: 5, customerScore: 5, innovationScore: 5, capitalScore: 5, totalVisionaryScore: 5, ceoName, explanation: "System Error",
      error: "GEMINI_ERROR"
    };
  }
};

export const findHistoricalPattern = async (ticker: string, sector: SectorType, marketCap: number, revenueGrowth: number, grossMargin: number): Promise<PatternMatch & { error?: string }> => {
  const schema = `
    {
      "similarTo": "Company Name (Year)",
      "matchScore": number 0-100,
      "keyParallels": ["parallel 1", "parallel 2"],
      "keyDifferences": ["difference 1", "difference 2"]
    }
  `;
  const task = `Compare ${ticker} (Sector: ${sector}, Cap: $${(marketCap / 1e9).toFixed(1)}B, Growth: ${revenueGrowth}%, GM: ${grossMargin}%) to historical winners.`;

  try {
    const res = await safeGenerateContent({
      model: GEMINI_MODEL,
      systemInstruction: STRICT_JSON_SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: `TASK: ${task}\n\nSCHEMA:\n${schema}` }] }],
      config: JSON_CONFIG
    });
    const parsed = parseJSON<PatternMatch>(res.text || "{}");
    return {
      similarTo: parsed?.similarTo || "None",
      matchScore: parsed?.matchScore ?? 0,
      keyParallels: Array.isArray(parsed?.keyParallels) ? parsed.keyParallels : [],
      keyDifferences: Array.isArray(parsed?.keyDifferences) ? parsed.keyDifferences : []
    };
  } catch (e) {
    return {
      similarTo: "None", matchScore: 0, keyParallels: [], keyDifferences: [],
      error: "GEMINI_ERROR"
    };
  }
};

export const analyzeMoatAndThesis = async (ticker: string, description: string): Promise<MoatThesisAnalysis & { error?: string }> => {
  const schema = `
    {
      "moatScore": number,
      "primaryMoatType": "string",
      "moatDurability": "string",
      "oneLineThesis": "string",
      "bullCase": ["string", "string"],
      "bearCase": ["string", "string"]
    }
  `;
  const task = `Analyze moat for ${ticker}. Score 1-10.`;

  try {
    const res = await safeGenerateContent({
      model: GEMINI_MODEL,
      systemInstruction: STRICT_JSON_SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: `TASK: ${task}\n\nSCHEMA:\n${schema}` }] }],
      config: JSON_CONFIG
    });
    const parsed = parseJSON<MoatThesisAnalysis>(res.text || "{}");
    return {
      moatScore: parsed?.moatScore ?? 0,
      primaryMoatType: parsed?.primaryMoatType || "None",
      moatDurability: parsed?.moatDurability || "None",
      oneLineThesis: parsed?.oneLineThesis || "Error",
      bullCase: Array.isArray(parsed?.bullCase) ? parsed.bullCase : [],
      bearCase: Array.isArray(parsed?.bearCase) ? parsed.bearCase : []
    };
  } catch (e) {
    return {
      moatScore: 0, primaryMoatType: "None", moatDurability: "None", oneLineThesis: "Error", bullCase: [], bearCase: [],
      error: "GEMINI_ERROR"
    };
  }
};

export const extractCatalysts = async (ticker: string): Promise<string[]> => {
  const schema = `["Event 1", "Event 2"]`;
  const task = `Find upcoming catalysts for ${ticker} (Earnings, FDA, Product Launches).`;

  try {
    const res = await safeGenerateContent({
      model: GEMINI_MODEL,
      systemInstruction: STRICT_JSON_SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: `TASK: ${task}\n\nSCHEMA:\n${schema}` }] }],
      config: JSON_CONFIG
    });
    return parseJSON<string[]>(res.text || "[]") || ["No specific catalysts found"];
  } catch (e) { return ["Catalyst data unavailable"]; }
};

export interface QualitativeAnalysis {
  tamPenetration: '1-5%' | '<1%' | '5-10%' | '>10%';
  revenueType: 'Recurring' | 'Consumable' | 'Transactional' | 'One-time' | 'Project-based';
  catalysts: string[];
  catalystDensity: 'High' | 'Medium' | 'Low';
  asymmetryScore: 'High' | 'Medium' | 'Low';
  pricingPower: 'Strong' | 'Neutral' | 'Weak';
  reasoning: string;
}

export const analyzeQualitativeFactors = async (ticker: string, companyName: string, sector: string): Promise<QualitativeAnalysis & { error?: string }> => {
  const schema = `
    {
      "tamPenetration": "1-5%",
      "revenueType": "Recurring",
      "catalysts": ["Catalyst 1", "Catalyst 2"],
      "catalystDensity": "Medium",
      "asymmetryScore": "High",
      "pricingPower": "Strong",
      "reasoning": "Brief summary."
    }
  `;
  const task = `Qualitative analysis for ${companyName} (${ticker}).`;

  try {
    const res = await safeGenerateContent({
      model: GEMINI_MODEL,
      systemInstruction: STRICT_JSON_SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: `TASK: ${task}\n\nSCHEMA:\n${schema}` }] }],
      config: JSON_CONFIG
    });
    const parsed = parseJSON<QualitativeAnalysis>(res.text || "{}");
    return {
      tamPenetration: parsed?.tamPenetration || '5-10%',
      revenueType: parsed?.revenueType || 'Transactional',
      catalysts: Array.isArray(parsed?.catalysts) ? parsed.catalysts : [],
      catalystDensity: parsed?.catalystDensity || 'Low',
      asymmetryScore: parsed?.asymmetryScore || 'Medium',
      pricingPower: parsed?.pricingPower || 'Neutral',
      reasoning: parsed?.reasoning || "Error"
    };
  } catch (e) {
    return {
      tamPenetration: '5-10%', revenueType: 'Transactional', catalysts: [], catalystDensity: 'Low', asymmetryScore: 'Medium', pricingPower: 'Neutral', reasoning: "Error",
      error: "GEMINI_ERROR"
    };
  }
};

export const getFinancialEstimates = async (ticker: string) => {
  const schema = `
    {
      "revenueGrowth3Y": number,
      "grossMargin": number,
      "operatingMargin": number,
      "returnOnEquity": number
    }
  `;
  const task = `Extract explicit financial metrics for ${ticker}. DO NOT ESTIMATE or GUESS. If data is not explicitly available in your knowledge base, return 0.`;

  try {
    const res = await safeGenerateContent({
      model: GEMINI_MODEL,
      systemInstruction: STRICT_JSON_SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: `TASK: ${task}\n\nSCHEMA:\n${schema}` }] }],
      config: JSON_CONFIG
    });

    const parsed = parseJSON(res.text || "{}");
    return {
      revenueGrowth3Y: parsed?.revenueGrowth3Y ?? 0,
      grossMargin: parsed?.grossMargin ?? 0,
      operatingMargin: parsed?.operatingMargin ?? 0,
      returnOnEquity: parsed?.returnOnEquity ?? 0
    };
  } catch (e) {
    return { revenueGrowth3Y: 0, grossMargin: 0, operatingMargin: 0, returnOnEquity: 0 };
  }
};

export const analyzeAntigravity = async (inputData: any): Promise<AntigravityResult> => {
  try {
    const res = await safeGenerateContent({
      model: GEMINI_MODEL,
      systemInstruction: STRICT_JSON_SYSTEM_PROMPT,
      contents: [
        {
          role: "user",
          parts: [{ text: ANTIGRAVITY_SYSTEM_PROMPT + "\n\n### COMPANY DATA FOR ANALYSIS\n" + JSON.stringify(inputData) }]
        }
      ],
      config: JSON_CONFIG,
    });

    const parsed = parseJSON<AntigravityResult>(res.text || "{}");

    if (!parsed) throw new Error("JSON Parse Failed");

    return {
      aiStatus: parsed.aiStatus || 'MONITOR_ONLY',
      aiTier: parsed.aiTier || 'Not Interesting',
      aiConviction: parsed.aiConviction || 0,
      thesisSummary: parsed.thesisSummary || "Analysis failed",
      bullCase: parsed.bullCase || "",
      bearCase: parsed.bearCase || "",
      keyDrivers: Array.isArray(parsed.keyDrivers) ? parsed.keyDrivers : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [], // Legacy
      timeHorizonYears: parsed.timeHorizonYears || 0,
      multiBaggerPotential: parsed.multiBaggerPotential || 'LOW',
      positionSizingHint: parsed.positionSizingHint || 'NONE',
      notesForUI: parsed.notesForUI || "",

      // New Fields
      primaryMoatType: parsed.primaryMoatType || 'none',
      moatScore: typeof parsed.moatScore === 'number' ? parsed.moatScore : 0,
      tamCategory: parsed.tamCategory || 'medium',
      tamPenetration: parsed.tamPenetration || 'medium',
      founderLed: typeof parsed.founderLed === 'boolean' ? parsed.founderLed : false,
      insiderOwnership: typeof parsed.insiderOwnership === 'number' ? parsed.insiderOwnership : null,
      warningFlags: Array.isArray(parsed.warningFlags) ? parsed.warningFlags : [],
      positiveCatalysts: Array.isArray(parsed.positiveCatalysts) ? parsed.positiveCatalysts : [],

      error: null
    };

  } catch (error) {
    console.error("Antigravity Analysis Error:", error);
    return {
      aiStatus: 'MONITOR_ONLY',
      aiTier: 'Not Interesting',
      aiConviction: 0,
      thesisSummary: "AI Analysis Failed",
      bullCase: "",
      bearCase: "",
      keyDrivers: [],
      warnings: [],
      timeHorizonYears: 0,
      multiBaggerPotential: 'LOW',
      positionSizingHint: 'NONE',
      notesForUI: "",

      // Defaults for error case
      primaryMoatType: 'none',
      moatScore: 0,
      tamCategory: 'medium',
      tamPenetration: 'medium',
      founderLed: false,
      insiderOwnership: null,
      warningFlags: [],
      positiveCatalysts: [],

      error: "GEMINI_ERROR"
    };
  }
};