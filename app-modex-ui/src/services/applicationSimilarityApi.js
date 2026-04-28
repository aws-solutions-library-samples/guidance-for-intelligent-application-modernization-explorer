/**
 * Application Similarity API Service
 * 
 * This service handles application similarity analysis operations including:
 * - Triggering analysis via Step Functions
 * - Fetching results from DynamoDB
 * - Clearing cached results
 */

import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = process.env.REACT_APP_API_URL;

/**
 * Get authentication headers for API requests
 */
const getAuthHeaders = async () => {
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

/**
 * Analyze application similarities using Step Functions
 * @param {string} projectId - Project ID
 * @param {Object} filters - Analysis filters
 * @returns {Object} Analysis results with execution details
 */
export const analyzeApplicationSimilarities = async (projectId, filters = {}) => {
  console.log('🚀 Starting application similarity analysis for project:', projectId);
  console.log('📋 Filters:', filters);

  try {
    // Trigger the Step Functions execution using the dedicated endpoint
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/application-similarities`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filters
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Application similarity analysis triggered successfully:', result);
    
    return result;
  } catch (error) {
    console.error('❌ Error triggering application similarity analysis:', error);
    throw error;
  }
};

/**
 * Fetch application similarity results from DynamoDB
 * @param {string} projectId - Project ID
 * @returns {Object|null} Analysis results or null if not found
 */
export const fetchApplicationSimilarityResults = async (projectId) => {
  if (!projectId) {
    console.warn('⚠️ No project ID provided for fetching application similarity results');
    return null;
  }

  console.log('🔍 Fetching existing application similarity results from DynamoDB for project:', projectId);

  try {
    const headers = await getAuthHeaders();
    
    // Use the dedicated application-similarities endpoint
    const url = `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/application-similarities`;
    console.log('🌐 Making API request to application-similarities endpoint:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('🔍 Raw API response:', data);

    // Handle API Gateway response format
    let actualData;
    if (data.body && typeof data.body === 'string') {
      actualData = JSON.parse(data.body);
    } else {
      actualData = data;
    }

    if (actualData.success) {
      if (actualData.results) {
        const results = actualData.results;
        console.log('✅ Successfully fetched existing application similarity results from DynamoDB');
        console.log('📊 Results summary:', {
          totalApplications: results.applications?.length || 0,
          similarPairs: results.similarityMatrix?.length || 0,
          clustersCount: results.clusters?.length || 0
        });
        
        return results;
      } else {
        // Empty recordset case - success but no results
        console.log('📭 No application similarity results found (empty recordset)');
        return null;
      }
    } else {
      console.log('📭 No application similarity results found in response');
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching application similarity results:', error);
    
    // Don't throw for common "not found" scenarios
    if (error.message.includes('404') || 
        error.message.includes('No data') ||
        error.message.includes('not found')) {
      return null;
    }
    
    throw error;
  }
};

/**
 * Clear application similarity results from DynamoDB
 * @param {string} projectId - Project ID
 * @returns {Object} Success response
 */
export const clearApplicationSimilarityResults = async (projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to clear application similarity results');
  }

  console.log('🗑️ Clearing application similarity results for project:', projectId);

  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/application-similarities`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Application similarity results cleared successfully');
    
    return result;
  } catch (error) {
    console.error('❌ Error clearing application similarity results:', error);
    throw error;
  }
};

/**
 * Poll application similarity execution status
 * @param {string} executionArn - Step Function execution ARN
 * @returns {Object} Execution status
 */
export const pollApplicationSimilarityExecution = async (executionArn) => {
  if (!executionArn) {
    throw new Error('Execution ARN is required to poll status');
  }

  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/step-functions/execution-status?executionArn=${encodeURIComponent(executionArn)}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('❌ Error polling application similarity execution:', error);
    throw error;
  }
};
