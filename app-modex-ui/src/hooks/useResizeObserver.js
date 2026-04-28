import { useEffect, useRef, useState } from 'react';
import { createSafeResizeObserver } from '../utils/resizeUtils';

/**
 * Custom hook for safely handling resize events
 * 
 * This hook:
 * 1. Creates a ref for the element to observe
 * 2. Sets up a safe ResizeObserver that avoids loop limit errors
 * 3. Provides dimensions and ref to the component
 * 4. Handles cleanup on unmount
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.debounceTime - Debounce time in ms (default: 100)
 * @returns {Object} - Object containing ref and dimensions
 */
const useResizeObserver = (options = {}) => {
  const { debounceTime = 100 } = options;
  const ref = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeTimeoutRef = useRef(null);
  
  useEffect(() => {
    // Check if ref.current exists and is a valid DOM element
    if (!ref.current || typeof ref.current.getBoundingClientRect !== 'function') {
      return;
    }
    
    const updateDimensions = () => {
      // Double-check ref.current is still valid when the callback is executed
      if (!ref.current || typeof ref.current.getBoundingClientRect !== 'function') {
        return;
      }
      
      try {
        const { width, height } = ref.current.getBoundingClientRect();
        
        // Use requestAnimationFrame to avoid ResizeObserver loop issues
        requestAnimationFrame(() => {
          setDimensions({ width, height });
          
          // Set isResizing to true
          setIsResizing(true);
          
          // Clear any existing timeout
          if (resizeTimeoutRef.current) {
            clearTimeout(resizeTimeoutRef.current);
          }
          
          // Set a timeout to set isResizing back to false after debounceTime
          resizeTimeoutRef.current = setTimeout(() => {
            setIsResizing(false);
          }, debounceTime);
        });
      } catch (error) {
        console.error('Error getting element dimensions:', error);
      }
    };
    
    // Initial update
    updateDimensions();
    
    // Create observer for resize events
    const observer = createSafeResizeObserver(updateDimensions);
    
    try {
      observer.observe(ref.current);
    } catch (error) {
      // Catch and log any errors during observation
      console.error('Error observing element:', error);
    }
    
    return () => {
      // Clean up
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      try {
        observer.disconnect();
      } catch (error) {
        // Catch and log any errors during disconnect
        console.error('Error disconnecting observer:', error);
      }
    };
  }, [debounceTime]);
  
  return { ref, dimensions, isResizing };
};

export default useResizeObserver;
