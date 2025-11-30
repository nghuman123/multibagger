import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock fetch
global.fetch = vi.fn();

// Mock import.meta.env
vi.stubGlobal('import.meta', {
    env: {
        VITE_GEMINI_API_KEY: 'test-gemini-key',
        VITE_FMP_API_KEY: 'test-fmp-key',
        VITE_FINNHUB_API_KEY: 'test-finnhub-key',
        VITE_MASSIVE_API_KEY: 'test-massive-key',
    },
});
