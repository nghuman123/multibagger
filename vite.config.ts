
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  console.log("Loading Env Config:");
  console.log("FMP_KEY Found:", !!env.FMP_API_KEY);
  console.log("FINNHUB_KEY Found:", !!env.FINNHUB_API_KEY);
  console.log("GEMINI_KEY Found:", !!(env.GEMINI_API_KEY || env.API_KEY));

  return {
    plugins: [react()],
    define: {
      'process.env.FMP_API_KEY': JSON.stringify(env.FMP_API_KEY || ''),
      'process.env.FINNHUB_API_KEY': JSON.stringify(env.FINNHUB_API_KEY || ''),
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''), // Gemini API Key
    },
  };
});
