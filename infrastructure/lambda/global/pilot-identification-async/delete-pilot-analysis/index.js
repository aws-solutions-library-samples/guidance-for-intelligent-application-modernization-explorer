// Force deployment timestamp: 2025-08-06T19:57:03.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:32.3NZ';

/**
 * Delete Pilot Analysis Lambda Function
 * 
 * This function deletes a pilot identification analysis job and its results.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { SFNClient, StopExecutionCommand } = require('@aws-sdk/client-sfn');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const stepfunctions = new SFNClient({ region: process.env.AWS_REGION });

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
 * Stop Step Function execution if running
 */
const stopExecution = async (executionArn) => {
  try {
    await stepfunctions.send(new StopExecutionCommand({
      executionArn,
      cause: 'User requested deletion of analysis job'
    }));
    
    console.log('✅ Step Function execution stopped:', executionArn);
    return true;
  } catch (error) {
    console.error('❌ Error stopping execution:', error);
    return false;
  }
};

/**
 * Delete all results for a job
 */
const deleteResults = async (jobId, resultsTableName) => {
  try {
    // Query all results for this job
    const queryResult = await dynamodb.send(new QueryCommand({
      TableName: resultsTableName,
      KeyConditionExpression: 'jobId = :jobId',
      ExpressionAttributeValues: {
        ':jobId': jobId
      },
      ProjectionExpression: 'jobId, candidateId'
    }));
    
    const items = queryResult.Items || [];
    
    if (items.length === 0) {
      console.log('📝 No results to delete for job:', jobId);
      return 0;
    }
    
    console.log(`🗑️ Deleting ${items.length} result records...`);
    
    // Delete in batches of 25 (DynamoDB limit)
    const batchSize = 25;
    let deletedCount = 0;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      const deleteRequests = batch.map(item => ({
        DeleteRequest: {
          Key: {
            jobId: item.jobId,
            candidateId: item.candidateId
          }
        }
      }));
      
      await dynamodb.send(new BatchWriteCommand({
        RequestItems: {
          [resultsTableName]: deleteRequests
        }
      }));
      
      deletedCount += batch.length;
    }
    
    console.log(`✅ Deleted ${deletedCount} result records`);
    return deletedCount;
    
  } catch (error) {
    console.error('❌ Error deleting results:', error);
    throw error;
  }
};

/**
 * Main Lambda handler
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('🗑️ Delete Pilot Analysis - Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
    // Extract job ID from path parameters
    const jobId = event.pathParameters?.jobId;
    if (!jobId) {
      return createResponse(400, {
        error: 'Job ID is required',
        message: 'Please provide a valid job ID in the URL path'
      });
    }
    
    // Extract project ID
    const projectId = getProjectIdFromEvent(event);
    if (!projectId) {
      return createResponse(400, {
        error: 'Project ID is required',
        message: 'Please provide a valid project ID'
      });
    }
    
    // Get table names from environment (normalize project ID to lowercase for table names)
    const normalizedProjectId = projectId.toLowerCase();
    const jobsTableName = process.env.PILOT_JOBS_TABLE || `app-modex-pilot-jobs-${normalizedProjectId}`;
    const resultsTableName = process.env.PILOT_RESULTS_TABLE || `app-modex-pilot-results-${normalizedProjectId}`;
    
    console.log('🔍 Looking up job to delete:', {
      jobId,
      projectId,
      jobsTable: jobsTableName,
      resultsTable: resultsTableName
    });
    
    // Get job record from DynamoDB
    const jobResult = await dynamodb.send(new GetCommand({
      TableName: jobsTableName,
      Key: { jobId }
    }));
    
    if (!jobResult.Item) {
      return createResponse(404, {
        error: 'Job not found',
        message: `No analysis job found with ID: ${jobId}`
      });
    }
    
    const job = jobResult.Item;
    
    // Verify project ownership
    if (job.projectId !== projectId) {
      return createResponse(403, {
        error: 'Access denied',
        message: 'You do not have access to this analysis job'
      });
    }
    
    console.log('📋 Job found, proceeding with deletion:', {
      jobId: job.jobId,
      status: job.status,
      hasExecution: !!job.executionArn
    });
    
    let stoppedExecution = false;
    let deletedResults = 0;
    
    // Stop Step Function execution if running
    if (job.executionArn && (job.status === 'RUNNING' || job.status === 'INITIATED')) {
      stoppedExecution = await stopExecution(job.executionArn);
    }
    
    // Delete all results
    try {
      deletedResults = await deleteResults(jobId, resultsTableName);
    } catch (error) {
      console.error('❌ Error deleting results, continuing with job deletion:', error);
    }
    
    // Delete job record
    await dynamodb.send(new DeleteCommand({
      TableName: jobsTableName,
      Key: { jobId }
    }));
    
    console.log('✅ Job record deleted successfully');
    
    // Build response
    const response = {
      jobId,
      message: 'Analysis job deleted successfully',
      details: {
        stoppedExecution,
        deletedResults,
        previousStatus: job.status
      }
    };
    
    console.log('✅ Deletion completed:', response.details);
    
    return createResponse(200, response);
    
  } catch (error) {
    console.error('❌ Error deleting pilot analysis:', error);
    
    return createResponse(500, {
      error: 'Internal server error',
      message: 'Failed to delete analysis job',
      details: error.message
    });
  }
};
