/**
 * Utility functions for handling and suppressing specific errors
 */

/**
 * Completely disables ResizeObserver error reporting
 */
export const disableResizeObserverErrors = () => {
  // Store original functions
  const originalError = window.console.error;
  const originalWarn = window.console.warn;
  
  // Enhanced ResizeObserver error patterns
  const resizeObserverPatterns = [
    'ResizeObserver loop',
    'ResizeObserver loop completed with undelivered notifications',
    'ResizeObserver was not able to deliver',
    'ResizeObserver loop limit exceeded',
    'handleError'
  ];
  
  const isResizeObserverError = (message) => {
    if (!message) return false;
    const messageStr = String(message);
    return resizeObserverPatterns.some(pattern => messageStr.includes(pattern));
  };
  
  // Override console.error
  window.console.error = (...args) => {
    if (args.length > 0 && isResizeObserverError(args[0])) {
      return; // Silently ignore
    }
    originalError.apply(window.console, args);
  };
  
  // Override console.warn
  window.console.warn = (...args) => {
    if (args.length > 0 && isResizeObserverError(args[0])) {
      return; // Silently ignore
    }
    originalWarn.apply(window.console, args);
  };
  
  // Override global error handler
  window.addEventListener('error', (event) => {
    if (event && (isResizeObserverError(event.message) || isResizeObserverError(event.error))) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return false;
    }
  }, true);
  
  // Override unhandled rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    if (event && isResizeObserverError(event.reason)) {
      event.preventDefault();
      return false;
    }
  });
  
  // Create a custom ResizeObserver that doesn't throw loop limit errors
  if (typeof window !== 'undefined' && window.ResizeObserver) {
    const originalResizeObserver = window.ResizeObserver;
    
    window.ResizeObserver = class PatchedResizeObserver extends originalResizeObserver {
      constructor(callback) {
        super((entries, observer) => {
          // Use requestAnimationFrame to throttle callbacks and avoid loop limit errors
          window.requestAnimationFrame(() => {
            if (!Array.isArray(entries)) {
              return;
            }
            
            try {
              callback(entries, observer);
            } catch (error) {
              // Catch and suppress any ResizeObserver errors
              if (!isResizeObserverError(error.message)) {
                console.error('Error in ResizeObserver callback:', error);
              }
            }
          });
        });
      }
    };
  }
  
  // Handle React's development mode error overlay
  if (process.env.NODE_ENV === 'development') {
    // Completely disable the error overlay for ResizeObserver errors
    const originalReactErrorHandler = window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__?.handleError;
    if (originalReactErrorHandler) {
      window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__.handleError = (error) => {
        if (error && isResizeObserverError(error.message)) {
          return; // Don't show overlay for ResizeObserver errors
        }
        originalReactErrorHandler(error);
      };
    }
    
    // Also handle the captureConsoleIntegration
    if (window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__?.captureConsoleIntegration) {
      const originalCaptureConsole = window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__.captureConsoleIntegration;
      window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__.captureConsoleIntegration = (errorCallback) => {
        return originalCaptureConsole((error, type) => {
          if (error && isResizeObserverError(error.message)) {
            return; // Don't capture ResizeObserver errors
          }
          errorCallback(error, type);
        });
      };
    }
  }
};

/**
 * Initialize all error handlers
 */
export const initializeErrorHandlers = () => {
  disableResizeObserverErrors();
  
  // Additional global error handling for development
  if (process.env.NODE_ENV === 'development') {
    // Suppress specific development warnings
    const originalWarn = console.warn;
    console.warn = (...args) => {
      // Filter out common development warnings that aren't actionable
      if (args[0] && typeof args[0] === 'string') {
        const message = args[0];
        if (message.includes('ResizeObserver') || 
            message.includes('Warning: ReactDOM.render is no longer supported')) {
          return;
        }
      }
      originalWarn.apply(console, args);
    };
  }
};
