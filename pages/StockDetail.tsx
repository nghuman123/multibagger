
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { INITIAL_STOCKS } from '../constants';
import StockChart from '../components/StockChart';
import DataQualityPanel from '../components/DataQualityPanel';
import DataQualityBadge, { QualityState } from '../components/DataQualityBadge';
import { AnalysisSkeleton } from '../components/LoadingSkeleton';
import ApiError from '../components/ApiError';
import { ApiError as ApiErrorType } from '../services/utils/retry';
import {
   ArrowLeft,
   Globe,
   RefreshCcw,
   CheckCircle2,
   BrainCircuit,
   Rocket,
   ShieldAlert,
   Microscope,
   Zap,
   Scale,
   Users,
   Crosshair,
   BarChart2,
   Activity,
   Lightbulb,
   History,
   AlertOctagon,
   TrendingUp
} from 'lucide-react';
import { analyzeStock } from '../services/analyzer';
import { getRealTimeQuote } from '../services/geminiService';
import { MultiBaggerAnalysis, StockQuote } from '../types';

const StockDetail: React.FC = () => {
   const { ticker } = useParams<{ ticker: string }>();
   const stock = INITIAL_STOCKS.find(s => s.ticker === ticker);

   const [aiAnalysis, setAiAnalysis] = useState<MultiBaggerAnalysis | null>(null);
   const [loadingReport, setLoadingReport] = useState(false);
   const [reportError, setReportError] = useState<unknown>(null);

   const [liveQuote, setLiveQuote] = useState<StockQuote | null>(null);
   const [loadingQuote, setLoadingQuote] = useState(false);

   useEffect(() => {
      setAiAnalysis(null);
      setLiveQuote(null);
      setReportError(null);
      if (ticker) {
         fetchLiveQuote();
      }
   }, [ticker]);

   const fetchLiveQuote = async () => {
      if (!ticker) return;
      setLoadingQuote(true);
      try {
         const quote = await getRealTimeQuote(ticker);
         if (quote) {
            setLiveQuote(quote);
         }
      } catch (err) {
         console.warn("Quote fetch error", err);
      } finally {
         setLoadingQuote(false);
      }
   };

   const generateReport = async () => {
      if (!ticker) return;
      setLoadingReport(true);
      setReportError(null);
      try {
         const result = await analyzeStock(ticker);
         if (result) {
            setAiAnalysis(result);
         } else {
            throw new Error("Analysis returned no data.");
         }
      } catch (err) {
         console.error("Analysis Error:", err);
         setReportError(err);
      } finally {
         setLoadingReport(false);
      }
   };

   const getErrorType = (err: unknown): 'api_key' | 'rate_limit' | 'network' | 'unknown' => {
      if (err instanceof ApiErrorType) {
         if (err.code === 'MISSING_KEY') return 'api_key';
         if (err.code === 'RATE_LIMIT') return 'rate_limit';
         if (err.code === 'NETWORK') return 'network';
      }
      return 'unknown';
   };

   if (!ticker) {
      return <div className="p-8 text-white">Stock not found</div>;
   }

   // Fallback values if stock exists, otherwise placeholders
   const stockName = aiAnalysis?.companyName || stock?.name || ticker;
   const description = stock?.description || "Run analysis to fetch company details.";

   // Derived display values
   const displayPrice = liveQuote ? liveQuote.price.toFixed(2) : (stock?.price ? stock.price.toFixed(2) : "---");
   const displayChange = liveQuote ? `${liveQuote.changesPercentage > 0 ? '+' : ''}${liveQuote.changesPercentage.toFixed(2)}%` : (stock?.changePercent ? `${stock.changePercent}%` : "---");
   const isPositive = displayChange.includes('+') || (!displayChange.includes('-') && parseFloat(displayChange) > 0);

   const displayCap = liveQuote
      ? (liveQuote.marketCap > 1e9 ? `${(liveQuote.marketCap / 1e9).toFixed(2)}B` : `${(liveQuote.marketCap / 1e6).toFixed(2)}M`)
      : (stock?.marketCap ? (parseFloat(stock.marketCap) > 1e9 ? `${(parseFloat(stock.marketCap) / 1e9).toFixed(2)}B` : `${(parseFloat(stock.marketCap) / 1e6).toFixed(2)}M`) : "---");

   const getVerdictColor = (verdict: string) => {
      switch (verdict) {
         case 'Strong Buy': return 'bg-accent-500/20 text-accent-500 border-accent-500/30';
         case 'Buy': return 'bg-green-500/20 text-green-500 border-green-500/30';
         case 'Watch': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
         case 'Pass': return 'bg-gray-700 text-gray-300';
         case 'Disqualified': return 'bg-red-500/20 text-red-500 border-red-500/30';
         default: return 'bg-gray-700 text-gray-300';
      }
   };

   return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
         <Link to="/screener" className="inline-flex items-center text-gray-400 hover:text-white mb-2 transition-colors">
            <ArrowLeft size={16} className="mr-1" /> Back to Screener
         </Link>

         {/* Top Header: Extended Real-Time Data */}
         <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg relative overflow-hidden">
            {/* Background Accent */}
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${isPositive ? 'from-accent-500/10' : 'from-red-500/10'} to-transparent rounded-bl-full pointer-events-none`}></div>

            <div className="flex-1">
               <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-bold text-white tracking-tight">{ticker}</h1>
                  <span className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400 border border-gray-700">NASDAQ</span>
                  {liveQuote ? (
                     <span className="flex items-center text-xs text-accent-500 bg-accent-500/10 px-2 py-1 rounded border border-accent-500/20 animate-pulse">
                        <Globe size={10} className="mr-1" /> Live Data
                     </span>
                  ) : (
                     <span className="flex items-center text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded border border-gray-700">
                        Loading Live Data...
                     </span>
                  )}
               </div>
               <h2 className="text-xl text-gray-400 mt-1">{stockName}</h2>

               <div className="flex flex-wrap gap-4 mt-6">
                  <div className="flex items-center space-x-2 text-sm text-gray-400">
                     <BarChart2 size={14} />
                     <span>Cap: <span className="text-white font-medium">{displayCap}</span></span>
                  </div>
                  {liveQuote?.yearHigh && (
                     <div className="flex items-center space-x-2 text-sm text-gray-400">
                        <Activity size={14} />
                        <span>52W High: <span className="text-white font-medium">{liveQuote.yearHigh}</span></span>
                     </div>
                  )}
                  {liveQuote?.pe && (
                     <div className="flex items-center space-x-2 text-sm text-gray-400">
                        <Scale size={14} />
                        <span>P/E: <span className="text-white font-medium">{liveQuote.pe.toFixed(1)}</span></span>
                     </div>
                  )}
               </div>
            </div>

            <div className="text-right z-10">
               <div className="flex items-center justify-end gap-2 mb-1">
                  {loadingQuote && <RefreshCcw size={14} className="animate-spin text-gray-500" />}
                  <div className="text-5xl font-mono font-bold text-white tracking-tighter">${displayPrice}</div>
               </div>
               <div className={`text-xl font-medium ${isPositive ? 'text-accent-500' : 'text-danger-500'}`}>
                  {displayChange}
               </div>
               {liveQuote?.volume && (
                  <div className="text-gray-500 text-xs mt-2 font-mono">
                     Vol: {(liveQuote.volume / 1e6).toFixed(1)}M {liveQuote.avgVolume && <span className="text-gray-600"> / Avg: {(liveQuote.avgVolume / 1e6).toFixed(1)}M</span>}
                  </div>
               )}
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Column: Compounder Analysis */}
            <div className="lg:col-span-2 space-y-6">

               {/* Static Preview (Before AI Run) - Only show if we have metrics */}
               {!aiAnalysis && stock?.metrics && !loadingReport && !reportError && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75">
                     <div className="bg-gray-900 p-5 rounded-xl border border-gray-800">
                        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Engine 1: Growth (Est)</h3>
                        <div className="text-3xl font-bold text-white mb-1">{stock.metrics.revenueGrowth}%</div>
                        <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                           <div className="h-full bg-gray-600 rounded-full" style={{ width: `${Math.min(stock.metrics.revenueGrowth, 100)}%` }}></div>
                        </div>
                     </div>
                     <div className="bg-gray-900 p-5 rounded-xl border border-gray-800">
                        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Engine 2: Value (Est)</h3>
                        <div className="text-3xl font-bold text-white mb-1">{stock.metrics.pegRatio || 'N/A'}</div>
                        <p className="text-xs text-gray-500">PEG Ratio</p>
                     </div>
                  </div>
               )}

               {/* AI Analysis Report */}
               <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-lg flex flex-col min-h-[400px]">
                  <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-850">
                     <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                           <BrainCircuit className="text-primary-400" size={18} />
                           AlphaHunter Algorithm
                        </h3>
                        <p className="text-xs text-gray-400 mt-1">Quantitative Scoring & Risk Assessment (FMP Data)</p>
                     </div>
                     {!aiAnalysis && !loadingReport && (
                        <button
                           onClick={generateReport}
                           className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center shadow-lg shadow-primary-900/20"
                        >
                           <Microscope className="mr-2" size={16} />
                           Run Full Analysis
                        </button>
                     )}
                  </div>

                  {loadingReport ? (
                     <AnalysisSkeleton />
                  ) : reportError ? (
                     <div className="p-8">
                        <ApiError type={getErrorType(reportError)} onRetry={generateReport} />
                     </div>
                  ) : aiAnalysis ? (
                     <div className="p-6 space-y-8">

                        {/* Verdict Banner */}
                        <div className={`p-4 rounded-lg border flex items-center justify-between ${getVerdictColor(aiAnalysis.verdict)}`}>
                           <div className="flex items-center gap-3">
                              {aiAnalysis.riskFlags.disqualified ? <AlertOctagon size={24} /> : <CheckCircle2 size={24} />}
                              <div>
                                 <h4 className="font-bold text-lg uppercase tracking-wide">
                                    {aiAnalysis.verdict === 'Disqualified' ? 'DISQUALIFIED' : `VERDICT: ${aiAnalysis.verdict}`}
                                 </h4>
                                 {aiAnalysis.riskFlags.disqualified && (
                                    <p className="text-xs text-red-400 mt-1">Kill Switch Triggered</p>
                                 )}
                              </div>
                           </div>
                           <div className="text-right">
                              <span className="text-xs uppercase opacity-70 block">Composite Score</span>
                              <span className="text-3xl font-bold">{aiAnalysis.finalScore}</span>
                           </div>
                        </div>

                        {/* Data Quality Panel */}
                        <DataQualityPanel
                           quality={aiAnalysis.dataQuality}
                           timestamp={aiAnalysis.dataTimestamp}
                        />

                        {/* Quantitative Breakdown */}
                        <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
                           <h4 className="text-gray-300 text-sm font-bold uppercase mb-4 border-b border-gray-800 pb-2">Quantitative Scoring</h4>
                           <div className="space-y-4">
                              {[
                                 { icon: Rocket, label: 'Growth Velocity', score: aiAnalysis.quantScore.growthScore, max: 30, color: 'text-accent-500', bg: 'bg-accent-500' },
                                 { icon: TrendingUp, label: 'Quality Engine', score: aiAnalysis.quantScore.qualityScore, max: 25, color: 'text-blue-500', bg: 'bg-blue-500' },
                                 { icon: Zap, label: 'Rule of 40', score: aiAnalysis.quantScore.ruleOf40Score, max: 20, color: 'text-yellow-500', bg: 'bg-yellow-500' },
                                 { icon: Users, label: 'Insider Confidence', score: aiAnalysis.quantScore.insiderScore, max: 15, color: 'text-purple-500', bg: 'bg-purple-500' },
                                 { icon: Scale, label: 'Valuation Safety', score: aiAnalysis.quantScore.valuationScore, max: 10, color: 'text-gray-400', bg: 'bg-gray-400' },
                              ].map((item, i) => (
                                 <div key={i} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center w-1/3 text-gray-300">
                                       <item.icon size={16} className={`${item.color} mr-2`} />
                                       {item.label}
                                       {item.label === 'Insider Confidence' && (
                                          <div className="ml-2">
                                             <DataQualityBadge
                                                source={aiAnalysis.dataQuality.insiderOwnershipSource}
                                                size="sm"
                                                showLabel={false}
                                             />
                                          </div>
                                       )}
                                    </div>
                                    <div className="flex-1 mx-4">
                                       <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full ${item.bg}`} style={{ width: `${(item.score / item.max) * 100}%` }}></div>
                                       </div>
                                    </div>
                                    <div className="w-10 text-right font-mono text-white font-bold">{item.score}</div>
                                 </div>
                              ))}
                           </div>
                        </div>

                        {/* Sector Specifics & Visionary */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {/* Data Summary */}
                           <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
                              <h4 className="text-primary-400 text-sm font-bold uppercase mb-3 flex items-center">
                                 <Crosshair size={16} className="mr-2" />
                                 Key Metrics
                              </h4>
                              <div className="space-y-3">
                                 <MetricRow label="Sector" value={aiAnalysis.sector} />
                                 <MetricRow label="3Y CAGR" value={`${aiAnalysis.quantScore.revenueGrowth3YrCAGR.toFixed(1)}%`} />
                                 <MetricRow label="Gross Margin" value={`${aiAnalysis.quantScore.grossMargin.toFixed(1)}%`} />
                                 <MetricRow label="Insider Own" value={`${aiAnalysis.quantScore.insiderOwnershipPct}%`} />
                                 <MetricRow label="Rule of 40" value={aiAnalysis.quantScore.ruleOf40Value.toFixed(1)} />
                              </div>
                           </div>

                           {/* Visionary Score */}
                           <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
                              <h4 className="text-purple-400 text-sm font-bold uppercase mb-3 flex items-center">
                                 <Lightbulb size={16} className="mr-2" />
                                 Visionary Leadership
                              </h4>
                              <div className="flex items-center justify-between mb-4">
                                 <div className="text-center">
                                    <div className="text-2xl font-bold text-white">{aiAnalysis.visionaryAnalysis.totalVisionaryScore}</div>
                                    <div className="text-[10px] text-gray-500 uppercase">Bezos Score</div>
                                 </div>
                                 <div className="space-y-1 text-xs text-gray-400 w-32">
                                    <div className="flex justify-between"><span>Long-Term</span><span>{aiAnalysis.visionaryAnalysis.longTermScore}</span></div>
                                    <div className="flex justify-between"><span>Customer</span><span>{aiAnalysis.visionaryAnalysis.customerScore}</span></div>
                                    <div className="flex justify-between"><span>Innovation</span><span>{aiAnalysis.visionaryAnalysis.innovationScore}</span></div>
                                 </div>
                              </div>
                              <p className="text-[10px] text-gray-500 italic line-clamp-2">"{aiAnalysis.visionaryAnalysis.explanation}"</p>
                           </div>
                        </div>

                        {/* Historical DNA Pattern Match */}
                        {aiAnalysis.patternMatch && (
                           <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/10 rounded-bl-full pointer-events-none"></div>
                              <h4 className="text-gray-300 text-sm font-bold uppercase mb-4 flex items-center">
                                 <History size={16} className="mr-2 text-primary-400" />
                                 Historical DNA Match
                              </h4>
                              <div className="flex items-center gap-4 mb-4">
                                 <div className="relative w-16 h-16 flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full border-4 border-gray-800"></div>
                                    <div className="absolute inset-0 rounded-full border-4 border-primary-500 border-t-transparent animate-spin-slow" style={{ animationDuration: '3s' }}></div>
                                    <span className="font-bold text-white">{aiAnalysis.patternMatch.matchScore}%</span>
                                 </div>
                                 <div>
                                    <p className="text-xs text-gray-400 uppercase">Similar To</p>
                                    <p className="text-xl font-bold text-white text-shadow-glow">{aiAnalysis.patternMatch.similarTo}</p>
                                 </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-xs">
                                 <div>
                                    <p className="text-green-500 font-bold mb-1">Key Parallels</p>
                                    <ul className="list-disc list-inside text-gray-400 space-y-1">
                                       {aiAnalysis.patternMatch.keyParallels.map((p, i) => <li key={i}>{p}</li>)}
                                    </ul>
                                 </div>
                                 <div>
                                    <p className="text-orange-500 font-bold mb-1">Differences</p>
                                    <ul className="list-disc list-inside text-gray-400 space-y-1">
                                       {aiAnalysis.patternMatch.keyDifferences.map((d, i) => <li key={i}>{d}</li>)}
                                    </ul>
                                 </div>
                              </div>
                           </div>
                        )}

                        {/* Thesis Section */}
                        <div>
                           <h4 className="text-gray-300 text-sm font-bold uppercase mb-2 flex items-center">
                              <BrainCircuit size={16} className="mr-2 text-primary-400" />
                              Growth Thesis
                           </h4>
                           <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 text-gray-300 text-sm leading-relaxed">
                              {aiAnalysis.growthThesis}
                           </div>
                        </div>

                        {/* Catalysts */}
                        <div>
                           <h4 className="text-gray-300 text-sm font-bold uppercase mb-2 flex items-center">
                              <CalendarIcon size={16} className="mr-2 text-accent-500" />
                              Upcoming Catalysts
                           </h4>
                           <ul className="grid grid-cols-1 gap-2">
                              {aiAnalysis.catalysts.map((item, idx) => (
                                 <li key={idx} className="flex items-start text-xs text-gray-300 bg-gray-950 p-3 rounded border border-gray-800">
                                    <span className="w-1.5 h-1.5 rounded-full bg-accent-500 mt-1.5 mr-2 flex-shrink-0"></span>
                                    {item}
                                 </li>
                              ))}
                           </ul>
                        </div>

                     </div>
                  ) : (
                     !loadingReport && (
                        <div className="p-12 text-center flex-1 flex flex-col justify-center items-center">
                           <div className="w-16 h-16 rounded-full bg-gray-800 text-gray-600 mb-4 flex items-center justify-center">
                              <Microscope size={32} />
                           </div>
                           <h4 className="text-gray-300 font-medium mb-1">Awaiting Analysis</h4>
                           <p className="text-gray-500 text-sm max-w-sm">
                              Launch the algorithmic engine to process real-time financial data from FMP against "The Code of the Compounder" logic.
                           </p>
                        </div>
                     )
                  )}
               </div>
            </div>

            {/* Right Column: Risk & Charts */}
            <div className="space-y-6">

               {/* Kill Switch Module */}
               {aiAnalysis ? (
                  <div className={`p-6 rounded-xl border shadow-lg ${aiAnalysis.riskFlags.disqualified ? 'bg-red-950/20 border-red-900/50' : 'bg-gray-900 border-gray-800'
                     }`}>
                     <h3 className={`font-bold mb-4 flex items-center ${aiAnalysis.riskFlags.disqualified ? 'text-red-500' : 'text-white'}`}>
                        <ShieldAlert className="mr-2" size={18} />
                        Risk Analysis & Kill Switch
                     </h3>

                     {aiAnalysis.riskFlags.disqualified && (
                        <div className="bg-red-900/20 border border-red-900/50 rounded p-3 mb-4">
                           <p className="text-xs text-red-400 font-bold uppercase mb-1">Disqualification Reasons:</p>
                           <ul className="list-disc list-inside text-xs text-red-300">
                              {aiAnalysis.riskFlags.disqualifyReasons.map((r, i) => <li key={i}>{r}</li>)}
                           </ul>
                        </div>
                     )}

                     {aiAnalysis.riskFlags.warnings.length > 0 && (
                        <div className="bg-yellow-900/20 border border-yellow-900/50 rounded p-3 mb-4">
                           <p className="text-xs text-yellow-400 font-bold uppercase mb-1">Warnings:</p>
                           <ul className="list-disc list-inside text-xs text-yellow-300">
                              {aiAnalysis.riskFlags.warnings.map((r, i) => <li key={i}>{r}</li>)}
                           </ul>
                        </div>
                     )}

                     <div className="space-y-4">
                        <RiskItem
                           label="Beneish M-Score"
                           value={aiAnalysis.riskFlags.beneishMScore.toFixed(2)}
                           threshold={-1.78}
                           inverse
                           quality={aiAnalysis.dataQuality.beneishMScoreReliability}
                        />
                        <RiskItem label="Dilution Rate" value={`${aiAnalysis.riskFlags.dilutionRate.toFixed(1)}%`} threshold={5} inverse />
                        <RiskItem label="Cash Runway" value={`${aiAnalysis.riskFlags.cashRunwayQuarters.toFixed(1)} Qtrs`} threshold={6} />
                        <RiskItem label="Altman Z-Score" value={aiAnalysis.riskFlags.altmanZScore.toFixed(2)} threshold={1.8} />
                        <RiskItem
                           label="Short Interest"
                           value={aiAnalysis.dataQuality.shortInterestSource === 'real' ? `${aiAnalysis.riskFlags.shortInterestPct.toFixed(1)}%` : 'N/A'}
                           threshold={20}
                           inverse
                           quality={aiAnalysis.dataQuality.shortInterestSource === 'real' ? 'full' : 'unavailable'}
                        />
                     </div>
                  </div>
               ) : (
                  <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg opacity-50">
                     <h3 className="text-white font-bold mb-4 flex items-center">
                        <ShieldAlert className="mr-2 text-gray-500" size={18} />
                        Risk Analysis
                     </h3>
                     <p className="text-xs text-gray-500">Run analysis to view Beneish M-Score and Dilution risks.</p>
                  </div>
               )}

               {/* Technical Chart */}
               <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 h-64 flex flex-col shadow-lg">
                  <div className="flex justify-between items-center mb-2">
                     <h3 className="text-sm font-bold text-gray-400 uppercase">Price Action</h3>
                  </div>
                  <div className="flex-1 w-full -ml-2">
                     <StockChart color={isPositive ? '#10B981' : '#EF4444'} />
                  </div>
               </div>

               <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
                  <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Company Profile</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                     {aiAnalysis?.companyName || description}
                  </p>
               </div>

            </div>
         </div>
      </div>
   );
};

const CalendarIcon = ({ size, className }: { size: number, className?: string }) => (
   <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
   >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
   </svg>
);

const RiskItem = ({
   label,
   value,
   threshold,
   inverse = false,
   warning = false,
   quality
}: {
   label: string,
   value: string,
   threshold: number,
   inverse?: boolean,
   warning?: boolean,
   quality?: QualityState
}) => {
   const numVal = parseFloat(value.replace(/[^0-9.-]/g, ''));
   const isBad = !isNaN(numVal) && (inverse ? numVal > threshold : numVal < threshold);
   const isNa = value === 'N/A';

   return (
      <div className="flex justify-between items-center border-b border-gray-800 pb-2 last:border-0">
         <span className="text-gray-400 text-xs uppercase flex items-center gap-2">
            {label}
            {quality && <DataQualityBadge source={quality} size="sm" showLabel={false} />}
         </span>
         <span className={`font-mono font-bold text-sm ${isNa ? 'text-gray-500' : (isBad ? 'text-red-500' : (warning ? 'text-yellow-500' : 'text-accent-500'))}`}>
            {value}
         </span>
      </div>
   );
};

const MetricRow = ({ label, value }: { label: string, value: string }) => (
   <div className="flex justify-between items-center border-b border-gray-800 pb-2 last:border-0">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className="text-white font-mono text-sm font-bold">{value}</span>
   </div>
);

export default StockDetail;
