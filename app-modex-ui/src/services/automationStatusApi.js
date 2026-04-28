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

// Helper function to make authenticated API calls
const apiCall = async (endpoint, options = {}) => {
  try {
    const headers = await getAuthHeaders();
    const fullUrl = `${API_BASE_URL}${endpoint}`;
    
    console.log('🔧 Making automation API call:', {
      url: fullUrl,
      method: options.method || 'GET',
      hasAuth: !!headers.Authorization
    });
    
    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    console.log('🔧 Automation API response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (e) {
        // If not JSON, use the raw text
        if (errorText) {
          errorMessage = errorText;
        }
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('🔧 Automation API call failed:', error);
    throw error;
  }
};

// Get current automation status for all projects
export const getCurrentAutomationStatus = async (filters = {}) => {
  try {
    console.log('🔄 Fetching current automation status');
    
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.limit) params.append('limit', filters.limit.toString());
    
    const endpoint = `/automations/status${params.toString() ? `?${params}` : ''}`;
    const data = await apiCall(endpoint);
    
    console.log('✅ Current automation status fetched:', data.projects?.length || 0, 'projects');
    return data;
  } catch (error) {
    console.error('❌ Error fetching current automation status:', error);
    throw new Error(`Failed to fetch current automation status: ${error.message}`);
  }
};

// Get automation execution history
export const getAutomationHistory = async (filters = {}) => {
  try {
    console.log('🔄 Fetching automation history');
    
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.result) params.append('result', filters.result);
    if (filters.projectId) params.append('projectId', filters.projectId);
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.nextToken) params.append('nextToken', filters.nextToken);
    
    const endpoint = `/automations/history${params.toString() ? `?${params}` : ''}`;
    const data = await apiCall(endpoint);
    
    console.log('✅ Automation history fetched:', data.executions?.length || 0, 'executions');
    return data;
  } catch (error) {
    console.error('❌ Error fetching automation history:', error);
    throw new Error(`Failed to fetch automation history: ${error.message}`);
  }
};

// Get automation failure analysis
export const getAutomationFailureAnalysis = async (filters = {}) => {
  try {
    console.log('🔄 Fetching automation failure analysis');
    
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.failureType) params.append('failureType', filters.failureType);
    if (filters.limit) params.append('limit', filters.limit.toString());
    
    const endpoint = `/automations/failures${params.toString() ? `?${params}` : ''}`;
    const data = await apiCall(endpoint);
    
    console.log('✅ Automation failure analysis fetched:', data.analysis?.totalFailures || 0, 'failures');
    return data;
  } catch (error) {
    console.error('❌ Error fetching automation failure analysis:', error);
    throw new Error(`Failed to fetch automation failure analysis: ${error.message}`);
  }
};

// Get automation status for a specific project
export const getProjectAutomationStatus = async (projectId) => {
  try {
    console.log('🔄 Fetching project automation status:', projectId);
    
    const data = await apiCall(`/automations/project/${projectId}`);
    
    console.log('✅ Project automation status fetched:', projectId);
    return data;
  } catch (error) {
    console.error('❌ Error fetching project automation status:', error);
    throw new Error(`Failed to fetch project automation status: ${error.message}`);
  }
};
