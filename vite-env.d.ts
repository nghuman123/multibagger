/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_FMP_API_KEY: string;
  readonly VITE_FINNHUB_API_KEY: string;
  readonly VITE_MASSIVE_API_KEY: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
