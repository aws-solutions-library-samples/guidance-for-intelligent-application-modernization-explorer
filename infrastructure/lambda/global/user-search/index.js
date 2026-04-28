// Force deployment timestamp: 2025-07-22T11:17:46.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:08.3NZ';

/**
 * User Search Lambda Function
 * Searches for users in Cognito user pool
 */

const AWS = require('aws-sdk');
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
    const { httpMethod, queryStringParameters, requestContext = {} } = event;

    if (httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const searchQuery = queryStringParameters?.q || '';
    const limit = parseInt(queryStringParameters?.limit || '10', 10);

    if (!searchQuery) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Search query is required' })
      };
    }

    // Get user pool ID from Secrets Manager
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

    // Extract the current user from the Authorization header
    const authHeader = event.headers?.Authorization || '';
    let currentUser = '';

    if (authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
          currentUser = payload['cognito:username'] || '';
          console.log('Current user extracted from token:', currentUser);
        }
      } catch (tokenError) {
        console.error('Error extracting user from token:', tokenError);
      }
    }

    console.log(`Searching for users in user pool ${userPoolId} with query: ${searchQuery}`);

    // Initialize Cognito Identity Provider client
    const cognito = new AWS.CognitoIdentityServiceProvider();

    // Search for users in Cognito user pool
    const params = {
      UserPoolId: userPoolId,
      Filter: `email ^= "${searchQuery}" or given_name ^= "${searchQuery}" or family_name ^= "${searchQuery}"`,
      Limit: limit
    };

    console.log('Cognito search params:', JSON.stringify(params));

    const result = await cognito.listUsers(params).promise();
    console.log('Cognito search result:', JSON.stringify(result));

    // Transform Cognito users to simplified format
    const users = result.Users
      .filter(user => user.Username !== currentUser) // Filter out the current user
      .map(user => {
        const attributes = {};
        user.Attributes.forEach(attr => {
          attributes[attr.Name] = attr.Value;
        });

        // Use the username as the primary ID, but also include the email's local part
        // as an alternative ID for better matching
        const email = attributes.email || '';
        const emailLocalPart = email.split('@')[0];

        return {
          id: user.Username,
          userId: user.Username, // Explicit userId field
          username: emailLocalPart, // Add username field (local part of email)
          email: email,
          firstName: attributes.given_name || '',
          lastName: attributes.family_name || '',
          status: user.UserStatus
        };
      });

    console.log(`Found ${result.Users.length} users, returning ${users.length} after filtering out current user`);

    // Return users directly without nesting in success/data structure
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        users: users
      })
    };
  } catch (error) {
    console.error('Error searching users:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to search users', details: error.message || 'An unexpected error occurred' })
    };
  }
};
