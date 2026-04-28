// Force deployment timestamp: 2025-08-06T19:57:01.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:28.3NZ';

/**
 * Get Pilot Analysis Results Lambda Function
 * 
 * This function retrieves the results of a completed pilot identification analysis.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

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
  console.log('📊 Get Pilot Analysis Results - Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
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
    
    // Check if this is a latest-results request (no jobId in path)
    const jobId = event.pathParameters?.jobId;
    
    if (!jobId) {
      // This is a latest-results request - find the most recent completed job
      console.log('🔍 Looking up latest completed analysis for project:', projectId);
      
      try {
        // Query jobs table to find the most recent completed job for this project
        const jobsResult = await dynamodb.send(new QueryCommand({
          TableName: jobsTableName,
          IndexName: 'ProjectStatusIndex', // GSI we created in buildspec.yml
          KeyConditionExpression: 'projectId = :projectId AND #status = :status',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':projectId': projectId,
            ':status': 'COMPLETED'
          },
          ScanIndexForward: false, // Sort by sort key descending (most recent first)
          Limit: 1
        }));
        
        if (!jobsResult.Items || jobsResult.Items.length === 0) {
          return createResponse(404, {
            error: 'No completed analysis found',
            message: 'No completed pilot analysis found for this project'
          });
        }
        
        const latestJob = jobsResult.Items[0];
        console.log('✅ Found latest completed job:', latestJob.jobId);
        
        // Now get the results for this job
        return await getResultsForJob(latestJob.jobId, projectId, resultsTableName, latestJob, event);
        
      } catch (queryError) {
        console.error('❌ Error querying for latest job:', queryError);
        return createResponse(500, {
          error: 'Database query failed',
          message: 'Failed to find latest analysis results'
        });
      }
    } else {
      // This is a specific jobId request - use existing logic
      console.log('🔍 Looking up specific job:', jobId);
      
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
      
      return await getResultsForJob(jobId, projectId, resultsTableName, jobResult.Item, event);
    }
    
  } catch (error) {
    console.error('❌ Error getting analysis results:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message
    });
  }
};

/**
 * Get results for a specific job
 */
const getResultsForJob = async (jobId, projectId, resultsTableName, jobRecord, event) => {
  console.log('📊 Getting results for job:', jobId);
  
  // Verify job belongs to the project
  if (jobRecord.projectId !== projectId) {
    return createResponse(403, {
      error: 'Access denied',
      message: 'Job does not belong to the specified project'
    });
  }
  
  // Check job status
  if (jobRecord.status !== 'COMPLETED') {
    return createResponse(400, {
      error: 'Job not completed',
      message: `Analysis job is in status: ${jobRecord.status}. Results are only available for completed jobs.`,
      status: jobRecord.status,
      jobId: jobId
    });
  }
  
  console.log('📋 Job completed, fetching results...');
  
  // Get results from DynamoDB
  const resultsQuery = await dynamodb.send(new QueryCommand({
    TableName: resultsTableName,
    KeyConditionExpression: 'jobId = :jobId',
    ExpressionAttributeValues: {
      ':jobId': jobId
    },
    ScanIndexForward: true // Sort by candidateId ascending
  }));
  
  const candidates = resultsQuery.Items || [];
  
  console.log('✅ Retrieved results:', {
    jobId,
    candidateCount: candidates.length
  });
  
  // Parse query parameters for pagination and filtering
  const queryParams = event.queryStringParameters || {};
  const limit = parseInt(queryParams.limit) || 50;
  const offset = parseInt(queryParams.offset) || 0;
  const minScore = parseFloat(queryParams.minScore) || 0;
  
  // Filter candidates by minimum score if specified
  let filteredCandidates = candidates;
  if (minScore > 0) {
    filteredCandidates = candidates.filter(candidate => 
      (candidate.finalScore || 0) >= minScore
    );
  }
  
  // Apply pagination
  const paginatedCandidates = filteredCandidates.slice(offset, offset + limit);
  
  // Build response
  const response = {
    jobId: jobRecord.jobId,
    projectId: jobRecord.projectId,
    status: jobRecord.status,
    completedAt: jobRecord.completedAt,
    criteria: jobRecord.criteria,
    metadata: {
      ...jobRecord.metadata,
      totalCandidates: candidates.length,
      filteredCandidates: filteredCandidates.length,
      returnedCandidates: paginatedCandidates.length
    },
    candidates: paginatedCandidates,
    pagination: {
      limit,
      offset,
      total: filteredCandidates.length,
      hasMore: (offset + limit) < filteredCandidates.length
    }
  };
  
  // Add summary statistics
  if (candidates.length > 0) {
    const scores = candidates.map(c => c.finalScore || 0);
    response.summary = {
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      candidatesAbove80: candidates.filter(c => (c.finalScore || 0) >= 80).length,
      candidatesAbove70: candidates.filter(c => (c.finalScore || 0) >= 70).length
    };
  }
  
  console.log('✅ Returning analysis results:', {
    jobId: response.jobId,
    candidateCount: response.candidates.length,
    totalCandidates: response.metadata.totalCandidates
  });
  
  return createResponse(200, response);
};
