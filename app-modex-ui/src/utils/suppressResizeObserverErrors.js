/**
 * This utility provides a global solution to suppress ResizeObserver errors
 * It works by patching the browser's error handling mechanisms at multiple levels
 */

/**
 * Suppress ResizeObserver errors globally
 * This function should be called as early as possible in the application lifecycle
 */
export const suppressResizeObserverErrors = () => {
  // 1. Override window.onerror to catch ResizeObserver errors
  const originalOnError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    if (message && typeof message === 'string' && message.includes('ResizeObserver')) {
      // Prevent the error from propagating
      return true;
    }
    // Call the original handler for other errors
    return originalOnError ? originalOnError.apply(this, arguments) : false;
  };

  // 2. Override console.error to suppress ResizeObserver error logging
  const originalConsoleError = console.error;
  console.error = function(...args) {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('ResizeObserver')) {
      // Don't log ResizeObserver errors
      return;
    }
    // Call the original console.error for other errors
    return originalConsoleError.apply(this, args);
  };

  // 3. Add a global event listener for error events
  window.addEventListener('error', (event) => {
    if (event && event.message && event.message.includes('ResizeObserver')) {
      // Prevent the error from propagating
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }, true);

  // 4. Add a global event listener for unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    if (event && event.reason && String(event.reason).includes('ResizeObserver')) {
      // Prevent the rejection from propagating
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  });

  // 5. Patch the ResizeObserver constructor to prevent loop limit errors
  if (typeof window !== 'undefined' && window.ResizeObserver) {
    const OriginalResizeObserver = window.ResizeObserver;
    
    window.ResizeObserver = class PatchedResizeObserver extends OriginalResizeObserver {
      constructor(callback) {
        // Create a wrapped callback that uses requestAnimationFrame
        const wrappedCallback = (entries, observer) => {
          window.requestAnimationFrame(() => {
            try {
              callback(entries, observer);
            } catch (error) {
              // Silently catch any errors in the callback
              if (!error.message.includes('ResizeObserver')) {
                console.error('Error in ResizeObserver callback:', error);
              }
            }
          });
        };
        
        super(wrappedCallback);
      }
    };
  }

  // 6. For React's error overlay in development mode
  if (process.env.NODE_ENV === 'development' && 
      window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__) {
    const originalHandleError = window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__.handleError;
    if (originalHandleError) {
      window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__.handleError = (error) => {
        if (error && error.message && error.message.includes('ResizeObserver')) {
          // Don't show the error overlay for ResizeObserver errors
          return;
        }
        originalHandleError(error);
      };
    }
  }
};

// Export a cleanup function that restores the original behavior
export const restoreResizeObserverErrorHandling = () => {
  // This function would restore all the original handlers
  // Implementation left as an exercise for the reader
  console.warn('ResizeObserver error handling restoration not implemented');
};
