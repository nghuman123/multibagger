# AlphaHunter - Multi-Bagger Stock Discovery

A professional-grade stock discovery platform specializing in small-cap opportunities with catalyst tracking and AI-powered analysis.

## Features

- **Quantitative Scoring Engine**: Growth, Quality, Rule of 40, Insider, Valuation scores
- **Risk Analysis**: Beneish M-Score, Altman Z-Score, Dilution tracking
- **AI Analysis**: Visionary CEO scoring, Catalyst extraction, Pattern matching
- **Real-time Data**: Live quotes from Financial Modeling Prep
- **Short Interest**: Real short interest data from Finnhub

## Prerequisites

- Node.js 18+
- npm or yarn

## API Keys Required (All Free Tier)

| Service | Purpose | Free Tier | Sign Up |
|---------|---------|-----------|---------|
| **Gemini** | AI analysis, catalyst extraction | Generous | [Google AI Studio](https://aistudio.google.com/) |
| **Financial Modeling Prep** | Financial data, quotes | 250 calls/day | [FMP](https://site.financialmodelingprep.com/) |
| **Finnhub** | Short interest, sentiment | 60 calls/min | [Finnhub](https://finnhub.io/) |

## Quick Start

1. **Clone and install**
```bash
   git clone <your-repo>
   cd alphahunter
   npm install
```

2. **Configure environment**
   
   Create `.env.local` in the project root:
```env
   # Google Gemini API Key (required for AI features)
   API_KEY=your_gemini_api_key_here

   # Financial Modeling Prep (required for financial data)
   FMP_API_KEY=your_fmp_api_key_here

   # Finnhub (required for short interest data)
   FINNHUB_API_KEY=your_finnhub_api_key_here
```

3. **Run the app**
```bash
   npm run dev
```

4. **Open in browser**
   http://localhost:5173
