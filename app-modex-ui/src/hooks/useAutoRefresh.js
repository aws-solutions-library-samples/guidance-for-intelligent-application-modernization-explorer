import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * Custom hook for auto-refresh functionality with fixed 30-second interval
 * Smart refresh (data comparison) prevents UI flickering
 * 
 * @param {Function} refreshCallback - Function to call when refresh is triggered
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Whether auto-refresh is enabled (default: true)
 * @returns {Object} - Auto-refresh state and controls
 */
export const useAutoRefresh = (refreshCallback, options = {}) => {
  const {
    enabled = true
  } = options;

  const FIXED_INTERVAL = 30; // Fixed 30-second interval
  const [isPaused, setIsPaused] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef(null);
  const pauseTimeoutRef = useRef(null);

  // Manual refresh trigger
  const isRefreshingRef = useRef(false);
  
  const triggerRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return; // Prevent concurrent refreshes
    
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await refreshCallback();
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setIsRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, [refreshCallback]);

  // Pause auto-refresh temporarily (useful when user is typing)
  const pauseTemporarily = useCallback((duration = 5000) => {
    setIsPaused(true);
    
    // Clear existing pause timeout
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
    }
    
    // Resume after duration
    pauseTimeoutRef.current = setTimeout(() => {
      setIsPaused(false);
    }, duration);
  }, []);

  // Toggle pause/resume
  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  // Set up auto-refresh interval
  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Don't set up interval if disabled or paused
    if (!enabled || isPaused) {
      return;
    }

    // Set up new interval (fixed 30 seconds)
    intervalRef.current = setInterval(() => {
      triggerRefresh();
    }, FIXED_INTERVAL * 1000);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
      }
    };
  }, [isPaused, enabled, triggerRefresh]);

  return useMemo(() => ({
    isPaused,
    togglePause,
    pauseTemporarily,
    triggerRefresh,
    isRefreshing
  }), [isPaused, togglePause, pauseTemporarily, triggerRefresh, isRefreshing]);
};
