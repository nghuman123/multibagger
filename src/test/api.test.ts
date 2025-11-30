import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getQuote } from '../../services/api/fmp';
import { performMarketScan } from '../../services/geminiService';

describe('API Services', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('FMP API', () => {
        it('should fetch quote successfully', async () => {
            const mockQuote = [{ symbol: 'AAPL', price: 150 }];
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockQuote,
            });

            const result = await getQuote('AAPL');
            expect(result).toEqual(mockQuote[0]);
            expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('financialmodelingprep.com'));
        });

        it('should handle API errors gracefully', async () => {
            // Use mockResolvedValue to ensure all retries fail
            (global.fetch as any).mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            const result = await getQuote('AAPL');
            expect(result).toBeNull();
        });
    });

    describe('Gemini Service', () => {
        it('should return error if API key is missing', async () => {
            // Temporarily unset key
            const originalEnv = import.meta.env;
            vi.stubGlobal('import.meta', { env: { ...originalEnv, VITE_GEMINI_API_KEY: '' } });

            const result = await performMarketScan('test query');
            expect(result.markdown).toBe('Error performing scan.');

            // Restore key
            vi.stubGlobal('import.meta', { env: originalEnv });
        });
    });
});
