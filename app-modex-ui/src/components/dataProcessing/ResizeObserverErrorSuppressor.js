import { useEffect } from 'react';

/**
 * Component that suppresses ResizeObserver errors
 * This component doesn't render anything, it just adds error handling
 */
const ResizeObserverErrorSuppressor = () => {
  useEffect(() => {
    // Store original error handlers
    const originalOnError = window.onerror;
    const originalConsoleError = console.error;
    
    // Override window.onerror with more comprehensive checking
    window.onerror = function(message, source, lineno, colno, error) {
      // Check for ResizeObserver errors in multiple ways
      const isResizeObserverError = 
        (message && typeof message === 'string' && message.includes('ResizeObserver')) ||
        (error && error.message && error.message.includes('ResizeObserver')) ||
        (error && error.name === 'ResizeObserver') ||
        (source && source.includes('ResizeObserver'));
        
      if (isResizeObserverError) {
        console.debug('Suppressed ResizeObserver error:', { message, source, lineno, colno, error });
        return true; // Prevent error from propagating
      }
      return originalOnError ? originalOnError.apply(this, arguments) : false;
    };
    
    // Override console.error with better filtering
    console.error = function(...args) {
      // Check if any argument contains ResizeObserver
      const hasResizeObserverError = args.some(arg => 
        (typeof arg === 'string' && arg.includes('ResizeObserver')) ||
        (arg && arg.message && arg.message.includes('ResizeObserver')) ||
        (arg && arg.toString && arg.toString().includes('ResizeObserver'))
      );
      
      if (hasResizeObserverError) {
        console.debug('Suppressed ResizeObserver console error:', ...args);
        return; // Don't log ResizeObserver errors
      }
      return originalConsoleError.apply(this, args);
    };
    
    // Create error event listener
    const errorHandler = (event) => {
      if (event && event.message && event.message.includes('ResizeObserver')) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };
    
    // Create unhandled rejection listener
    const rejectionHandler = (event) => {
      if (event && event.reason && String(event.reason).includes('ResizeObserver')) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };
    
    // Add event listeners
    window.addEventListener('error', errorHandler, true);
    window.addEventListener('unhandledrejection', rejectionHandler);
    
    // Create MutationObserver to remove error messages from the DOM
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Find and remove error messages related to ResizeObserver
          const errorNodes = document.querySelectorAll('[role="alert"]');
          errorNodes.forEach(node => {
            if (node.textContent && node.textContent.includes('ResizeObserver')) {
              node.remove();
            }
          });
        }
      }
    });
    
    // Start observing the document body
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Return cleanup function
    return () => {
      // Restore original error handlers
      window.onerror = originalOnError;
      console.error = originalConsoleError;
      
      // Remove event listeners
      window.removeEventListener('error', errorHandler, true);
      window.removeEventListener('unhandledrejection', rejectionHandler);
      
      // Disconnect observer
      observer.disconnect();
    };
  }, []);
  
  // This component doesn't render anything
  return null;
};

export default ResizeObserverErrorSuppressor;
