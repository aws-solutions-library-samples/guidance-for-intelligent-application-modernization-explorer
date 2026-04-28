/**
 * Simplified Authentication Service using Cognito Hosted UI
 * Sign-in only - no sign-up functionality
 */

import { signOut, fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

class AuthService {
  constructor() {
    // Remove https:// prefix to match Amplify configuration
    const domainUrl = process.env.REACT_APP_COGNITO_DOMAIN_URL || '';
    this.cognitoDomain = domainUrl.replace('https://', '');
    this.clientId = process.env.REACT_APP_USER_POOL_CLIENT_ID || '';
    this.redirectUri = `${window.location.origin}/callback`;
    this.logoutUri = window.location.origin;
  }

  /**
   * Redirect to Cognito Hosted UI for sign in
   */
  async signIn() {
    console.log('🔐 Redirecting to Cognito Hosted UI for sign in...');
    console.log('🔐 Configuration:', {
      domain: this.cognitoDomain,
      clientId: this.clientId,
      redirectUri: this.redirectUri
    });
    
    // Use direct redirect (we know this works from testing)
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: 'email openid profile',
      redirect_uri: this.redirectUri
    });
    
    const authUrl = `https://${this.cognitoDomain}/login?${params.toString()}`;
    
    console.log('🔐 Direct redirect to:', authUrl);
    window.location.href = authUrl;
  }

  /**
   * Sign out using Amplify's built-in signOut (like the working chatbot)
   */
  async signOut() {
    try {
      console.log('🔐 Signing out...');
      
      // Clear manual tokens first
      this.clearManualTokens();
      
      // Preserve filter settings before clearing localStorage
      const filterKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('techStackFilters_') ||
        key.startsWith('infrastructureFilters_') ||
        key.startsWith('utilizationFilters_') ||
        key.startsWith('skillsFilters_') ||
        key.startsWith('visionFilters_')
      );
      
      const preservedFilters = {};
      filterKeys.forEach(key => {
        preservedFilters[key] = localStorage.getItem(key);
      });
      
      // Clear local storage
      localStorage.clear();
      
      // Restore filter settings
      Object.keys(preservedFilters).forEach(key => {
        localStorage.setItem(key, preservedFilters[key]);
      });
      
      // Use Amplify's signOut - this should handle Hosted UI logout properly
      await signOut();
      
      console.log('🔐 Amplify signOut completed, redirecting to landing...');
      
      // Redirect to landing page
      window.location.href = '/landing';
      
    } catch (error) {
      console.error('🔐 Sign out error:', error);
      
      // Even if signOut fails, clear everything and redirect
      this.clearManualTokens();
      
      // Preserve filter settings before clearing localStorage
      const filterKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('techStackFilters_') ||
        key.startsWith('infrastructureFilters_') ||
        key.startsWith('utilizationFilters_') ||
        key.startsWith('skillsFilters_') ||
        key.startsWith('visionFilters_')
      );
      
      const preservedFilters = {};
      filterKeys.forEach(key => {
        preservedFilters[key] = localStorage.getItem(key);
      });
      
      localStorage.clear();
      
      // Restore filter settings
      Object.keys(preservedFilters).forEach(key => {
        localStorage.setItem(key, preservedFilters[key]);
      });
      
      window.location.href = '/landing';
    }
  }

  /**
   * Check if user is currently authenticated - validate against Cognito
   */
  async isAuthenticated() {
    try {
      // Always check with Amplify/Cognito first (server validation)
      const session = await fetchAuthSession();
      
      if (session.tokens?.accessToken) {
        console.log('🔐 Valid Cognito session found');
        return true;
      }
      
      // If no valid Cognito session, clear any stale local tokens
      console.log('🔐 No valid Cognito session, clearing local tokens');
      this.clearManualTokens();
      return false;
      
    } catch (error) {
      console.log('🔐 Cognito session validation failed:', error);
      
      // Clear stale local tokens if Cognito validation fails
      this.clearManualTokens();
      return false;
    }
  }

  /**
   * Get current authenticated user - validate against Cognito
   */
  async getCurrentUser() {
    try {
      // Always get user from Cognito (server validation)
      const user = await getCurrentUser();
      console.log('🔐 Valid Cognito user:', user.username);
      return user;
      
    } catch (error) {
      console.log('🔐 No valid Cognito user:', error);
      
      // Clear stale local tokens if user validation fails
      this.clearManualTokens();
      return null;
    }
  }

  /**
   * Decode ID token to get user information
   */
  decodeIdToken(idToken) {
    try {
      const base64Url = idToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('🔐 Error decoding ID token:', error);
      return null;
    }
  }

  /**
   * Clear manually stored tokens
   */
  clearManualTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('id_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('auth_timestamp');
  }

  /**
   * Get current auth session
   */
  async getSession() {
    try {
      const session = await fetchAuthSession();
      return session;
    } catch (error) {
      console.log('🔐 No current session:', error);
      return null;
    }
  }

  /**
   * Get auth token for API calls
   */
  async getAuthToken() {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() || null;
    } catch (error) {
      console.log('🔐 No auth token:', error);
      return null;
    }
  }
}

/**
 * Get authentication headers for API requests
 */
export const getAuthHeaders = async () => {
  try {
    const session = await fetchAuthSession();
    
    if (!session.tokens || !session.tokens.idToken) {
      throw new Error('No authentication token available. Please log in again.');
    }
    
    return {
      'Authorization': `Bearer ${session.tokens.idToken.toString()}`,
      'Content-Type': 'application/json'
    };
  } catch (error) {
    console.error('🔐 Error getting auth headers:', error);
    throw error;
  }
};

// Export singleton instance
export const authService = new AuthService();
export default authService;
