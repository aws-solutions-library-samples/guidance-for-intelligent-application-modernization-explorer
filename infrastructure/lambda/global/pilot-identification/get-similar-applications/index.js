// Force deployment timestamp: 2025-08-08T00:00:00.0NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:11.3NZ';

/**
 * Get Similar Applications Lambda Function
 * 
 * This function retrieves similar applications for a given pilot application
 * from the application similarity DynamoDB table
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Create a successful response
 */
const createResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
};

/**
 * Extract project ID from event context
 */
const getProjectIdFromEvent = (event) => {
  // Try to get project ID from various sources
  if (event.requestContext?.authorizer?.claims?.['custom:projectId']) {
    return event.requestContext.authorizer.claims['custom:projectId'];
  }
  
  // Try to get from query parameters (new approach)
  if (event.queryStringParameters?.projectId) {
    return event.queryStringParameters.projectId;
  }
  
  // Try to get from headers (fallback)
  if (event.headers?.['x-project-id']) {
    return event.headers['x-project-id'];
  }
  
  return null;
};

/**
 * Main Lambda handler
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('🔍 Get Similar Applications - Event:', JSON.stringify(sanitizeEvent(event), null, 2));

  try {
    // Extract project ID and application name
    const projectId = getProjectIdFromEvent(event);
    const applicationName = event.pathParameters?.applicationName;
    const minSimilarity = parseFloat(event.queryStringParameters?.minSimilarity || '0');

    if (!projectId) {
      return createResponse(400, {
        error: 'Project ID is required',
        message: 'Please provide a valid project ID'
      });
    }

    if (!applicationName) {
      return createResponse(400, {
        error: 'Application name is required',
        message: 'Please provide a valid application name in the path'
      });
    }

    console.log('🔍 Looking for similar applications:', {
      projectId,
      applicationName: decodeURIComponent(applicationName),
      minSimilarity
    });

    // Construct similarity table name
    const similarityTableName = `app-modex-app-sim-${projectId.toLowerCase()}`;
    
    console.log('📋 Querying table:', similarityTableName);

    // Query similarity table for this application
    const response = await dynamodb.send(new QueryCommand({
      TableName: similarityTableName,
      KeyConditionExpression: 'application_id = :app_id',
      ExpressionAttributeValues: {
        ':app_id': decodeURIComponent(applicationName)
      }
    }));

    const items = response.Items || [];
    console.log(`📊 Found ${items.length} similarity records`);

    // Transform and filter the results
    const similarApplications = items
      .map(item => ({
        name: item.similar_app_id,
        applicationName: item.similar_app_id,
        similarity: parseFloat(item.similarity_score || 0),
        department: '', // Not available in similarity table
        criticality: '', // Not available in similarity table
        componentCount: item.app2_component_count || 0
      }))
      .filter(app => app.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity); // Sort by similarity descending

    console.log(`✅ Returning ${similarApplications.length} similar applications (filtered by ${minSimilarity})`);
    
    if (similarApplications.length > 0) {
      console.log(`🔍 Top similar app: ${similarApplications[0].name} (${(similarApplications[0].similarity * 100).toFixed(1)}%)`);
    }

    return createResponse(200, {
      success: true,
      applicationName: decodeURIComponent(applicationName),
      similarApplications,
      totalCount: similarApplications.length,
      minSimilarity,
      metadata: {
        projectId,
        retrievedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error getting similar applications:', error);
    
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
