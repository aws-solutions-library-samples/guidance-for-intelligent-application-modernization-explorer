/**
 * This file contains a direct patch for the browser's ResizeObserver implementation
 * It replaces the native ResizeObserver with a custom implementation that doesn't throw loop limit errors
 */

/**
 * Apply the ResizeObserver patch
 * This function should be called as early as possible in the application lifecycle
 */
export const patchResizeObserver = () => {
  if (typeof window === 'undefined' || !window.ResizeObserver) {
    return;
  }
  
  // Store the original ResizeObserver
  const OriginalResizeObserver = window.ResizeObserver;
  
  // Create a patched version
  window.ResizeObserver = class PatchedResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observer = new OriginalResizeObserver(this.wrapCallback.bind(this));
    }
    
    wrapCallback(entries, observer) {
      // Use requestAnimationFrame to avoid loop limit errors
      window.requestAnimationFrame(() => {
        try {
          this.callback(entries, observer);
        } catch (error) {
          // Silently catch any errors in the callback
          if (!error.message.includes('ResizeObserver')) {
            console.error('Error in ResizeObserver callback:', error);
          }
        }
      });
    }
    
    observe(target, options) {
      try {
        this.observer.observe(target, options);
      } catch (error) {
        console.error('Error in ResizeObserver.observe:', error);
      }
    }
    
    unobserve(target) {
      try {
        this.observer.unobserve(target);
      } catch (error) {
        console.error('Error in ResizeObserver.unobserve:', error);
      }
    }
    
    disconnect() {
      try {
        this.observer.disconnect();
      } catch (error) {
        console.error('Error in ResizeObserver.disconnect:', error);
      }
    }
  };
  
  // Log that the patch has been applied
  console.log('ResizeObserver patched successfully');
};

/**
 * Restore the original ResizeObserver implementation
 */
export const restoreResizeObserver = () => {
  // This function would restore the original ResizeObserver
  // Implementation left as an exercise for the reader
  console.warn('ResizeObserver restoration not implemented');
};
