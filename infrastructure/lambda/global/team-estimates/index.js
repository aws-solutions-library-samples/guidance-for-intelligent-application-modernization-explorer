// Force deployment timestamp: 2025-10-29T14:00:00.0NZ
const DEPLOYMENT_TIMESTAMP = '2025-10-29T14:00:00.0NZ';

/**
 * Team Estimates Lambda Function
 * 
 * Handles CRUD operations for Team estimates
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const createResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-project-id,X-Amz-User-Agent',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'false'
  },
  body: JSON.stringify(body)
});

const getProjectIdFromEvent = (event) => {
  return event.pathParameters?.projectId;
};

const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('🔍 Team Estimates - Event:', JSON.stringify(sanitizeEvent(event), null, 2));

  try {
    const projectId = getProjectIdFromEvent(event);
    const method = event.httpMethod;
    const pathParameters = event.pathParameters || {};
    const teamEstimateId = pathParameters.teamEstimateId;

    if (!projectId) {
      return createResponse(400, { error: 'Project ID is required' });
    }

    const tableName = `app-modex-team-estimates-${projectId}`.toLowerCase();

    switch (method) {
      case 'OPTIONS':
        // Handle preflight requests
        console.log('🔄 Handling CORS preflight request');
        return createResponse(200, { message: 'CORS preflight successful' });

      case 'GET':
        if (teamEstimateId) {
          // Get specific team estimate
          try {
            const result = await dynamodb.send(new GetCommand({
              TableName: tableName,
              Key: { projectId, teamEstimateId }
            }));
            
            if (!result.Item) {
              return createResponse(404, { error: 'Team estimate not found' });
            }
            
            return createResponse(200, result.Item);
          } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
              return createResponse(404, { error: 'Team estimate not found' });
            }
            throw error;
          }
        } else {
          // Get all team estimates for project
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
        // Create new team estimate
        const teamData = JSON.parse(event.body);
        const newTeamEstimateId = `team-${Date.now()}`;
        
        const newTeamEstimate = {
          projectId,
          teamEstimateId: newTeamEstimateId,
          id: newTeamEstimateId, // For compatibility with frontend
          bucketId: teamData.bucketId,
          bucketName: teamData.bucketName,
          pilotApplicationId: teamData.pilotApplicationId,
          pilotApplicationName: teamData.pilotApplicationName,
          complexitySize: teamData.complexitySize,
          periodType: teamData.periodType,
          periodValue: teamData.periodValue,
          resources: teamData.resources,
          skills: teamData.skills || [],
          applicationResources: teamData.applicationResources || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        try {
          await dynamodb.send(new PutCommand({
            TableName: tableName,
            Item: newTeamEstimate
          }));

          return createResponse(201, newTeamEstimate);
        } catch (error) {
          if (error.name === 'ResourceNotFoundException') {
            // Table doesn't exist, DynamoDB will create it automatically on retry
            // This is expected for the first item in a new project
            await dynamodb.send(new PutCommand({
              TableName: tableName,
              Item: newTeamEstimate
            }));
            return createResponse(201, newTeamEstimate);
          }
          throw error;
        }

      case 'PUT':
        // Update existing team estimate
        if (!teamEstimateId) {
          return createResponse(400, { error: 'Team estimate ID is required for updates' });
        }

        const updateData = JSON.parse(event.body);
        
        // Get existing item first to preserve fields not being updated
        let existingItem = {};
        try {
          const existingResult = await dynamodb.send(new GetCommand({
            TableName: tableName,
            Key: { projectId, teamEstimateId }
          }));
          existingItem = existingResult.Item || {};
        } catch (error) {
          if (error.name !== 'ResourceNotFoundException') {
            throw error;
          }
        }

        const updatedTeamEstimate = {
          ...existingItem,
          projectId,
          teamEstimateId,
          id: teamEstimateId, // For compatibility with frontend
          bucketId: updateData.bucketId || existingItem.bucketId,
          bucketName: updateData.bucketName || existingItem.bucketName,
          pilotApplicationId: updateData.pilotApplicationId || existingItem.pilotApplicationId,
          pilotApplicationName: updateData.pilotApplicationName || existingItem.pilotApplicationName,
          complexitySize: updateData.complexitySize || existingItem.complexitySize,
          periodType: updateData.periodType || existingItem.periodType,
          periodValue: updateData.periodValue || existingItem.periodValue,
          resources: updateData.resources || existingItem.resources,
          skills: updateData.skills || existingItem.skills || [],
          applicationResources: updateData.applicationResources || existingItem.applicationResources || {},
          updatedAt: new Date().toISOString()
        };

        await dynamodb.send(new PutCommand({
          TableName: tableName,
          Item: updatedTeamEstimate
        }));

        return createResponse(200, updatedTeamEstimate);

      case 'DELETE':
        // Delete team estimate
        if (!teamEstimateId) {
          return createResponse(400, { error: 'Team estimate ID is required for deletion' });
        }

        try {
          await dynamodb.send(new DeleteCommand({
            TableName: tableName,
            Key: { projectId, teamEstimateId }
          }));

          return createResponse(200, { message: 'Team estimate deleted successfully' });
        } catch (error) {
          if (error.name === 'ResourceNotFoundException') {
            return createResponse(404, { error: 'Team estimate not found' });
          }
          throw error;
        }

      default:
        return createResponse(405, { error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('❌ Error in team estimates handler:', error);
    return createResponse(500, { 
      error: 'Internal server error',
      message: error.message 
    });
  }
};