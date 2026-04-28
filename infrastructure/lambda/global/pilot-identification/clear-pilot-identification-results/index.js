// Force deployment timestamp: 2025-08-07T17:00:00.000Z
const DEPLOYMENT_TIMESTAMP = '2025-08-07T17:00:00.000Z';

/**
 * Clear Pilot Identification Results Lambda Function
 * 
 * Simple project-based endpoint that clears all pilot identification results
 * for a project. Follows the same pattern as application similarity clear.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Extract project ID from event context
 */
const getProjectIdFromEvent = (event) => {
  // Try to get project ID from various sources
  if (event.requestContext?.authorizer?.claims?.['custom:projectId']) {
    return event.requestContext.authorizer.claims['custom:projectId'];
  }
  
  // Try to get from query parameters
  if (event.queryStringParameters?.projectId) {
    return event.queryStringParameters.projectId;
  }
  
  // Try to get from headers
  if (event.headers?.['x-project-id']) {
    return event.headers['x-project-id'];
  }
  
  return null;
};

/**
 * Create response with CORS headers
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
 * Main Lambda handler
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('🗑️ Clear Pilot Identification Results - Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
    // Extract project ID
    const projectId = getProjectIdFromEvent(event);
    if (!projectId) {
      return createResponse(400, {
        error: 'Project ID is required',
        message: 'Please provide a valid project ID'
      });
    }
    
    console.log('🗑️ Clearing pilot identification results for project:', projectId);
    
    // Get results table name
    const normalizedProjectId = projectId.toLowerCase();
    const resultsTableName = `app-modex-pilot-results-${normalizedProjectId}`;
    
    console.log('📋 Clearing results table:', resultsTableName);
    
    try {
      // First, scan to get all items
      const scanResult = await dynamodb.send(new ScanCommand({
        TableName: resultsTableName,
        ProjectionExpression: 'jobId, candidateId' // Only get keys for deletion
      }));
      
      if (!scanResult.Items || scanResult.Items.length === 0) {
        console.log('📭 No pilot identification results found to clear for project:', projectId);
        return createResponse(200, {
          success: true,
          message: 'No results found to clear',
          deletedCount: 0
        });
      }
      
      console.log('🗑️ Found', scanResult.Items.length, 'items to delete');
      
      // Delete all items
      const deletePromises = scanResult.Items.map(item => 
        dynamodb.send(new DeleteCommand({
          TableName: resultsTableName,
          Key: {
            jobId: item.jobId,
            candidateId: item.candidateId
          }
        }))
      );
      
      await Promise.all(deletePromises);
      
      console.log('✅ Successfully cleared', scanResult.Items.length, 'pilot identification results');
      
      return createResponse(200, {
        success: true,
        message: 'Pilot identification results cleared successfully',
        deletedCount: scanResult.Items.length
      });
      
    } catch (tableError) {
      console.error('❌ Error clearing results table:', tableError);
      
      // If table doesn't exist, that's fine - nothing to clear
      if (tableError.name === 'ResourceNotFoundException') {
        return createResponse(200, {
          success: true,
          message: 'No results found to clear',
          deletedCount: 0
        });
      }
      
      throw tableError;
    }
    
  } catch (error) {
    console.error('❌ Error clearing pilot identification results:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message
    });
  }
};
