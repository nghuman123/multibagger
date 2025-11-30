import React from 'react';
import { Info, Database } from 'lucide-react';
import DataQualityBadge from './DataQualityBadge';
import { DataQuality } from '../types';

interface DataQualityPanelProps {
  quality: DataQuality;
  timestamp: string;
}

const DataQualityPanel: React.FC<DataQualityPanelProps> = ({ quality, timestamp }) => {
  const date = new Date(timestamp);
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 mb-6 relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Database size={64} />
      </div>

      <div className="flex justify-between items-start mb-4 relative z-10">
        <h4 className="text-xs text-gray-400 uppercase font-bold flex items-center">
          <Info size={14} className="mr-2 text-primary-400" />
          Data Quality Report
        </h4>
        <span className="text-[10px] text-gray-600 font-mono">
          Last Updated: {formattedDate}
        </span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
        <div className="flex flex-col gap-2 p-2 rounded hover:bg-gray-900/50 transition-colors">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Insider Data</span>
          <DataQualityBadge 
            source={quality.insiderOwnershipSource} 
            tooltip={quality.insiderOwnershipSource === 'estimated' ? 'Derived from recent Form 4 filings pattern' : 'Direct from company filings'}
          />
        </div>
        <div className="flex flex-col gap-2 p-2 rounded hover:bg-gray-900/50 transition-colors">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Beneish Model</span>
          <DataQualityBadge 
            source={quality.beneishMScoreReliability} 
            tooltip={quality.beneishMScoreReliability === 'partial' ? 'Some accounting fields (Receivables/SG&A) were missing' : 'All 8 variables calculated'}
          />
        </div>
        <div className="flex flex-col gap-2 p-2 rounded hover:bg-gray-900/50 transition-colors">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Short Interest</span>
          <DataQualityBadge 
            source={quality.shortInterestSource} 
            tooltip="Data sourced from Finnhub / Exchange reports"
          />
        </div>
        <div className="flex flex-col gap-2 p-2 rounded hover:bg-gray-900/50 transition-colors">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Overall Confidence</span>
          <DataQualityBadge 
            source={quality.overallConfidence} 
            tooltip="Aggregate score based on data completeness"
          />
        </div>
      </div>
      
      <div className="mt-4 pt-3 border-t border-gray-900 text-[10px] text-gray-600 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/50"></div>
        <span>
          Metrics marked as <strong className="text-yellow-600">ESTIMATED</strong> use heuristics or have missing data points. Verify critical data before investing.
        </span>
      </div>
    </div>
  );
};

export default DataQualityPanel;