/**
 * Step Function Service
 * Handles step function operations like triggering similarity analysis
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
    
    console.log('Making step function API request to:', url);
    
    // Build request options
    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
      },
      ...(options.body && { body: JSON.stringify(options.body) })
    };
    
    // Make the request
    const response = await fetch(url, requestOptions);
    
    // Parse response
    let data = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    console.log('Step function API response:', {
      status: response.status,
      statusText: response.statusText,
      data: data
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: data?.message || data || `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
        data: data
      };
    }
    
    return {
      success: true,
      data: data,
      status: response.status
    };
    
  } catch (error) {
    console.error('Step function API request failed:', error);
    return {
      success: false,
      error: error.message || 'Network error',
      status: 0
    };
  }
};

/**
 * Trigger application similarities analysis step function
 * @param {string} projectId - The project ID to analyze
 * @param {Object} filters - Optional filters for the analysis
 * @returns {Promise<Object>} API response
 */
export const triggerApplicationSimilaritiesAnalysis = async (projectId, filters = {}) => {
  console.log('Triggering application similarities analysis for project:', projectId, 'with filters:', filters);
  
  try {
    const response = await apiRequest('/step-functions/application-similarity-analysis', {
      method: 'POST',
      body: {
        projectId: projectId,
        filters: filters,
        timestamp: new Date().toISOString()
      }
    });
    
    if (response.success) {
      console.log('Application similarities analysis triggered successfully:', response.data);
      return {
        success: true,
        executionArn: response.data?.executionArn,
        executionId: response.data?.executionId,
        message: response.data?.message || 'Application similarities analysis started successfully'
      };
    } else {
      console.error('Failed to trigger application similarities analysis:', response.error);
      return {
        success: false,
        error: response.error || 'Failed to trigger application similarities analysis'
      };
    }
  } catch (error) {
    console.error('Error triggering application similarities analysis:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred'
    };
  }
};

/**
 * Legacy function for backward compatibility
 * @deprecated Use triggerApplicationSimilaritiesAnalysis instead
 */
export const triggerSimilaritiesAnalysis = async (projectId, filters = {}) => {
  console.warn('triggerSimilaritiesAnalysis is deprecated. Use triggerApplicationSimilaritiesAnalysis instead.');
  return triggerApplicationSimilaritiesAnalysis(projectId, filters);
};

/**
 * Trigger component similarity analysis step function
 * @param {string} projectId - The project ID to analyze
 * @param {Object} filters - Analysis filters
 * @returns {Promise<Object>} API response
 */
export const triggerComponentSimilarityAnalysis = async (projectId, filters = {}) => {
  console.log('Triggering component similarity analysis for project:', projectId);
  
  try {
    const response = await apiRequest('/step-functions/component-similarity-analysis', {
      method: 'POST',
      body: {
        projectId: projectId,
        analysisType: 'component_similarity',
        filters: filters,
        timestamp: new Date().toISOString()
      }
    });
    
    if (response.success) {
      console.log('Component similarity analysis triggered successfully:', response.data);
      return {
        success: true,
        executionArn: response.data?.executionArn,
        executionId: response.data?.executionId,
        message: response.data?.message || 'Component similarity analysis started successfully'
      };
    } else {
      console.error('Failed to trigger component similarity analysis:', response.error);
      return {
        success: false,
        error: response.error || 'Failed to trigger component similarity analysis'
      };
    }
  } catch (error) {
    console.error('Error triggering component similarity analysis:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred'
    };
  }
};

/**
 * Generic Step Function execution trigger
 * @param {Object} params - Execution parameters
 * @returns {Promise<Object>} API response
 */
export const triggerStepFunctionExecution = async (params) => {
  const { stateMachineType, projectId, input } = params;
  
  console.log(`Triggering ${stateMachineType} Step Function for project:`, projectId);
  
  try {
    const endpoint = stateMachineType === 'component-similarity' 
      ? '/step-functions/component-similarity-analysis'
      : '/step-functions/similarities-analysis';
    
    const response = await apiRequest(endpoint, {
      method: 'POST',
      body: input
    });
    
    if (response.success) {
      console.log(`${stateMachineType} analysis triggered successfully:`, response.data);
      return {
        success: true,
        executionArn: response.data?.executionArn,
        executionId: response.data?.executionId,
        message: response.data?.message || `${stateMachineType} analysis started successfully`
      };
    } else {
      console.error(`Failed to trigger ${stateMachineType} analysis:`, response.error);
      return {
        success: false,
        error: response.error || `Failed to trigger ${stateMachineType} analysis`
      };
    }
  } catch (error) {
    console.error(`Error triggering ${stateMachineType} analysis:`, error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred'
    };
  }
};

/**
 * Get the status of a step function execution
 * @param {string} executionArn - The execution ARN to check
 * @param {string} projectId - The project ID (required for API routing)
 * @returns {Promise<Object>} Execution status
 */
export const getExecutionStatus = async (executionArn, projectId) => {
  console.log('Getting execution status for:', executionArn, 'projectId:', projectId);
  
  try {
    const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/step-function?executionArn=${encodeURIComponent(executionArn)}`);
    
    if (response.success) {
      return {
        success: true,
        status: response.data?.status,
        startDate: response.data?.startDate,
        stopDate: response.data?.stopDate,
        output: response.data?.output,
        error: response.data?.error
      };
    } else {
      return {
        success: false,
        error: response.error || 'Failed to get execution status'
      };
    }
  } catch (error) {
    console.error('Error getting execution status:', error);
    return {
      success: false,
      error: error.message || 'Failed to get execution status'
    };
  }
};

/**
 * Trigger pilot identification analysis step function
 * @param {string} projectId - The project ID to analyze
 * @param {Object} criteria - Analysis criteria (drivers, events, etc.)
 * @returns {Promise<Object>} API response
 */
export const triggerPilotIdentificationAnalysis = async (projectId, criteria = {}) => {
  console.log('Triggering pilot identification analysis for project:', projectId, 'with criteria:', criteria);
  
  try {
    const response = await apiRequest(`/projects/${projectId}/pilot-identification`, {
      method: 'POST',
      body: {
        ...criteria,  // Spread criteria into root level
        timestamp: new Date().toISOString()
      }
    });
    
    if (response.success) {
      console.log('Pilot identification analysis triggered successfully:', response);
      return {
        success: true,
        jobId: response.data?.jobId,
        processId: response.data?.processId,
        executionArn: response.data?.executionArn,
        message: response.data?.message || 'Pilot identification analysis started successfully'
      };
    } else {
      console.error('Failed to trigger pilot identification analysis:', response.error);
      return {
        success: false,
        error: response.error || 'Failed to trigger pilot identification analysis'
      };
    }
  } catch (error) {
    console.error('Error triggering pilot identification analysis:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred'
    };
  }
};

/**
 * List recent step function executions for a project
 * @param {string} projectId - The project ID
 * @param {number} maxResults - Maximum number of results to return
 * @returns {Promise<Object>} List of executions
 */
export const listExecutions = async (projectId, maxResults = 10) => {
  console.log('Listing executions for project:', projectId);
  
  try {
    const response = await apiRequest(`/step-functions/executions?projectId=${encodeURIComponent(projectId)}&maxResults=${maxResults}`);
    
    if (response.success) {
      return {
        success: true,
        executions: response.data?.executions || []
      };
    } else {
      return {
        success: false,
        error: response.error || 'Failed to list executions'
      };
    }
  } catch (error) {
    console.error('Error listing executions:', error);
    return {
      success: false,
      error: error.message || 'Failed to list executions'
    };
  }
};
