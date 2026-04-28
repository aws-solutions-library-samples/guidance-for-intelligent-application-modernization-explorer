// Force deployment timestamp: 2025-07-22T11:17:45.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:04.3NZ';

/**
 * Enhanced Sharing Lambda Function with User Integration
 * Handles project sharing with automatic user lookup/creation
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();
const secretsManager = new AWS.SecretsManager();

const { sanitizeEvent } = require('app-modex-shared');

// Cache for secrets (loaded at cold start)
let appConfig = null;

/**
 * Load configuration from Secrets Manager
 */
async function loadConfig() {
  if (appConfig) return appConfig;
  
  const APP_CONFIG_SECRET_ARN = process.env.APP_CONFIG_SECRET_ARN;
  const response = await secretsManager.getSecretValue({ SecretId: APP_CONFIG_SECRET_ARN }).promise();
  appConfig = JSON.parse(response.SecretString);
  return appConfig;
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
    'Content-Type': 'application/json'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }
  
  try {
    const { httpMethod, pathParameters, body } = event;
    const projectId = pathParameters?.projectId;
    const shareId = pathParameters?.shareId;
    
    // Log environment variables for debugging
    console.log('Environment variables:', {
      PROJECTS_TABLE: process.env.PROJECTS_TABLE,
      PROJECTS_TABLE_NAME: process.env.PROJECTS_TABLE_NAME,
      PROJECT_DATA_TABLE: process.env.PROJECT_DATA_TABLE,
      PROJECT_DATA_TABLE_NAME: process.env.PROJECT_DATA_TABLE_NAME
    });
    
    // Get the table name from environment variables with fallback
    const tableName = process.env.PROJECTS_TABLE || process.env.PROJECTS_TABLE_NAME || 'app-modex-projects';
    
    if (!tableName) {
      console.error('No table name found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Configuration error: No table name found' })
      };
    }
    
    console.log(`Using table name: ${tableName}`);
    
    // Handle different HTTP methods
    switch (httpMethod) {
      case 'GET':
        return await getProjectShares(projectId, tableName, headers);
      case 'POST':
        return await shareProject(projectId, JSON.parse(body || '{}'), tableName, headers);
      case 'PUT':
        return await updateShare(projectId, shareId, JSON.parse(body || '{}'), tableName, headers);
      case 'DELETE':
        return await removeShare(projectId, shareId, tableName, headers);
      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message || 'An unexpected error occurred' })
    };
  }
};

// Get all users shared with a project
async function getProjectShares(projectId, tableName, headers) {
  try {
    if (!projectId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Project ID is required' })
      };
    }
    
    // Get project to check if it exists and get sharing info
    const projectParams = {
      TableName: tableName,
      Key: { projectId }
    };
    
    console.log('Getting project with params:', JSON.stringify(projectParams));
    
    try {
      const projectResult = await dynamodb.get(projectParams).promise();
      console.log('Project result:', JSON.stringify(projectResult));
      
      if (!projectResult.Item) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Project not found' })
        };
      }
      
      // Return shared users or empty array if none
      const sharedUsers = projectResult.Item.sharedUsers || [];
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: sharedUsers
        })
      };
    } catch (dbError) {
      console.error('DynamoDB error:', dbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database error', details: dbError.message })
      };
    }
  } catch (error) {
    console.error('Error getting project shares:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to get project shares', details: error.message })
    };
  }
}

// Share project with a user (using external identity management)
async function shareProject(projectId, shareData, tableName, headers) {
  try {
    const { email, shareMode = 'read-only', firstName, lastName } = shareData;
    
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }
    
    if (!projectId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Project ID is required' })
      };
    }
    
    // Step 1: Look up user in Cognito to get their actual cognito:username
    const config = await loadConfig();
    const userPoolId = config.userPoolId;
    
    if (!userPoolId) {
      console.error('userPoolId not found in Secrets Manager');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Configuration error: userPoolId not found' })
      };
    }
    
    let cognitoUser;
    let cognitoUsername;
    
    try {
      console.log('Looking up user in Cognito:', email);
      
      // Search for user by email
      const listUsersParams = {
        UserPoolId: userPoolId,
        Filter: `email = "${email}"`,
        Limit: 1
      };
      
      const listUsersResult = await cognitoIdentityServiceProvider.listUsers(listUsersParams).promise();
      
      if (!listUsersResult.Users || listUsersResult.Users.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'User not found in Cognito. User must have an account before they can be added to a project.' })
        };
      }
      
      cognitoUser = listUsersResult.Users[0];
      cognitoUsername = cognitoUser.Username; // This is the cognito:username that will be used for matching
      
      console.log('Found Cognito user:', {
        username: cognitoUsername,
        email: email,
        userStatus: cognitoUser.UserStatus
      });
      
    } catch (cognitoError) {
      console.error('Error looking up user in Cognito:', cognitoError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to look up user in Cognito', details: cognitoError.message })
      };
    }
    
    // Step 2: Check if project exists
    const projectParams = {
      TableName: tableName,
      Key: { projectId }
    };
    
    console.log('Getting project with params:', JSON.stringify(projectParams));
    
    try {
      const projectResult = await dynamodb.get(projectParams).promise();
      if (!projectResult.Item) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Project not found' })
        };
      }
      
      const project = projectResult.Item;
      
      // Step 3: Check if user is already shared
      const existingShares = project.sharedUsers || [];
      const existingShare = existingShares.find(share => share.email === email);
      
      if (existingShare) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: 'User is already shared with this project' })
        };
      }
      
      // Step 4: Create share record using the actual Cognito username
      const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();
      
      const newShare = {
        id: shareId,
        email: email,
        firstName: firstName || extractFirstNameFromEmail(email),
        lastName: lastName || extractLastNameFromEmail(email),
        userId: cognitoUsername, // Use the actual cognito:username from Cognito
        shareMode: shareMode,
        sharedDate: now
      };
      
      console.log('Creating share with userId:', cognitoUsername);
      
      // Step 5: Update project with new share
      const updatedShares = [...existingShares, newShare];
      
      const updateParams = {
        TableName: tableName,
        Key: { projectId },
        UpdateExpression: 'SET sharedUsers = :shares, sharedCount = :count, isShared = :shared, lastModified = :modified',
        ExpressionAttributeValues: {
          ':shares': updatedShares,
          ':count': updatedShares.length,
          ':shared': true,
          ':modified': now
        },
        ReturnValues: 'ALL_NEW'
      };
      
      console.log('Updating project with params:', JSON.stringify(updateParams, null, 2));
      
      const updateResult = await dynamodb.update(updateParams).promise();
      console.log('Update result:', JSON.stringify(updateResult));
      
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          data: newShare
        })
      };
    } catch (dbError) {
      console.error('DynamoDB error:', dbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database error', details: dbError.message })
      };
    }
  } catch (error) {
    console.error('Error sharing project:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to share project', details: error.message })
    };
  }
}

// Update share permissions
async function updateShare(projectId, shareId, updateData, tableName, headers) {
  try {
    const { shareMode } = updateData;
    
    if (!shareId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Share ID is required' })
      };
    }
    
    if (!projectId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Project ID is required' })
      };
    }
    
    // Step 1: Check if project exists and get current shares
    const projectParams = {
      TableName: tableName,
      Key: { projectId }
    };
    
    console.log('Getting project with params:', JSON.stringify(projectParams));
    
    try {
      const projectResult = await dynamodb.get(projectParams).promise();
      if (!projectResult.Item) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Project not found' })
        };
      }
      
      const project = projectResult.Item;
      const existingShares = project.sharedUsers || [];
      
      // Step 2: Find the share to update
      const shareIndex = existingShares.findIndex(share => share.id === shareId);
      if (shareIndex === -1) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Share not found' })
        };
      }
      
      // Step 3: Update the share
      const now = new Date().toISOString();
      const updatedShare = { ...existingShares[shareIndex], shareMode, lastModified: now };
      const updatedShares = [...existingShares];
      updatedShares[shareIndex] = updatedShare;
      
      // Step 4: Update the project
      const updateParams = {
        TableName: tableName,
        Key: { projectId },
        UpdateExpression: 'SET sharedUsers = :shares, lastModified = :modified',
        ExpressionAttributeValues: {
          ':shares': updatedShares,
          ':modified': now
        },
        ReturnValues: 'ALL_NEW'
      };
      
      console.log('Updating project with params:', JSON.stringify(updateParams, null, 2));
      
      const updateResult = await dynamodb.update(updateParams).promise();
      console.log('Update result:', JSON.stringify(updateResult));
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: updatedShare
        })
      };
    } catch (dbError) {
      console.error('DynamoDB error:', dbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database error', details: dbError.message })
      };
    }
  } catch (error) {
    console.error('Error updating share:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to update share', details: error.message })
    };
  }
}

// Remove share
async function removeShare(projectId, shareId, tableName, headers) {
  try {
    if (!shareId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Share ID is required' })
      };
    }
    
    if (!projectId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Project ID is required' })
      };
    }
    
    // Step 1: Check if project exists and get current shares
    const projectParams = {
      TableName: tableName,
      Key: { projectId }
    };
    
    console.log('Getting project with params:', JSON.stringify(projectParams));
    
    try {
      const projectResult = await dynamodb.get(projectParams).promise();
      if (!projectResult.Item) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Project not found' })
        };
      }
      
      const project = projectResult.Item;
      const existingShares = project.sharedUsers || [];
      
      // Step 2: Find the share to remove
      const shareIndex = existingShares.findIndex(share => share.id === shareId);
      if (shareIndex === -1) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Share not found' })
        };
      }
      
      // Step 3: Remove the share
      const now = new Date().toISOString();
      const updatedShares = existingShares.filter(share => share.id !== shareId);
      
      // Step 4: Update the project
      const updateParams = {
        TableName: tableName,
        Key: { projectId },
        UpdateExpression: 'SET sharedUsers = :shares, sharedCount = :count, isShared = :shared, lastModified = :modified',
        ExpressionAttributeValues: {
          ':shares': updatedShares,
          ':count': updatedShares.length,
          ':shared': updatedShares.length > 0,
          ':modified': now
        },
        ReturnValues: 'ALL_NEW'
      };
      
      console.log('Updating project with params:', JSON.stringify(updateParams, null, 2));
      
      const updateResult = await dynamodb.update(updateParams).promise();
      console.log('Update result:', JSON.stringify(updateResult));
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Share removed successfully'
        })
      };
    } catch (dbError) {
      console.error('DynamoDB error:', dbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database error', details: dbError.message })
      };
    }
  } catch (error) {
    console.error('Error removing share:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to remove share', details: error.message })
    };
  }
}

// Helper functions
function extractFirstNameFromEmail(email) {
  const localPart = email.split('@')[0];
  const parts = localPart.split(/[._-]/);
  return parts[0] ? capitalizeFirst(parts[0]) : 'User';
}

function extractLastNameFromEmail(email) {
  const localPart = email.split('@')[0];
  const parts = localPart.split(/[._-]/);
  return parts[1] ? capitalizeFirst(parts[1]) : '';
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
