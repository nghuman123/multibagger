
export class ApiError extends Error {
  constructor(
    public code: 'MISSING_KEY' | 'RATE_LIMIT' | 'NETWORK' | 'NOT_FOUND' | 'UNKNOWN',
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: unknown) => boolean;
}

export const fetchWithRetry = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    shouldRetry = (error) => {
      // Don't retry on 4xx client errors unless it's a rate limit
      if (error instanceof ApiError) {
         if (error.code === 'MISSING_KEY' || error.code === 'NOT_FOUND') return false;
         if (error.code === 'RATE_LIMIT') return true; 
      }
      if (error instanceof Response && error.status >= 400 && error.status < 500) {
        if (error.status === 429) return true;
        return false;
      }
      return true;
    }
  } = options;

  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!shouldRetry(error) || attempt === maxRetries) {
        throw error;
      }
      
      const delay = delayMs * Math.pow(backoffMultiplier, attempt);
      console.warn(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  throw lastError;
};
