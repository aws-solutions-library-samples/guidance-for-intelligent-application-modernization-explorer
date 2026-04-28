/**
 * Export API Service
 * Handles API requests for export functionality with comprehensive error handling and retry logic
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { retryApiCall, callWithCircuitBreaker, isRetryableError } from '../utils/exportRetryUtils';
import { logExportError } from '../utils/exportErrorLogger';

/**
 * Base API URL from environment variables
 */
const API_URL = process.env.REACT_APP_API_URL || '';

/**
 * Helper function to construct API URLs properly, handling trailing slashes
 * @param {string} endpoint - The endpoint path (should start with /)
 * @returns {string} - Properly constructed URL
 */
const buildApiUrl = (endpoint) => {
  const baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${path}`;
};

/**
 * Enhanced error class for export API errors
 */
class ExportApiError extends Error {
  constructor(message, status, response, originalError) {
    super(message);
    this.name = 'ExportApiError';
    this.status = status;
    this.response = response;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
    this.isRetryable = isRetryableError(this);
  }
}

/**
 * Get authentication headers for API requests with retry logic
 * @returns {Promise<Object>} - Headers object with Authorization
 */
const getAuthHeaders = async () => {
  return retryApiCall(async () => {
    try {
      const { tokens } = await fetchAuthSession();
      if (!tokens || !tokens.idToken) {
        const authError = new ExportApiError('No authentication token available', 401);
        authError.isRetryable = false; // Auth errors typically aren't retryable
        throw authError;
      }
      
      return {
        'Authorization': `Bearer ${tokens.idToken.toString()}`,
        'Content-Type': 'application/json'
      };
    } catch (error) {
      console.error('Error getting auth headers:', error);
      if (error instanceof ExportApiError) {
        throw error;
      }
      throw new ExportApiError('Authentication failed', 401, null, error);
    }
  }, {
    maxRetries: 1, // Limited retries for auth
    onRetry: (retryInfo) => {
      console.log(`Retrying authentication (attempt ${retryInfo.attempt})`);
    }
  });
};

/**
 * Enhanced fetch wrapper with comprehensive error handling
 */
const fetchWithErrorHandling = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Parse response body
    let responseData;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      try {
        responseData = await response.json();
      } catch (parseError) {
        console.warn('Failed to parse JSON response:', parseError);
        responseData = { error: 'Invalid JSON response' };
      }
    } else {
      responseData = { error: 'Non-JSON response received' };
    }

    // Handle HTTP errors
    if (!response.ok) {
      const errorMessage = responseData?.error || 
                          responseData?.message || 
                          `HTTP ${response.status}: ${response.statusText}`;
      
      throw new ExportApiError(errorMessage, response.status, responseData);
    }

    return responseData;

  } catch (error) {
    clearTimeout(timeoutId);

    // Handle different types of errors
    if (error.name === 'AbortError') {
      throw new ExportApiError('Request timeout', 408, null, error);
    }
    
    if (error instanceof ExportApiError) {
      throw error;
    }

    // Network or other fetch errors
    if (error.message.includes('fetch')) {
      throw new ExportApiError('Network error - please check your connection', 0, null, error);
    }

    throw new ExportApiError(error.message || 'Unknown error occurred', 0, null, error);
  }
};

/**
 * Initiate a new export job with comprehensive error handling and retry logic
 * @param {Object} exportRequest - Export request parameters
 * @param {string} exportRequest.projectId - Project identifier
 * @param {string} exportRequest.userId - User identifier
 * @param {string[]} exportRequest.selectedCategories - Array of selected category IDs
 * @returns {Promise<Object>} - Export job details
 */
export const initiateExport = async (exportRequest) => {

  // Validate input
  if (!exportRequest?.selectedCategories?.length) {
    throw new ExportApiError('No categories selected for export', 400);
  }

  if (!exportRequest.projectId || !exportRequest.userId) {
    throw new ExportApiError('Missing required project or user information', 400);
  }

  return callWithCircuitBreaker(async () => {
    return retryApiCall(async () => {
      try {
        const authHeaders = await getAuthHeaders();
        
        const result = await fetchWithErrorHandling(buildApiUrl(`/projects/${exportRequest.projectId}/export`), {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(exportRequest),
          timeout: 15000 // 15 second timeout for initiation
        });
        
        // Validate response structure
        if (!result.exportId) {
          throw new ExportApiError('Invalid response: missing export ID', 500, result);
        }
        
        console.log('Export initiated successfully:', result.exportId);
        return result;
        
      } catch (error) {
        console.error('Error initiating export:', error);
        
        // Log error with context
        await logExportError(error, {
          component: 'exportApiService',
          operation: 'initiateExport',
          projectId: exportRequest.projectId,
          selectedCategories: exportRequest.selectedCategories,
          retryAttempt: 0
        });
        
        // Add context to the error
        if (error instanceof ExportApiError) {
          error.context = 'export_initiation';
          error.requestData = { ...exportRequest, userId: '[REDACTED]' }; // Don't log sensitive data
        }
        
        throw error;
      }
    }, {
      maxRetries: 2,
      onRetry: (retryInfo) => {
        console.log(`Retrying export initiation (attempt ${retryInfo.attempt}/${retryInfo.maxRetries})`);
      }
    });
  });
};

/**
 * Get export history with pagination and filtering, enhanced error handling
 * @param {Object} params - Query parameters
 * @param {string} params.projectId - Project identifier
 * @param {number} [params.page=1] - Page number (1-based)
 * @param {number} [params.pageSize=10] - Number of records per page
 * @param {string} [params.status] - Filter by status
 * @param {string} [params.userId] - Filter by user ID
 * @returns {Promise<Object>} - Export history response with records and pagination
 */
export const getExportHistory = async (params = {}) => {

  // Validate required parameters
  if (!params.projectId) {
    throw new ExportApiError('Project ID is required to fetch export history', 400);
  }

  return retryApiCall(async () => {
    try {
      const authHeaders = await getAuthHeaders();
      
      // Build and validate query string
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value);
        }
      });
      
      const result = await fetchWithErrorHandling(
        buildApiUrl(`/projects/${params.projectId}/export/history?${queryParams.toString()}`), 
        {
          method: 'GET',
          headers: authHeaders,
          timeout: 10000 // 10 second timeout
        }
      );
      
      // Validate response structure - API returns 'items' but frontend expects 'records'
      if (!Array.isArray(result.items)) {
        console.warn('Invalid export history response structure, using empty array');
        return { records: [], pagination: { page: 1, pageSize: 10, totalRecords: 0, totalPages: 0 } };
      }
      
      // Transform API response to match frontend expectations
      return { 
        records: result.items,
        pagination: { 
          page: 1, 
          pageSize: result.items.length, 
          totalRecords: result.count || result.items.length, 
          totalPages: 1 
        } 
      };
      
    } catch (error) {
      console.error('Error fetching export history:', error);
      
      // Log error with context
      await logExportError(error, {
        component: 'exportApiService',
        operation: 'getExportHistory',
        projectId: params.projectId,
        requestParams: params
      });
      
      if (error instanceof ExportApiError) {
        error.context = 'export_history_fetch';
        error.requestParams = params;
      }
      
      throw error;
    }
  }, {
    maxRetries: 3,
    onRetry: (retryInfo) => {
      console.log(`Retrying export history fetch (attempt ${retryInfo.attempt})`);
    }
  });
};

/**
 * Get status of a specific export job with enhanced error handling
 * @param {string} exportId - Export identifier
 * @param {string} projectId - Project identifier (required for backend API)
 * @returns {Promise<Object>} - Export job status and details
 */
export const getExportStatus = async (exportId, projectId) => {

  if (!exportId) {
    throw new ExportApiError('Export ID is required to fetch status', 400);
  }

  if (!projectId) {
    throw new ExportApiError('Project ID is required to fetch status', 400);
  }

  return retryApiCall(async () => {
    try {
      const authHeaders = await getAuthHeaders();
      
      const result = await fetchWithErrorHandling(
        buildApiUrl(`/projects/${projectId}/export/${exportId}`), 
        {
          method: 'GET',
          headers: authHeaders,
          timeout: 8000 // 8 second timeout for status checks
        }
      );
      
      // Validate response structure
      if (!result.status) {
        throw new ExportApiError('Invalid status response: missing status field', 500, result);
      }
      
      return result;
      
    } catch (error) {
      // For status checks, we want to be more lenient with errors
      // since they're called frequently during polling
      if (error instanceof ExportApiError && error.status === 404) {
        // Export not found - this might be expected for very new exports
        console.warn(`Export ${exportId} not found, might be still initializing`);
        return {
          exportId,
          status: 'INITIATED',
          message: 'Export is being initialized',
          progress: 0
        };
      }
      
      console.error('Error fetching export status:', error);
      
      // Log error with context (but only for non-404 errors to avoid spam)
      if (!(error instanceof ExportApiError && error.status === 404)) {
        await logExportError(error, {
          component: 'exportApiService',
          operation: 'getExportStatus',
          exportId: exportId
        });
      }
      
      if (error instanceof ExportApiError) {
        error.context = 'export_status_fetch';
        error.exportId = exportId;
      }
      
      throw error;
    }
  }, {
    maxRetries: 2, // Fewer retries for status checks
    baseDelay: 500, // Shorter delay for status checks
    onRetry: (retryInfo) => {
      console.log(`Retrying export status fetch for ${exportId} (attempt ${retryInfo.attempt})`);
    }
  });
};

/**
 * Generate a secure download URL for a completed export with enhanced error handling
 * @param {string} exportId - Export identifier
 * @param {string} projectId - Project identifier (required by backend)
 * @returns {Promise<Object>} - Download URL and metadata
 */
export const generateDownloadUrl = async (exportId, projectId) => {
  if (!exportId) {
    throw new ExportApiError('Export ID is required to generate download URL', 400);
  }
  
  if (!projectId) {
    throw new ExportApiError('Project ID is required to generate download URL', 400);
  }

  return retryApiCall(async () => {
    try {
      const authHeaders = await getAuthHeaders();
      
      const result = await fetchWithErrorHandling(
        buildApiUrl(`/projects/${projectId}/export/${exportId}/download`), 
        {
          method: 'GET',
          headers: authHeaders,
          timeout: 10000 // 10 second timeout
        }
      );
      
      // Validate response structure
      if (!result.downloadUrl) {
        throw new ExportApiError('Invalid download response: missing download URL', 500, result);
      }
      
      // Validate URL format
      try {
        new URL(result.downloadUrl);
      } catch (urlError) {
        throw new ExportApiError('Invalid download URL format received', 500, result);
      }
      
      return result;
      
    } catch (error) {
      console.error('Error generating download URL:', error);
      
      // Log error with context
      await logExportError(error, {
        component: 'exportApiService',
        operation: 'generateDownloadUrl',
        exportId: exportId
      });
      
      if (error instanceof ExportApiError) {
        error.context = 'download_url_generation';
        error.exportId = exportId;
        
        // Provide user-friendly error messages for common scenarios
        if (error.status === 404) {
          error.message = 'Export not found or has expired';
        } else if (error.status === 403) {
          error.message = 'You do not have permission to download this export';
        } else if (error.status === 410) {
          error.message = 'Export file is no longer available for download';
        }
      }
      
      throw error;
    }
  }, {
    maxRetries: 2,
    onRetry: (retryInfo) => {
      console.log(`Retrying download URL generation for ${exportId} (attempt ${retryInfo.attempt})`);
    }
  });
};

/**
 * Download an export file by triggering browser download with comprehensive error handling
 * @param {string} exportId - Export identifier
 * @param {string} projectId - Project identifier (required by backend)
 * @returns {Promise<void>}
 */
export const downloadExport = async (exportId, projectId) => {

  if (!exportId) {
    throw new ExportApiError('Export ID is required for download', 400);
  }
  
  if (!projectId) {
    throw new ExportApiError('Project ID is required for download', 400);
  }

  try {
    // Get the download URL with retry logic
    const downloadData = await generateDownloadUrl(exportId, projectId);
    
    if (!downloadData.downloadUrl) {
      throw new ExportApiError('No download URL provided in response', 500, downloadData);
    }
    
    // Validate browser download capability
    if (typeof document === 'undefined') {
      throw new ExportApiError('Download not supported in this environment', 500);
    }
    
    // Create a temporary link element and trigger download
    const link = document.createElement('a');
    link.href = downloadData.downloadUrl;
    link.download = downloadData.filename || `export-${exportId}.zip`;
    link.style.display = 'none';
    
    // Add error handling for download link
    link.onerror = () => {
      document.body.removeChild(link);
      throw new ExportApiError('Failed to initiate download - the file may be corrupted or unavailable', 500);
    };
    
    document.body.appendChild(link);
    
    try {
      link.click();
      console.log('Export download initiated successfully:', exportId);
      
      // Clean up after a short delay to ensure download started
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 1000);
      
    } catch (clickError) {
      document.body.removeChild(link);
      throw new ExportApiError('Failed to trigger download - browser may have blocked the download', 500, null, clickError);
    }
    
  } catch (error) {
    console.error('Error downloading export:', error);
    
    // Log error with context
    await logExportError(error, {
      component: 'exportApiService',
      operation: 'downloadExport',
      exportId: exportId
    });
    
    if (error instanceof ExportApiError) {
      error.context = 'export_download';
      error.exportId = exportId;
    } else {
      // Wrap unexpected errors
      throw new ExportApiError(`Download failed: ${error.message}`, 500, null, error);
    }
    
    throw error;
  }
};

// Export the real API implementation only
export default {
  initiateExport,
  getExportHistory,
  getExportStatus,
  generateDownloadUrl,
  downloadExport
};