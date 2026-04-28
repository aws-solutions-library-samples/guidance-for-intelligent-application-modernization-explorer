/**
 * Export Error Logging and Monitoring Utility
 * Provides comprehensive error logging, monitoring integration, and user feedback
 */

/**
 * Error severity levels
 */
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Error categories for better classification
 */
export const ERROR_CATEGORIES = {
  NETWORK: 'network',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  VALIDATION: 'validation',
  SERVER: 'server',
  CLIENT: 'client',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  QUOTA: 'quota',
  UNKNOWN: 'unknown'
};

/**
 * Determine error category based on error properties
 */
export const categorizeError = (error) => {
  if (!error) return ERROR_CATEGORIES.UNKNOWN;

  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.response?.status;

  // Network errors
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return ERROR_CATEGORIES.NETWORK;
  }

  // Authentication errors
  if (status === 401 || message.includes('auth') || message.includes('token')) {
    return ERROR_CATEGORIES.AUTHENTICATION;
  }

  // Authorization errors
  if (status === 403 || message.includes('permission') || message.includes('forbidden')) {
    return ERROR_CATEGORIES.AUTHORIZATION;
  }

  // Validation errors
  if (status === 400 || message.includes('validation') || message.includes('invalid')) {
    return ERROR_CATEGORIES.VALIDATION;
  }

  // Rate limiting
  if (status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return ERROR_CATEGORIES.RATE_LIMIT;
  }

  // Quota errors
  if (message.includes('quota') || message.includes('limit exceeded')) {
    return ERROR_CATEGORIES.QUOTA;
  }

  // Timeout errors
  if (status === 408 || message.includes('timeout') || message.includes('timed out')) {
    return ERROR_CATEGORIES.TIMEOUT;
  }

  // Server errors
  if (status >= 500) {
    return ERROR_CATEGORIES.SERVER;
  }

  // Client errors
  if (status >= 400 && status < 500) {
    return ERROR_CATEGORIES.CLIENT;
  }

  return ERROR_CATEGORIES.UNKNOWN;
};

/**
 * Determine error severity based on category and impact
 */
export const determineSeverity = (error, context = {}) => {
  const category = categorizeError(error);
  const status = error.status || 0;

  // Critical errors that prevent core functionality
  if (category === ERROR_CATEGORIES.SERVER && status >= 500) {
    return ERROR_SEVERITY.CRITICAL;
  }

  // High severity for auth/permission issues
  if (category === ERROR_CATEGORIES.AUTHENTICATION || 
      category === ERROR_CATEGORIES.AUTHORIZATION) {
    return ERROR_SEVERITY.HIGH;
  }

  // Medium severity for network and timeout issues
  if (category === ERROR_CATEGORIES.NETWORK || 
      category === ERROR_CATEGORIES.TIMEOUT ||
      category === ERROR_CATEGORIES.RATE_LIMIT) {
    return ERROR_SEVERITY.MEDIUM;
  }

  // Low severity for validation and client errors
  if (category === ERROR_CATEGORIES.VALIDATION || 
      category === ERROR_CATEGORIES.CLIENT) {
    return ERROR_SEVERITY.LOW;
  }

  return ERROR_SEVERITY.MEDIUM;
};

/**
 * Create a structured error log entry
 */
export const createErrorLogEntry = (error, context = {}) => {
  const category = categorizeError(error);
  const severity = determineSeverity(error, context);
  
  return {
    // Error details
    message: error.message || 'Unknown error',
    name: error.name || 'Error',
    stack: error.stack,
    status: error.status,
    
    // Classification
    category,
    severity,
    
    // Context information
    context: {
      component: context.component || 'unknown',
      operation: context.operation || 'unknown',
      userId: context.userId || 'anonymous',
      projectId: context.projectId || 'unknown',
      exportId: context.exportId,
      retryAttempt: context.retryAttempt || 0,
      ...context
    },
    
    // Environment information
    environment: {
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
      buildVersion: process.env.REACT_APP_VERSION || 'unknown'
    },
    
    // Additional metadata
    metadata: {
      isRetryable: error.isRetryable || false,
      errorId: generateErrorId(),
      correlationId: context.correlationId || generateCorrelationId()
    }
  };
};

/**
 * Get or create session ID for error correlation
 */
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('export_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('export_session_id', sessionId);
  }
  return sessionId;
};

/**
 * Generate unique error ID
 */
const generateErrorId = () => {
  return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generate correlation ID for tracking related operations
 */
const generateCorrelationId = () => {
  return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Log error to console with structured format
 */
export const logToConsole = (errorEntry) => {
  const { severity, category, message, context, metadata } = errorEntry;
  
  const logMethod = severity === ERROR_SEVERITY.CRITICAL ? 'error' :
                   severity === ERROR_SEVERITY.HIGH ? 'error' :
                   severity === ERROR_SEVERITY.MEDIUM ? 'warn' : 'log';
  
  console[logMethod](`[EXPORT_ERROR] ${category.toUpperCase()}: ${message}`, {
    errorId: metadata.errorId,
    context: context.component,
    operation: context.operation,
    severity,
    timestamp: errorEntry.environment.timestamp
  });
  
  // Log full details in development
  if (process.env.NODE_ENV === 'development') {
    console.groupCollapsed(`Error Details: ${metadata.errorId}`);
    console.log('Full Error Entry:', errorEntry);
    console.groupEnd();
  }
};

/**
 * Store error in local storage for debugging and support
 */
export const storeErrorLocally = (errorEntry) => {
  try {
    const storageKey = 'export_error_logs';
    const existingLogs = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    // Add new error
    existingLogs.push(errorEntry);
    
    // Keep only last 50 errors to prevent storage bloat
    if (existingLogs.length > 50) {
      existingLogs.splice(0, existingLogs.length - 50);
    }
    
    localStorage.setItem(storageKey, JSON.stringify(existingLogs));
  } catch (storageError) {
    console.warn('Failed to store error log locally:', storageError);
  }
};

/**
 * Send error to monitoring service (placeholder for real implementation)
 */
export const sendToMonitoringService = async (errorEntry) => {
  // In production, this would send to a real monitoring service
  // like DataDog, New Relic, Sentry, etc.
  
  if (process.env.NODE_ENV === 'production') {
    try {
      // Example implementation for a monitoring service
      // await fetch('/api/monitoring/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorEntry)
      // });
      
      console.log('Would send to monitoring service:', errorEntry.metadata.errorId);
    } catch (monitoringError) {
      console.warn('Failed to send error to monitoring service:', monitoringError);
    }
  }
};

/**
 * Main error logging function
 */
export const logExportError = async (error, context = {}) => {
  try {
    const errorEntry = createErrorLogEntry(error, context);
    
    // Log to console
    logToConsole(errorEntry);
    
    // Store locally for debugging
    storeErrorLocally(errorEntry);
    
    // Send to monitoring service
    await sendToMonitoringService(errorEntry);
    
    return errorEntry;
  } catch (loggingError) {
    console.error('Failed to log export error:', loggingError);
    // Fallback to basic console logging
    console.error('Original error:', error);
  }
};

/**
 * Get error logs from local storage for debugging
 */
export const getStoredErrorLogs = () => {
  try {
    return JSON.parse(localStorage.getItem('export_error_logs') || '[]');
  } catch (error) {
    console.warn('Failed to retrieve stored error logs:', error);
    return [];
  }
};

/**
 * Clear stored error logs
 */
export const clearStoredErrorLogs = () => {
  try {
    localStorage.removeItem('export_error_logs');
    sessionStorage.removeItem('export_session_id');
  } catch (error) {
    console.warn('Failed to clear stored error logs:', error);
  }
};

/**
 * Generate error report for support
 */
export const generateErrorReport = (errorId) => {
  const logs = getStoredErrorLogs();
  const targetError = logs.find(log => log.metadata.errorId === errorId);
  
  if (!targetError) {
    return 'Error not found in local logs';
  }
  
  return `
Export Error Report
==================

Error ID: ${targetError.metadata.errorId}
Timestamp: ${targetError.environment.timestamp}
Severity: ${targetError.severity}
Category: ${targetError.category}

Error Details:
- Message: ${targetError.message}
- Status: ${targetError.status || 'N/A'}
- Component: ${targetError.context.component}
- Operation: ${targetError.context.operation}

Environment:
- URL: ${targetError.environment.url}
- User Agent: ${targetError.environment.userAgent}
- Build Version: ${targetError.environment.buildVersion}

Context:
- Project ID: ${targetError.context.projectId}
- Export ID: ${targetError.context.exportId || 'N/A'}
- Retry Attempt: ${targetError.context.retryAttempt}

Please include this report when contacting support.
  `.trim();
};

export default {
  logExportError,
  createErrorLogEntry,
  categorizeError,
  determineSeverity,
  getStoredErrorLogs,
  clearStoredErrorLogs,
  generateErrorReport,
  ERROR_SEVERITY,
  ERROR_CATEGORIES
};