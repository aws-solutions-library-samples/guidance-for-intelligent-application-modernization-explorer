// Force deployment timestamp: 2025-08-06T19:56:56.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:17.3NZ';

/**
 * Initiate Pilot Analysis Lambda Function
 * 
 * This function starts an asynchronous pilot identification analysis job.
 * It creates a job record and triggers background processing.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { CloudFormationClient, ListExportsCommand } = require('@aws-sdk/client-cloudformation');
const { v4: uuidv4 } = require('uuid');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const stepfunctions = new SFNClient({ region: process.env.AWS_REGION });
const cloudformation = new CloudFormationClient({ region: process.env.AWS_REGION });

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
  
  // Try to get from request body
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      if (body.projectId) {
        return body.projectId;
      }
    } catch (e) {
      // Ignore parsing errors
    }
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
 * Get Step Function ARN from CloudFormation exports
 */
const getStepFunctionArn = async (projectId) => {
  try {
    const exportName = `App-ModEx-PilotStateMachine-${projectId}`;
    
    const command = new ListExportsCommand({});
    const result = await cloudformation.send(command);
    const exportItem = result.Exports.find(exp => exp.Name === exportName);
    
    if (!exportItem) {
      console.warn(`⚠️ Step Function export not found: ${exportName}`);
      return null;
    }
    
    console.log('✅ Found Step Function ARN:', exportItem.Value);
    return exportItem.Value;
  } catch (error) {
    console.error('❌ Error getting Step Function ARN:', error);
    return null;
  }
};
const estimateProcessingTime = (applicationCount) => {
  // Base time: 30 seconds for setup
  // Additional time: 0.1 seconds per application
  const estimatedSeconds = 30 + (applicationCount * 0.1);
  
  if (estimatedSeconds < 60) {
    return `${Math.ceil(estimatedSeconds)} seconds`;
  } else if (estimatedSeconds < 3600) {
    return `${Math.ceil(estimatedSeconds / 60)} minutes`;
  } else {
    return `${Math.ceil(estimatedSeconds / 3600)} hours`;
  }
};

/**
 * Main Lambda handler
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('🚀 Initiate Pilot Analysis - Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
    // Extract project ID
    const projectId = getProjectIdFromEvent(event);
    if (!projectId) {
      return createResponse(400, {
        error: 'Project ID is required',
        message: 'Please provide a valid project ID'
      });
    }
    
    // Parse request body
    let criteria;
    try {
      criteria = JSON.parse(event.body || '{}');
    } catch (e) {
      return createResponse(400, {
        error: 'Invalid request body',
        message: 'Request body must be valid JSON'
      });
    }
    
    // Validate required criteria
    if (!criteria.drivers || !Array.isArray(criteria.drivers) || criteria.drivers.length === 0) {
      return createResponse(400, {
        error: 'Business drivers are required',
        message: 'Please provide at least one business driver'
      });
    }
    
    // Generate unique job ID and process ID
    const jobId = `pilot_${Date.now()}_${uuidv4().substring(0, 8)}`;
    const processId = `pilot-analysis-${Date.now()}-${uuidv4().substring(0, 8)}`;
    const timestamp = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days TTL
    
    // Get table names from environment (normalize project ID to lowercase for table names)
    const normalizedProjectId = projectId.toLowerCase();
    const jobsTableName = process.env.PILOT_JOBS_TABLE || `app-modex-pilot-jobs-${normalizedProjectId}`;
    const processTableName = `app-modex-process-${normalizedProjectId}`;
    
    console.log('📝 Creating job and process records:', {
      jobId,
      processId,
      projectId,
      normalizedProjectId,
      jobsTableName,
      processTableName,
      criteria: Object.keys(criteria)
    });
    
    // Create job record in DynamoDB (for backward compatibility)
    const jobRecord = {
      jobId,
      projectId,
      status: 'INITIATED',
      progress: 0,
      createdAt: timestamp,
      criteria,
      ttl,
      metadata: {
        estimatedApplications: criteria.estimatedApplications || 'unknown',
        maxCandidates: criteria.maxCandidates || 10
      }
    };
    
    await dynamodb.send(new PutCommand({
      TableName: jobsTableName,
      Item: jobRecord
    }));
    
    console.log('✅ Job record created successfully');
    
    // Create process tracking record in unified process tracking table
    const processRecord = {
      processId,
      projectId,
      processType: 'PILOT_IDENTIFICATION',
      processName: 'Pilot Identification Analysis',
      status: 'INITIATED',
      startTime: timestamp,
      endTime: null,
      description: 'Pilot identification analysis using Step Functions',
      criteria: criteria,
      jobId: jobId, // Link to job record
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    await dynamodb.send(new PutCommand({
      TableName: processTableName,
      Item: processRecord
    }));
    
    console.log('✅ Process tracking record created successfully');
    
    // Get Step Function ARN from CloudFormation exports (use original case for export name)
    const stepFunctionArn = await getStepFunctionArn(projectId);
    
    if (stepFunctionArn) {
      console.log('🔄 Starting Step Function execution...');
      
      const resultsTableName = process.env.PILOT_RESULTS_TABLE || `app-modex-pilot-results-${normalizedProjectId}`;
      
      // Clear old results before starting new analysis
      console.log('🗑️ Clearing old pilot identification results...');
      try {
        const scanResult = await dynamodb.send(new ScanCommand({
          TableName: resultsTableName,
          ProjectionExpression: 'jobId, candidateId'
        }));
        
        if (scanResult.Items && scanResult.Items.length > 0) {
          console.log(`🗑️ Found ${scanResult.Items.length} old results to delete`);
          
          // Delete in batches of 25 (DynamoDB limit)
          const batchSize = 25;
          for (let i = 0; i < scanResult.Items.length; i += batchSize) {
            const batch = scanResult.Items.slice(i, i + batchSize);
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
          }
          
          console.log('✅ Old results cleared successfully');
        } else {
          console.log('📝 No old results to clear');
        }
      } catch (clearError) {
        console.warn('⚠️ Error clearing old results (continuing anyway):', clearError.message);
      }
      
      const executionInput = {
        jobId,
        processId,
        projectId,
        criteria,
        jobsTableName,
        resultsTableName,
        processTableName
      };
      
      const execution = await stepfunctions.send(new StartExecutionCommand({
        stateMachineArn: stepFunctionArn,
        name: `pilot-analysis-${processId}`,
        input: JSON.stringify(executionInput)
      }));
      
      console.log('✅ Step Function execution started:', execution.executionArn);
      
      // Update job record with execution ARN
      await dynamodb.send(new UpdateCommand({
        TableName: jobsTableName,
        Key: { jobId },
        UpdateExpression: 'SET executionArn = :arn, #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':arn': execution.executionArn,
          ':status': 'RUNNING'
        }
      }));
      
    } else {
      console.log('⚠️ No Step Function ARN configured, job will remain in INITIATED status');
    }
    
    // Estimate processing time
    const estimatedTime = estimateProcessingTime(criteria.estimatedApplications || 1000);
    
    // Return immediate response
    return createResponse(200, {
      jobId,
      processId,
      status: 'INITIATED',
      message: 'Pilot identification analysis started successfully',
      estimatedTime,
      pollUrl: `/step-functions/pilot-identification/analysis/${jobId}/status`,
      resultsUrl: `/step-functions/pilot-identification/analysis/${jobId}/results`
    });
    
  } catch (error) {
    console.error('❌ Error initiating pilot analysis:', error);
    
    return createResponse(500, {
      error: 'Internal server error',
      message: 'Failed to initiate pilot analysis',
      details: error.message
    });
  }
};
