import { fetchAuthSession } from 'aws-amplify/auth';

const API_URL = process.env.REACT_APP_API_URL || '';

/**
 * Get authentication headers for API requests
 */
const getAuthHeaders = async () => {
  try {
    const { tokens } = await fetchAuthSession();
    if (!tokens || !tokens.idToken) {
      throw new Error('No authentication token available');
    }
    
    return {
      'Authorization': `Bearer ${tokens.idToken.toString()}`,
      'Content-Type': 'application/json'
    };
  } catch (error) {
    console.error('Error getting auth headers:', error);
    throw error;
  }
};

/**
 * Fetch processes with optional filtering
 * @param {string} projectId - Project ID
 * @param {Object} params - Query parameters
 * @param {string} params.processType - Filter by process type
 * @param {string} params.status - Filter by status
 * @param {string} params.startDate - Filter by start date
 * @param {string} params.endDate - Filter by end date
 * @param {number} params.limit - Maximum number of results to return
 * @param {string} params.nextToken - Pagination token
 * @returns {Promise<Object>} - Process data with items and pagination info
 */
export const fetchProcesses = async (projectId, params = {}) => {
  try {
    const authHeaders = await getAuthHeaders();
    
    // Build query string
    const queryParams = new URLSearchParams();
    if (params.processType) queryParams.append('processType', params.processType);
    if (params.status) queryParams.append('status', params.status);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.nextToken) queryParams.append('nextToken', params.nextToken);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    
    const queryString = queryParams.toString();
    const baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
    const url = `${baseUrl}/projects/${projectId}/process-tracking${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: authHeaders
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch processes: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching processes:', error);
    throw error;
  }
};

/**
 * Fetch a specific process by ID
 * @param {string} projectId - Project ID
 * @param {string} processId - Process ID
 * @returns {Promise<Object>} - Process details
 */
export const fetchProcessById = async (projectId, processId) => {
  try {
    const authHeaders = await getAuthHeaders();
    
    const response = await fetch(`${API_URL}/projects/${projectId}/process-tracking/${processId}`, {
      method: 'GET',
      headers: authHeaders
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch process: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching process details:', error);
    throw error;
  }
};

/**
 * Create a new process
 * @param {string} projectId - Project ID
 * @param {Object} processData - Process data
 * @returns {Promise<Object>} - Created process
 */
export const createProcess = async (projectId, processData) => {
  try {
    const authHeaders = await getAuthHeaders();
    
    const response = await fetch(`${API_URL}/projects/${projectId}/process-tracking`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(processData)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create process: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating process:', error);
    throw error;
  }
};

/**
 * Update a process
 * @param {string} projectId - Project ID
 * @param {string} processId - Process ID
 * @param {Object} updateData - Update data
 * @returns {Promise<Object>} - Updated process
 */
export const updateProcess = async (projectId, processId, updateData) => {
  try {
    const authHeaders = await getAuthHeaders();
    
    const response = await fetch(`${API_URL}/projects/${projectId}/process-tracking/${processId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(updateData)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update process: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating process:', error);
    throw error;
  }
};


