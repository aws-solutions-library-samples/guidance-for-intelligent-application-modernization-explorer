/**
 * Simplified Authentication Context for Cognito Hosted UI
 * Much simpler than the previous complex challenge-based context
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

// Create context
const SimpleAuthContext = createContext();

// Auth provider component
export const SimpleAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication status on mount and when window gains focus
  useEffect(() => {
    checkAuthState();
    
    // Check for auth success flag from OAuth callback
    const checkAuthSuccess = () => {
      const authSuccess = localStorage.getItem('auth_success');
      const authTimestamp = localStorage.getItem('auth_timestamp');
      
      if (authSuccess && authTimestamp) {
        const timestamp = parseInt(authTimestamp);
        const now = Date.now();
        
        // If auth success was recent (within 30 seconds), re-check auth state
        if (now - timestamp < 30000) {
          console.log('🔐 Recent auth success detected, re-checking state...');
          localStorage.removeItem('auth_success');
          localStorage.removeItem('auth_timestamp');
          setTimeout(checkAuthState, 1000);
        }
      }
    };
    
    checkAuthSuccess();
    
    // Re-check auth state when window gains focus
    const handleFocus = () => {
      console.log('🔐 Window gained focus, re-checking auth state...');
      checkAuthState();
    };
    
    // Periodically re-check auth state to detect server-side logout
    const interval = setInterval(() => {
      console.log('🔐 Periodic auth state check...');
      checkAuthState();
    }, 30000); // Check every 30 seconds
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, []);

  const checkAuthState = async () => {
    try {
      setLoading(true);
      console.log('🔐 Checking authentication state...');
      
      const authenticated = await authService.isAuthenticated();
      
      if (authenticated) {
        const currentUser = await authService.getCurrentUser();
        console.log('🔐 User is authenticated:', currentUser?.username);
        
        setUser(currentUser);
        setIsAuthenticated(true);
      } else {
        console.log('🔐 User is not authenticated');
        setUser(null);
        setIsAuthenticated(false);
      }
      
    } catch (error) {
      console.error('🔐 Error checking auth state:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  // Force refresh auth state (for testing)
  const refreshAuthState = () => {
    console.log('🔐 Manually refreshing auth state...');
    checkAuthState();
  };

  const signIn = async () => {
    console.log('🔐 Initiating sign in...');
    await authService.signIn();
    // Note: This will redirect, so no state updates needed here
  };

  const signOut = async () => {
    console.log('🔐 Initiating sign out...');
    setLoading(true);
    
    // Clear local state immediately
    setUser(null);
    setIsAuthenticated(false);
    
    // Clear any local storage
    localStorage.removeItem('selectedProject');
    localStorage.removeItem('username');
    
    // Redirect to Cognito logout
    await authService.signOut();
    // Note: This will redirect, so no further state updates needed
  };

  const getAuthToken = async () => {
    return await authService.getAuthToken();
  };

  const contextValue = {
    // State
    user,
    loading,
    isAuthenticated,
    
    // Actions
    signIn,
    signOut,
    checkAuthState,
    refreshAuthState, // For manual testing
    getAuthToken,
  };

  return (
    <SimpleAuthContext.Provider value={contextValue}>
      {children}
    </SimpleAuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useSimpleAuth = () => {
  const context = useContext(SimpleAuthContext);
  if (!context) {
    throw new Error('useSimpleAuth must be used within a SimpleAuthProvider');
  }
  return context;
};

export default SimpleAuthContext;
