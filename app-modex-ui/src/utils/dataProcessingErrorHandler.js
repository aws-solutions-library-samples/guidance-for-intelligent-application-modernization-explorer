/**
 * Specific error handler for the DataProcessingPage component
 * This handler suppresses ResizeObserver errors and provides a clean error handling mechanism
 */

/**
 * Initialize the error handler for DataProcessingPage
 * This function should be called when the DataProcessingPage component mounts
 */
export const initializeDataProcessingErrorHandler = () => {
  // Store original console.error
  const originalConsoleError = console.error;
  
  // Override console.error to suppress ResizeObserver errors
  console.error = (...args) => {
    // Check if this is a ResizeObserver error
    if (args[0] && typeof args[0] === 'string' && 
        (args[0].includes('ResizeObserver loop') || 
         args[0].includes('ResizeObserver loop completed with undelivered notifications') ||
         args[0].includes('ResizeObserver was not able to deliver'))) {
      // Suppress the error
      return;
    }
    
    // Pass through all other errors
    originalConsoleError(...args);
  };
  
  // Add a specific error event listener for the DataProcessingPage
  const errorHandler = (event) => {
    if (event && event.error && event.error.message && 
        (event.error.message.includes('ResizeObserver loop') || 
         event.error.message.includes('ResizeObserver loop completed with undelivered notifications') ||
         event.error.message.includes('ResizeObserver was not able to deliver'))) {
      // Prevent the error from propagating
      event.preventDefault();
      return false;
    }
  };
  
  // Add the error handler
  window.addEventListener('error', errorHandler, true);
  
  // Return a cleanup function
  return () => {
    // Restore original console.error
    console.error = originalConsoleError;
    
    // Remove the error handler
    window.removeEventListener('error', errorHandler, true);
  };
};

/**
 * Patch the ResizeObserver for the DataProcessingPage
 * This function creates a patched version of ResizeObserver that doesn't throw loop limit errors
 */
export const patchResizeObserverForDataProcessing = () => {
  if (typeof window !== 'undefined' && window.ResizeObserver) {
    // Store the original ResizeObserver
    const OriginalResizeObserver = window.ResizeObserver;
    
    // Create a patched version
    window.ResizeObserver = class PatchedResizeObserver extends OriginalResizeObserver {
      constructor(callback) {
        // Wrap the callback in a try-catch block and use requestAnimationFrame
        const safeCallback = (entries, observer) => {
          window.requestAnimationFrame(() => {
            try {
              callback(entries, observer);
            } catch (error) {
              // Suppress ResizeObserver errors
              if (!error.message.includes('ResizeObserver')) {
                console.error('Error in ResizeObserver callback:', error);
              }
            }
          });
        };
        
        // Call the original constructor with our safe callback
        super(safeCallback);
      }
    };
    
    // Return a function to restore the original ResizeObserver
    return () => {
      window.ResizeObserver = OriginalResizeObserver;
    };
  }
  
  // Return a no-op cleanup function if ResizeObserver doesn't exist
  return () => {};
};
