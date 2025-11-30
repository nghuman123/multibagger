
import React from 'react';
import { Key, Clock, WifiOff, AlertTriangle, RefreshCcw } from 'lucide-react';
import { ApiError } from '../services/utils/retry';

interface ErrorMessageProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ error, onRetry, className = '', compact = false }) => {
  let title = 'Error';
  let message = 'An unexpected error occurred.';
  let Icon = AlertTriangle;
  let actionLabel = 'Try Again';

  if (error instanceof ApiError) {
    switch (error.code) {
      case 'MISSING_KEY':
        title = 'API Key Missing';
        message = 'Please configure your FMP_API_KEY in environment variables to see live data.';
        Icon = Key;
        actionLabel = 'Check Config';
        break;
      case 'RATE_LIMIT':
        title = 'Rate Limit Exceeded';
        message = 'Too many requests. The free tier allows limited calls per minute.';
        Icon = Clock;
        break;
      case 'NETWORK':
        title = 'Network Error';
        message = 'Unable to connect to the data provider. Check your internet connection.';
        Icon = WifiOff;
        break;
      case 'NOT_FOUND':
        title = 'Not Found';
        message = 'The requested stock ticker could not be found.';
        Icon = AlertTriangle;
        break;
    }
  }

  if (compact) {
    return (
       <div className={`bg-red-900/20 border border-red-900/50 rounded-lg p-3 flex items-center gap-3 ${className}`}>
         <Icon size={16} className="text-red-400 flex-shrink-0" />
         <span className="text-xs text-red-200 flex-1">{message}</span>
         {onRetry && (
            <button onClick={onRetry} className="text-xs bg-red-900/50 hover:bg-red-900 px-2 py-1 rounded text-white transition-colors">
               Retry
            </button>
         )}
       </div>
    );
  }

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-6 text-center ${className}`}>
      <div className="bg-red-500/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
        <Icon className="text-red-500" size={24} />
      </div>
      <h3 className="text-white font-bold mb-1">{title}</h3>
      <p className="text-gray-400 text-sm mb-4">{message}</p>
      {onRetry && (
        <button 
          onClick={onRetry} 
          className="inline-flex items-center text-sm bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <RefreshCcw size={14} className="mr-2" />
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;
