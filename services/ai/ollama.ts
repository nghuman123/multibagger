import { execSync } from 'child_process';
import fs from 'fs';

// Configuration
const OLLAMA_PORT = 11434;
const DEFAULT_MODEL = 'llama3.1';

/**
 * Detects the Windows Host IP effectively.
 * The most reliable WSL method is `ip route show default` which points to the host.
 */
const getOllamaHost = (): string => {
    // 1. Try environment variable first
    if (process.env.OLLAMA_HOST_IP) {
        return `http://${process.env.OLLAMA_HOST_IP}:${OLLAMA_PORT}`;
    }

    // 2. Execute 'ip route show default' (What worked for the user)
    try {
        const stdout = execSync("ip route show | grep default | awk '{print $3}'", { encoding: 'utf-8' });
        const ip = stdout.trim();
        if (ip) {
            console.log(`[Ollama] Detected Windows Host IP: ${ip}`);
            return `http://${ip}:${OLLAMA_PORT}`;
        }
    } catch (e) {
        console.warn("[Ollama] Failed to detect IP via shell command", e);
    }

    // 3. Fallback to /etc/resolv.conf
    try {
        if (fs.existsSync('/etc/resolv.conf')) {
            const content = fs.readFileSync('/etc/resolv.conf', 'utf-8');
            const match = content.match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/);
            if (match && match[1]) {
                return `http://${match[1]}:${OLLAMA_PORT}`;
            }
        }
    } catch (e) { }

    // 4. Last resort
    return `http://127.0.0.1:${OLLAMA_PORT}`;
};

const OLLAMA_BASE_URL = getOllamaHost();

/**
 * Generic Ollama API caller
 */
export const generateOllamaResponse = async (
    prompt: string,
    schema?: string,
    model: string = DEFAULT_MODEL
): Promise<string> => {

    const systemPrompt = `
    You are a strict data extraction engine.
    Your specific task is to extract data from the prompt or generate analysis based on it.
    
    CRITICAL OUTPUT RULES:
    1. Output MUST be valid JSON only.
    2. Do NOT write any introduction or conclusion.
    3. Do NOT wrap the output in markdown blocks (e.g. \`\`\`json).
    ${schema ? `4. You MUST strictly follow this JSON schema:\n${schema}` : ''}
  `;

    try {
        const payload = {
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            stream: false,
            format: 'json', // Enforce JSON mode natively
            options: {
                temperature: 0.1, // Low temp for factual data
                num_ctx: 8192     // Larger context window if needed
            }
        };

        console.log(`[Ollama] Connecting to ${OLLAMA_BASE_URL} with model ${model}...`);

        const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Ollama API Error: ${response.status} ${response.statusText}`);
        }

        const data: any = await response.json();
        return data.message?.content || "{}";

    } catch (error) {
        console.error("[Ollama] Request Failed:", error);
        // Return empty JSON on failure to prevent crashes
        return "{}";
    }
};
