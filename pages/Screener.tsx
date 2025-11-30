import React, { useState, useEffect } from 'react';
import { INITIAL_STOCKS } from '../constants';
import { Filter, Sliders, Download, RefreshCcw, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getRealTimeQuote, StockQuote } from '../services/geminiService';

const Screener: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [livePrices, setLivePrices] = useState<Record<string, StockQuote>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Filter logic
  const filteredStocks = INITIAL_STOCKS.filter(s => 
    (s.ticker.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (s.score || 0) >= minScore
  );

  // Fetch live prices on mount
  useEffect(() => {
    const fetchLivePrices = async () => {
      setLoadingPrices(true);
      // Fetch in parallel batches of 10 to avoid overwhelming browser/API
      const batchSize = 10;
      for (let i = 0; i < filteredStocks.length; i += batchSize) {
        const batch = filteredStocks.slice(i, i + batchSize);
        await Promise.all(batch.map(async (stock) => {
          try {
            const quote = await getRealTimeQuote(stock.ticker);
            if (quote) {
              setLivePrices(prev => ({...prev, [stock.ticker]: quote}));
            }
          } catch (e) {
            console.warn(`Failed to fetch quote for ${stock.ticker}`, e);
          }
        }));
        // Small delay between batches
        await new Promise(r => setTimeout(r, 100));
      }
      setLoadingPrices(false);
    };

    // Only run if we have stocks to show
    if (filteredStocks.length > 0) {
      fetchLivePrices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount (or could add debounce for search)

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
           <h2 className="text-3xl font-bold text-white tracking-tight">Stock Screener</h2>
           <p className="text-gray-400 mt-1">Filter specifically for high-growth small-cap setups.</p>
        </div>
        <div className="flex space-x-2">
          <button className="flex items-center space-x-2 bg-gray-800 text-gray-300 px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors border border-gray-700">
             <Download size={16} />
             <span>Export</span>
          </button>
          <button className="flex items-center space-x-2 bg-primary-600 text-white px-3 py-2 rounded-lg hover:bg-primary-500 transition-colors">
             <Filter size={16} />
             <span>Save Preset</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Filter Panel */}
        <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl h-fit overflow-y-auto">
          <div className="flex items-center space-x-2 mb-6 text-primary-400">
            <Sliders size={20} />
            <span className="font-bold">Filters</span>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Search Ticker</label>
              <input 
                type="text" 
                placeholder="e.g. IONQ" 
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500 transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Min. Multi-Bagger Score</label>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">0</span>
                <span className="text-sm font-bold text-accent-500">{minScore}</span>
                <span className="text-xs text-gray-500">100</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary-500"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">Market Cap</label>
              <div className="flex items-center space-x-2">
                <input type="text" placeholder="Min" className="w-1/2 bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white" />
                <span className="text-gray-500">-</span>
                <input type="text" placeholder="Max" className="w-1/2 bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white" />
              </div>
            </div>

            <div className="space-y-2">
               <label className="block text-sm font-medium text-gray-300">Sector</label>
               <select className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-gray-400 focus:outline-none">
                 <option>All Sectors</option>
                 <option>Technology</option>
                 <option>Healthcare</option>
                 <option>Energy</option>
                 <option>Industrials</option>
               </select>
            </div>
            
            <button className="w-full bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg text-sm transition-colors border border-gray-700">
              Reset Filters
            </button>
          </div>
        </div>

        {/* Results Table */}
        <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-800/50 text-gray-400 text-sm uppercase tracking-wider">
                  <th className="p-4 font-medium border-b border-gray-800">Ticker</th>
                  <th className="p-4 font-medium border-b border-gray-800 flex items-center">
                    Price
                    {loadingPrices && <RefreshCcw size={12} className="ml-2 animate-spin text-gray-500" />}
                  </th>
                  <th className="p-4 font-medium border-b border-gray-800">Score</th>
                  <th className="p-4 font-medium border-b border-gray-800">Market Cap</th>
                  <th className="p-4 font-medium border-b border-gray-800 hidden md:table-cell">Volume</th>
                  <th className="p-4 font-medium border-b border-gray-800 hidden md:table-cell">Growth</th>
                  <th className="p-4 font-medium border-b border-gray-800 hidden lg:table-cell">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredStocks.map((stock) => {
                  const liveData = livePrices[stock.ticker];
                  const displayPrice = liveData ? liveData.price.toFixed(2) : "---";
                  
                  let changeVal = 0;
                  if (liveData) {
                    changeVal = liveData.changesPercentage;
                  }
                  
                  const isPositive = changeVal > 0;
                  const displayChange = liveData ? `${changeVal > 0 ? '+' : ''}${changeVal.toFixed(2)}%` : "---";

                  let displayCap = stock.marketCap;
                  if (liveData) {
                     const val = liveData.marketCap;
                     if (val === 0) {
                        displayCap = "---";
                     } else if (val >= 1e9) displayCap = (val / 1e9).toFixed(1) + 'B';
                     else if (val >= 1e6) displayCap = (val / 1e6).toFixed(1) + 'M';
                     else displayCap = val.toString();
                  }

                  let displayVol = stock.volume;
                  if (liveData) {
                      const vol = liveData.volume;
                      if (vol >= 1e9) displayVol = (vol / 1e9).toFixed(1) + 'B';
                      else if (vol >= 1e6) displayVol = (vol / 1e6).toFixed(1) + 'M';
                      else displayVol = vol.toLocaleString();
                  }

                  return (
                    <tr key={stock.ticker} className="hover:bg-gray-800/30 transition-colors group">
                      <td className="p-4">
                        <div className="flex flex-col">
                          <Link to={`/stock/${stock.ticker}`} className="font-bold text-white group-hover:text-primary-400 transition-colors">{stock.ticker}</Link>
                          <span className="text-xs text-gray-500 truncate max-w-[120px]">{stock.name}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-gray-200 font-mono flex items-center">
                          ${displayPrice}
                          {liveData && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse"></span>}
                        </div>
                        <div className={`text-xs ${isPositive ? 'text-accent-500' : 'text-danger-500'}`}>
                          {displayChange.replace(/[+-]/, '') && (isPositive ? '+' : '')}{displayChange.replace(/[+-]/, '')}%
                        </div>
                      </td>
                      <td className="p-4">
                         {stock.score ? (
                           <div className="flex items-center">
                              <span className={`font-bold ${
                                stock.score >= 90 ? 'text-accent-500' :
                                stock.score >= 80 ? 'text-primary-400' :
                                'text-yellow-500'
                              }`}>{stock.score}</span>
                              <div className="w-16 h-1 bg-gray-800 ml-2 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    stock.score >= 90 ? 'bg-accent-500' :
                                    stock.score >= 80 ? 'bg-primary-500' :
                                    'bg-yellow-500'
                                  }`} 
                                  style={{width: `${stock.score}%`}}
                                />
                              </div>
                           </div>
                         ) : (
                           <span className="text-xs text-gray-600 italic">Not Analyzed</span>
                         )}
                      </td>
                      <td className="p-4 text-gray-300 text-sm">{displayCap}</td>
                      <td className="p-4 text-gray-300 text-sm hidden md:table-cell">{displayVol}</td>
                      <td className="p-4 hidden md:table-cell">
                        <span className="text-accent-500 text-sm font-medium">{stock.metrics?.revenueGrowth ? `+${stock.metrics.revenueGrowth}%` : "---"}</span>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <Link to={`/stock/${stock.ticker}`} className="inline-flex items-center text-xs bg-gray-800 hover:bg-primary-600 text-white px-2 py-1 rounded transition-colors">
                           <PlayCircle size={12} className="mr-1" /> Analyze
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredStocks.length === 0 && (
             <div className="p-12 text-center text-gray-500">
               No stocks match your filters.
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Screener;