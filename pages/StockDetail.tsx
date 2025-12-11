import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { INITIAL_STOCKS } from '../constants';
import StockChart from '../components/StockChart';
import { MultibaggerBadge, GradeDisplay } from '../components/StockCard';
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
   ShieldAlert,
   Microscope,
   Zap,
   Scale,
   Users,
   BarChart2,
   Activity,
   Lightbulb,
   History,
   AlertOctagon,
   TrendingUp,
   Award,
   Target,
   FileText,
   Database,
   Rocket,
   ShieldCheck,
   TrendingDown
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
   const [activeTab, setActiveTab] = useState<'thesis' | 'moat' | 'financials' | 'raw'>('thesis');

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

   const stockName = aiAnalysis?.companyName || stock?.name || ticker;
   const displayPrice = liveQuote ? liveQuote.price.toFixed(2) : (stock?.price ? stock.price.toFixed(2) : "---");
   const displayChange = liveQuote ? `${liveQuote.changesPercentage > 0 ? '+' : ''}${liveQuote.changesPercentage.toFixed(2)}%` : (stock?.changePercent ? `${stock.changePercent}%` : "---");
   const isPositive = displayChange.includes('+') || (!displayChange.includes('-') && parseFloat(displayChange) > 0);

   const getTierColor = (tier: string) => {
      switch (tier) {
         case 'Tier 1': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.3)]';
         case 'Tier 2': return 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]';
         case 'Tier 3': return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
         case 'Not Interesting': return 'bg-gray-800/50 text-gray-500 border-gray-700';
         case 'Disqualified': return 'bg-red-500/20 text-red-500 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]';
         default: return 'bg-gray-800 text-gray-400';
      }
   };

   return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
         <Link to="/screener" className="inline-flex items-center text-gray-400 hover:text-white mb-2 transition-colors">
            <ArrowLeft size={16} className="mr-1" /> Back to Screener
         </Link>

         {/* Hero Section */}
         <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${isPositive ? 'from-green-500/5' : 'from-red-500/5'} to-transparent rounded-bl-full pointer-events-none`}></div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
               <div>
                  <div className="flex items-center gap-3 mb-1">
                     <h1 className="text-4xl font-bold text-white tracking-tight">{ticker}</h1>
                     {aiAnalysis && (
                        <span className={`px-3 py-1 rounded-full text-sm font-bold border ${getTierColor(aiAnalysis.tier)}`}>
                           {aiAnalysis.tier}
                        </span>
                     )}
                  </div>
                  <h2 className="text-xl text-gray-400">{stockName}</h2>

                  {aiAnalysis && aiAnalysis.bonuses.length > 0 && (
                     <div className="flex gap-2 mt-3">
                        {aiAnalysis.bonuses.map((bonus, i) => (
                           <span key={i} className="flex items-center px-2 py-1 bg-gray-800 rounded text-xs text-accent-400 border border-gray-700">
                              <Award size={12} className="mr-1" /> {bonus}
                           </span>
                        ))}
                     </div>
                  )}
               </div>

               <div className="text-right">
                  <div className="text-5xl font-mono font-bold text-white tracking-tighter">${displayPrice}</div>
                  <div className={`text-xl font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                     {String(displayChange)}
                  </div>
                  {aiAnalysis && (
                     <div className="mt-2">
                        <MultibaggerBadge score={aiAnalysis.score} />
                     </div>
                  )}
               </div>
            </div>
         </div>

         {!aiAnalysis && !loadingReport && !reportError && (
            <div className="flex justify-center py-12">
               <button
                  onClick={generateReport}
                  className="bg-primary-600 hover:bg-primary-500 text-white px-8 py-4 rounded-xl text-lg font-bold transition-all shadow-lg shadow-primary-900/20 flex items-center gap-3 hover:scale-105"
               >
                  <Microscope size={24} />
                  Run AlphaHunter Analysis
               </button>
            </div>
         )}

         {loadingReport && <AnalysisSkeleton />}

         {reportError && (
            <div className="p-8">
               <ApiError type={getErrorType(reportError)} onRetry={generateReport} />
            </div>
         )}

         {aiAnalysis && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

               {/* Left Column: The Why & Thesis */}
               <div className="lg:col-span-2 space-y-6">

                  {/* "The Why" Score Breakdown - Replaced by Institutional Scorecard */}
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 shadow-lg">
                     <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <Target className="mr-2 text-primary-400" />
                        Institutional Scorecard
                     </h3>

                     <div className="mb-6">
                        <GradeDisplay
                           quality={aiAnalysis.grades?.quality || 'C'}
                           growth={aiAnalysis.grades?.growth || 'C'}
                           valuation={aiAnalysis.grades?.valuation || 'C'}
                           momentum={aiAnalysis.grades?.momentum || 'C'}
                        />
                     </div>

                     <div className="bg-gray-950/50 p-3 rounded border border-gray-800 font-mono text-xs text-center text-gray-400">
                        {aiAnalysis.multiBaggerScore?.summary || "See thesis for details."}
                     </div>
                  </div>

                  {/* Tabs */}
                  <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden min-h-[500px]">
                     <div className="flex border-b border-gray-800">
                        <button
                           onClick={() => setActiveTab('thesis')}
                           className={`flex-1 py-4 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === 'thesis' ? 'bg-gray-800 text-white border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                           <BrainCircuit size={16} className="inline mr-2" /> Thesis
                        </button>
                        <button
                           onClick={() => setActiveTab('moat')}
                           className={`flex-1 py-4 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === 'moat' ? 'bg-gray-800 text-white border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                           <ShieldCheck size={16} className="inline mr-2" /> Moat
                        </button>
                        <button
                           onClick={() => setActiveTab('financials')}
                           className={`flex-1 py-4 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === 'financials' ? 'bg-gray-800 text-white border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                           <BarChart2 size={16} className="inline mr-2" /> Financials
                        </button>
                        <button
                           onClick={() => setActiveTab('raw')}
                           className={`flex-1 py-4 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === 'raw' ? 'bg-gray-800 text-white border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                           <Database size={16} className="inline mr-2" /> Raw
                        </button>
                     </div>

                     <div className="p-6">
                        {activeTab === 'thesis' && (
                           <div className="space-y-6 animate-in fade-in">
                              <div>
                                 <h4 className="text-primary-400 font-bold mb-2 flex items-center">
                                    <Lightbulb size={16} className="mr-2" /> Investment Thesis
                                 </h4>
                                 <p className="text-gray-300 leading-relaxed text-sm">{aiAnalysis.aiAnalysis.thesis}</p>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                 <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
                                    <h4 className="text-green-400 font-bold mb-2 text-sm flex items-center">
                                       <TrendingUp size={16} className="mr-2" /> Bull Case
                                    </h4>
                                    <ul className="list-disc list-inside text-xs text-gray-400 space-y-2">
                                       {aiAnalysis.aiAnalysis.bullCase && aiAnalysis.aiAnalysis.bullCase.length > 0 ? (
                                          aiAnalysis.aiAnalysis.bullCase.map((item, i) => <li key={i}>{item}</li>)
                                       ) : (
                                          <li>No specific bull case data available.</li>
                                       )}
                                    </ul>
                                 </div>

                                 <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
                                    <h4 className="text-red-400 font-bold mb-2 text-sm flex items-center">
                                       <TrendingDown size={16} className="mr-2" /> Bear Case
                                    </h4>
                                    <ul className="list-disc list-inside text-xs text-gray-400 space-y-2">
                                       {aiAnalysis.aiAnalysis.bearCase && aiAnalysis.aiAnalysis.bearCase.length > 0 ? (
                                          aiAnalysis.aiAnalysis.bearCase.map((item, i) => <li key={i}>{item}</li>)
                                       ) : (
                                          <li>No specific bear case data available.</li>
                                       )}
                                    </ul>
                                 </div>
                              </div>

                              {aiAnalysis.patternMatch && (
                                 <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
                                    <h4 className="text-purple-400 font-bold mb-2 text-sm flex items-center">
                                       <History size={16} className="mr-2" /> Historical Pattern
                                    </h4>
                                    <div className="flex items-center gap-4">
                                       <div className="text-2xl font-bold text-white">{aiAnalysis.patternMatch.matchScore}%</div>
                                       <div className="text-sm text-gray-400">Match with <span className="text-white font-bold">{aiAnalysis.patternMatch.similarTo}</span></div>
                                    </div>
                                 </div>
                              )}
                           </div>
                        )}

                        {activeTab === 'moat' && (
                           <div className="space-y-6 animate-in fade-in">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                 <div className="bg-gray-950 p-6 rounded-lg border border-gray-800 text-center">
                                    <h4 className="text-blue-400 font-bold mb-2 text-sm">Moat Score</h4>
                                    <div className="text-4xl font-bold text-white mb-2">{aiAnalysis.aiAnalysis.moat.score}/10</div>
                                    <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                                       <div className="h-full bg-blue-500 rounded-full" style={{ width: `${aiAnalysis.aiAnalysis.moat.score * 10}%` }}></div>
                                    </div>
                                 </div>

                                 <div className="space-y-4">
                                    <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
                                       <h4 className="text-gray-400 text-xs uppercase mb-1">Moat Type</h4>
                                       <div className="text-lg font-bold text-white">{aiAnalysis.aiAnalysis.moat.type || "Unspecified"}</div>
                                    </div>
                                    <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
                                       <h4 className="text-gray-400 text-xs uppercase mb-1">Durability</h4>
                                       <div className="text-lg font-bold text-white">{aiAnalysis.aiAnalysis.moat.durability}</div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        )}

                        {activeTab === 'financials' && (
                           <div className="space-y-4 animate-in fade-in">
                              <MetricRow label="Revenue Growth (3Y CAGR)" value={`${aiAnalysis.quantScore?.revenueGrowth3YrCAGR.toFixed(1)}%`} />
                              <MetricRow label="Gross Margin" value={`${aiAnalysis.quantScore?.grossMargin.toFixed(1)}%`} />
                              <MetricRow label="Rule of 40" value={aiAnalysis.quantScore?.ruleOf40Value.toFixed(1)} />
                              <MetricRow label="Insider Ownership" value={`${aiAnalysis.quantScore?.insiderOwnershipPct.toFixed(1)}%`} />
                              <MetricRow label="Price to Sales" value={aiAnalysis.quantScore?.priceToSales.toFixed(1)} />
                           </div>
                        )}

                        {activeTab === 'raw' && (
                           <pre className="text-[10px] text-gray-500 overflow-auto max-h-[500px] bg-gray-950 p-4 rounded border border-gray-800 animate-in fade-in">
                              {JSON.stringify(aiAnalysis, null, 2)}
                           </pre>
                        )}
                     </div>
                  </div>
               </div>

               {/* Right Column: Risk Radar & Technicals */}
               <div className="space-y-6">

                  {/* Risk Radar */}
                  <div className={`p-6 rounded-xl border shadow-lg ${aiAnalysis.riskFlags.disqualified ? 'bg-red-950/20 border-red-900/50' : 'bg-gray-900 border-gray-800'}`}>
                     <h3 className={`font-bold mb-4 flex items-center ${aiAnalysis.riskFlags.disqualified ? 'text-red-500' : 'text-white'}`}>
                        <ShieldAlert className="mr-2" size={18} />
                        Risk Radar
                     </h3>

                     {aiAnalysis.riskFlags.disqualified ? (
                        <div className="bg-red-900/20 border border-red-900/50 rounded p-4 mb-4">
                           <p className="text-xs text-red-400 font-bold uppercase mb-2">Disqualification Reasons:</p>
                           <ul className="list-disc list-inside text-xs text-red-300 space-y-1">
                              {aiAnalysis.riskFlags.disqualifyReasons.map((r, i) => <li key={i}>{r}</li>)}
                           </ul>
                        </div>
                     ) : (
                        aiAnalysis.riskFlags.warnings.length > 0 ? (
                           <div className="bg-yellow-900/20 border border-yellow-900/50 rounded p-4 mb-4">
                              <p className="text-xs text-yellow-400 font-bold uppercase mb-2">Active Warnings:</p>
                              <ul className="list-disc list-inside text-xs text-yellow-300 space-y-1">
                                 {aiAnalysis.riskFlags.warnings.map((r, i) => <li key={i}>{r}</li>)}
                              </ul>
                           </div>
                        ) : (
                           <div className="flex items-center gap-3 text-green-500 bg-green-500/10 p-4 rounded border border-green-500/20">
                              <CheckCircle2 size={24} />
                              <span className="font-bold text-sm">Risk Check Passed</span>
                           </div>
                        )
                     )}

                     <div className="space-y-3 mt-4">
                        <RiskItem label="Beneish M-Score" value={aiAnalysis.riskFlags.beneishMScore.toFixed(2)} threshold={-1.78} inverse />
                        <RiskItem label="Altman Z-Score" value={aiAnalysis.riskFlags.altmanZScore.toFixed(2)} threshold={1.8} />
                        <RiskItem label="Dilution Rate" value={`${aiAnalysis.riskFlags.dilutionRate.toFixed(1)}%`} threshold={5} inverse />
                     </div>
                  </div>

                  {/* Technical Chart */}
                  <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 h-64 flex flex-col shadow-lg">
                     <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-bold text-gray-400 uppercase">Price Action</h3>
                     </div>
                     <div className="flex-1 w-full -ml-2">
                        <StockChart color={isPositive ? '#10B981' : '#EF4444'} />
                     </div>
                  </div>

                  {/* Data Quality */}
                  <DataQualityPanel quality={aiAnalysis.dataQuality} timestamp={aiAnalysis.dataTimestamp} />

               </div>
            </div>
         )}
      </div>
   );
};

const RiskItem = ({ label, value, threshold, inverse = false }: { label: string, value: string, threshold: number, inverse?: boolean }) => {
   const numVal = parseFloat(value.replace(/[^0-9.-]/g, ''));
   const bad = !isNaN(numVal) && (inverse ? numVal > threshold : numVal < threshold);
   return (
      <div className="flex justify-between items-center border-b border-gray-800 pb-2 last:border-0">
         <span className="text-gray-400 text-xs uppercase">{label}</span>
         <span className={`font-mono font-bold text-sm ${bad ? 'text-red-500' : 'text-green-500'}`}>{value}</span>
      </div>
   );
};

const MetricRow = ({ label, value }: { label: string, value: string | undefined }) => (
   <div className="flex justify-between items-center border-b border-gray-800 pb-2 last:border-0">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className="text-white font-mono text-sm font-bold">{value ?? '---'}</span>
   </div>
);

export default StockDetail;
