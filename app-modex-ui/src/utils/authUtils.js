import { Auth } from 'aws-amplify';
import AWS from 'aws-sdk';

/**
 * Get AWS credentials for the current user with project-specific role
 * @param {string} projectId - The ID of the project to get credentials for
 * @returns {Promise<AWS.Credentials>} - AWS credentials
 */
export const getProjectCredentials = async (projectId) => {
  try {
    // Get current authenticated user
    const currentUser = await Auth.currentAuthenticatedUser();
    const idToken = currentUser.signInUserSession.idToken.jwtToken;
    
    // Get Cognito Identity Pool ID from environment
    const identityPoolId = process.env.REACT_APP_IDENTITY_POOL_ID;
    const region = process.env.REACT_APP_REGION || 'us-east-1';
    
    if (!identityPoolId) {
      console.error('Identity Pool ID not configured');
      throw new Error('Identity Pool ID not configured');
    }
    
    // Configure AWS credentials with project ID as custom claim
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: identityPoolId,
      Logins: {
        [`cognito-idp.${region}.amazonaws.com/${process.env.REACT_APP_USER_POOL_ID}`]: idToken
      },
      customRoleArn: undefined, // Let Cognito determine the role based on rules
      logins: {
        'custom:projectId': projectId
      }
    });
    
    // Refresh credentials
    await AWS.config.credentials.getPromise();
    
    return AWS.config.credentials;
  } catch (error) {
    console.error('Error getting project credentials:', error);
    throw error;
  }
};

/**
 * Initialize AWS services with project-specific credentials
 * @param {string} projectId - The ID of the project
 * @returns {Promise<Object>} - Object containing initialized AWS services
 */
export const initializeAwsServices = async (projectId) => {
  try {
    // Get credentials for the project
    const credentials = await getProjectCredentials(projectId);
    const region = process.env.REACT_APP_REGION || 'us-east-1';
    
    // Initialize AWS services with the credentials
    const s3 = new AWS.S3({
      credentials,
      region
    });
    
    const dynamodb = new AWS.DynamoDB.DocumentClient({
      credentials,
      region
    });
    
    // Return initialized services
    return {
      s3,
      dynamodb
    };
  } catch (error) {
    console.error('Error initializing AWS services:', error);
    throw error;
  }
};

/**
 * Check if the current user has write access to a project
 * @param {string} projectId - The ID of the project
 * @param {Object} projectData - The project data object
 * @returns {boolean} - True if the user has write access, false otherwise
 */
export const hasWriteAccess = (projectId, projectData) => {
  try {
    // Get current user ID
    const userId = Auth.currentAuthenticatedUser().username;
    
    // Check if user is the owner
    if (projectData.createdBy === userId) {
      return true;
    }
    
    // Check if user has write permission in shared users
    if (projectData.sharedUsers && Array.isArray(projectData.sharedUsers)) {
      const userShare = projectData.sharedUsers.find(user => user.userId === userId);
      return userShare && userShare.permission === 'write';
    }
    
    return false;
  } catch (error) {
    console.error('Error checking write access:', error);
    return false;
  }
};

/**
 * Check if the current user has read access to a project
 * @param {string} projectId - The ID of the project
 * @param {Object} projectData - The project data object
 * @returns {boolean} - True if the user has read access, false otherwise
 */
export const hasReadAccess = (projectId, projectData) => {
  try {
    // Get current user ID
    const userId = Auth.currentAuthenticatedUser().username;
    
    // Check if user is the owner
    if (projectData.createdBy === userId) {
      return true;
    }
    
    // Check if user is in shared users
    if (projectData.sharedUsers && Array.isArray(projectData.sharedUsers)) {
      return projectData.sharedUsers.some(user => user.userId === userId);
    }
    
    return false;
  } catch (error) {
    console.error('Error checking read access:', error);
    return false;
  }
};
