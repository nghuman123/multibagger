import React, { useState, useRef, useEffect } from 'react';
import { performMarketScan, AnalysisResult } from '../services/geminiService';
import { Send, Telescope, Loader, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const AIScanner: React.FC = () => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{role: 'user' | 'model', content: string, sources?: string[]}[]>([
    {
      role: 'model',
      content: "Hello! I am the AlphaHunter AI Agent. I can search the live web for recent stock news, upcoming FDA dates, earnings rumors, or emerging themes. Try asking:\n\n* \"Find small-cap biotech stocks with FDA decisions in late 2024\"\n* \"What are the latest rumors about IonQ?\"\n* \"Find stocks involved in nuclear fusion energy\""
    }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMsg = query;
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    const result: AnalysisResult = await performMarketScan(userMsg);

    setMessages(prev => [...prev, { 
      role: 'model', 
      content: result.markdown, 
      sources: result.sources 
    }]);
    setLoading(false);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col max-w-4xl mx-auto">
      <div className="flex-none mb-6">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
          <Telescope className="text-primary-400" size={32} />
          AI Market Scanner
        </h2>
        <p className="text-gray-400 mt-2">
          Powered by Gemini 2.5 Flash & Google Search Grounding. Ask specifically about current events, recent filings, or niche sectors.
        </p>
      </div>

      <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col shadow-2xl">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[85%] rounded-2xl p-4 ${
                  msg.role === 'user' 
                    ? 'bg-primary-600 text-white rounded-br-none' 
                    : 'bg-gray-800 text-gray-200 rounded-bl-none border border-gray-700'
                }`}
              >
                <div className="prose prose-invert prose-sm">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-700/50">
                    <p className="text-xs text-gray-400 mb-2 flex items-center">
                      <Globe size={12} className="mr-1" />
                      Sources
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.slice(0, 3).map((src, i) => (
                        <a 
                          key={i} 
                          href={src} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[10px] bg-gray-900 hover:bg-gray-700 px-2 py-1 rounded-full text-primary-400 transition-colors truncate max-w-[200px]"
                        >
                          {new URL(src).hostname}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="flex justify-start">
               <div className="bg-gray-800 text-gray-400 rounded-2xl rounded-bl-none p-4 border border-gray-700 flex items-center space-x-2">
                 <Loader className="animate-spin" size={16} />
                 <span className="text-sm">Scanning web for live data...</span>
               </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-850 border-t border-gray-800">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="E.g. What is the latest news on ASTS? or Find uranium stocks with recent insider buying."
              className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
            />
            <button 
              type="submit" 
              disabled={loading || !query.trim()}
              className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 rounded-lg font-medium transition-colors flex items-center"
            >
              <Send size={18} />
            </button>
          </form>
          <div className="text-center mt-2">
             <span className="text-[10px] text-gray-600">AI can make mistakes. Verify important financial data.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIScanner;
