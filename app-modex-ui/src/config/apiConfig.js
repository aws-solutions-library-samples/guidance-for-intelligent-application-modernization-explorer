/**
 * API Configuration for App-ModEx Application
 * This file manages the configuration for real API endpoints
 */

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// API Configuration
const API_CONFIG = {
  // API endpoints (from AWS deployment)
  API: {
    BASE_URL: process.env.REACT_APP_API_URL,
    ENDPOINTS: {
      PROJECTS: '/projects',
      PROJECT_SHARING: '/projects/{projectId}/sharing',
      PROJECT_DATA: '/projects/{projectId}/data',
      USERS: '/users',
      AUTH: '/auth'
    }
  },
  
  // Authentication configuration
  AUTH: {
    USER_POOL_ID: process.env.REACT_APP_USER_POOL_ID || '',
    USER_POOL_CLIENT_ID: process.env.REACT_APP_USER_POOL_CLIENT_ID || '',
    REGION: process.env.REACT_APP_AWS_REGION || 'us-east-1',
    IDENTITY_POOL_ID: process.env.REACT_APP_IDENTITY_POOL_ID || '',
  },
  
  // Feature flags
  FEATURES: {
    AUTHENTICATION_REQUIRED: process.env.REACT_APP_AUTH_REQUIRED === 'true' || isProduction,
    REAL_TIME_UPDATES: process.env.REACT_APP_REAL_TIME_UPDATES === 'true',
    ANALYTICS_ENABLED: process.env.REACT_APP_ANALYTICS_ENABLED === 'true',
    DEBUG_MODE: process.env.REACT_APP_DEBUG_MODE === 'true' || isDevelopment,
  }
};

// API Client factory
export const createApiClient = () => {
  return {
    type: 'real',
    baseUrl: API_CONFIG.API.BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`, // Will be implemented with Cognito
    }
  };
};

// Get authentication token from Cognito
const getAuthToken = () => {
  // This will be set by the AuthContext when user is authenticated
  return window.cognitoAuthToken || '';
};

// API endpoint builder
export const buildApiUrl = (endpoint, params = {}) => {
  let url = `${API_CONFIG.API.BASE_URL}${endpoint}`;
  
  // Replace path parameters
  Object.keys(params).forEach(key => {
    url = url.replace(`{${key}}`, params[key]);
  });
  
  return url;
};

// HTTP client with error handling
export const apiRequest = async (endpoint, options = {}) => {
  const client = createApiClient();
  
  // Handle real API requests
  const url = buildApiUrl(endpoint, options.pathParams || {});
  
  const requestOptions = {
    method: options.method || 'GET',
    headers: {
      ...client.headers,
      ...options.headers,
    },
    ...options,
  };
  
  if (options.body && requestOptions.method !== 'GET') {
    requestOptions.body = JSON.stringify(options.body);
  }
  
  try {
    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text();
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
};

// Configuration getters
export const getApiConfig = () => API_CONFIG;
export const isAuthenticationRequired = () => API_CONFIG.FEATURES.AUTHENTICATION_REQUIRED;
export const isDebugMode = () => API_CONFIG.FEATURES.DEBUG_MODE;

// Environment-specific configurations
export const getEnvironmentConfig = () => {
  return {
    environment: process.env.NODE_ENV,
    apiUrl: API_CONFIG.API.BASE_URL,
    region: API_CONFIG.AUTH.REGION,
    userPoolId: API_CONFIG.AUTH.USER_POOL_ID,
    userPoolClientId: API_CONFIG.AUTH.USER_POOL_CLIENT_ID,
    features: API_CONFIG.FEATURES,
  };
};

// Validate required environment variables
const validateConfig = () => {
  const errors = [];
  
  if (!API_CONFIG.API.BASE_URL) {
    errors.push('REACT_APP_API_URL is required');
  }
  
  if (API_CONFIG.FEATURES.AUTHENTICATION_REQUIRED) {
    if (!API_CONFIG.AUTH.USER_POOL_ID) {
      errors.push('REACT_APP_USER_POOL_ID is required when authentication is enabled');
    }
    if (!API_CONFIG.AUTH.USER_POOL_CLIENT_ID) {
      errors.push('REACT_APP_USER_POOL_CLIENT_ID is required when authentication is enabled');
    }
  }
  
  if (errors.length > 0) {
    console.error('❌ Configuration Errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    
    if (API_CONFIG.FEATURES.DEBUG_MODE) {
      console.log('📋 Current Configuration:', {
        API_URL: API_CONFIG.API.BASE_URL,
        AUTH_REQUIRED: API_CONFIG.FEATURES.AUTHENTICATION_REQUIRED,
        USER_POOL_ID: API_CONFIG.AUTH.USER_POOL_ID,
        USER_POOL_CLIENT_ID: API_CONFIG.AUTH.USER_POOL_CLIENT_ID
      });
    }
  }
  
  return errors.length === 0;
};

// Validate configuration on load
validateConfig();

// Export default configuration
export default API_CONFIG;
