// @deprecated This file is deprecated. Use pilotIdentificationApi.js instead.
console.warn('⚠️ pilotIdentificationAsyncApi.js is deprecated. Use pilotIdentificationApi.js instead.');

/**
 * Pilot Identification Async API Service
 * 
 * This service handles asynchronous pilot identification analysis
 * for large datasets with progress tracking and result caching.
 */

import { fetchAuthSession } from 'aws-amplify/auth';

// Get API URL from environment
const API_URL = process.env.REACT_APP_API_URL || '';

/**
 * Get authentication token
 */
const getAuthToken = async () => {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || null;
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
};

/**
 * Get project ID from localStorage
 */
const getProjectId = () => {
  try {
    const selectedProject = JSON.parse(localStorage.getItem('selectedProject') || '{}');
    return selectedProject.projectId || null;
  } catch (error) {
    console.error('Failed to get project ID:', error);
    return null;
  }
};

/**
 * Make API request with authentication
 */
const apiRequest = async (endpoint, options = {}) => {
  try {
    const token = await getAuthToken();
    const projectId = getProjectId();
    
    if (!token) {
      throw new Error('Authentication required');
    }
    
    if (!projectId) {
      throw new Error('Project ID required');
    }
    
    const baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
    const url = `${baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}projectId=${projectId}`;
    
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
    
    console.log(`🔄 API Request: ${options.method || 'GET'} ${url}`);
    
    const response = await fetch(url, requestOptions);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    
    console.log(`✅ API Response: ${response.status}`, data);
    return data;
    
  } catch (error) {
    console.error('❌ API Request failed:', error);
    throw error;
  }
};

/**
 * Start asynchronous pilot identification analysis
 */
export const startPilotAnalysis = async (criteria) => {
  try {
    console.log('🚀 Starting async pilot analysis:', criteria);
    
    // Estimate application count for better UX
    const estimatedApplications = 1000; // Could be dynamic based on project
    
    const analysisData = {
      ...criteria,
      estimatedApplications,
      timestamp: new Date().toISOString()
    };
    
    const result = await apiRequest('/step-functions/pilot-identification/analysis', {
      method: 'POST',
      body: analysisData
    });
    
    console.log('✅ Analysis started successfully:', result);
    return {
      success: true,
      jobId: result.jobId,
      status: result.status,
      estimatedTime: result.estimatedTime,
      pollUrl: result.pollUrl,
      resultsUrl: result.resultsUrl
    };
    
  } catch (error) {
    console.error('❌ Failed to start pilot analysis:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get pilot analysis job status
 */
export const getPilotAnalysisStatus = async (jobId) => {
  try {
    console.log('📊 Getting analysis status for job:', jobId);
    
    const result = await apiRequest(`/step-functions/pilot-identification/analysis/${jobId}/status`);
    
    console.log('✅ Status retrieved:', result);
    return {
      success: true,
      ...result
    };
    
  } catch (error) {
    console.error('❌ Failed to get analysis status:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get pilot analysis results
 */
export const getPilotAnalysisResults = async (jobId, options = {}) => {
  try {
    console.log('📊 Getting analysis results for job:', jobId);
    
    const queryParams = new URLSearchParams();
    if (options.limit) queryParams.append('limit', options.limit);
    if (options.offset) queryParams.append('offset', options.offset);
    if (options.minScore) queryParams.append('minScore', options.minScore);
    
    const endpoint = `/step-functions/pilot-identification/analysis/${jobId}/results${queryParams.toString() ? `&${queryParams.toString()}` : ''}`;
    
    const result = await apiRequest(endpoint);
    
    console.log('✅ Results retrieved:', {
      jobId: result.jobId,
      candidateCount: result.candidates?.length || 0,
      totalCandidates: result.metadata?.totalCandidates || 0
    });
    
    return {
      success: true,
      ...result
    };
    
  } catch (error) {
    console.error('❌ Failed to get analysis results:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Delete pilot analysis job and results
 */
export const deletePilotAnalysis = async (jobId) => {
  try {
    console.log('🗑️ Deleting analysis job:', jobId);
    
    const result = await apiRequest(`/step-functions/pilot-identification/analysis/${jobId}`, {
      method: 'DELETE'
    });
    
    console.log('✅ Analysis deleted successfully:', result);
    return {
      success: true,
      ...result
    };
    
  } catch (error) {
    console.error('❌ Failed to delete analysis:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Poll for analysis completion
 */
export const pollAnalysisStatus = async (jobId, onProgress, maxAttempts = 120) => {
  let attempts = 0;
  
  const poll = async () => {
    try {
      attempts++;
      const statusResult = await getPilotAnalysisStatus(jobId);
      
      if (!statusResult.success) {
        throw new Error(statusResult.error);
      }
      
      // Call progress callback
      if (onProgress) {
        onProgress(statusResult);
      }
      
      // Check if completed (handle both COMPLETED/completed and SUCCEEDED/succeeded statuses)
      const status = statusResult.status?.toUpperCase();
      if (status === 'COMPLETED' || status === 'SUCCEEDED') {
        console.log('✅ Analysis completed successfully');
        return statusResult;
      }
      
      // Check if failed (handle both FAILED/failed statuses)
      if (status === 'FAILED') {
        throw new Error(statusResult.error?.message || 'Analysis failed');
      }
      
      // Check max attempts
      if (attempts >= maxAttempts) {
        throw new Error('Analysis timeout - maximum polling attempts reached');
      }
      
      // Continue polling
      setTimeout(poll, 5000); // Poll every 5 seconds
      
    } catch (error) {
      console.error('❌ Polling error:', error);
      if (onProgress) {
        onProgress({
          success: false,
          error: error.message
        });
      }
    }
  };
  
  // Start polling
  poll();
};

/**
 * Check if dataset is large enough to require async processing
 */
export const shouldUseAsyncProcessing = (estimatedApplications = 0) => {
  // Use async processing for datasets with 500+ applications
  return estimatedApplications >= 500;
};

/**
 * Get cached analysis results if available, fallback to DynamoDB
 */
export const getCachedAnalysisResults = async (projectId) => {
  try {
    const cacheKey = `pilot_analysis_${projectId}`;
    const cached = localStorage.getItem(cacheKey);
    
    // First, try to get from localStorage cache
    if (cached) {
      const data = JSON.parse(cached);
      
      // Check if cache is still valid (24 hours)
      const cacheAge = Date.now() - new Date(data.timestamp).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (cacheAge < maxAge) {
        console.log('✅ Using cached analysis results from localStorage');
        return data;
      } else {
        console.log('⚠️ Cached results expired, removing');
        localStorage.removeItem(cacheKey);
      }
    }
    
    // If no valid cache, try to fetch from DynamoDB
    console.log('📡 No valid cache found, attempting to fetch from DynamoDB...');
    
    try {
      // Get the most recent completed analysis for this project using the latest-results endpoint
      const dynamoResults = await apiRequest('/step-functions/pilot-identification/latest-results', {
        method: 'GET'
      });
      
      if (dynamoResults && dynamoResults.candidates && dynamoResults.candidates.length > 0) {
        console.log('✅ Found results in DynamoDB, caching locally');
        
        // Cache the results locally for future use
        cacheAnalysisResults(projectId, dynamoResults);
        
        return dynamoResults;
      } else {
        console.log('ℹ️ No results found in DynamoDB');
      }
    } catch (fetchError) {
      console.error('❌ Error fetching from DynamoDB:', fetchError);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error reading cached results:', error);
    return null;
  }
};

/**
 * Cache analysis results
 */
export const cacheAnalysisResults = (projectId, results) => {
  try {
    const cacheKey = `pilot_analysis_${projectId}`;
    const cacheData = {
      ...results,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log('✅ Analysis results cached');
  } catch (error) {
    console.error('❌ Error caching results:', error);
  }
};

/**
 * Clear cached analysis results and force refresh from DynamoDB
 */
export const refreshAnalysisResults = async (projectId) => {
  try {
    console.log('🔄 Forcing refresh of analysis results from DynamoDB...');
    
    // Clear localStorage cache
    const cacheKey = `pilot_analysis_${projectId}`;
    localStorage.removeItem(cacheKey);
    
    // Fetch fresh results from DynamoDB using the latest-results endpoint
    const freshResults = await apiRequest('/step-functions/pilot-identification/latest-results', {
      method: 'GET'
    });
    
    if (freshResults && freshResults.candidates && freshResults.candidates.length > 0) {
      console.log('✅ Fresh results fetched from DynamoDB');
      
      // Cache the fresh results
      cacheAnalysisResults(projectId, freshResults);
      
      return freshResults;
    } else {
      console.log('ℹ️ No results found in DynamoDB');
      return null;
    }
  } catch (error) {
    console.error('❌ Error refreshing results:', error);
    return null;
  }
};

/**
 * Force load results even if job status is still RUNNING
 * This is a workaround for cases where Step Function completed but job status wasn't updated
 */
export const forceLoadResults = async (jobId) => {
  try {
    console.log('🔄 Force loading results for job:', jobId);
    
    // Try to get results directly, ignoring the job status
    const result = await getPilotAnalysisResults(jobId);
    
    if (result.success && result.candidates && result.candidates.length > 0) {
      console.log('✅ Found results despite job status!');
      return result;
    } else {
      console.log('❌ No results found');
      return null;
    }
  } catch (error) {
    console.error('❌ Error force loading results:', error);
    return null;
  }
};

/**
 * Debug function to check what's actually in DynamoDB
 */
export const debugCheckDynamoDBStatus = async (jobId) => {
  try {
    console.log('🔍 Debug: Checking DynamoDB status for job:', jobId);
    
    // First, try to get the job status
    const statusResult = await getPilotAnalysisStatus(jobId);
    console.log('📊 Job status from API:', statusResult);
    
    // Then try to get results directly
    const resultsResult = await getPilotAnalysisResults(jobId);
    console.log('📋 Results from API:', resultsResult);
    
    return {
      statusResult,
      resultsResult
    };
  } catch (error) {
    console.error('❌ Debug check failed:', error);
    return { error: error.message };
  }
};

/**
 * Clear cached analysis results
 */
export const clearCachedAnalysisResults = (projectId) => {
  try {
    const cacheKey = `pilot_analysis_${projectId}`;
    localStorage.removeItem(cacheKey);
    console.log('✅ Cached analysis results cleared');
  } catch (error) {
    console.error('❌ Error clearing cached results:', error);
  }
};
