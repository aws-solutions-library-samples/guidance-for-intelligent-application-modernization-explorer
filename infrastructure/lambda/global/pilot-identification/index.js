/**
 * Pilot Identification Lambda Function
 * 
 * Handles both:
 * - GET: Retrieval of pilot identification results from DynamoDB
 * - POST: Triggering pilot identification analysis step function
 * - DELETE: Clearing pilot identification results from DynamoDB
 * 
 * Enforces least privilege - only accesses the specific DynamoDB tables for the project.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand, UpdateCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { v4: uuidv4 } = require('uuid');

const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const stepfunctions = new SFNClient({});

// Environment variables
const PILOT_STEP_FUNCTION_ARN = process.env.PILOT_STEP_FUNCTION_ARN;

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
  console.log('🚀 Pilot Identification Lambda started');
  console.log('📋 Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const projectId = pathParameters?.projectId;
    
    // Set CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Content-Type': 'application/json'
    };
    
    // Handle OPTIONS requests for CORS preflight
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'CORS preflight successful' })
      };
    }
    
    // Validate projectId
    if (!projectId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'projectId path parameter is required'
        })
      };
    }
    
    let result;
    
    if (httpMethod === 'GET') {
      result = await getPilotIdentificationResults(projectId, queryStringParameters, corsHeaders);
    } else if (httpMethod === 'POST') {
      const requestData = body ? JSON.parse(body) : {};
      result = await triggerPilotIdentificationAnalysis(projectId, requestData, context, corsHeaders);
    } else if (httpMethod === 'DELETE') {
      result = await clearPilotIdentificationResults(projectId, corsHeaders);
    } else {
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: `Method not allowed: ${httpMethod}`
        })
      };
    }
    
    return result;
    
  } catch (error) {
    console.error('💥 Error in pilot identification handler:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      })
    };
  }
};

/**
 * Generate unique process ID
 */
function generateProcessId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `pilot-${timestamp}-${random}`;
}

/**
 * Generate unique job ID
 */
function generateJobId() {
  return `pilot_${Date.now()}_${uuidv4().substring(0, 8)}`;
}

/**
 * Get pilot identification state machine ARN for a project
 */
function getPilotIdentificationStateMachineArn(projectId) {
  if (!PILOT_STEP_FUNCTION_ARN) {
    throw new Error('PILOT_STEP_FUNCTION_ARN environment variable is not set');
  }
  return PILOT_STEP_FUNCTION_ARN.replace('{projectId}', projectId);
}

/**
 * Estimate processing time based on application count
 */
function estimateProcessingTime(applicationCount) {
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
}

/**
 * Trigger pilot identification analysis
 */
async function triggerPilotIdentificationAnalysis(projectId, criteria, context, corsHeaders) {
  try {
    console.log(`🔄 Starting pilot identification analysis for project: ${projectId}`);
    console.log(`📋 Analysis criteria:`, criteria);
    
    // Validate required criteria
    if (!criteria.drivers || !Array.isArray(criteria.drivers) || criteria.drivers.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Business drivers are required',
          message: 'Please provide at least one business driver'
        })
      };
    }
    
    // Generate unique IDs
    const jobId = generateJobId();
    const processId = generateProcessId();
    const processTimestamp = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days TTL
    
    // Normalize project ID for table names
    const normalizedProjectId = projectId.toLowerCase();
    const jobsTableName = `app-modex-pilot-jobs-${normalizedProjectId}`;
    const resultsTableName = `app-modex-pilot-results-${normalizedProjectId}`;
    const processTableName = `app-modex-process-${normalizedProjectId}`;
    
    console.log('📝 Creating job and process records:', {
      jobId,
      processId,
      projectId,
      jobsTableName,
      resultsTableName,
      processTableName
    });
    
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
    
    // Create job record in DynamoDB
    const jobRecord = {
      jobId,
      projectId,
      status: 'INITIATED',
      progress: 0,
      createdAt: processTimestamp,
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
    
    // Create process tracking record
    const processRecord = {
      processId,
      projectId,
      processType: 'PILOT_IDENTIFICATION',
      processName: 'Pilot Identification Analysis',
      status: 'INITIATED',
      startTime: processTimestamp,
      endTime: null,
      description: 'Pilot identification analysis using Step Functions',
      criteria: criteria,
      jobId: jobId,
      createdAt: processTimestamp,
      updatedAt: processTimestamp
    };
    
    await dynamodb.send(new PutCommand({
      TableName: processTableName,
      Item: processRecord
    }));
    
    console.log('✅ Process tracking record created successfully');
    
    // Get the pilot identification state machine ARN
    const pilotStateMachineArn = getPilotIdentificationStateMachineArn(projectId);
    
    // Prepare Step Function input
    const stepFunctionInput = {
      jobId,
      processId,
      projectId,
      criteria,
      jobsTableName,
      resultsTableName,
      processTableName,
      triggeredBy: 'pilot-identification-lambda',
      processTimestamp: processTimestamp,
      timestamp: processTimestamp
    };
    
    console.log('🔄 Starting Pilot Identification Step Function execution with input:', stepFunctionInput);
    console.log('🎯 Step Function ARN:', pilotStateMachineArn);
    
    // Start Pilot Identification Step Function execution
    const executionResult = await stepfunctions.send(new StartExecutionCommand({
      stateMachineArn: pilotStateMachineArn,
      name: `pilot-analysis-${processId}`,
      input: JSON.stringify(stepFunctionInput)
    }));
    
    console.log('✅ Pilot Identification Step Function execution started:', executionResult.executionArn);
    
    // Update job record with execution ARN
    await dynamodb.send(new UpdateCommand({
      TableName: jobsTableName,
      Key: { 
        jobId
      },
      UpdateExpression: 'SET executionArn = :executionArn, #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':executionArn': executionResult.executionArn,
        ':status': 'RUNNING'
      }
    }));
    
    // Estimate processing time
    const estimatedTime = estimateProcessingTime(criteria.estimatedApplications || 1000);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        jobId,
        processId,
        executionArn: executionResult.executionArn,
        status: 'INITIATED',
        message: 'Pilot identification analysis started successfully',
        estimatedTime,
        analysisType: 'pilot-identification'
      })
    };
    
  } catch (error) {
    console.error('💥 Error triggering pilot identification analysis:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      })
    };
  }
}

/**
 * Get pilot identification results from DynamoDB
 */
async function getPilotIdentificationResults(projectId, queryParams, corsHeaders) {
  try {
    const normalizedProjectId = projectId.toLowerCase();
    const jobsTableName = `app-modex-pilot-jobs-${normalizedProjectId}`;
    const resultsTableName = `app-modex-pilot-results-${normalizedProjectId}`;
    
    console.log(`📊 Querying DynamoDB tables for project: ${projectId}`);
    console.log(`   Jobs table: ${jobsTableName}`);
    console.log(`   Results table: ${resultsTableName}`);
    
    // Find the most recent completed job for this project
    try {
      const jobsResult = await dynamodb.send(new QueryCommand({
        TableName: jobsTableName,
        IndexName: 'ProjectStatusIndex',
        KeyConditionExpression: 'projectId = :projectId AND #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':projectId': projectId,
          ':status': 'COMPLETED'
        },
        ScanIndexForward: false, // Sort descending (most recent first)
        Limit: 1
      }));
      
      if (!jobsResult.Items || jobsResult.Items.length === 0) {
        console.log('📭 No completed pilot identification analysis found - returning null');
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            results: null
          })
        };
      }
      
      const latestJob = jobsResult.Items[0];
      console.log('✅ Found latest completed job:', latestJob.jobId);
      
      // Parse query parameters for pagination and filtering
      const limit = parseInt(queryParams?.limit) || 50;
      const offset = parseInt(queryParams?.offset) || 0;
      const minScore = parseFloat(queryParams?.minScore) || 0;
      
      // Get results for this job
      const resultsQuery = await dynamodb.send(new QueryCommand({
        TableName: resultsTableName,
        KeyConditionExpression: 'jobId = :jobId',
        ExpressionAttributeValues: {
          ':jobId': latestJob.jobId
        },
        ScanIndexForward: true // Sort by candidateId ascending
      }));
      
      const allResults = resultsQuery.Items || [];
      
      console.log(`✅ Retrieved ${allResults.length} results from DynamoDB`);
      
      // Separate results by type (RULE_BASED, AI_ENHANCED, CONSOLIDATED)
      const ruleBasedResults = allResults.filter(r => r.resultType === 'RULE_BASED');
      const aiEnhancedResults = allResults.filter(r => r.resultType === 'AI_ENHANCED');
      const consolidatedResults = allResults.filter(r => r.resultType === 'CONSOLIDATED');
      
      console.log(`📊 Results breakdown: Rule-Based=${ruleBasedResults.length}, AI-Enhanced=${aiEnhancedResults.length}, Consolidated=${consolidatedResults.length}`);
      
      // Build summary statistics from consolidated results
      let summary = null;
      if (consolidatedResults.length > 0) {
        const scores = consolidatedResults.map(c => c.score || c.consolidatedScore || 0);
        summary = {
          averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
          maxScore: Math.max(...scores),
          minScore: Math.min(...scores),
          candidatesAbove80: consolidatedResults.filter(c => (c.score || c.consolidatedScore || 0) >= 80).length,
          candidatesAbove70: consolidatedResults.filter(c => (c.score || c.consolidatedScore || 0) >= 70).length
        };
      }
      
      const response = {
        jobId: latestJob.jobId,
        projectId: latestJob.projectId,
        status: latestJob.status,
        completedAt: latestJob.completedAt,
        criteria: latestJob.criteria,
        metadata: {
          ...latestJob.metadata,
          totalResults: allResults.length,
          ruleBasedCount: ruleBasedResults.length,
          aiEnhancedCount: aiEnhancedResults.length,
          consolidatedCount: consolidatedResults.length
        },
        // Return results in the format expected by frontend
        ruleBased: ruleBasedResults,
        aiEnhanced: aiEnhancedResults,
        consolidated: consolidatedResults,
        // Legacy format for backward compatibility
        candidates: consolidatedResults,
        summary
      };
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          results: response
        })
      };
      
    } catch (queryError) {
      if (queryError.name === 'ResourceNotFoundException') {
        console.log('📭 Pilot identification tables not found - returning null');
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            results: null
          })
        };
      }
      throw queryError;
    }
    
  } catch (error) {
    console.error('Error querying DynamoDB:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to retrieve pilot identification results'
      })
    };
  }
}

/**
 * Clear pilot identification results from DynamoDB
 */
async function clearPilotIdentificationResults(projectId, corsHeaders) {
  try {
    const normalizedProjectId = projectId.toLowerCase();
    const jobsTableName = `app-modex-pilot-jobs-${normalizedProjectId}`;
    const resultsTableName = `app-modex-pilot-results-${normalizedProjectId}`;
    
    console.log(`🗑️ Clearing pilot identification results for project: ${projectId}`);
    console.log(`   Jobs table: ${jobsTableName}`);
    console.log(`   Results table: ${resultsTableName}`);
    
    let deletedJobs = 0;
    let deletedResults = 0;
    
    // Delete all records from results table
    try {
      console.log(`📊 Scanning results table: ${resultsTableName}`);
      const resultsRecords = await dynamodb.send(new ScanCommand({
        TableName: resultsTableName,
        ProjectionExpression: 'jobId, candidateId'
      }));
      
      if (resultsRecords.Items && resultsRecords.Items.length > 0) {
        console.log(`🔄 Found ${resultsRecords.Items.length} result records to delete`);
        
        // Delete in batches of 25 (DynamoDB limit)
        for (let i = 0; i < resultsRecords.Items.length; i += 25) {
          const batch = resultsRecords.Items.slice(i, i + 25);
          
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
          
          deletedResults += deleteRequests.length;
          console.log(`   ✅ Deleted batch ${Math.floor(i / 25) + 1}: ${deleteRequests.length} records`);
        }
      } else {
        console.log(`📭 No result records found to delete`);
      }
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`⚠️ Results table not found: ${resultsTableName}`);
      } else {
        throw error;
      }
    }
    
    // Delete all records from jobs table
    try {
      console.log(`📊 Scanning jobs table: ${jobsTableName}`);
      const jobRecords = await dynamodb.send(new ScanCommand({
        TableName: jobsTableName,
        ProjectionExpression: 'jobId'
      }));
      
      if (jobRecords.Items && jobRecords.Items.length > 0) {
        console.log(`🔄 Found ${jobRecords.Items.length} job records to delete`);
        
        // Delete in batches of 25 (DynamoDB limit)
        for (let i = 0; i < jobRecords.Items.length; i += 25) {
          const batch = jobRecords.Items.slice(i, i + 25);
          
          const deleteRequests = batch.map(item => ({
            DeleteRequest: {
              Key: {
                jobId: item.jobId
              }
            }
          }));
          
          await dynamodb.send(new BatchWriteCommand({
            RequestItems: {
              [jobsTableName]: deleteRequests
            }
          }));
          
          deletedJobs += deleteRequests.length;
          console.log(`   ✅ Deleted batch ${Math.floor(i / 25) + 1}: ${deleteRequests.length} records`);
        }
      } else {
        console.log(`📭 No job records found to delete`);
      }
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`⚠️ Jobs table not found: ${jobsTableName}`);
      } else {
        throw error;
      }
    }
    
    console.log(`✅ Successfully cleared pilot identification results`);
    console.log(`   📊 Deleted ${deletedJobs} job records`);
    console.log(`   📊 Deleted ${deletedResults} result records`);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Pilot identification results cleared successfully',
        deletedJobs,
        deletedResults,
        projectId
      })
    };
    
  } catch (error) {
    console.error('💥 Error clearing pilot identification results:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to clear pilot identification results'
      })
    };
  }
}

/**
 * Sanitize event for logging (remove sensitive data)
 */
function sanitizeEvent(event) {
  const sanitized = { ...event };
  if (sanitized.headers) {
    sanitized.headers = { ...sanitized.headers };
    if (sanitized.headers.Authorization) {
      sanitized.headers.Authorization = '***REDACTED***';
    }
  }
  return sanitized;
}
