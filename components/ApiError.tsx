import React from 'react';
import { AlertTriangle, Key, Clock, WifiOff, RefreshCcw } from 'lucide-react';

type ErrorType = 'api_key' | 'rate_limit' | 'network' | 'unknown';

interface ApiErrorProps {
  type: ErrorType;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

const errorConfig = {
  api_key: {
    icon: Key,
    title: 'API Key Missing',
    description: 'Add API keys to .env.local and restart the server.',
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10 border-yellow-500/30'
  },
  rate_limit: {
    icon: Clock,
    title: 'Rate Limit Exceeded',
    description: 'Too many requests. Please wait a moment before trying again.',
    color: 'text-orange-500',
    bg: 'bg-orange-500/10 border-orange-500/30'
  },
  network: {
    icon: WifiOff,
    title: 'Network Error',
    description: 'Unable to connect to the server. Check your internet connection.',
    color: 'text-red-500',
    bg: 'bg-red-500/10 border-red-500/30'
  },
  unknown: {
    icon: AlertTriangle,
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred.',
    color: 'text-gray-500',
    bg: 'bg-gray-500/10 border-gray-500/30'
  }
};

const ApiError: React.FC<ApiErrorProps> = ({ type, message, onRetry, compact }) => {
  const config = errorConfig[type] || errorConfig.unknown;
  const Icon = config.icon;

  if (compact) {
    return (
      <div className={`p-3 rounded-lg border ${config.bg} flex items-center gap-3`}>
        <Icon className={config.color} size={16} />
        <span className="text-xs text-gray-300 flex-1">{message || config.description}</span>
        {onRetry && (
          <button onClick={onRetry} className="text-xs text-primary-400 hover:text-primary-300 underline">
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-xl border ${config.bg} text-center`}>
      <Icon className={`${config.color} mx-auto mb-3`} size={32} />
      <h3 className="text-white font-bold mb-1">{config.title}</h3>
      <p className="text-gray-400 text-sm mb-4">
        {message || config.description}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <RefreshCcw size={14} className="mr-2" />
          Try Again
        </button>
      )}
    </div>
  );
};

export default ApiError;