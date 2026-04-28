/**
 * Real API for Application Buckets
 * 
 * This service provides real API calls for the Application Buckets functionality.
 */

import { getAuthHeaders } from './authService';

const API_BASE_URL = process.env.REACT_APP_API_URL;
if (!API_BASE_URL) {
  throw new Error('REACT_APP_API_URL environment variable is required');
}

/**
 * Fetch all application buckets for a project
 * 
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to array of application buckets
 */
export const fetchApplicationBuckets = async (projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to fetch application buckets');
  }

  console.log('🔍 Fetching application buckets for project:', projectId);

  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}projects/${encodeURIComponent(projectId)}/application-buckets`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const buckets = await response.json();
    console.log('✅ Application buckets fetched successfully:', buckets.length);
    
    return buckets;
  } catch (error) {
    console.error('❌ Error fetching application buckets:', error);
    throw error;
  }
};

/**
 * Fetch a specific application bucket by ID
 * 
 * @param {string} bucketId - The ID of the bucket to fetch
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to the bucket object
 */
export const fetchBucketById = async (bucketId, projectId) => {
  if (!bucketId) {
    throw new Error('Bucket ID is required to fetch bucket');
  }
  if (!projectId) {
    throw new Error('Project ID is required to fetch bucket');
  }

  console.log('🔍 Fetching bucket:', bucketId, 'for project:', projectId);

  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}projects/${encodeURIComponent(projectId)}/application-buckets/${encodeURIComponent(bucketId)}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const bucket = await response.json();
    console.log('✅ Bucket fetched successfully:', bucket.name);
    
    return bucket;
  } catch (error) {
    console.error('❌ Error fetching bucket:', error);
    throw error;
  }
};

/**
 * Create a new application bucket
 * 
 * @param {Object} bucketData - The bucket data
 * @param {string} bucketData.name - The name of the bucket
 * @param {string} bucketData.pilotApplicationId - The ID of the pilot application
 * @param {string} bucketData.pilotApplicationName - The name of the pilot application
 * @param {number} bucketData.similarityThreshold - The similarity threshold
 * @param {Array} bucketData.applications - Array of similar applications
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to the created bucket
 */
export const createBucket = async (bucketData, projectId) => {
  if (!bucketData.name) {
    throw new Error('Bucket name is required');
  }
  if (!projectId) {
    throw new Error('Project ID is required to create bucket');
  }

  console.log('🔨 Creating bucket:', bucketData.name, 'for project:', projectId);

  try {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}projects/${encodeURIComponent(projectId)}/application-buckets`, {
      method: 'POST',
      headers,
      body: JSON.stringify(bucketData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const bucket = await response.json();
    console.log('✅ Bucket created successfully:', bucket.name);
    
    return bucket;
  } catch (error) {
    console.error('❌ Error creating bucket:', error);
    throw error;
  }
};

/**
 * Update an existing application bucket
 * 
 * @param {string} bucketId - The ID of the bucket to update
 * @param {Object} bucketData - The updated bucket data
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to the updated bucket
 */
export const updateBucket = async (bucketId, bucketData, projectId) => {
  if (!bucketId) {
    throw new Error('Bucket ID is required to update bucket');
  }
  if (!projectId) {
    throw new Error('Project ID is required to update bucket');
  }

  console.log('🔧 Updating bucket:', bucketId, 'for project:', projectId);

  try {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}projects/${encodeURIComponent(projectId)}/application-buckets/${encodeURIComponent(bucketId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(bucketData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const bucket = await response.json();
    console.log('✅ Bucket updated successfully:', bucket.name);
    
    return bucket;
  } catch (error) {
    console.error('❌ Error updating bucket:', error);
    throw error;
  }
};

/**
 * Delete an application bucket
 * 
 * @param {string} bucketId - The ID of the bucket to delete
 * @param {string} projectId - The project ID
 * @returns {Promise} Promise resolving to success message
 */
export const deleteBucket = async (bucketId, projectId) => {
  if (!bucketId) {
    throw new Error('Bucket ID is required to delete bucket');
  }
  if (!projectId) {
    throw new Error('Project ID is required to delete bucket');
  }

  console.log('🗑️ Deleting bucket:', bucketId, 'for project:', projectId);

  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}projects/${encodeURIComponent(projectId)}/application-buckets/${encodeURIComponent(bucketId)}`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Bucket deleted successfully');
    
    return result;
  } catch (error) {
    console.error('❌ Error deleting bucket:', error);
    throw error;
  }
};
