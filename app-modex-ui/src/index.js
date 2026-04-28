import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Initialize i18n BEFORE importing App to ensure translations are ready
import './i18n';

import App from './App';
import { configureAmplify } from './config/amplifyConfig';
import ResizeObserverErrorBoundary from './components/ResizeObserverErrorBoundary';

// Ultimate ResizeObserver error suppression
(function() {
  // Override all possible error sources
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // Pattern matching for ResizeObserver errors
  const isResizeObserverError = (msg) => {
    const str = String(msg || '');
    return str.includes('ResizeObserver') || 
           str.includes('handleError') ||
           str.includes('deliverResizeLoopError') ||
           str.includes('loop completed with undelivered notifications');
  };

  // Override console methods
  console.error = function(...args) {
    if (args.some(arg => isResizeObserverError(arg))) return;
    originalError.apply(console, args);
  };

  console.warn = function(...args) {
    if (args.some(arg => isResizeObserverError(arg))) return;
    originalWarn.apply(console, args);
  };

  // Override window error events
  window.addEventListener('error', function(event) {
    if (isResizeObserverError(event.message) || isResizeObserverError(event.error)) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return false;
    }
  }, true);

  // Override unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    if (isResizeObserverError(event.reason)) {
      event.preventDefault();
      return false;
    }
  });

  // Nuclear option: Completely disable React error overlay
  if (process.env.NODE_ENV === 'development') {
    // Set environment variable to disable overlay
    process.env.REACT_APP_DISABLE_ERROR_OVERLAY = 'true';
    
    // Override the global hook
    window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__ = null;
    
    // Also try to disable through webpack
    if (window.webpackHotUpdate) {
      const originalWebpackHotUpdate = window.webpackHotUpdate;
      window.webpackHotUpdate = function(...args) {
        try {
          return originalWebpackHotUpdate.apply(this, args);
        } catch (error) {
          if (isResizeObserverError(error.message)) return;
          throw error;
        }
      };
    }
  }
})();

// Configure Amplify
configureAmplify();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ResizeObserverErrorBoundary>
    <App />
  </ResizeObserverErrorBoundary>
);
