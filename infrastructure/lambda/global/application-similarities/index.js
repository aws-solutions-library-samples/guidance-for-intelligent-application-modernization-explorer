/**
 * Application Similarities Lambda Function
 * 
 * Handles both:
 * - GET: Retrieval of application similarity results from DynamoDB
 * - POST: Triggering application similarity analysis step function
 * 
 * Enforces least privilege - only accesses the specific DynamoDB table for the project.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');

const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const stepfunctions = new SFNClient({});

// Environment variables
const APP_SIM_STEP_FUNCTION_ARN = process.env.APP_SIM_STEP_FUNCTION_ARN;

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
  console.log('🚀 Application Similarities Lambda started');
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
      const threshold = queryStringParameters?.threshold ? parseFloat(queryStringParameters.threshold) : null;
      
      if (threshold !== null && threshold >= 0 && threshold <= 1) {
        console.log(`🎯 Using custom threshold: ${threshold * 100}%`);
        result = await getApplicationSimilarityResultsWithThreshold(projectId, threshold, corsHeaders);
      } else {
        console.log('📊 Using default threshold (70%)');
        result = await getApplicationSimilarityResults(projectId, corsHeaders);
      }
    } else if (httpMethod === 'POST') {
      const requestData = body ? JSON.parse(body) : {};
      const { filters } = requestData;
      result = await triggerApplicationSimilaritiesAnalysis(projectId, filters || {}, context, corsHeaders);
    } else if (httpMethod === 'DELETE') {
      result = await clearApplicationSimilarityResults(projectId, corsHeaders);
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
    console.error('💥 Error in application similarities handler:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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
  return `app-sim-${timestamp}-${random}`;
}

/**
 * Get application similarities state machine ARN for a project
 */
function getApplicationSimilaritiesStateMachineArn(projectId) {
  if (!APP_SIM_STEP_FUNCTION_ARN) {
    throw new Error('APP_SIM_STEP_FUNCTION_ARN environment variable is not set');
  }
  return APP_SIM_STEP_FUNCTION_ARN.replace('{projectId}', projectId);
}

/**
 * Trigger application similarities analysis
 */
async function triggerApplicationSimilaritiesAnalysis(projectId, filters, context, corsHeaders) {
  try {
    console.log(`🔄 Starting application similarities analysis for project: ${projectId}`);
    console.log(`📋 Analysis filters:`, filters);
    
    // Generate unique process ID
    const processId = generateProcessId();
    const processTimestamp = new Date().toISOString();
    const processTableName = `app-modex-process-${projectId}`.toLowerCase();
    
    // Create process tracking record
    await dynamodb.send(new PutCommand({
      TableName: processTableName,
      Item: {
        processId,
        timestamp: processTimestamp,
        processType: 'APP_SIMILARITY',
        processName: 'Application Similarity Analysis',
        status: 'INITIATED',
        startTime: processTimestamp,
        updatedAt: processTimestamp,
        projectId,
        minSimilarityScore: filters?.minSimilarityScore || 0.7,
        applicationFilter: filters?.applicationFilter || 'all',
        departmentFilter: filters?.departmentFilter || 'all'
      }
    }));
    
    console.log(`✅ Created process tracking record: ${processId}`);
    
    // Get the application similarities state machine ARN
    const applicationSimilaritiesStateMachineArn = getApplicationSimilaritiesStateMachineArn(projectId);
    
    // Prepare Step Function input
    const stepFunctionInput = {
      projectId,
      processId,
      processTableName: processTableName,
      analysisType: 'application-similarities',
      filters: {
        minSimilarityScore: filters?.minSimilarityScore || 0.7,
        includeRuntimes: filters?.includeRuntimes !== false,
        includeFrameworks: filters?.includeFrameworks !== false,
        includeDatabases: filters?.includeDatabases !== false,
        includeIntegrations: filters?.includeIntegrations !== false,
        includeStorages: filters?.includeStorages !== false,
        applicationFilter: filters?.applicationFilter || 'all',
        departmentFilter: filters?.departmentFilter || 'all'
      },
      triggeredBy: 'application-similarities-lambda',
      processTimestamp: processTimestamp,
      timestamp: processTimestamp
    };
    
    console.log('🔄 Starting Application Similarity Step Function execution with input:', stepFunctionInput);
    console.log('🎯 Step Function ARN:', applicationSimilaritiesStateMachineArn);
    
    // Start Application Similarity Step Function execution
    const executionResult = await stepfunctions.send(new StartExecutionCommand({
      stateMachineArn: applicationSimilaritiesStateMachineArn,
      name: `app-similarity-${processId}`,
      input: JSON.stringify(stepFunctionInput)
    }));
    
    console.log('✅ Application Similarity Step Function execution started:', executionResult.executionArn);
    
    // Update process tracking record with execution ARN
    await dynamodb.send(new UpdateCommand({
      TableName: processTableName,
      Key: { 
        processId
      },
      UpdateExpression: 'SET executionArn = :executionArn, #status = :status, stage = :stage',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':executionArn': executionResult.executionArn,
        ':status': 'PROCESSING',
        ':stage': 'application-similarity-step-function-started'
      }
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        processId,
        executionArn: executionResult.executionArn,
        message: 'Application similarities analysis started successfully',
        analysisType: 'application-similarities'
      })
    };
    
  } catch (error) {
    console.error('💥 Error triggering application similarities analysis:', error);
    
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
 * Get application similarity results from DynamoDB
 */
async function getApplicationSimilarityResults(projectId, corsHeaders) {
  try {
    const tableName = `app-modex-app-sim-${projectId}`.toLowerCase();
    
    console.log(`📊 Querying DynamoDB table: ${tableName}`);
    
    const params = {
      TableName: tableName
    };
    
    const result = await dynamodb.send(new ScanCommand(params));
    
    if (!result.Items || result.Items.length === 0) {
      console.log('📭 No application similarity results found - returning empty recordset');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          results: {
            totalApplications: 0,
            similarPairs: 0,
            applications: [],
            similarityMatrix: [],
            clusters: []
          }
        })
      };
    }
    
    console.log(`✅ Found ${result.Items.length} similarity records`);
    
    // Process raw DynamoDB records into UI format
    const processedResults = processRawSimilarityData(result.Items);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        results: processedResults
      })
    };
    
  } catch (error) {
    console.error('Error querying DynamoDB:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      console.log('📭 Application similarity results table not found - returning empty recordset');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          results: {
            totalApplications: 0,
            similarPairs: 0,
            applications: [],
            similarityMatrix: [],
            clusters: []
          }
        })
      };
    }
    
    throw error;
  }
}

/**
 * Get application similarity results from DynamoDB with custom threshold
 */
async function getApplicationSimilarityResultsWithThreshold(projectId, threshold, corsHeaders) {
  try {
    const tableName = `app-modex-app-sim-${projectId}`.toLowerCase();
    
    console.log(`📊 Querying DynamoDB table: ${tableName} with threshold: ${threshold}`);
    
    const params = {
      TableName: tableName
    };
    
    const result = await dynamodb.send(new ScanCommand(params));
    
    if (!result.Items || result.Items.length === 0) {
      console.log('📭 No application similarity results found - returning empty recordset');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          results: {
            totalApplications: 0,
            similarPairs: 0,
            applications: [],
            similarityMatrix: [],
            clusters: [],
            threshold: threshold
          }
        })
      };
    }
    
    console.log(`✅ Found ${result.Items.length} similarity records`);
    
    // Process raw DynamoDB records into UI format with custom threshold
    const processedResults = processRawSimilarityDataWithThreshold(result.Items, threshold);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        results: processedResults
      })
    };
    
  } catch (error) {
    console.error('Error querying DynamoDB:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      console.log('📭 Application similarity results table not found - returning empty recordset');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          results: {
            totalApplications: 0,
            similarPairs: 0,
            applications: [],
            similarityMatrix: [],
            clusters: [],
            threshold: threshold
          }
        })
      };
    }
    
    throw error;
  }
}

/**
 * Process raw DynamoDB similarity data into UI format
 */
function processRawSimilarityData(rawRecords) {
  try {
    console.log(`🔄 Processing ${rawRecords.length} raw similarity records`);
    
    // Log first raw record to see structure
    if (rawRecords.length > 0) {
      console.log(`📋 Sample raw DynamoDB record:`, JSON.stringify(rawRecords[0], null, 2));
    }
    
    const applicationsMap = new Map();
    const similarityMatrix = [];
    
    rawRecords.forEach(record => {
      // Extract unique applications
      if (!applicationsMap.has(record.application_id)) {
        applicationsMap.set(record.application_id, {
          id: record.application_id,
          applicationname: record.application_id,
          applicationtype: ''
        });
      }
      
      if (!applicationsMap.has(record.similar_app_id)) {
        applicationsMap.set(record.similar_app_id, {
          id: record.similar_app_id,
          applicationname: record.similar_app_id,
          applicationtype: ''
        });
      }
      
      // Add to similarity matrix
      similarityMatrix.push({
        application_id: record.application_id,
        similar_application_id: record.similar_app_id,
        similarity_score: record.similarity_score
      });
    });
    
    const applications = Array.from(applicationsMap.values());
    
    // Log first processed record to see transformation
    if (similarityMatrix.length > 0) {
      console.log(`📋 Sample processed similarity record:`, JSON.stringify(similarityMatrix[0], null, 2));
    }
    
    // Generate simple clusters
    const clusters = generateSimpleClusters(similarityMatrix, applications);
    
    const results = {
      totalApplications: applications.length,
      similarPairs: similarityMatrix.length,
      applications: applications,
      similarityMatrix: similarityMatrix,
      clusters: clusters
    };
    
    console.log(`✅ Processed results:`, {
      totalApplications: results.totalApplications,
      similarPairs: results.similarPairs,
      clustersCount: results.clusters.length
    });
    
    // Log first 2 records from final similarityMatrix
    console.log(`📋 First 2 records in final similarityMatrix:`, JSON.stringify(results.similarityMatrix.slice(0, 2), null, 2));
    
    return results;
    
  } catch (error) {
    console.error('Error processing raw similarity data:', error);
    throw error;
  }
}

/**
 * Process raw DynamoDB similarity data into UI format with custom threshold
 */
function processRawSimilarityDataWithThreshold(rawRecords, threshold) {
  try {
    console.log(`🔄 Processing ${rawRecords.length} raw similarity records with threshold: ${threshold * 100}%`);
    
    // Log first raw record to see structure
    if (rawRecords.length > 0) {
      console.log(`📋 Sample raw DynamoDB record:`, JSON.stringify(rawRecords[0], null, 2));
    }
    
    const applicationsMap = new Map();
    const similarityMatrix = [];
    
    rawRecords.forEach(record => {
      // Extract unique applications
      if (!applicationsMap.has(record.application_id)) {
        applicationsMap.set(record.application_id, {
          id: record.application_id,
          applicationname: record.application_id,
          applicationtype: ''
        });
      }
      
      if (!applicationsMap.has(record.similar_app_id)) {
        applicationsMap.set(record.similar_app_id, {
          id: record.similar_app_id,
          applicationname: record.similar_app_id,
          applicationtype: ''
        });
      }
      
      // Add to similarity matrix
      similarityMatrix.push({
        application_id: record.application_id,
        similar_application_id: record.similar_app_id,
        similarity_score: record.similarity_score
      });
    });
    
    const applications = Array.from(applicationsMap.values());
    
    // Log first processed record to see transformation
    if (similarityMatrix.length > 0) {
      console.log(`📋 Sample processed similarity record:`, JSON.stringify(similarityMatrix[0], null, 2));
    }
    
    // Generate clusters with custom threshold
    const clusters = generateSimpleClusters(similarityMatrix, applications, threshold);
    
    const results = {
      totalApplications: applications.length,
      similarPairs: similarityMatrix.length,
      applications: applications,
      similarityMatrix: similarityMatrix,
      clusters: clusters,
      threshold: threshold
    };
    
    console.log(`✅ Processed results with ${threshold * 100}% threshold:`, {
      totalApplications: results.totalApplications,
      similarPairs: results.similarPairs,
      clustersCount: results.clusters.length
    });
    
    // Log first 2 records from final similarityMatrix
    console.log(`📋 First 2 records in final similarityMatrix:`, JSON.stringify(results.similarityMatrix.slice(0, 2), null, 2));
    
    return results;
    
  } catch (error) {
    console.error('Error processing raw similarity data with threshold:', error);
    throw error;
  }
}

/**
 * Generate simple clusters based on similarity threshold
 */
function generateSimpleClusters(similarityMatrix, applications, threshold = 0.7) {
  const clusters = [];
  const clustered = new Set();
  
  applications.forEach((application, index) => {
    if (clustered.has(application.id)) return;
    
    const cluster = {
      cluster_id: `cluster_${index}`,
      applications: [application.id],
      application_count: 1,
      avg_similarity: 0
    };
    
    let totalSimilarity = 0;
    let similarityCount = 0;
    
    similarityMatrix.forEach(sim => {
      if (sim.application_id === application.id && sim.similarity_score >= threshold && !clustered.has(sim.similar_application_id)) {
        cluster.applications.push(sim.similar_application_id);
        clustered.add(sim.similar_application_id);
        totalSimilarity += sim.similarity_score;
        similarityCount++;
      }
    });
    
    cluster.application_count = cluster.applications.length;
    cluster.avg_similarity = similarityCount > 0 ? totalSimilarity / similarityCount : 0;
    
    if (cluster.application_count > 1) {
      clusters.push(cluster);
      cluster.applications.forEach(appId => clustered.add(appId));
    }
  });
  
  return clusters;
}

/**
 * Clear application similarity results from DynamoDB
 */
async function clearApplicationSimilarityResults(projectId, corsHeaders) {
  try {
    const similarityTableName = `app-modex-app-sim-${projectId}`.toLowerCase();
    const clustersTableName = `app-modex-app-clusters-${projectId}`.toLowerCase();
    
    console.log(`🗑️ Clearing application similarity results for project: ${projectId}`);
    console.log(`   Similarity table: ${similarityTableName}`);
    console.log(`   Clusters table: ${clustersTableName}`);
    
    let deletedSimilarities = 0;
    let deletedClusters = 0;
    
    // Delete all records from similarity table
    try {
      console.log(`📊 Scanning similarity table: ${similarityTableName}`);
      const similarityRecords = await dynamodb.send(new ScanCommand({
        TableName: similarityTableName
      }));
      
      if (similarityRecords.Items && similarityRecords.Items.length > 0) {
        console.log(`🔄 Found ${similarityRecords.Items.length} similarity records to delete`);
        
        // Delete in batches of 25 (DynamoDB limit)
        for (let i = 0; i < similarityRecords.Items.length; i += 25) {
          const batch = similarityRecords.Items.slice(i, i + 25);
          
          const deleteRequests = batch.map(item => ({
            DeleteRequest: {
              Key: {
                application_id: item.application_id,
                similar_app_id: item.similar_app_id
              }
            }
          }));
          
          await dynamodb.send(new BatchWriteCommand({
            RequestItems: {
              [similarityTableName]: deleteRequests
            }
          }));
          
          deletedSimilarities += deleteRequests.length;
          console.log(`   ✅ Deleted batch ${Math.floor(i / 25) + 1}: ${deleteRequests.length} records`);
        }
      } else {
        console.log(`📭 No similarity records found to delete`);
      }
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`⚠️ Similarity table not found: ${similarityTableName}`);
      } else {
        throw error;
      }
    }
    
    // Delete all records from clusters table
    try {
      console.log(`📊 Scanning clusters table: ${clustersTableName}`);
      const clusterRecords = await dynamodb.send(new ScanCommand({
        TableName: clustersTableName
      }));
      
      if (clusterRecords.Items && clusterRecords.Items.length > 0) {
        console.log(`🔄 Found ${clusterRecords.Items.length} cluster records to delete`);
        
        // Delete in batches of 25 (DynamoDB limit)
        for (let i = 0; i < clusterRecords.Items.length; i += 25) {
          const batch = clusterRecords.Items.slice(i, i + 25);
          
          const deleteRequests = batch.map(item => ({
            DeleteRequest: {
              Key: {
                cluster_id: item.cluster_id
              }
            }
          }));
          
          await dynamodb.send(new BatchWriteCommand({
            RequestItems: {
              [clustersTableName]: deleteRequests
            }
          }));
          
          deletedClusters += deleteRequests.length;
          console.log(`   ✅ Deleted batch ${Math.floor(i / 25) + 1}: ${deleteRequests.length} records`);
        }
      } else {
        console.log(`📭 No cluster records found to delete`);
      }
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`⚠️ Clusters table not found: ${clustersTableName}`);
      } else {
        throw error;
      }
    }
    
    console.log(`✅ Successfully cleared application similarity results`);
    console.log(`   📊 Deleted ${deletedSimilarities} similarity records`);
    console.log(`   📊 Deleted ${deletedClusters} cluster records`);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Application similarity results cleared successfully',
        deletedSimilarities,
        deletedClusters,
        projectId
      })
    };
    
  } catch (error) {
    console.error('💥 Error clearing application similarity results:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to clear application similarity results'
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
