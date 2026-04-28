// Force deployment timestamp: 2025-10-27T12:49:01.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:48.3NZ';

/**
 * TCO Estimates Lambda Function
 * 
 * Handles CRUD operations for TCO estimates
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

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
  console.log('🔍 TCO Estimates - Event:', JSON.stringify(sanitizeEvent(event), null, 2));

  try {
    const projectId = getProjectIdFromEvent(event);
    const method = event.httpMethod;
    const pathParameters = event.pathParameters || {};
    const tcoId = pathParameters.tcoId;

    if (!projectId) {
      return createResponse(400, { error: 'Project ID is required' });
    }

    const tableName = `app-modex-tco-estimates-${projectId}`.toLowerCase();

    switch (method) {
      case 'OPTIONS':
        // Handle preflight requests
        return createResponse(200, {});

      case 'GET':
        if (tcoId) {
          // Get specific TCO estimate
          try {
            const result = await dynamodb.send(new GetCommand({
              TableName: tableName,
              Key: { projectId, tcoId }
            }));
            
            if (!result.Item) {
              return createResponse(404, { error: 'TCO estimate not found' });
            }
            
            return createResponse(200, result.Item);
          } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
              return createResponse(404, { error: 'TCO estimate not found' });
            }
            throw error;
          }
        } else {
          // Get all TCO estimates for project
          try {
            const result = await dynamodb.send(new QueryCommand({
              TableName: tableName,
              KeyConditionExpression: 'projectId = :projectId',
              ExpressionAttributeValues: { ':projectId': projectId }
            }));
            
            return createResponse(200, result.Items || []);
          } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
              // Table doesn't exist yet, return empty array
              return createResponse(200, []);
            }
            throw error;
          }
        }

      case 'POST':
        // Create new TCO estimate
        const tcoData = JSON.parse(event.body);
        const newTcoId = `tco-${Date.now()}`;
        
        const newTCO = {
          projectId,
          tcoId: newTcoId,
          bucketId: tcoData.bucketId,
          bucketName: tcoData.bucketName,
          pilotApplicationId: tcoData.pilotApplicationId,
          pilotApplicationName: tcoData.pilotApplicationName,
          utilizationSize: tcoData.utilizationSize,
          periodType: tcoData.periodType,
          periodValue: tcoData.periodValue,
          totalCost: tcoData.totalCost,
          applicationCosts: tcoData.applicationCosts,
          costs: tcoData.costs,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        try {
          await dynamodb.send(new PutCommand({
            TableName: tableName,
            Item: newTCO
          }));

          return createResponse(201, newTCO);
        } catch (error) {
          if (error.name === 'ResourceNotFoundException') {
            // Table doesn't exist, DynamoDB will create it automatically on retry
            // This is expected for the first item in a new project
            await dynamodb.send(new PutCommand({
              TableName: tableName,
              Item: newTCO
            }));
            return createResponse(201, newTCO);
          }
          throw error;
        }

      case 'PUT':
        // Update existing TCO estimate
        if (!tcoId) {
          return createResponse(400, { error: 'TCO ID is required for updates' });
        }

        const updateData = JSON.parse(event.body);
        const updatedTCO = {
          projectId,
          tcoId,
          ...updateData,
          updatedAt: new Date().toISOString()
        };

        await dynamodb.send(new PutCommand({
          TableName: tableName,
          Item: updatedTCO
        }));

        return createResponse(200, updatedTCO);

      case 'DELETE':
        // Delete TCO estimate
        if (!tcoId) {
          return createResponse(400, { error: 'TCO ID is required for deletion' });
        }

        await dynamodb.send(new DeleteCommand({
          TableName: tableName,
          Key: { projectId, tcoId }
        }));

        return createResponse(200, { message: 'TCO estimate deleted successfully' });

      default:
        return createResponse(405, { error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('❌ Error in TCO estimates handler:', error);
    return createResponse(500, { 
      error: 'Internal server error',
      message: error.message 
    });
  }
};
