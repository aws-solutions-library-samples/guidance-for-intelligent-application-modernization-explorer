/**
 * Real API for TCO Estimates
 * 
 * This service provides real API calls for the TCO Estimate page.
 */

import { getAuthHeaders } from './authService';

const API_BASE_URL = process.env.REACT_APP_API_URL;

/**
 * Create API request with authentication headers
 */
const createApiRequest = async (url, options = {}) => {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
};

/**
 * Fetch all TCO estimates
 * 
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to array of TCO estimates
 */
export const fetchTCOEstimates = async (projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to fetch TCO estimates');
  }
  return createApiRequest(`/projects/${encodeURIComponent(projectId)}/tco`);
};

/**
 * Fetch a specific TCO estimate by ID
 * 
 * @param {string} tcoId - The ID of the TCO estimate to fetch
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to the TCO estimate object
 */
export const fetchTCOById = async (tcoId, projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to fetch TCO estimate');
  }
  return createApiRequest(`/projects/${encodeURIComponent(projectId)}/tco/${encodeURIComponent(tcoId)}`);
};

/**
 * Fetch buckets without TCO estimates
 * 
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to array of buckets without TCO estimates
 */
export const fetchBucketsWithoutTCO = async (projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to fetch buckets');
  }
  
  try {
    // Get all buckets
    const allBuckets = await createApiRequest(`/projects/${encodeURIComponent(projectId)}/application-buckets`);
    
    // Get all TCO estimates
    const tcoEstimates = await fetchTCOEstimates(projectId);
    
    // Filter out buckets that already have TCO estimates
    const bucketsWithTCO = tcoEstimates.map(tco => tco.bucketId);
    const bucketsWithoutTCO = allBuckets.filter(bucket => !bucketsWithTCO.includes(bucket.bucketId));
    
    return bucketsWithoutTCO;
  } catch (error) {
    console.error('Error fetching buckets without TCO:', error);
    throw error;
  }
};

/**
 * Create a new TCO estimate
 * 
 * @param {Object} tcoData - The data for the new TCO estimate
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to the created TCO estimate
 */
export const createTCOEstimate = async (tcoData, projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to create TCO estimate');
  }
  return createApiRequest(`/projects/${encodeURIComponent(projectId)}/tco`, {
    method: 'POST',
    body: JSON.stringify(tcoData)
  });
};

/**
 * Update an existing TCO estimate
 * 
 * @param {string} tcoId - The ID of the TCO estimate to update
 * @param {Object} tcoData - The updated data for the TCO estimate
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to the updated TCO estimate
 */
export const updateTCOEstimate = async (tcoId, tcoData, projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to update TCO estimate');
  }
  return createApiRequest(`/projects/${encodeURIComponent(projectId)}/tco/${encodeURIComponent(tcoId)}`, {
    method: 'PUT',
    body: JSON.stringify(tcoData)
  });
};

/**
 * Delete a TCO estimate
 * 
 * @param {string} tcoId - The ID of the TCO estimate to delete
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to success message
 */
export const deleteTCOEstimate = async (tcoId, projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to delete TCO estimate');
  }
  return createApiRequest(`/projects/${encodeURIComponent(projectId)}/tco/${encodeURIComponent(tcoId)}`, {
    method: 'DELETE'
  });
};
