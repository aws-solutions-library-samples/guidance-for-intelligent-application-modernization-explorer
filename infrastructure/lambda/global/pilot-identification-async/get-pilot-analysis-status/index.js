// Force deployment timestamp: 2025-08-06T19:57:00.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:25.3NZ';

/**
 * Get Pilot Analysis Status Lambda Function
 * 
 * This function checks the status of a pilot identification analysis job.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { SFNClient, DescribeExecutionCommand } = require('@aws-sdk/client-sfn');

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
 * Get Step Function execution status
 */
const getExecutionStatus = async (executionArn) => {
  try {
    const command = new DescribeExecutionCommand({
      executionArn
    });
    const execution = await stepfunctions.send(command);
    
    return {
      status: execution.status,
      startDate: execution.startDate,
      stopDate: execution.stopDate,
      input: execution.input ? JSON.parse(execution.input) : null,
      output: execution.output ? JSON.parse(execution.output) : null
    };
  } catch (error) {
    console.error('❌ Error getting execution status:', error);
    return null;
  }
};

/**
 * Calculate progress percentage based on status
 */
const calculateProgress = (status, stepFunctionStatus) => {
  switch (status) {
    case 'INITIATED':
      return 5;
    case 'RUNNING':
      // If we have Step Function status, use more granular progress
      if (stepFunctionStatus) {
        switch (stepFunctionStatus.status) {
          case 'RUNNING':
            return 50; // Assume halfway through
          case 'SUCCEEDED':
            return 100;
          case 'FAILED':
          case 'TIMED_OUT':
          case 'ABORTED':
            return 0;
          default:
            return 25;
        }
      }
      return 50;
    case 'COMPLETED':
      return 100;
    case 'FAILED':
      return 0;
    default:
      return 0;
  }
};

/**
 * Get current processing phase description
 */
const getCurrentPhase = (status, progress) => {
  if (status === 'COMPLETED') {
    return 'Analysis completed successfully';
  } else if (status === 'FAILED') {
    return 'Analysis failed';
  } else if (progress < 25) {
    return 'Initializing analysis...';
  } else if (progress < 50) {
    return 'Querying application data...';
  } else if (progress < 75) {
    return 'Calculating similarity scores...';
  } else if (progress < 100) {
    return 'Scoring pilot candidates...';
  } else {
    return 'Finalizing results...';
  }
};

/**
 * Main Lambda handler
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('📊 Get Pilot Analysis Status - Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
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
    
    // Get table name from environment (normalize project ID to lowercase for table names)
    const normalizedProjectId = projectId.toLowerCase();
    const jobsTableName = process.env.PILOT_JOBS_TABLE || `app-modex-pilot-jobs-${normalizedProjectId}`;
    
    console.log('🔍 Looking up job:', {
      jobId,
      projectId,
      tableName: jobsTableName
    });
    
    // Get job record from DynamoDB
    const result = await dynamodb.send(new GetCommand({
      TableName: jobsTableName,
      Key: { jobId }
    }));
    
    if (!result.Item) {
      return createResponse(404, {
        error: 'Job not found',
        message: `No analysis job found with ID: ${jobId}`
      });
    }
    
    const job = result.Item;
    
    // Verify project ownership
    if (job.projectId !== projectId) {
      return createResponse(403, {
        error: 'Access denied',
        message: 'You do not have access to this analysis job'
      });
    }
    
    console.log('📋 Job found:', {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt
    });
    
    // Get Step Function execution status if available
    let stepFunctionStatus = null;
    if (job.executionArn) {
      stepFunctionStatus = await getExecutionStatus(job.executionArn);
    }
    
    // Calculate current progress
    const progress = job.progress || calculateProgress(job.status, stepFunctionStatus);
    const currentPhase = getCurrentPhase(job.status, progress);
    
    // Estimate completion time
    let estimatedCompletion = null;
    if (job.status === 'RUNNING' && job.createdAt) {
      const startTime = new Date(job.createdAt);
      const now = new Date();
      const elapsed = now - startTime;
      
      if (progress > 0) {
        const totalEstimated = (elapsed / progress) * 100;
        const remaining = totalEstimated - elapsed;
        estimatedCompletion = new Date(now.getTime() + remaining).toISOString();
      }
    }
    
    // Build response
    const response = {
      jobId: job.jobId,
      projectId: job.projectId,
      status: job.status,
      progress,
      currentPhase,
      createdAt: job.createdAt,
      completedAt: job.completedAt || null,
      estimatedCompletion,
      criteria: job.criteria,
      metadata: job.metadata || {}
    };
    
    // Add Step Function details if available
    if (stepFunctionStatus) {
      response.execution = {
        status: stepFunctionStatus.status,
        startDate: stepFunctionStatus.startDate,
        stopDate: stepFunctionStatus.stopDate
      };
    }
    
    // Add error details if failed
    if (job.status === 'FAILED' && job.error) {
      response.error = job.error;
    }
    
    console.log('✅ Returning job status:', {
      jobId: response.jobId,
      status: response.status,
      progress: response.progress
    });
    
    return createResponse(200, response);
    
  } catch (error) {
    console.error('❌ Error getting pilot analysis status:', error);
    
    return createResponse(500, {
      error: 'Internal server error',
      message: 'Failed to get analysis status',
      details: error.message
    });
  }
};
