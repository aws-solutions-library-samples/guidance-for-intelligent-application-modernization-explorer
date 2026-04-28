/**
 * Retry utilities for export operations
 * Provides exponential backoff, jitter, and intelligent retry logic
 */

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffFactor: 2,
  jitter: true,
  retryableErrors: [
    'network',
    'timeout',
    'server_error',
    'rate_limit',
    'temporary_failure'
  ]
};

/**
 * Determine if an error is retryable
 */
export const isRetryableError = (error, config = DEFAULT_RETRY_CONFIG) => {
  if (!error) return false;

  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.response?.status;
  


  // Network errors
  if (message.includes('network') || 
      message.includes('fetch') || 
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('timed out')) {
    return true;
  }

  // HTTP status codes that are retryable
  if (status) {
    // 5xx server errors (except 501 Not Implemented)
    if (status >= 500 && status <= 599 && status !== 501) {
      return true;
    }
    // 429 Too Many Requests
    if (status === 429) {
      return true;
    }
    // 408 Request Timeout
    if (status === 408) {
      return true;
    }
    
    // Explicitly non-retryable status codes
    if (status === 401 || status === 403 || status === 404 || 
        (status >= 400 && status < 500 && status !== 408 && status !== 429)) {
      return false;
    }
  }

  // Specific error types
  if (message.includes('rate limit') || 
      message.includes('quota exceeded') ||
      message.includes('temporary') ||
      message.includes('unavailable')) {
    return true;
  }

  return false;
};

/**
 * Calculate delay for next retry attempt with exponential backoff and jitter
 */
export const calculateRetryDelay = (attempt, config = DEFAULT_RETRY_CONFIG) => {
  const { baseDelay, maxDelay, backoffFactor, jitter } = config;
  
  // Calculate exponential backoff delay
  let delay = baseDelay * Math.pow(backoffFactor, attempt);
  
  // Apply maximum delay limit
  delay = Math.min(delay, maxDelay);
  
  // Add jitter to prevent thundering herd
  if (jitter) {
    // Add random jitter of ±25%
    const jitterAmount = delay * 0.25;
    delay += (Math.random() - 0.5) * 2 * jitterAmount;
  }
  
  return Math.max(delay, 0);
};

/**
 * Enhanced retry function with exponential backoff and intelligent error handling
 */
export const retryWithBackoff = async (
  operation, 
  config = DEFAULT_RETRY_CONFIG,
  onRetry = null
) => {
  const { maxRetries } = config;
  let lastError;
  let actualAttempts = 0;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    actualAttempts = attempt + 1; // Track actual attempts (1-based)
    
    try {
      // Execute the operation
      const result = await operation(attempt);
      
      // If successful, return the result
      return result;
      
    } catch (error) {
      lastError = error;
      
      // Log the error attempt
      console.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
      
      // Check if we should retry
      if (attempt < maxRetries && isRetryableError(error, config)) {
        const delay = calculateRetryDelay(attempt, config);
        
        console.log(`Retrying in ${delay}ms...`);
        
        // Call retry callback if provided
        if (onRetry) {
          onRetry(attempt + 1, delay, error);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
      } else {
        // No more retries or error is not retryable
        break;
      }
    }
  }
  
  // All retries exhausted, throw the last error with enhanced message
  const finalError = new Error(`Operation failed after ${actualAttempts} attempts: ${lastError.message}`);
  finalError.originalError = lastError;
  finalError.attempts = actualAttempts;
  throw finalError;
};

/**
 * Retry wrapper for API calls with specific export-related error handling
 */
export const retryApiCall = async (apiCall, options = {}) => {
  const config = {
    ...DEFAULT_RETRY_CONFIG,
    ...options
  };

  try {
    return await retryWithBackoff(
      async (attempt) => {
        try {
          return await apiCall();
        } catch (error) {
          // Enhance error with retry context
          error.retryAttempt = attempt;
          error.isRetryable = isRetryableError(error, config);
          throw error;
        }
      },
      config,
      options.onRetry
    );
  } catch (error) {
    // Ensure error enhancement is preserved
    if (!error.hasOwnProperty('retryAttempt')) {
      error.retryAttempt = config.maxRetries;
      error.isRetryable = isRetryableError(error, config);
    }
    throw error;
  }
};

/**
 * Retry wrapper for export operations with progress tracking
 */
export const retryExportOperation = async (
  operation, 
  operationName = 'Export operation',
  options = {}
) => {
  const config = {
    ...DEFAULT_RETRY_CONFIG,
    maxRetries: 2, // Fewer retries for export operations
    ...options
  };

  const startTime = Date.now();
  
  return retryWithBackoff(
    operation,
    config,
    (attempt, delay, error) => {
      const elapsed = Date.now() - startTime;
      
      console.log(`${operationName} retry ${attempt}/${config.maxRetries} after ${elapsed}ms`);
      
      // Call custom retry callback if provided
      if (options.onRetry) {
        options.onRetry({
          attempt,
          delay,
          error,
          operationName,
          elapsedTime: elapsed
        });
      }
    }
  );
};

/**
 * Circuit breaker pattern for export operations
 */
class ExportCircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 300000; // 5 minutes
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN - export service temporarily unavailable');
      }
    }

    try {
      const result = await operation();
      
      // Success - reset failure count
      this.failureCount = 0;
      this.successCount++;
      
      if (this.state === 'HALF_OPEN' && this.successCount >= 2) {
        this.state = 'CLOSED';
      }
      
      return result;
      
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        console.warn('Circuit breaker opened due to repeated failures');
      }
      
      throw error;
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount
    };
  }
}

// Global circuit breaker instance for export operations
export const exportCircuitBreaker = new ExportCircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds
});

/**
 * Wrapper for export API calls with circuit breaker protection
 */
export const callWithCircuitBreaker = async (operation) => {
  return exportCircuitBreaker.execute(operation);
};

/**
 * Utility to create a retryable version of an async function
 */
export const makeRetryable = (fn, config = DEFAULT_RETRY_CONFIG) => {
  return async (...args) => {
    return retryWithBackoff(
      () => fn(...args),
      config
    );
  };
};

/**
 * Batch retry utility for multiple operations
 */
export const retryBatch = async (operations, config = DEFAULT_RETRY_CONFIG) => {
  const results = [];
  const errors = [];
  
  for (let i = 0; i < operations.length; i++) {
    try {
      const result = await retryWithBackoff(operations[i], config);
      results.push({ index: i, result, success: true });
    } catch (error) {
      errors.push({ index: i, error, success: false });
      results.push({ index: i, error, success: false });
    }
  }
  
  return {
    results,
    errors,
    successCount: results.filter(r => r.success).length,
    errorCount: errors.length
  };
};

export default {
  isRetryableError,
  calculateRetryDelay,
  retryWithBackoff,
  retryApiCall,
  retryExportOperation,
  callWithCircuitBreaker,
  makeRetryable,
  retryBatch,
  exportCircuitBreaker
};