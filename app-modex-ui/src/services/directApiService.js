/**
 * Direct API Service
 * Uses fetch directly to make API calls
 */

import { fetchAuthSession } from 'aws-amplify/auth';

// Get API URL from environment
const API_URL = process.env.REACT_APP_API_URL || '';

// Helper function to get authentication token
const getAuthToken = async () => {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || null;
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
};

// Helper function to make API requests
const apiRequest = async (path, options = {}) => {
  try {
    // Get auth token
    const token = await getAuthToken();
    if (!token) {
      console.warn('No auth token available for API request');
      return {
        success: false,
        error: 'Authentication required',
        status: 401
      };
    }
    
    // Build request URL
    const baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
    const url = `${baseUrl}${path}`;
    
    console.log('Making API request to:', url);
    
    // Build request options
    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
      },
      mode: 'cors',
      credentials: 'omit', // Changed from 'include' to 'omit' to fix CORS issue
      ...options
    };
    
    // Remove body for GET and HEAD requests
    if (['GET', 'HEAD'].includes(requestOptions.method.toUpperCase()) && requestOptions.body) {
      delete requestOptions.body;
    }
    
    console.log('Request options:', JSON.stringify(requestOptions, null, 2));
    
    // For OPTIONS requests, handle preflight
    if (options.method === 'OPTIONS') {
      const preflightResponse = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': options.actualMethod || 'GET',
          'Access-Control-Request-Headers': 'Content-Type,Authorization'
        },
        mode: 'cors',
        credentials: 'omit' // Changed from 'include' to 'omit' to fix CORS issue
      });
      
      if (!preflightResponse.ok) {
        console.error('CORS preflight failed:', preflightResponse.status);
        return {
          success: false,
          error: `CORS preflight failed with status ${preflightResponse.status}`,
          status: preflightResponse.status
        };
      }
    }
    
    // Make request
    const response = await fetch(url, requestOptions);
    
    console.log('Response status:', response.status);
    console.log('Response headers:', [...response.headers.entries()]);
    
    // Check if response is OK
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
        console.error('Error response data:', errorData);
      } catch (e) {
        try {
          const errorText = await response.text();
          console.error('Error response text:', errorText);
          errorData = { message: errorText || `HTTP ${response.status}: Unknown error` };
        } catch (textError) {
          console.error('Failed to read error response:', textError);
          errorData = { message: `HTTP ${response.status}: Could not read error response` };
        }
      }
      
      // Special handling for 502 Bad Gateway (likely CORS or Lambda errors)
      if (response.status === 502) {
        console.error('502 Bad Gateway error - likely CORS or Lambda issue');
        return {
          success: false,
          error: 'The server encountered an error. This may be due to CORS configuration or Lambda function issues.',
          status: 502,
          data: errorData
        };
      }
      
      return {
        success: false,
        error: errorData.message || errorData.error || `HTTP ${response.status}: Unknown error`,
        status: response.status,
        data: errorData
      };
    }
    
    // Parse response
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
      console.log('Response data:', data);
    } else {
      data = await response.text();
      try {
        // Try to parse as JSON even if content-type is not set correctly
        data = JSON.parse(data);
        console.log('Parsed response data:', data);
      } catch (e) {
        console.log('Response text:', data);
      }
    }
    
    // If the response already has a success field, return it as-is
    // Otherwise, wrap it in a success response
    if (typeof data === 'object' && data !== null && 'success' in data) {
      return data;
    }
    
    return {
      success: true,
      data,
      status: response.status
    };
  } catch (error) {
    console.error('API request failed:', error);
    
    // For CORS errors, provide a more helpful message
    if (error.message && error.message.includes('CORS')) {
      console.error('CORS error detected:', error.message);
      return {
        success: false,
        error: 'CORS error: The API does not allow requests from this origin. Check that the API Gateway and Lambda functions have proper CORS configuration.',
        corsError: true,
        status: 0
      };
    }
    
    // For network errors, provide a more helpful message
    if (error.message && error.message.includes('NetworkError')) {
      return {
        success: false,
        error: 'Network error: Unable to connect to the API. Check your internet connection and API endpoint configuration.',
        networkError: true,
        status: 0
      };
    }
    
    return {
      success: false,
      error: error.message || 'Unknown error',
      status: error.status || 500
    };
  }
};

// Project Sharing API
export const projectSharingApi = {
  // Get all users shared with a project
  getSharedUsers: async (projectId) => {
    try {
      console.log('Getting shared users for project:', projectId);
      const response = await apiRequest(`/projects/${projectId}/sharing`);
      console.log('getSharedUsers response:', response);
      console.log('Response type:', typeof response);
      console.log('Response.data:', response.data);
      console.log('Response.data type:', typeof response.data);
      return response;
    } catch (error) {
      console.error('Error getting shared users:', error);
      return {
        success: false,
        error: error.message || 'Failed to get shared users',
        status: error.status || 500
      };
    }
  },
  
  // Share project with a user
  shareProject: async (projectId, userData) => {
    try {
      const response = await apiRequest(`/projects/${projectId}/sharing`, {
        method: 'POST',
        body: JSON.stringify(userData)
      });
      return response;
    } catch (error) {
      console.error('Error sharing project:', error);
      return {
        success: false,
        error: error.message || 'Failed to share project',
        status: error.status || 500
      };
    }
  },
  
  // Update share permissions
  updateShare: async (projectId, shareId, updateData) => {
    try {
      const response = await apiRequest(`/projects/${projectId}/sharing/${shareId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData)
      });
      return response;
    } catch (error) {
      console.error('Error updating share:', error);
      return {
        success: false,
        error: error.message || 'Failed to update share',
        status: error.status || 500
      };
    }
  },
  
  // Remove share
  removeShare: async (projectId, shareId) => {
    try {
      const response = await apiRequest(`/projects/${projectId}/sharing/${shareId}`, {
        method: 'DELETE'
      });
      return response;
    } catch (error) {
      console.error('Error removing share:', error);
      return {
        success: false,
        error: error.message || 'Failed to remove share',
        status: error.status || 500
      };
    }
  }
};

// User Search API
export const userSearchApi = {
  // Search for users
  searchUsers: async (projectId, query, limit = 10) => {
    try {
      const queryParams = new URLSearchParams({
        q: query,
        limit: limit.toString()
      }).toString();
      
      // Use the real API
      const response = await apiRequest(`/projects/${projectId}/sharing/users/search?${queryParams}`);
      
      console.log('Raw API response:', JSON.stringify(response));
      
      // Check if the response has users directly or nested in data
      if (response.users) {
        console.log('Using API response with direct users property');
        return {
          success: true,
          data: { users: response.users },
          status: 200
        };
      } else if (response.data && response.data.users) {
        console.log('Using API response with nested users property');
        return {
          success: true,
          data: response.data,
          status: 200
        };
      }
      
      // If the API call fails or returns unexpected data, return an error
      console.error('API call failed or returned unexpected data:', response.error || 'No users property in response');
      return {
        success: false,
        error: response.error || 'Failed to retrieve user data',
        status: response.status || 500
      };
    } catch (error) {
      console.error('User search failed:', error);
      
      // Return error response
      return {
        success: false,
        error: error.message || 'Unknown error',
        status: error.status || 500
      };
    }
  }
};

// Export default API service
export default {
  userSearch: userSearchApi,
  projectSharing: projectSharingApi
};
