// Component Similarity Analysis API Service - Real Backend Implementation
import { fetchAuthSession } from 'aws-amplify/auth';
import { getExecutionStatus } from './stepFunctionService';

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
 * Analyze component similarities using real backend Step Functions
 * @param {string} projectId - Project ID
 * @param {Object} filters - Analysis filters
 * @returns {Object} Analysis results with execution details
 */
export const analyzeComponentSimilarities = async (projectId, filters = {}) => {
  console.log('🚀 Starting component similarity analysis for project:', projectId);
  console.log('📋 Filters:', filters);

  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/component-similarities`, {
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
    console.log('✅ Component similarity analysis triggered successfully:', result);
    
    return {
      success: true,
      executionArn: result.executionArn,
      executionId: result.executionId,
      estimatedTimeMinutes: result.estimatedTimeMinutes || 15,
      message: 'Component similarity analysis started successfully',
      analysisType: 'component-similarity',
      projectId: projectId,
      filters: filters
    };
  } catch (error) {
    console.error('💥 Error in component similarity analysis:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred while starting the analysis'
    };
  }
};

/**
 * Poll component similarity execution status
 * @param {string} executionArn - Step Function execution ARN
 * @param {Function} statusCallback - Callback for status updates
 * @returns {Object} Execution status and results
 */
export const pollComponentSimilarityExecution = async (executionArn, statusCallback) => {
  console.log('🔄 Starting to poll component similarity execution:', executionArn);
  
  try {
    const maxPolls = 60; // Poll for up to 30 minutes (60 * 30 seconds)

    return new Promise((resolve) => {
      let pollCount = 0; // Move pollCount inside Promise to avoid const assignment error
      
      const poll = async () => {
        try {
          const statusResult = await getExecutionStatus(executionArn);
          
          if (statusResult.success) {
            // Calculate progress based on execution time and estimated completion
            const progress = Math.min(95, (pollCount / maxPolls) * 100);
            
            // Call status callback with progress update
            if (statusCallback) {
              statusCallback({
                status: statusResult.status,
                progress: progress,
                pollCount: pollCount,
                maxPolls: maxPolls
              });
            }

            // If still running and haven't exceeded max polls, continue polling
            if (statusResult.status === 'RUNNING' && pollCount < maxPolls) {
              pollCount++;
              setTimeout(poll, 30000); // Poll every 30 seconds for Step Functions
            } else if (statusResult.status === 'SUCCEEDED') {
              console.log('🎉 Component similarity analysis completed successfully');
              
              // Results are now stored in DynamoDB, no need to fetch from S3
              resolve({
                success: true,
                status: 'SUCCEEDED',
                results: { message: 'Analysis completed. Results stored in DynamoDB.' },
                executionArn: executionArn,
                completedAt: statusResult.stopDate
              });
            } else if (statusResult.status === 'FAILED') {
              console.error('❌ Component similarity analysis failed:', statusResult.error);
              resolve({
                success: false,
                status: 'FAILED',
                error: statusResult.error || 'Component similarity analysis failed'
              });
            } else if (statusResult.status === 'TIMED_OUT') {
              console.warn('⏰ Component similarity analysis timed out');
              resolve({
                success: false,
                status: 'TIMED_OUT',
                error: 'Analysis took longer than expected and was terminated'
              });
            }
          } else {
            console.error('Failed to get execution status:', statusResult.error);
            resolve({
              success: false,
              error: statusResult.error || 'Failed to get execution status'
            });
          }
        } catch (err) {
          console.error('Error polling execution status:', err);
          // Don't resolve immediately, might be temporary network issue
          if (pollCount < maxPolls) {
            pollCount++;
            setTimeout(poll, 30000);
          } else {
            resolve({
              success: false,
              error: 'Failed to poll execution status after maximum attempts'
            });
          }
        }
      };

      // Start polling after a short delay
      setTimeout(poll, 2000);
    });
    
  } catch (error) {
    console.error('💥 Error polling component similarity execution:', error);
    return {
      success: false,
      error: error.message || 'Failed to poll execution status'
    };
  }
};

/**
 * Get analysis status summary with user-friendly messages
 * @param {string} status - Execution status
 * @param {number} progress - Progress percentage
 * @param {number} estimatedTimeMinutes - Estimated completion time
 * @returns {Object} Status summary with message and description
 */
export const getAnalysisStatusSummary = (status, progress = 0, estimatedTimeMinutes = null) => {
  const statusMessages = {
    'RUNNING': {
      message: 'Component Analysis Running',
      description: `Processing component similarities using distributed Step Functions. ${Math.round(progress)}% complete.`
    },
    'SUCCEEDED': {
      message: 'Analysis Completed Successfully',
      description: 'Component similarity analysis has finished. Results are now available for review.'
    },
    'FAILED': {
      message: 'Analysis Failed',
      description: 'The component similarity analysis encountered an error and could not complete.'
    },
    'TIMED_OUT': {
      message: 'Analysis Timed Out',
      description: 'The component similarity analysis took longer than expected and was terminated.'
    },
    'ABORTED': {
      message: 'Analysis Aborted',
      description: 'The component similarity analysis was manually stopped or cancelled.'
    }
  };

  const statusInfo = statusMessages[status] || {
    message: `Status: ${status}`,
    description: 'Component similarity analysis status is being monitored.'
  };

  // Add estimated time information for running analyses
  if (status === 'RUNNING' && estimatedTimeMinutes) {
    statusInfo.description += ` Estimated completion time: ${estimatedTimeMinutes} minutes.`;
  }

  return statusInfo;
};

/**
 * Fetch existing component similarity results for a project from DynamoDB
 * @param {string} projectId - Project ID
 * @returns {Object} Existing analysis results or null if none found
 */
export const fetchComponentSimilarityResults = async (projectId) => {
  if (!projectId) {
    console.warn('⚠️ No project ID provided for fetching component similarity results');
    return null;
  }

  console.log('🔍 Fetching existing component similarity results from DynamoDB for project:', projectId);

  try {
    const headers = await getAuthHeaders();
    
    // Use the dedicated component-similarities endpoint
    const url = `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/component-similarities`;
    console.log('🌐 Making API request to component-similarities endpoint:', url);

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
        console.log('✅ Successfully fetched existing component similarity results from DynamoDB');
        console.log('📊 Results summary:', {
          totalComponents: results.components?.length || 0,
          similarPairs: results.similarityMatrix?.length || 0,
          clustersCount: results.clusters?.length || 0
        });
        
        return results;
      } else {
        // Empty recordset case - success but no results
        console.log('📭 No component similarity results found (empty recordset)');
        return null;
      }
    } else {
      console.log('📭 No component similarity results found in response');
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching component similarity results:', error);
    
    // Don't throw for common "not found" scenarios
    if (error.message.includes('404') || 
        error.message.includes('No data') ||
        error.message.includes('not found')) {
      return null;
    }
    
    throw error;
  }
};
export const clearCachedResults = async (projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to clear component similarity results');
  }

  console.log('🗑️ Clearing component similarity results for project:', projectId);

  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/component-similarities`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Component similarity results cleared successfully');
    
    return {
      success: true,
      message: result.message || 'Component similarity results cleared successfully'
    };
  } catch (error) {
    console.error('❌ Error clearing component similarity results:', error);
    return {
      success: false,
      error: error.message || 'Failed to clear cached results'
    };
  }
};
