/**
 * Utility functions for handling resize operations and optimizing ResizeObserver usage
 */

/**
 * Creates a debounced function that delays invoking the provided function
 * until after the specified wait time has elapsed since the last time it was invoked.
 * 
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to delay
 * @returns {Function} - The debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Creates a throttled function that only invokes the provided function
 * at most once per every specified wait period.
 * 
 * @param {Function} func - The function to throttle
 * @param {number} limit - The number of milliseconds to throttle invocations to
 * @returns {Function} - The throttled function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

/**
 * Creates a safe ResizeObserver that handles the "ResizeObserver loop limit exceeded" error
 * 
 * @param {Function} callback - The callback function to execute when resize is observed
 * @returns {ResizeObserver} - A ResizeObserver instance with error handling
 */
export const createSafeResizeObserver = (callback) => {
  // Use requestAnimationFrame to avoid ResizeObserver loop limit exceeded error
  const safeCallback = (entries, observer) => {
    requestAnimationFrame(() => {
      try {
        callback(entries, observer);
      } catch (error) {
        // Silently handle ResizeObserver errors, log others
        if (!error.message || !error.message.includes('ResizeObserver')) {
          console.error('Error in ResizeObserver callback:', error);
        }
      }
    });
  };
  
  return new ResizeObserver(safeCallback);
};

/**
 * Safely updates state in response to resize events using requestAnimationFrame
 * 
 * @param {Function} setStateFunction - React setState function
 * @param {any} newState - The new state to set
 */
export const safeSetState = (setStateFunction, newState) => {
  requestAnimationFrame(() => {
    setStateFunction(newState);
  });
};
