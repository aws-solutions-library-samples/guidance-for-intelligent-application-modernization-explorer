/**
 * Team Estimates API Service
 * 
 * This service provides API calls for Team Estimate operations.
 */

import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = process.env.REACT_APP_API_URL;

// Helper function to get auth headers
const getAuthHeaders = async () => {
  try {
    const session = await fetchAuthSession();
    
    // Use ID token instead of access token for API Gateway Cognito authorizer
    const token = session.tokens?.idToken?.toString();
    
    if (!token) {
      throw new Error('No ID token available');
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  } catch (error) {
    console.error('Error getting auth headers:', error);
    throw new Error('Authentication required');
  }
};

// Helper function to get project ID
const getProjectId = () => {
  try {
    const projectData = localStorage.getItem('selectedProject');
    if (projectData) {
      const project = JSON.parse(projectData);
      return project.projectId;
    }
  } catch (err) {
    console.error('Error loading project data:', err);
  }
  return null;
};

/**
 * Fetch all Team estimates for the current project
 * 
 * @returns {Promise} Promise resolving to array of Team estimates
 */
export const fetchTeamEstimates = async (projectId = null) => {
  try {
    const currentProjectId = projectId || getProjectId();
    if (!currentProjectId) {
      throw new Error('No project selected');
    }

    console.log('🔄 Fetching team estimates for project:', currentProjectId);

    const headers = await getAuthHeaders();
    const url = `${API_BASE_URL}projects/${encodeURIComponent(currentProjectId)}/team-estimates`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Team estimates fetched:', data);
    return data;
  } catch (error) {
    console.error('❌ Error fetching team estimates:', error);
    throw error;
  }
};

/**
 * Fetch a specific Team estimate by ID
 * 
 * @param {string} teamEstimateId - The ID of the Team estimate to fetch
 * @param {string} projectId - Optional project ID
 * @returns {Promise} Promise resolving to the Team estimate object
 */
export const fetchTeamEstimateById = async (teamEstimateId, projectId = null) => {
  try {
    const currentProjectId = projectId || getProjectId();
    if (!currentProjectId) {
      throw new Error('No project selected');
    }

    console.log('🔄 Fetching team estimate:', teamEstimateId, 'for project:', currentProjectId);

    const headers = await getAuthHeaders();
    const url = `${API_BASE_URL}projects/${encodeURIComponent(currentProjectId)}/team-estimates/${encodeURIComponent(teamEstimateId)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Team estimate fetched:', data);
    return data;
  } catch (error) {
    console.error('❌ Error fetching team estimate:', error);
    throw error;
  }
};

/**
 * Fetch buckets without Team estimates
 * 
 * @param {string} projectId - Optional project ID
 * @returns {Promise} Promise resolving to array of buckets without Team estimates
 */
export const fetchBucketsWithoutTeamEstimate = async (projectId = null) => {
  try {
    const currentProjectId = projectId || getProjectId();
    if (!currentProjectId) {
      throw new Error('No project selected');
    }

    console.log('🔄 Fetching buckets without team estimates for project:', currentProjectId);

    const headers = await getAuthHeaders();

    // Get all buckets
    const bucketsUrl = `${API_BASE_URL}/projects/${encodeURIComponent(currentProjectId)}/application-buckets`;
    const bucketsResponse = await fetch(bucketsUrl, {
      method: 'GET',
      headers
    });

    if (!bucketsResponse.ok) {
      throw new Error(`HTTP error! status: ${bucketsResponse.status}`);
    }

    const allBuckets = await bucketsResponse.json();

    // Get all team estimates
    const teamEstimates = await fetchTeamEstimates(currentProjectId);

    // Filter out buckets that already have team estimates
    const bucketsWithTeamEstimate = teamEstimates.map(estimate => estimate.bucketId);
    const bucketsWithoutTeamEstimate = allBuckets.filter(bucket => 
      !bucketsWithTeamEstimate.includes(bucket.id || bucket.bucketId)
    );

    console.log('✅ Buckets without team estimates:', bucketsWithoutTeamEstimate);
    return bucketsWithoutTeamEstimate;
  } catch (error) {
    console.error('❌ Error fetching buckets without team estimates:', error);
    throw error;
  }
};

/**
 * Create a new Team estimate
 * 
 * @param {Object} teamEstimateData - The data for the new Team estimate
 * @param {string} projectId - Optional project ID
 * @returns {Promise} Promise resolving to the created Team estimate
 */
export const createTeamEstimate = async (teamEstimateData, projectId = null) => {
  try {
    const currentProjectId = projectId || getProjectId();
    if (!currentProjectId) {
      throw new Error('No project selected');
    }

    console.log('🔄 Creating team estimate for project:', currentProjectId, 'with data:', teamEstimateData);

    const headers = await getAuthHeaders();
    
    const url = `${API_BASE_URL}projects/${encodeURIComponent(currentProjectId)}/team-estimates`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(teamEstimateData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Team estimate created:', data);
    return data;
  } catch (error) {
    console.error('❌ Error creating team estimate:', error);
    throw error;
  }
};

/**
 * Update an existing Team estimate
 * 
 * @param {string} teamEstimateId - The ID of the Team estimate to update
 * @param {Object} teamEstimateData - The updated data for the Team estimate
 * @param {string} projectId - Optional project ID
 * @returns {Promise} Promise resolving to the updated Team estimate
 */
export const updateTeamEstimate = async (teamEstimateId, teamEstimateData, projectId = null) => {
  try {
    const currentProjectId = projectId || getProjectId();
    if (!currentProjectId) {
      throw new Error('No project selected');
    }

    console.log('🔄 Updating team estimate:', teamEstimateId, 'for project:', currentProjectId, 'with data:', teamEstimateData);

    const headers = await getAuthHeaders();
    
    const url = `${API_BASE_URL}projects/${encodeURIComponent(currentProjectId)}/team-estimates/${encodeURIComponent(teamEstimateId)}`;
    
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(teamEstimateData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Team estimate updated:', data);
    return data;
  } catch (error) {
    console.error('❌ Error updating team estimate:', error);
    throw error;
  }
};

/**
 * Delete a Team estimate
 * 
 * @param {string} teamEstimateId - The ID of the Team estimate to delete
 * @param {string} projectId - Optional project ID
 * @returns {Promise} Promise resolving to success message
 */
export const deleteTeamEstimate = async (teamEstimateId, projectId = null) => {
  try {
    const currentProjectId = projectId || getProjectId();
    if (!currentProjectId) {
      throw new Error('No project selected');
    }

    console.log('🔄 Deleting team estimate:', teamEstimateId, 'for project:', currentProjectId);

    const headers = await getAuthHeaders();
    const url = `${API_BASE_URL}projects/${encodeURIComponent(currentProjectId)}/team-estimates/${encodeURIComponent(teamEstimateId)}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Team estimate deleted:', data);
    return data;
  } catch (error) {
    console.error('❌ Error deleting team estimate:', error);
    throw error;
  }
};