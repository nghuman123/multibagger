import { Stock } from './types';

// Helper to generate dynamic future dates relative to today
const getFutureDate = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
};

// List of tickers to track
export const WATCHLIST_TICKERS = [
  "IONQ", "RKLB", "ASTS", "PLTR", "DNA", "SERV", "HIMS", "SOFI", "CRWD",
  "NVDA", "AMD", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NFLX", "ADBE", "CRM",
  "INTC", "CSCO", "CMCSA", "PEP", "AVGO", "TXN", "QCOM", "TMUS", "COST", "AMGN",
  "PYPL", "SBUX", "MDLZ", "ISRG", "BKNG", "VRTX", "GILD", "ADP", "REGN", "FISV",
  "CSX", "ILMN", "KDP", "MU", "LRCX", "MELI", "PANW", "SNPS", "CDNS", "ASML",
  "KLAC", "MAR", "ORLY", "CTAS", "FTNT", "DXCM", "WDAY", "AEP", "KHC", "BIIB",
  "NXPI", "EXC", "ADSK", "XEL", "EA", "IDXX", "MCHP", "CPRT", "PCAR", "ROST",
  "PAYX", "WBA", "ODFL", "FAST", "VRSK", "DLTR", "CTSH", "ANSS", "EBAY", "ALGN",
  "SWKS", "VRSN", "SIRI", "SPLK", "TEAM", "ZM", "LCID", "RIVN", "DDOG", "ZS",
  "NET", "SNOW", "MDB", "OKTA", "DOCU", "TWLO", "U", "PATH", "GTLB", "CFLT",
  "AI", "OPEN", "AFRM", "UPST", "COIN", "HOOD", "DKNG", "ROKU", "SQ", "SE",
  "SHOP", "SPOT"
];

// Initial state with minimal data (no mock scores)
export const INITIAL_STOCKS: Stock[] = WATCHLIST_TICKERS.map(ticker => ({
  ticker,
  name: ticker, // Placeholder until fetched
  price: 0,
  changePercent: 0,
  marketCap: "---",
  sector: "Unknown",
  industry: "Unknown",
  volume: "---",
  avgVolume: "---",
  description: "Loading data...",
  catalysts: [],
  // Optional fields omitted
}));
