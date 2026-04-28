import React, { useEffect, useRef } from 'react';
import { createSafeResizeObserver } from '../utils/resizeUtils';

/**
 * Higher-Order Component that adds ResizeObserver optimization to any component
 * 
 * This HOC:
 * 1. Creates a safe ResizeObserver that avoids loop limit errors
 * 2. Provides containerRef and dimensions to the wrapped component
 * 3. Handles cleanup on unmount
 * 
 * @param {React.ComponentType} WrappedComponent - The component to wrap
 * @returns {React.ComponentType} - The wrapped component with resize optimization
 */
const withResizeOptimization = (WrappedComponent) => {
  const WithResizeOptimization = (props) => {
    const containerRef = useRef(null);
    const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });
    
    useEffect(() => {
      if (!containerRef.current) return;
      
      // Update dimensions initially
      const updateDimensions = () => {
        if (containerRef.current) {
          const { width, height } = containerRef.current.getBoundingClientRect();
          
          // Use requestAnimationFrame to avoid ResizeObserver loop issues
          requestAnimationFrame(() => {
            setDimensions({ width, height });
          });
        }
      };
      
      // Initial update
      updateDimensions();
      
      // Create observer for resize events
      const observer = createSafeResizeObserver(updateDimensions);
      observer.observe(containerRef.current);
      
      return () => {
        observer.disconnect();
      };
    }, []);
    
    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        {containerRef.current && (
          <WrappedComponent
            {...props}
            containerRef={containerRef}
            dimensions={dimensions}
          />
        )}
      </div>
    );
  };
  
  WithResizeOptimization.displayName = `WithResizeOptimization(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  
  return WithResizeOptimization;
};

export default withResizeOptimization;
