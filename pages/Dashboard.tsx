
import React, { useEffect, useState } from 'react';
import { INITIAL_STOCKS } from '../constants';
import { ArrowUpRight, ArrowDownRight, Zap, TrendingUp, DollarSign, Activity, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getRealTimeQuote, StockQuote } from '../services/geminiService';
import { StockCardSkeleton } from '../components/LoadingSkeleton';
import ApiError from '../components/ApiError';
import { ApiError as ApiErrorType } from '../services/utils/retry';

const Dashboard: React.FC = () => {
  // Show top 10 stocks from our watchlist
  const [topStocks] = useState(INITIAL_STOCKS.slice(0, 10));
  const [upcomingCatalysts] = useState([]); // Catalysts will be fetched or empty for now

  const [livePrices, setLivePrices] = useState<Record<string, StockQuote>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchLivePrices = async () => {
    setLoadingPrices(true);
    setError(null);
    try {
      // Fetch in parallel for better performance
      const promises = topStocks.map(async (stock) => {
        try {
          const quote = await getRealTimeQuote(stock.ticker);
          if (quote) {
            setLivePrices(prev => ({ ...prev, [stock.ticker]: quote }));
          }
        } catch (e) {
          console.warn(`Failed to fetch quote for ${stock.ticker}`, e);
        }
      });

      await Promise.all(promises);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError(err as Error);
    } finally {
      setLoadingPrices(false);
    }
  };

  useEffect(() => {
    fetchLivePrices();
  }, [topStocks]);

  const getErrorType = (err: unknown): 'api_key' | 'rate_limit' | 'network' | 'unknown' => {
    if (err instanceof ApiErrorType) {
      if (err.code === 'MISSING_KEY') return 'api_key';
      if (err.code === 'RATE_LIMIT') return 'rate_limit';
      if (err.code === 'NETWORK') return 'network';
    }
    return 'unknown';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Market Dashboard</h2>
          <p className="text-gray-400 mt-1">Overview of potential multi-bagger opportunities.</p>
        </div>
        <div className="flex space-x-3">
          <Link to="/ai-scanner" className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-primary-900/20 transition-all flex items-center">
            <Zap className="w-4 h-4 mr-2" />
            AI Scan
          </Link>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6">
          <ApiError type={getErrorType(error)} onRetry={fetchLivePrices} />
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm font-medium">Watchlist Size</p>
              <h3 className="text-2xl font-bold text-white mt-1">{INITIAL_STOCKS.length}</h3>
            </div>
            <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-green-500 font-medium flex items-center">
              <ArrowUpRight size={14} className="mr-1" /> Active
            </span>
            <span className="text-gray-500 ml-2">Monitoring</span>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm font-medium">Live Data</p>
              <h3 className="text-2xl font-bold text-white mt-1">Active</h3>
            </div>
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
              <Zap size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-white font-medium">Real-time updates</span>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm font-medium">Avg Volume</p>
              <h3 className="text-2xl font-bold text-white mt-1">---</h3>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
              <Activity size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-gray-500">Across watchlist</span>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm font-medium">Market Sentiment</p>
              <h3 className="text-2xl font-bold text-green-400 mt-1">Neutral</h3>
            </div>
            <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-gray-500">Awaiting Analysis</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Top Picks */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center">
              Featured Opportunities
              {loadingPrices && <RefreshCcw size={14} className="ml-2 animate-spin text-gray-500" />}
            </h3>
            <Link to="/screener" className="text-primary-400 text-sm hover:text-primary-300">View All</Link>
          </div>

          <div className="space-y-4">
            {loadingPrices && Object.keys(livePrices).length === 0 ? (
              <>
                <StockCardSkeleton />
                <StockCardSkeleton />
                <StockCardSkeleton />
              </>
            ) : (
              topStocks.map((stock) => {
                const liveData = livePrices[stock.ticker];
                const displayPrice = liveData ? liveData.price.toFixed(2) : "---";

                let changeVal = 0;
                if (liveData) {
                  changeVal = liveData.changesPercentage;
                }

                const isNegative = changeVal < 0;
                const displayChange = liveData ? `${changeVal > 0 ? '+' : ''}${changeVal.toFixed(2)}%` : "---";

                return (
                  <div key={stock.ticker} className="bg-gray-900 border border-gray-800 p-5 rounded-xl hover:border-gray-700 transition-colors group relative overflow-hidden">

                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="bg-gray-800 p-2 rounded text-lg font-bold text-white w-12 text-center">
                          {stock.ticker.substring(0, 2)}
                        </div>
                        <div>
                          <h4 className="font-bold text-lg text-white group-hover:text-primary-400 transition-colors">
                            <Link to={`/stock/${stock.ticker}`}>{stock.ticker}</Link>
                          </h4>
                          <p className="text-sm text-gray-400">{stock.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-mono font-medium text-white">
                          ${displayPrice}
                          {liveData && <span className="ml-2 text-[10px] text-accent-500 font-sans border border-accent-500/20 bg-accent-500/10 px-1 rounded">LIVE</span>}
                        </div>
                        <div className={`text-sm flex items-center justify-end ${!isNegative ? 'text-accent-500' : 'text-danger-500'}`}>
                          {!isNegative ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
                          {displayChange.replace(/[+-]/, '')}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <span className="text-xs text-gray-500 uppercase">Score</span>
                        <div className="text-xl font-bold text-gray-500">{stock.score || "N/A"}</div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 uppercase">Growth</span>
                        <div className="text-sm font-medium text-gray-300">{stock.metrics?.revenueGrowth ? `${stock.metrics.revenueGrowth}%` : "---"}</div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 uppercase">Cash</span>
                        <div className="text-sm font-medium text-gray-300">{stock.metrics?.cashRunway || "---"}</div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-gray-800 text-gray-400 text-xs rounded border border-gray-700">{stock.sector}</span>
                      <span className="px-2 py-1 bg-gray-800 text-gray-400 text-xs rounded border border-gray-700">{stock.industry}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Catalyst Sidebar */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Upcoming Catalysts</h3>
            <Link to="/catalysts" className="text-primary-400 text-sm hover:text-primary-300">Calendar</Link>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-6 text-center">
            <p className="text-gray-500 text-sm">Run analysis on stocks to discover upcoming catalysts.</p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
