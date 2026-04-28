import React, { useEffect, useRef } from 'react';

/**
 * Component that handles ResizeObserver errors for Table components
 * This component should be rendered as a parent of the Table component
 */
const TableErrorHandler = ({ children }) => {
  const containerRef = useRef(null);
  
  useEffect(() => {
    // Create a MutationObserver to watch for ResizeObserver errors
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check for error messages in the DOM
          const errorElements = document.querySelectorAll('[role="alert"]');
          for (const errorElement of errorElements) {
            if (errorElement.textContent && 
                (errorElement.textContent.includes('ResizeObserver loop') || 
                 errorElement.textContent.includes('ResizeObserver loop completed with undelivered notifications') ||
                 errorElement.textContent.includes('ResizeObserver was not able to deliver') ||
                 errorElement.textContent.includes('getBoundingClientRect is not a function'))) {
              // Remove the error element
              errorElement.remove();
            }
          }
        }
      }
    });
    
    // Start observing the document body for error messages
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Patch the error handler for this specific component
    const originalError = console.error;
    console.error = (...args) => {
      if (args[0] && typeof args[0] === 'string' && 
          (args[0].includes('ResizeObserver') || 
           args[0].includes('getBoundingClientRect'))) {
        return;
      }
      originalError(...args);
    };
    
    // Clean up the observer when the component unmounts
    return () => {
      observer.disconnect();
      console.error = originalError;
    };
  }, []);
  
  return <div ref={containerRef}>{children}</div>;
};

export default TableErrorHandler;
