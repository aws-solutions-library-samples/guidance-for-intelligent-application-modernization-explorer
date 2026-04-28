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

    // Debug: Log token payload to see user information
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        // Use atob instead of Buffer for browser compatibility
        const payload = JSON.parse(atob(tokenParts[1]));
        console.log('🔍 Token payload:', {
          sub: payload.sub,
          email: payload.email,
          'cognito:username': payload['cognito:username'],
          given_name: payload.given_name,
          family_name: payload.family_name
        });
      }
    } catch (tokenError) {
      console.error('Error parsing token for debugging:', tokenError);
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
    // Remove trailing slash from API_BASE_URL if present
    const baseUrl = API_BASE_URL?.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const fullUrl = `${baseUrl}${endpoint}`;
    
    console.log('🔧 Making API call:', {
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

    console.log('🔧 API response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: response.url
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ API error response:', errorData);
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    // Handle empty responses (like DELETE)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      console.log('✅ API response data:', data);
      return data;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ API call failed for ${endpoint}:`, error);
    
    // Add more specific error information
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error - check if API is accessible and CORS is configured');
    }
    
    throw error;
  }
};

// Get all projects for the authenticated user
export const getProjects = async () => {
  try {
    console.log('🔄 Fetching projects from DynamoDB...');
    console.log('🔧 API Base URL:', API_BASE_URL);
    
    // Debug: Check if we have auth headers
    const headers = await getAuthHeaders();
    console.log('🔧 Auth headers:', { 
      'Authorization': headers.Authorization ? 'Bearer [ID_TOKEN_PRESENT]' : 'MISSING',
      'Content-Type': headers['Content-Type']
    });
    
    const projects = await apiCall('/projects');
    console.log('✅ Projects fetched:', projects?.length || 0);
    return projects || [];
  } catch (error) {
    console.error('❌ Error fetching projects:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw new Error(`Failed to fetch projects: ${error.message}`);
  }
};

// Get a specific project by ID
export const getProject = async (projectId) => {
  try {
    console.log('🔄 Fetching project:', projectId);
    const project = await apiCall(`/projects/${projectId}`);
    console.log('✅ Project fetched:', project?.name);
    return project;
  } catch (error) {
    console.error('❌ Error fetching project:', error);
    throw new Error(`Failed to fetch project: ${error.message}`);
  }
};

// Create a new project
export const createProject = async (projectData) => {
  try {
    console.log('🔄 Creating project:', projectData.name);
    
    const project = await apiCall('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: projectData.name?.trim() || 'Untitled Project',
        description: projectData.description?.trim() || '',
        notes: projectData.notes?.trim() || '',
      }),
    });
    
    console.log('✅ Project created:', project?.projectId);
    return project;
  } catch (error) {
    console.error('❌ Error creating project:', error);
    
    // Check if it's a duplicate name error (409 Conflict)
    if (error.message && error.message.includes('409')) {
      const duplicateError = new Error('DUPLICATE_PROJECT_NAME');
      duplicateError.isDuplicate = true;
      duplicateError.originalMessage = error.message;
      throw duplicateError;
    }
    
    throw new Error(`Failed to create project: ${error.message}`);
  }
};

// Update an existing project
export const updateProject = async (projectId, updateData) => {
  try {
    console.log('🔄 Updating project:', projectId);
    
    const project = await apiCall(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: updateData.name?.trim(),
        description: updateData.description?.trim(),
        notes: updateData.notes?.trim(),
      }),
    });
    
    console.log('✅ Project updated:', project?.projectId);
    return project;
  } catch (error) {
    console.error('❌ Error updating project:', error);
    throw new Error(`Failed to update project: ${error.message}`);
  }
};

// Delete a project
export const deleteProject = async (projectId, options = {}) => {
  try {
    console.log('🔄 Deleting project:', projectId, options.force ? '(force)' : '');
    
    const endpoint = options.force 
      ? `/projects/${projectId}?force=true`
      : `/projects/${projectId}`;
    
    await apiCall(endpoint, {
      method: 'DELETE',
    });
    
    console.log('✅ Project deleted:', projectId);
    return true;
  } catch (error) {
    console.error('❌ Error deleting project:', error);
    throw new Error(`Failed to delete project: ${error.message}`);
  }
};

// Share a project with other users (placeholder for future implementation)
export const shareProject = async (projectId, shareData) => {
  try {
    console.log('🔄 Sharing project:', projectId);
    
    const result = await apiCall(`/projects/${projectId}/sharing`, {
      method: 'POST',
      body: JSON.stringify(shareData),
    });
    
    console.log('✅ Project shared:', projectId);
    return result;
  } catch (error) {
    console.error('❌ Error sharing project:', error);
    throw new Error(`Failed to share project: ${error.message}`);
  }
};

// Get project sharing information
export const getProjectSharing = async (projectId) => {
  try {
    console.log('🔄 Fetching project sharing info:', projectId);
    
    const sharing = await apiCall(`/projects/${projectId}/sharing`);
    
    console.log('✅ Project sharing info fetched:', projectId);
    return sharing;
  } catch (error) {
    console.error('❌ Error fetching project sharing:', error);
    throw new Error(`Failed to fetch project sharing: ${error.message}`);
  }
};
