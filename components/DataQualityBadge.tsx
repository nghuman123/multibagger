import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';

export type QualityState = 
  | 'real' | 'estimated' | 'unavailable' // Insider / Short Interest
  | 'full' | 'partial'               // Beneish
  | 'high' | 'medium' | 'low';       // Confidence

interface DataQualityBadgeProps {
  source: QualityState;
  tooltip?: string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const DataQualityBadge: React.FC<DataQualityBadgeProps> = ({ 
  source, 
  tooltip, 
  size = 'sm', 
  showLabel = true,
  className = ''
}) => {
  // Normalize input to 3 visual states
  let state: 'good' | 'warning' | 'bad' = 'bad';
  let label = 'Unknown';

  switch (source) {
    case 'real':
    case 'full':
    case 'high':
      state = 'good';
      label = source === 'real' ? 'Verified' : source === 'full' ? 'Complete' : 'High';
      break;
    case 'estimated':
    case 'partial':
    case 'medium':
      state = 'warning';
      label = source === 'estimated' ? 'Estimated' : source === 'partial' ? 'Partial' : 'Medium';
      break;
    case 'unavailable':
    case 'low':
      state = 'bad';
      label = source === 'unavailable' ? 'Missing' : 'Low';
      break;
  }

  const config = {
    good: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/20' },
    warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    bad: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20' }
  };

  const { icon: Icon, color, bg } = config[state];
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const textClass = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const paddingClass = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1';

  return (
    <div 
      className={`inline-flex items-center gap-1.5 rounded-full border ${bg} ${color} ${paddingClass} ${className} cursor-help`} 
      title={tooltip || `${label} Data Quality`}
    >
      <Icon className={sizeClass} />
      {showLabel && <span className={`font-medium uppercase tracking-wide ${textClass}`}>{label}</span>}
    </div>
  );
};

export default DataQualityBadge;