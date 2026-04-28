// Force deployment timestamp: 2025-08-06T19:57:04.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:55.3NZ';

/**
 * Step Function API Lambda Function
 * 
 * This function handles API Gateway requests to trigger and manage step functions
 * for similarities analysis and other workflows.
 */

const { SFNClient, StartExecutionCommand, DescribeExecutionCommand, ListExecutionsCommand } = require('@aws-sdk/client-sfn');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, BatchWriteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const stepfunctions = new SFNClient({});
const s3 = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const PROJECT_DATA_TABLE = process.env.PROJECT_DATA_TABLE;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';
const AWS_REGION = process.env.AWS_REGION || process.env.REGION;
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;

/**
 * Get AWS Account ID from environment or context
 */
function getAwsAccountId(context) {
  // Try environment variable first
  if (AWS_ACCOUNT_ID) {
    return AWS_ACCOUNT_ID;
  }
  
  // Extract from Lambda context
  if (context && context.invokedFunctionArn) {
    const arnParts = context.invokedFunctionArn.split(':');
    if (arnParts.length >= 5) {
      return arnParts[4];
    }
  }
  
  // Extract from SQS URL if available
  if (process.env.PROJECT_OPERATIONS_QUEUE_URL) {
    const match = process.env.PROJECT_OPERATIONS_QUEUE_URL.match(/amazonaws\.com\/(\d+)\//);
    if (match) {
      return match[1];
    }
  }
  
  throw new Error('Unable to determine AWS Account ID');
}

/**
 * Construct the component similarities analysis state machine ARN for a specific project
 */
function getComponentSimilaritiesStateMachineArn(projectId, context) {
  const accountId = getAwsAccountId(context);
  return `arn:aws:states:${AWS_REGION}:${accountId}:stateMachine:app-modex-comp-sim-analysis-${projectId}`;
}



/**
 * Create process tracking record for component similarities analysis
 */
async function createComponentSimilaritiesProcessRecord(projectId, processId, filters = {}) {
  try {
    const timestamp = new Date().toISOString();
    const processTableName = `app-modex-process-${projectId}`.toLowerCase();
    
    const processRecord = {
      processId,
      projectId,
      processType: 'COMP_SIMILARITY',
      processName: 'Component Similarity Analysis',
      status: 'INITIATED',
      startTime: timestamp,
      endTime: null,
      description: 'Component-level similarities analysis using distributed Step Functions',
      filters: filters,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    await dynamodb.send(new PutCommand({
      TableName: processTableName,
      Item: processRecord
    }));
    
    console.log(`✅ Created component similarities process tracking record in ${processTableName}: ${processId}`);
    return processRecord;
  } catch (error) {
    console.error('❌ Error creating component similarities process tracking record:', error);
    throw error;
  }
}

/**
 * Trigger component similarities analysis synchronously
 */
async function triggerComponentSimilaritiesAnalysis(projectId, filters = {}, context) {
  try {
    console.log(`🔄 Starting component similarities analysis for project: ${projectId}`);
    console.log(`📋 Analysis filters:`, filters);
    
    // Generate unique process ID
    const processId = generateProcessId();
    const processTimestamp = new Date().toISOString();
    
    // Create process tracking record
    await createComponentSimilaritiesProcessRecord(projectId, processId, filters);
    
    // Get the component similarities state machine ARN
    const componentSimilaritiesStateMachineArn = getComponentSimilaritiesStateMachineArn(projectId, context);
    
    // Prepare Step Function input
    const stepFunctionInput = {
      projectId,
      processId,
      processTableName: `app-modex-process-${projectId}`.toLowerCase(),
      analysisType: 'component-similarities',
      filters: {
        minSimilarityScore: filters.minSimilarityScore || 0.7,
        includeRuntimes: filters.includeRuntimes !== false,
        includeFrameworks: filters.includeFrameworks !== false,
        includeDatabases: filters.includeDatabases !== false,
        includeIntegrations: filters.includeIntegrations !== false,
        includeStorages: filters.includeStorages !== false,
        applicationFilter: filters.applicationFilter || 'all',
        componentTypeFilter: filters.componentTypeFilter || 'all'
      },
      triggeredBy: 'component-similarity-analysis',
      processTimestamp: processTimestamp,
      timestamp: processTimestamp
    };
    
    console.log('🔄 Starting Component Similarity Step Function execution with input:', stepFunctionInput);
    console.log('🎯 Step Function ARN:', componentSimilaritiesStateMachineArn);
    
    // Start Component Similarity Step Function execution synchronously
    const executionResult = await stepfunctions.send(new StartExecutionCommand({
      stateMachineArn: componentSimilaritiesStateMachineArn,
      name: `comp-similarity-${processId}`,
      input: JSON.stringify(stepFunctionInput)
    }));
    
    console.log('✅ Component Similarity Step Function execution started:', executionResult.executionArn);
    
    // Update process tracking record with execution ARN
    const processTableName = `app-modex-process-${projectId}`.toLowerCase();
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
        ':stage': 'component-similarity-step-function-started'
      }
    }));
    
    // Estimate completion time based on expected dataset size
    const estimatedTimeMinutes = estimateComponentAnalysisTime(filters);
    
    return {
      success: true,
      processId,
      executionArn: executionResult.executionArn,
      estimatedTimeMinutes,
      message: 'Component similarities analysis started successfully',
      analysisType: 'component-similarities'
    };
    
  } catch (error) {
    console.error('💥 Error triggering component similarities analysis:', error);
    throw error;
  }
}

/**
 * Estimate analysis completion time based on filters and expected dataset size
 */
function estimateComponentAnalysisTime(filters) {
  // Base time for small datasets (< 1000 components)
  let baseTime = 5;
  
  // Increase time estimate for larger expected datasets
  if (filters.applicationFilter === 'all') {
    baseTime = 15; // Assume larger dataset when analyzing all applications
  }
  
  // Add time for complex similarity calculations
  const complexityFactors = [
    filters.includeRuntimes,
    filters.includeFrameworks, 
    filters.includeDatabases,
    filters.includeIntegrations,
    filters.includeStorages
  ].filter(Boolean).length;
  
  // More factors = more complex analysis
  const complexityMultiplier = Math.max(1, complexityFactors / 3);
  
  return Math.ceil(baseTime * complexityMultiplier);
}

/**
 * List recent component similarity executions for a project
 */
async function listComponentSimilarityExecutions(projectId, maxResults = 10, context) {
  try {
    console.log(`📋 Listing component similarity executions for project: ${projectId}`);
    
    // Construct the project-specific component similarities state machine ARN
    const componentSimilaritiesStateMachineArn = getComponentSimilaritiesStateMachineArn(projectId, context);
    
    const result = await stepfunctions.send(new ListExecutionsCommand({
      stateMachineArn: componentSimilaritiesStateMachineArn,
      maxResults
    }));
    
    return {
      success: true,
      executions: result.executions || [],
      stateMachineArn: componentSimilaritiesStateMachineArn
    };
    
  } catch (error) {
    console.error('💥 Error listing component similarity executions:', error);
    throw error;
  }
}

/**
 * Generate a unique process ID for tracking
 */
function generateProcessId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `sim-analysis-${timestamp}-${random}`;
}



/**
 * Get step function execution status
 */
async function getExecutionStatus(executionArn) {
  try {
    console.log(`📊 Getting execution status for: ${executionArn}`);
    
    const result = await stepfunctions.send(new DescribeExecutionCommand({
      executionArn
    }));
    
    return {
      success: true,
      status: result.status,
      startDate: result.startDate,
      stopDate: result.stopDate,
      output: result.output,
      error: result.error
    };
    
  } catch (error) {
    console.error('💥 Error getting execution status:', error);
    throw error;
  }
}

/**
 * List recent executions for a project
 */
async function listExecutions(projectId, maxResults = 10, context) {
  try {
    console.log(`📋 Listing executions for project: ${projectId}`);
    
    // Construct the project-specific application similarities state machine ARN
    const applicationSimilaritiesStateMachineArn = getApplicationSimilaritiesStateMachineArn(projectId, context);
    
    const result = await stepfunctions.send(new ListExecutionsCommand({
      stateMachineArn: applicationSimilaritiesStateMachineArn,
      maxResults
    }));
    
    return {
      success: true,
      executions: result.executions || []
    };
    
  } catch (error) {
    console.error('💥 Error listing executions:', error);
    throw error;
  }
}

/**
 * Main Lambda handler
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event, context) => {
  console.log('🚀 Step Function API Lambda started');
  console.log('📋 Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
    const { httpMethod, path, pathParameters, queryStringParameters, body } = event;
    const requestBody = body ? JSON.parse(body) : {};
    
    // Set CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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
    
    let result;
    
    // Route based on path and method
    if (path === '/step-functions/component-similarity-analysis' && httpMethod === 'POST') {
      const { projectId, filters } = requestBody;
      
      if (!projectId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'projectId is required for component similarity analysis'
          })
        };
      }
      
      result = await triggerComponentSimilaritiesAnalysis(projectId, filters || {}, context);
      
    } else if (path === '/step-functions/component-similarity-results' && (httpMethod === 'GET' || httpMethod === 'DELETE')) {
      result = await handleComponentSimilarityResults(event, context);
      
    } else if (path === '/step-functions/application-similarity-analysis' && httpMethod === 'POST') {
      const { projectId, filters } = requestBody;
      
      if (!projectId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'projectId is required for application similarity analysis'
          })
        };
      }
      
      result = await triggerApplicationSimilaritiesAnalysis(projectId, filters || {}, context);
      
    } else if (path === '/step-functions/application-similarity-results' && (httpMethod === 'GET' || httpMethod === 'DELETE')) {
      result = await handleApplicationSimilarityResults(event, context);
      
    } else if (path && path.includes('/step-function') && httpMethod === 'GET') {
      // Handle GET on /projects/{projectId}/step-function for execution status polling
      const executionArn = queryStringParameters?.executionArn;
      
      if (!executionArn) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'executionArn query parameter is required for status polling'
          })
        };
      }
      
      result = await getExecutionStatus(executionArn);
      
    } else if (path === '/step-functions/executions' && httpMethod === 'GET') {
      const projectId = queryStringParameters?.projectId;
      const analysisType = queryStringParameters?.analysisType || 'application'; // 'application' or 'component'
      const maxResults = queryStringParameters?.maxResults ? parseInt(queryStringParameters.maxResults) : 10;
      
      if (!projectId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'projectId query parameter is required'
          })
        };
      }
      
      if (analysisType === 'component') {
        result = await listComponentSimilarityExecutions(projectId, maxResults, context);
      } else {
        result = await listExecutions(projectId, maxResults, context);
      }
      
    } else {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: `Endpoint not found: ${httpMethod} ${path}`
        })
      };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    console.error('💥 Error in step function API handler:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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
 * Get component similarity results from S3
 */
/**
 * Handle component similarity results requests
 */
async function handleComponentSimilarityResults(event, context) {
  const { httpMethod, queryStringParameters } = event;
  const projectId = queryStringParameters?.projectId;
  const threshold = queryStringParameters?.threshold ? parseFloat(queryStringParameters.threshold) : null;

  // Set CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Content-Type': 'application/json'
  };

  if (!projectId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'projectId query parameter is required'
      })
    };
  }

  try {
    if (httpMethod === 'GET') {
      // Check if custom threshold is provided
      if (threshold !== null && threshold >= 0 && threshold <= 1) {
        console.log(`🎯 Using custom threshold: ${threshold * 100}%`);
        return await getComponentSimilarityResultsFromDynamoDBWithThreshold(projectId, threshold, corsHeaders);
      } else {
        console.log('📊 Using default threshold (70%)');
        return await getComponentSimilarityResultsFromDynamoDB(projectId, corsHeaders);
      }
    } else if (httpMethod === 'DELETE') {
      return await clearComponentSimilarityResultsFromDynamoDB(projectId, corsHeaders);
    }
  } catch (error) {
    console.error('Error handling component similarity results:', error);
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
 * Get component similarity results from DynamoDB
 */
async function getComponentSimilarityResultsFromDynamoDB(projectId, corsHeaders) {
  try {
    const tableName = `app-modex-comp-sim-${projectId}`.toLowerCase();
    
    console.log(`📊 Querying DynamoDB table: ${tableName}`);
    
    const params = {
      TableName: tableName
    };
    
    const result = await dynamodb.send(new ScanCommand(params));
    
    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'No component similarity results found'
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
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Component similarity results table not found'
        })
      };
    }
    
    throw error;
  }
}

/**
 * Get component similarity results from DynamoDB with custom threshold
 */
async function getComponentSimilarityResultsFromDynamoDBWithThreshold(projectId, threshold, corsHeaders) {
  try {
    const tableName = `app-modex-comp-sim-${projectId}`.toLowerCase();
    
    console.log(`📊 Querying DynamoDB table: ${tableName} with threshold: ${threshold}`);
    
    const params = {
      TableName: tableName
    };
    
    const result = await dynamodb.send(new ScanCommand(params));
    
    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'No component similarity results found'
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
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Component similarity results table not found'
        })
      };
    }
    
    throw error;
  }
}

/**
 * Clear all component similarity results from DynamoDB
 */
async function clearComponentSimilarityResultsFromDynamoDB(projectId, corsHeaders) {
  try {
    const tableName = `app-modex-comp-sim-${projectId}`.toLowerCase();
    
    console.log(`🧹 Clearing DynamoDB table: ${tableName}`);
    
    const scanParams = {
      TableName: tableName,
      ProjectionExpression: 'component_id, similar_component_id'
    };
    
    const scanResult = await dynamodb.send(new ScanCommand(scanParams));
    
    if (!scanResult.Items || scanResult.Items.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'No records to clear'
        })
      };
    }
    
    console.log(`🗑️ Deleting ${scanResult.Items.length} records`);
    
    // Delete items in batches of 25
    const batchSize = 25;
    let deletedCount = 0;
    
    for (let i = 0; i < scanResult.Items.length; i += batchSize) {
      const batch = scanResult.Items.slice(i, i + batchSize);
      
      const deleteRequests = batch.map(item => ({
        DeleteRequest: {
          Key: {
            component_id: item.component_id,
            similar_component_id: item.similar_component_id
          }
        }
      }));
      
      const batchParams = {
        RequestItems: {
          [tableName]: deleteRequests
        }
      };
      
      await dynamodb.send(new BatchWriteCommand(batchParams));
      deletedCount += deleteRequests.length;
    }
    
    console.log(`✅ Successfully deleted ${deletedCount} records`);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Successfully cleared ${deletedCount} component similarity records`
      })
    };
    
  } catch (error) {
    console.error('Error clearing DynamoDB table:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Component similarity results table not found'
        })
      };
    }
    
    throw error;
  }
}

/**
 * Process raw DynamoDB similarity data into UI format with custom threshold
 */
function processRawSimilarityDataWithThreshold(rawRecords, threshold) {
  try {
    console.log(`🔄 Processing ${rawRecords.length} raw similarity records with threshold: ${threshold * 100}%`);
    
    const componentsMap = new Map();
    const similarityMatrix = [];
    
    rawRecords.forEach(record => {
      // Extract unique components
      if (!componentsMap.has(record.component_id)) {
        componentsMap.set(record.component_id, {
          id: record.component_id,
          componentname: record.component1_name || '',
          applicationname: record.application1 || ''
        });
      }
      
      if (!componentsMap.has(record.similar_component_id)) {
        componentsMap.set(record.similar_component_id, {
          id: record.similar_component_id,
          componentname: record.component2_name || '',
          applicationname: record.application2 || ''
        });
      }
      
      // Add to similarity matrix
      similarityMatrix.push({
        component_id: record.component_id,
        similar_component_id: record.similar_component_id,
        similarity_score: record.similarity_score,
        component1_name: record.component1_name,
        component2_name: record.component2_name,
        application1: record.application1,
        application2: record.application2
      });
    });
    
    const components = Array.from(componentsMap.values());
    
    // Generate clusters with custom threshold
    const clusters = generateSimpleClusters(similarityMatrix, components, threshold);
    
    // Find repeated patterns
    const repeatedPatterns = findRepeatedPatterns(components);
    
    const results = {
      totalComponents: components.length,
      similarPairs: similarityMatrix.length,
      components: components,
      similarityMatrix: similarityMatrix,
      clusters: clusters,
      repeatedPatterns: repeatedPatterns,
      threshold: threshold // Include the threshold used
    };
    
    console.log(`✅ Processed results with ${threshold * 100}% threshold:`, {
      totalComponents: results.totalComponents,
      similarPairs: results.similarPairs,
      clustersCount: results.clusters.length,
      patternsCount: results.repeatedPatterns.length
    });
    
    return results;
    
  } catch (error) {
    console.error('Error processing raw similarity data with threshold:', error);
    throw error;
  }
}

/**
 * Process raw DynamoDB similarity data into UI format
 */
function processRawSimilarityData(rawRecords) {
  try {
    console.log(`🔄 Processing ${rawRecords.length} raw similarity records`);
    
    const componentsMap = new Map();
    const similarityMatrix = [];
    
    rawRecords.forEach(record => {
      // Extract unique components
      if (!componentsMap.has(record.component_id)) {
        componentsMap.set(record.component_id, {
          id: record.component_id,
          componentname: record.component1_name || '',
          applicationname: record.application1 || ''
        });
      }
      
      if (!componentsMap.has(record.similar_component_id)) {
        componentsMap.set(record.similar_component_id, {
          id: record.similar_component_id,
          componentname: record.component2_name || '',
          applicationname: record.application2 || ''
        });
      }
      
      // Add to similarity matrix
      similarityMatrix.push({
        component_id: record.component_id,
        similar_component_id: record.similar_component_id,
        similarity_score: record.similarity_score,
        component1_name: record.component1_name,
        component2_name: record.component2_name,
        application1: record.application1,
        application2: record.application2
      });
    });
    
    const components = Array.from(componentsMap.values());
    
    // Generate simple clusters
    const clusters = generateSimpleClusters(similarityMatrix, components);
    
    // Find repeated patterns
    const repeatedPatterns = findRepeatedPatterns(components);
    
    const results = {
      totalComponents: components.length,
      similarPairs: similarityMatrix.length,
      components: components,
      similarityMatrix: similarityMatrix,
      clusters: clusters,
      repeatedPatterns: repeatedPatterns
    };
    
    console.log(`✅ Processed results:`, {
      totalComponents: results.totalComponents,
      similarPairs: results.similarPairs,
      clustersCount: results.clusters.length,
      patternsCount: results.repeatedPatterns.length
    });
    
    return results;
    
  } catch (error) {
    console.error('Error processing raw similarity data:', error);
    throw error;
  }
}

/**
 * Generate simple clusters based on similarity threshold
 */
function generateSimpleClusters(similarityMatrix, components, threshold = 0.7) {
  const clusters = [];
  const clustered = new Set();
  
  components.forEach((component, index) => {
    if (clustered.has(component.id)) return;
    
    const cluster = {
      cluster_id: `cluster_${index}`,
      components: [component.id],
      component_count: 1,
      avg_similarity: 0
    };
    
    let totalSimilarity = 0;
    let similarityCount = 0;
    
    similarityMatrix.forEach(sim => {
      if (sim.component_id === component.id && sim.similarity_score >= threshold && !clustered.has(sim.similar_component_id)) {
        cluster.components.push(sim.similar_component_id);
        clustered.add(sim.similar_component_id);
        totalSimilarity += sim.similarity_score;
        similarityCount++;
      }
    });
    
    cluster.component_count = cluster.components.length;
    cluster.avg_similarity = similarityCount > 0 ? totalSimilarity / similarityCount : 0;
    
    if (cluster.component_count > 1) {
      clusters.push(cluster);
      cluster.components.forEach(compId => clustered.add(compId));
    }
  });
  
  return clusters;
}

/**
 * Find repeated technology patterns based on actual technology stack combinations
 */
function findRepeatedPatterns(components) {
  const patterns = [];
  const technologyCombinations = new Map();
  
  components.forEach(comp => {
    // Create comprehensive technology stack signature
    const runtime = (comp.runtime || '').toLowerCase().trim();
    const framework = (comp.framework || '').toLowerCase().trim();
    
    // Handle databases, integrations, storages as arrays or strings
    let databases = comp.databases || [];
    if (typeof databases === 'string') {
      databases = databases.split(',').map(db => db.trim().toLowerCase()).filter(db => db);
    }
    databases = databases.sort();
    
    let integrations = comp.integrations || [];
    if (typeof integrations === 'string') {
      integrations = integrations.split(',').map(int => int.trim().toLowerCase()).filter(int => int);
    }
    integrations = integrations.sort();
    
    let storages = comp.storages || [];
    if (typeof storages === 'string') {
      storages = storages.split(',').map(stor => stor.trim().toLowerCase()).filter(stor => stor);
    }
    storages = storages.sort();
    
    // Create technology stack signature for grouping
    const techStackSignature = `${runtime}|${framework}|${databases.join(',')}|${integrations.join(',')}|${storages.join(',')}`;
    
    // Skip completely empty patterns
    if (!runtime && !framework && databases.length === 0 && integrations.length === 0 && storages.length === 0) {
      return;
    }
    
    if (!technologyCombinations.has(techStackSignature)) {
      technologyCombinations.set(techStackSignature, {
        signature: {
          runtime: runtime || null,
          framework: framework || null,
          databases: databases,
          integrations: integrations,
          storages: storages
        },
        components: []
      });
    }
    
    technologyCombinations.get(techStackSignature).components.push({
      componentId: comp.id,
      componentName: comp.componentname || comp.name || 'Unknown Component',
      applicationName: comp.applicationname || comp.application || 'Unknown Application'
    });
  });
  
  // Convert to pattern objects in RepeatedPatternsTable expected format
  let patternId = 0;
  technologyCombinations.forEach((data, techStackSignature) => {
    if (data.components.length > 1) { // Only patterns with multiple instances
      const signature = data.signature;
      
      // Create descriptive pattern name
      const nameParts = [];
      if (signature.runtime) nameParts.push(signature.runtime.charAt(0).toUpperCase() + signature.runtime.slice(1));
      if (signature.framework) nameParts.push(signature.framework.charAt(0).toUpperCase() + signature.framework.slice(1));
      if (signature.databases.length > 0) nameParts.push(signature.databases.map(db => db.charAt(0).toUpperCase() + db.slice(1)).join(' + '));
      if (signature.integrations.length > 0) nameParts.push(signature.integrations.map(int => int.charAt(0).toUpperCase() + int.slice(1)).join(' + '));
      if (signature.storages.length > 0) nameParts.push(signature.storages.map(stor => stor.charAt(0).toUpperCase() + stor.slice(1)).join(' + '));
      
      const patternName = nameParts.length > 0 ? nameParts.join(' + ') : `Pattern ${patternId + 1}`;
      
      patterns.push({
        id: `pattern_${patternId}`,
        patternName: patternName,
        frequency: data.components.length,
        pattern: {
          runtime: signature.runtime,
          framework: signature.framework,
          databases: signature.databases,
          integrations: signature.integrations,
          storages: signature.storages
        },
        components: data.components
      });
      
      patternId++;
    }
  });
  
  // Sort by frequency (most common first)
  patterns.sort((a, b) => b.frequency - a.frequency);
  
  console.log(`🏗️ Generated ${patterns.length} granular technology patterns`);
  return patterns;
}

// ============================================================================
// APPLICATION SIMILARITY FUNCTIONS
// ============================================================================

/**
 * Create application similarities process tracking record
 */
async function createApplicationSimilaritiesProcessRecord(projectId, processId, filters) {
  try {
    const timestamp = new Date().toISOString();
    
    const processRecord = {
      pk: `PROJECT#${projectId}`,
      sk: `PROCESS#${processId}`,
      processId,
      projectId,
      processType: 'application-similarities-analysis',
      status: 'RUNNING',
      filters,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    await dynamodb.send(new PutCommand({
      TableName: PROJECT_DATA_TABLE,
      Item: processRecord
    }));
    
    console.log(`✅ Created application similarities process tracking record: ${processId}`);
    return processRecord;
  } catch (error) {
    console.error('❌ Error creating application similarities process tracking record:', error);
    throw error;
  }
}

/**
 * Trigger application similarities analysis synchronously
 */
async function triggerApplicationSimilaritiesAnalysis(projectId, filters = {}, context) {
  try {
    console.log(`🔄 Starting application similarities analysis for project: ${projectId}`);
    console.log(`📋 Analysis filters:`, filters);
    
    // Generate unique process ID
    const processId = generateProcessId();
    const processTimestamp = new Date().toISOString();
    
    // Create process tracking record
    const processTableName = `app-modex-process-${projectId}`.toLowerCase();
    await dynamodb.send(new PutCommand({
      TableName: processTableName,
      Item: {
        processId,
        timestamp: processTimestamp,
        processType: 'APP_SIMILARITY',
        processName: 'Application Similarity Analysis',
        status: 'PROCESSING',
        startTime: processTimestamp,
        updatedAt: processTimestamp,
        projectId,
        minSimilarityScore: filters.minSimilarityScore || 0.7,
        applicationFilter: filters.applicationFilter || 'all',
        departmentFilter: filters.departmentFilter || 'all'
      }
    }));
    
    console.log(`✅ Created process tracking record: ${processId}`);
    
    // Get the application similarities state machine ARN
    const applicationSimilaritiesStateMachineArn = getApplicationSimilaritiesStateMachineArn(projectId, context);
    
    // Prepare Step Function input
    const stepFunctionInput = {
      projectId,
      processId,
      processTableName: processTableName,
      analysisType: 'application-similarities',
      filters: {
        minSimilarityScore: filters.minSimilarityScore || 0.7,
        includeRuntimes: filters.includeRuntimes !== false,
        includeFrameworks: filters.includeFrameworks !== false,
        includeDatabases: filters.includeDatabases !== false,
        includeIntegrations: filters.includeIntegrations !== false,
        includeStorages: filters.includeStorages !== false,
        applicationFilter: filters.applicationFilter || 'all',
        departmentFilter: filters.departmentFilter || 'all'
      },
      triggeredBy: 'application-similarity-analysis',
      processTimestamp: processTimestamp,
      timestamp: processTimestamp
    };
    
    console.log('🔄 Starting Application Similarity Step Function execution with input:', stepFunctionInput);
    console.log('🎯 Step Function ARN:', applicationSimilaritiesStateMachineArn);
    
    // Start Application Similarity Step Function execution synchronously
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
      UpdateExpression: 'SET executionArn = :executionArn, stage = :stage',
      ExpressionAttributeValues: {
        ':executionArn': executionResult.executionArn,
        ':stage': 'application-similarity-step-function-started'
      }
    }));
    
    // Estimate completion time based on expected dataset size
    const estimatedTimeMinutes = estimateApplicationAnalysisTime(filters);
    
    return {
      success: true,
      processId,
      executionArn: executionResult.executionArn,
      estimatedTimeMinutes,
      message: 'Application similarities analysis started successfully',
      analysisType: 'application-similarities'
    };
    
  } catch (error) {
    console.error('💥 Error triggering application similarities analysis:', error);
    throw error;
  }
}

/**
 * Estimate application analysis completion time based on filters and expected dataset size
 */
function estimateApplicationAnalysisTime(filters) {
  // Base time for small datasets (< 100 applications)
  let baseTime = 3;
  
  // Increase time estimate for larger expected datasets
  if (filters.applicationFilter === 'all') {
    baseTime = 8; // Assume larger dataset when analyzing all applications
  }
  
  // Add time for complex similarity calculations
  if (filters.includeIntegrations && filters.includeStorages) {
    baseTime += 2;
  }
  
  return Math.max(baseTime, 2); // Minimum 2 minutes
}

/**
 * Get application similarities state machine ARN for a project
 */
function getApplicationSimilaritiesStateMachineArn(projectId, context) {
  const { awsRequestId } = context;
  const region = process.env.AWS_REGION || 'us-west-2';
  const accountId = context.invokedFunctionArn.split(':')[4];
  
  // Construct the application similarities state machine ARN
  return `arn:aws:states:${region}:${accountId}:stateMachine:app-modex-app-sim-analysis-${projectId}`;
}

/**
 * Handle application similarity results requests (GET and DELETE)
 */
async function handleApplicationSimilarityResults(event, context) {
  const { httpMethod, queryStringParameters } = event;
  const projectId = queryStringParameters?.projectId;
  
  // Set CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  };
  
  if (!projectId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'projectId is required'
      })
    };
  }
  
  try {
    if (httpMethod === 'GET') {
      return await getApplicationSimilarityResults(projectId, corsHeaders);
    } else if (httpMethod === 'DELETE') {
      return await clearApplicationSimilarityResults(projectId, corsHeaders);
    }
  } catch (error) {
    console.error('Error handling application similarity results:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      })
    };
  }
  
  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({
      success: false,
      error: 'Method not allowed'
    })
  };
}

/**
 * Get application similarity results from DynamoDB
 */
async function getApplicationSimilarityResults(projectId, corsHeaders) {
  try {
    console.log(`🔍 Fetching application similarity results for project: ${projectId}`);
    
    const tableName = `app-modex-app-sim-${projectId}`.toLowerCase();
    console.log(`📊 Querying DynamoDB table: ${tableName}`);
    
    // Scan the DynamoDB table for all similarity records
    const result = await dynamodb.send(new ScanCommand({
      TableName: tableName,
      Limit: 1000 // Reasonable limit for similarity records
    }));
    
    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'No application similarity results found'
        })
      };
    }
    
    console.log(`✅ Found ${result.Items.length} similarity records`);
    
    // Process raw DynamoDB records into UI format
    const processedResults = processRawApplicationSimilarityData(result.Items);
    
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
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Application similarity results table not found'
        })
      };
    }
    
    throw error;
  }
}

/**
 * Clear application similarity results from DynamoDB
 */
async function clearApplicationSimilarityResults(projectId, corsHeaders) {
  try {
    console.log(`🗑️ Clearing application similarity results for project: ${projectId}`);
    
    const tableName = `app-modex-app-sim-${projectId}`.toLowerCase();
    
    // First, scan to get all items
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'application_id, similar_app_id'
    }));
    
    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log('📭 No application similarity results to clear');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'No results to clear'
        })
      };
    }
    
    // Delete items in batches
    const batchSize = 25; // DynamoDB batch write limit
    const items = scanResult.Items;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
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
          [tableName]: deleteRequests
        }
      }));
    }
    
    console.log(`✅ Cleared ${items.length} application similarity records`);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Cleared ${items.length} application similarity records`
      })
    };
    
  } catch (error) {
    console.error('❌ Error clearing application similarity results:', error);
    throw error;
  }
}

/**
 * Process raw DynamoDB application similarity data into UI format
 */
function processRawApplicationSimilarityData(rawRecords) {
  try {
    console.log(`🔄 Processing ${rawRecords.length} raw application similarity records`);
    
    const applicationsMap = new Map();
    const similarityMatrix = [];
    
    rawRecords.forEach(record => {
      // Extract unique applications
      if (!applicationsMap.has(record.application_id)) {
        applicationsMap.set(record.application_id, {
          id: record.application_id,
          applicationname: record.application_name || record.application_id,
          department: record.department || ''
        });
      }
      
      if (!applicationsMap.has(record.similar_app_id)) {
        applicationsMap.set(record.similar_app_id, {
          id: record.similar_app_id,
          applicationname: record.similar_app_name || record.similar_app_id,
          department: record.similar_department || ''
        });
      }
      
      // Add to similarity matrix
      similarityMatrix.push({
        application1_id: record.application_id,
        application2_id: record.similar_app_id,
        application1_name: record.application_name || record.application_id,
        application2_name: record.similar_app_name || record.similar_app_id,
        similarity_score: parseFloat(record.similarity_score) || 0,
        cluster_id: record.cluster_id || null
      });
    });
    
    // Convert applications map to array
    const applications = Array.from(applicationsMap.values());
    
    // Generate clusters from similarity data
    const clusters = generateApplicationClusters(similarityMatrix);
    
    // Generate repeated patterns (placeholder for now)
    const repeatedPatterns = [];
    
    console.log(`✅ Processed application similarity data:`, {
      applications: applications.length,
      similarityPairs: similarityMatrix.length,
      clusters: clusters.length
    });
    
    return {
      applications,
      similarityMatrix,
      clusters,
      repeatedPatterns,
      totalApplications: applications.length,
      similarPairs: similarityMatrix.length
    };
    
  } catch (error) {
    console.error('❌ Error processing raw application similarity data:', error);
    throw error;
  }
}

/**
 * Generate application clusters from similarity matrix
 */
function generateApplicationClusters(similarityMatrix) {
  // Simple clustering based on similarity scores
  const clusters = new Map();
  
  similarityMatrix.forEach(pair => {
    if (pair.cluster_id) {
      if (!clusters.has(pair.cluster_id)) {
        clusters.set(pair.cluster_id, {
          cluster_id: pair.cluster_id,
          applications: new Set(),
          avg_similarity: 0,
          similarity_scores: []
        });
      }
      
      const cluster = clusters.get(pair.cluster_id);
      cluster.applications.add(pair.application1_id);
      cluster.applications.add(pair.application2_id);
      cluster.similarity_scores.push(pair.similarity_score);
    }
  });
  
  // Convert to array format and calculate averages
  return Array.from(clusters.values()).map(cluster => ({
    cluster_id: cluster.cluster_id,
    applications: Array.from(cluster.applications).map(id => ({ id })),
    application_count: cluster.applications.size,
    avg_similarity: cluster.similarity_scores.reduce((a, b) => a + b, 0) / cluster.similarity_scores.length
  }));
}
