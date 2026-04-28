/**
 * Pilot Identification API Service
 * 
 * This service handles pilot identification analysis operations including:
 * - Triggering pilot identification analysis
 * - Fetching results from DynamoDB
 * - Clearing results
 * 
 * Follows the same pattern as applicationSimilarityApi.js and componentSimilarityApi.js
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
 * Trigger pilot identification analysis
 * @param {string} projectId - Project ID
 * @param {Object} criteria - Analysis criteria (drivers, constraints, etc.)
 * @returns {Object} Analysis job information
 */
export const triggerPilotIdentificationAnalysis = async (projectId, criteria) => {
  if (!projectId) {
    throw new Error('Project ID is required to trigger pilot identification analysis');
  }

  if (!criteria || !criteria.drivers || criteria.drivers.length === 0) {
    throw new Error('Business drivers are required for pilot identification analysis');
  }

  console.log('🚀 Triggering pilot identification analysis for project:', projectId);
  console.log('📋 Analysis criteria:', criteria);

  try {
    const headers = await getAuthHeaders();
    
    const url = `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/pilot-identification`;
    console.log('🌐 Making API request to:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(criteria)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ Pilot identification analysis triggered successfully:', data);
    
    return data;
  } catch (error) {
    console.error('❌ Error triggering pilot identification analysis:', error);
    throw error;
  }
};

/**
 * Fetch pilot identification results from DynamoDB
 * @param {string} projectId - Project ID
 * @param {Object} options - Query options (limit, offset, minScore)
 * @returns {Object|null} Analysis results or null if not found
 */
export const fetchPilotIdentificationResults = async (projectId, options = {}) => {
  if (!projectId) {
    console.warn('⚠️ No project ID provided for fetching pilot identification results');
    return null;
  }

  console.log('🔍 Fetching pilot identification results from DynamoDB for project:', projectId);

  try {
    const headers = await getAuthHeaders();
    
    // Build query parameters
    const queryParams = new URLSearchParams();
    if (options.limit) queryParams.append('limit', options.limit);
    if (options.offset) queryParams.append('offset', options.offset);
    if (options.minScore) queryParams.append('minScore', options.minScore);
    
    const queryString = queryParams.toString();
    const url = `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/pilot-identification${queryString ? `?${queryString}` : ''}`;
    console.log('🌐 Making API request to:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    if (response.status === 404) {
      console.log('📭 No pilot identification results found for project:', projectId);
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('🔍 Raw API response:', data);

    if (data.success && data.results) {
      const results = data.results;
      console.log('✅ Successfully fetched pilot identification results from DynamoDB');
      console.log('📊 Results summary:', {
        candidatesCount: results.candidates?.length || 0,
        totalCandidates: results.metadata?.totalCandidates || 0,
        jobId: results.jobId,
        status: results.status
      });
      
      return results;
    } else {
      console.log('📭 No pilot identification results found in response');
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching pilot identification results:', error);
    
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
 * Clear pilot identification results from DynamoDB
 * @param {string} projectId - Project ID
 * @returns {Object} Success response
 */
export const clearPilotIdentificationResults = async (projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to clear pilot identification results');
  }

  console.log('🗑️ Clearing pilot identification results for project:', projectId);

  try {
    const headers = await getAuthHeaders();
    
    const url = `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/pilot-identification`;
    console.log('🌐 Making API request to:', url);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Pilot identification results cleared successfully:', result);
    
    return result;
  } catch (error) {
    console.error('❌ Error clearing pilot identification results:', error);
    throw error;
  }
};

/**
 * Get similar applications for a specific pilot application
 * This function uses the application similarity API to find similar applications
 * @param {string} projectId - Project ID
 * @param {string} applicationName - Name of the pilot application
 * @param {number} minSimilarity - Minimum similarity threshold (0-1)
 * @returns {Object} Similar applications data
 */
export const getSimilarApplications = async (projectId, applicationName, minSimilarity = 0.7) => {
  if (!projectId) {
    throw new Error('Project ID is required to get similar applications');
  }

  if (!applicationName) {
    throw new Error('Application name is required to get similar applications');
  }

  console.log('🔍 Getting similar applications:', {
    projectId,
    applicationName,
    minSimilarity
  });

  try {
    const headers = await getAuthHeaders();
    
    // Use the application similarities endpoint to get similar applications
    const url = `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/application-similarities?threshold=${minSimilarity}`;
    console.log('🔗 API URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.results) {
      console.log('📭 No similarity data available');
      return {
        applicationName,
        similarApplications: [],
        totalCount: 0,
        minSimilarity
      };
    }

    // Filter similarity matrix for the specific application
    const similarityMatrix = data.results.similarityMatrix || [];
    const similarApps = similarityMatrix
      .filter(sim => 
        (sim.application_id === applicationName || sim.similar_application_id === applicationName) &&
        sim.similarity_score >= minSimilarity
      )
      .map(sim => ({
        applicationName: sim.application_id === applicationName ? sim.similar_application_id : sim.application_id,
        similarityScore: sim.similarity_score
      }))
      .sort((a, b) => b.similarityScore - a.similarityScore);

    console.log('✅ Similar applications fetched successfully:', {
      applicationName,
      totalCount: similarApps.length,
      minSimilarity
    });
    
    return {
      applicationName,
      similarApplications: similarApps,
      totalCount: similarApps.length,
      minSimilarity
    };
  } catch (error) {
    console.error('❌ Error getting similar applications:', error);
    
    // Return empty result instead of throwing to prevent UI errors
    return {
      applicationName,
      similarApplications: [],
      totalCount: 0,
      minSimilarity,
      error: error.message
    };
  }
};
