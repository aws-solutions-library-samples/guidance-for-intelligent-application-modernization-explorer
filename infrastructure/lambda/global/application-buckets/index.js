// Force deployment timestamp: 2025-10-27T12:48:43.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:24.3NZ';

/**
 * Application Buckets Lambda Function
 * 
 * Handles CRUD operations for application buckets
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const createResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-project-id',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  },
  body: JSON.stringify(body)
});

const getProjectIdFromEvent = (event) => {
  return event.pathParameters?.projectId ||
         event.queryStringParameters?.projectId || 
         event.headers?.['x-project-id'] || 
         event.requestContext?.authorizer?.claims?.['custom:projectId'];
};

const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('🔍 Application Buckets - Event:', JSON.stringify(sanitizeEvent(event), null, 2));

  try {
    const projectId = getProjectIdFromEvent(event);
    const method = event.httpMethod;
    const pathParameters = event.pathParameters || {};
    const bucketId = pathParameters.bucketId;

    if (!projectId) {
      return createResponse(400, { error: 'Project ID is required' });
    }

    const tableName = `app-modex-application-buckets-${projectId}`.toLowerCase();

    switch (method) {
      case 'OPTIONS':
        // Handle preflight requests
        return createResponse(200, {});

      case 'GET':
        if (bucketId) {
          // Get specific bucket
          const result = await dynamodb.send(new GetCommand({
            TableName: tableName,
            Key: { projectId, bucketId }
          }));
          
          if (!result.Item) {
            return createResponse(404, { error: 'Bucket not found' });
          }
          
          return createResponse(200, result.Item);
        } else {
          // Get all buckets for project
          const result = await dynamodb.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'projectId = :projectId',
            ExpressionAttributeValues: { ':projectId': projectId }
          }));
          
          return createResponse(200, result.Items || []);
        }

      case 'POST':
        // Create new bucket
        const bucketData = JSON.parse(event.body);
        const newBucketId = `bucket-${Date.now()}`;
        
        const newBucket = {
          projectId,
          bucketId: newBucketId,
          name: bucketData.name,
          pilotApplicationId: bucketData.pilotApplicationId,
          pilotApplicationName: bucketData.pilotApplicationName,
          similarityThreshold: bucketData.similarityThreshold,
          applications: bucketData.applications || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await dynamodb.send(new PutCommand({
          TableName: tableName,
          Item: newBucket
        }));

        return createResponse(201, newBucket);

      case 'PUT':
        // Update existing bucket
        if (!bucketId) {
          return createResponse(400, { error: 'Bucket ID is required for updates' });
        }

        const updateData = JSON.parse(event.body);
        const updatedBucket = {
          projectId,
          bucketId,
          ...updateData,
          updatedAt: new Date().toISOString()
        };

        await dynamodb.send(new PutCommand({
          TableName: tableName,
          Item: updatedBucket
        }));

        return createResponse(200, updatedBucket);

      case 'DELETE':
        // Delete bucket
        if (!bucketId) {
          return createResponse(400, { error: 'Bucket ID is required for deletion' });
        }

        await dynamodb.send(new DeleteCommand({
          TableName: tableName,
          Key: { projectId, bucketId }
        }));

        return createResponse(200, { message: 'Bucket deleted successfully' });

      default:
        return createResponse(405, { error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('❌ Error in application buckets handler:', error);
    return createResponse(500, { 
      error: 'Internal server error',
      message: error.message 
    });
  }
};
