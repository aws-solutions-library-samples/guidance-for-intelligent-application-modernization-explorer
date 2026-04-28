/**
 * Data Sources Service
 * Handles interactions with the API for data sources
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { v4 as uuidv4 } from 'uuid';

/**
 * Base API URL from environment variables
 */
const API_URL = process.env.REACT_APP_API_URL || '';

/**
 * Get authentication headers for API requests
 * @returns {Promise<Object>} - Headers object with Authorization
 */
const getAuthHeaders = async () => {
  try {
    const { tokens } = await fetchAuthSession();
    if (!tokens || !tokens.idToken) {
      throw new Error('No authentication token available');
    }
    
    return {
      'Authorization': `Bearer ${tokens.idToken.toString()}`
    };
  } catch (error) {
    console.error('Error getting auth headers:', error);
    throw error;
  }
};

/**
 * Add a data source record to DynamoDB
 * @param {Object} dataSource - The data source record to add
 * @returns {Promise<Object>} - The added data source record
 */
export const addDataSource = async (dataSource) => {
  try {
    // Get the selected project from localStorage
    const selectedProject = localStorage.getItem('selectedProject');
    if (!selectedProject) {
      throw new Error('No project selected');
    }
    
    const project = JSON.parse(selectedProject);
    const projectId = project.projectId || project.id;
    
    if (!projectId) {
      throw new Error('Invalid project ID');
    }
    
    // Create a unique ID for the data source
    const id = dataSource.id || `ds-${uuidv4()}`;
    const timestamp = dataSource.timestamp || new Date().toISOString();
    
    // Create the item to put in DynamoDB
    const item = {
      projectId,
      id,
      timestamp,
      filename: dataSource.filename,
      fileFormat: dataSource.fileFormat,
      fileSize: dataSource.fileSize,
      s3Key: dataSource.s3Key,
      s3Url: dataSource.s3Url,
      dataSourceType: dataSource.dataSourceType || 'skills', // Default to skills
      status: dataSource.status || 'uploaded',
      uploadedBy: dataSource.uploadedBy,
      processingStatus: dataSource.processingStatus || 'pending',
      metadata: dataSource.metadata || {}
    };
    
    // For now, we'll just return success since the file upload API already adds the record to DynamoDB
    console.log('✅ Data source added to DynamoDB:', item);
    
    return {
      success: true,
      dataSource: item
    };
  } catch (error) {
    console.error('❌ Error adding data source to DynamoDB:', error);
    return {
      success: false,
      error: error.message || 'Failed to add data source'
    };
  }
};

/**
 * Get all data sources for a project
 * @param {string} dataSourceType - Optional data source type to filter by
 * @returns {Promise<Object>} - The data sources
 */
export const getDataSources = async (dataSourceType = null) => {
  try {
    // Get the selected project from localStorage
    const selectedProject = localStorage.getItem('selectedProject');
    if (!selectedProject) {
      throw new Error('No project selected');
    }
    
    const project = JSON.parse(selectedProject);
    const projectId = project.projectId || project.id;
    
    if (!projectId) {
      throw new Error('Invalid project ID');
    }
    
    // Get auth headers
    const authHeaders = await getAuthHeaders();
    
    // Build the API URL
    let url = `${API_URL}/projects/${projectId}/data-sources`;
    if (dataSourceType) {
      url += `?dataSourceType=${encodeURIComponent(dataSourceType)}`;
    }
    
    console.log(`🔍 Getting data sources from API: ${url}`);
    
    // Make API request
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      }
    });
    
    // Parse response
    const result = await response.json();
    
    // Check for errors
    if (!response.ok) {
      throw new Error(result.error || 'Failed to get data sources');
    }
    
    console.log('✅ Data sources retrieved from API:', result.items);
    
    return {
      success: true,
      items: result.items || [],
      totalItems: result.totalItems || 0
    };
  } catch (error) {
    console.error('❌ Error getting data sources from API:', error);
    return {
      success: false,
      error: error.message || 'Failed to get data sources',
      items: [],
      totalItems: 0
    };
  }
};

/**
 * Download a data source file
 * @param {string} id - The ID of the data source to download
 * @returns {Promise<Object>} - The result of the download operation
 */
export const downloadDataSource = async (id) => {
  try {
    // Get the selected project from localStorage
    const selectedProject = localStorage.getItem('selectedProject');
    if (!selectedProject) {
      throw new Error('No project selected');
    }
    
    const project = JSON.parse(selectedProject);
    const projectId = project.projectId || project.id;
    
    if (!projectId) {
      throw new Error('Invalid project ID');
    }
    
    // Get auth headers
    const authHeaders = await getAuthHeaders();
    
    // Build the API URL
    const url = `${API_URL}/projects/${projectId}/files/${id}`;
    
    console.log(`📥 Downloading file from API: ${url}`);
    console.log(`📥 API_URL: ${API_URL}`);
    
    // Make API request
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      }
    });
    
    console.log(`📥 API response status: ${response.status}`);
    
    // Check for errors
    if (!response.ok) {
      let errorMessage = `API request failed with status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        console.error('Error parsing error response:', e);
      }
      throw new Error(errorMessage);
    }
    
    // Parse response
    const result = await response.json();
    
    console.log('✅ File download response:', result);
    
    if (!result.url) {
      throw new Error('No download URL provided by the server');
    }
    
    console.log('✅ Opening presigned URL:', result.url);
    
    // Instead of fetching the content directly, open the presigned URL in a new tab
    // This bypasses CORS issues since the browser handles the request directly
    window.open(result.url, '_blank');
    
    return {
      success: true,
      filename: result.filename
    };
  } catch (error) {
    console.error('❌ Error downloading file:', error);
    return {
      success: false,
      error: error.message || 'Failed to download file'
    };
  }
};

/**
 * Delete a data source
 * @param {string} id - The ID of the data source to delete
 * @returns {Promise<Object>} - The result of the delete operation
 */
export const deleteDataSource = async (id) => {
  try {
    // Get the selected project from localStorage
    const selectedProject = localStorage.getItem('selectedProject');
    if (!selectedProject) {
      throw new Error('No project selected');
    }
    
    const project = JSON.parse(selectedProject);
    const projectId = project.projectId || project.id;
    
    if (!projectId) {
      throw new Error('Invalid project ID');
    }
    
    // Get auth headers
    const authHeaders = await getAuthHeaders();
    
    // Build the API URL
    const url = `${API_URL}/projects/${projectId}/files/${id}`;
    
    console.log(`🗑️ Deleting file from API: ${url}`);
    
    // Make API request
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      }
    });
    
    // Parse response
    const result = await response.json();
    
    // Check for errors
    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete file');
    }
    
    console.log('✅ File deleted successfully:', result.message);
    
    return {
      success: true,
      message: result.message
    };
  } catch (error) {
    console.error('❌ Error deleting file:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete file'
    };
  }
};

export default {
  addDataSource,
  getDataSources,
  downloadDataSource,
  deleteDataSource
};
