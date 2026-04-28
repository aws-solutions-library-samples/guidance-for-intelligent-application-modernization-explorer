/**
 * Component Similarities Lambda Function
 * 
 * Handles both:
 * - GET: Retrieval of component similarity results from DynamoDB
 * - POST: Triggering component similarity analysis step function
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
const COMP_SIM_STEP_FUNCTION_ARN = process.env.COMP_SIM_STEP_FUNCTION_ARN;

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
  console.log('🚀 Component Similarities Lambda started');
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
        result = await getComponentSimilarityResultsWithThreshold(projectId, threshold, corsHeaders);
      } else {
        console.log('📊 Using default threshold (70%)');
        result = await getComponentSimilarityResults(projectId, corsHeaders);
      }
    } else if (httpMethod === 'POST') {
      const requestData = body ? JSON.parse(body) : {};
      const { filters } = requestData;
      result = await triggerComponentSimilaritiesAnalysis(projectId, filters || {}, context, corsHeaders);
    } else if (httpMethod === 'DELETE') {
      result = await clearComponentSimilarityResults(projectId, corsHeaders);
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
    console.error('💥 Error in component similarities handler:', error);
    
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
  return `comp-sim-${timestamp}-${random}`;
}

/**
 * Get component similarities state machine ARN for a project
 */
function getComponentSimilaritiesStateMachineArn(projectId) {
  if (!COMP_SIM_STEP_FUNCTION_ARN) {
    throw new Error('COMP_SIM_STEP_FUNCTION_ARN environment variable is not set');
  }
  return COMP_SIM_STEP_FUNCTION_ARN.replace('{projectId}', projectId);
}

/**
 * Trigger component similarities analysis
 */
async function triggerComponentSimilaritiesAnalysis(projectId, filters, context, corsHeaders) {
  try {
    console.log(`🔄 Starting component similarities analysis for project: ${projectId}`);
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
        projectId,
        processType: 'COMP_SIMILARITY',
        processName: 'Component Similarity Analysis',
        status: 'INITIATED',
        startTime: processTimestamp,
        endTime: null,
        description: 'Component-level similarities analysis using distributed Step Functions',
        filters: filters || {},
        createdAt: processTimestamp,
        updatedAt: processTimestamp
      }
    }));
    
    console.log(`✅ Created component similarities process tracking record: ${processId}`);
    
    // Get the component similarities state machine ARN
    const componentSimilaritiesStateMachineArn = getComponentSimilaritiesStateMachineArn(projectId);
    
    // Prepare Step Function input
    const stepFunctionInput = {
      projectId,
      processId,
      processTableName: processTableName,
      analysisType: 'component-similarities',
      filters: {
        minSimilarityScore: filters?.minSimilarityScore || 0.7,
        includeRuntimes: filters?.includeRuntimes !== false,
        includeFrameworks: filters?.includeFrameworks !== false,
        includeDatabases: filters?.includeDatabases !== false,
        includeIntegrations: filters?.includeIntegrations !== false,
        includeStorages: filters?.includeStorages !== false,
        applicationFilter: filters?.applicationFilter || 'all',
        componentTypeFilter: filters?.componentTypeFilter || 'all'
      },
      triggeredBy: 'component-similarities-lambda',
      processTimestamp: processTimestamp,
      timestamp: processTimestamp
    };
    
    console.log('🔄 Starting Component Similarity Step Function execution with input:', stepFunctionInput);
    console.log('🎯 Step Function ARN:', componentSimilaritiesStateMachineArn);
    
    // Start Component Similarity Step Function execution
    const executionResult = await stepfunctions.send(new StartExecutionCommand({
      stateMachineArn: componentSimilaritiesStateMachineArn,
      name: `comp-similarity-${processId}`,
      input: JSON.stringify(stepFunctionInput)
    }));
    
    console.log('✅ Component Similarity Step Function execution started:', executionResult.executionArn);
    
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
        ':stage': 'component-similarity-step-function-started'
      }
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        processId,
        executionArn: executionResult.executionArn,
        message: 'Component similarities analysis started successfully',
        analysisType: 'component-similarities'
      })
    };
    
  } catch (error) {
    console.error('💥 Error triggering component similarities analysis:', error);
    
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
async function getComponentSimilarityResults(projectId, corsHeaders) {
  try {
    const tableName = `app-modex-comp-sim-${projectId}`.toLowerCase();
    
    console.log(`📊 Querying DynamoDB table: ${tableName}`);
    
    const params = {
      TableName: tableName
    };
    
    const result = await dynamodb.send(new ScanCommand(params));
    
    if (!result.Items || result.Items.length === 0) {
      console.log('📭 No component similarity results found - returning empty recordset');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          results: {
            totalComponents: 0,
            similarPairs: 0,
            components: [],
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
      console.log('📭 Component similarity results table not found - returning empty recordset');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          results: {
            totalComponents: 0,
            similarPairs: 0,
            components: [],
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
 * Get component similarity results from DynamoDB with custom threshold
 */
async function getComponentSimilarityResultsWithThreshold(projectId, threshold, corsHeaders) {
  try {
    const tableName = `app-modex-comp-sim-${projectId}`.toLowerCase();
    
    console.log(`📊 Querying DynamoDB table: ${tableName} with threshold: ${threshold}`);
    
    const params = {
      TableName: tableName
    };
    
    const result = await dynamodb.send(new ScanCommand(params));
    
    if (!result.Items || result.Items.length === 0) {
      console.log('📭 No component similarity results found - returning empty recordset');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          results: {
            totalComponents: 0,
            similarPairs: 0,
            components: [],
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
      console.log('📭 Component similarity results table not found - returning empty recordset');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          results: {
            totalComponents: 0,
            similarPairs: 0,
            components: [],
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
    
    const results = {
      totalComponents: components.length,
      similarPairs: similarityMatrix.length,
      components: components,
      similarityMatrix: similarityMatrix,
      clusters: clusters
    };
    
    console.log(`✅ Processed results:`, {
      totalComponents: results.totalComponents,
      similarPairs: results.similarPairs,
      clustersCount: results.clusters.length
    });
    
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
    
    const results = {
      totalComponents: components.length,
      similarPairs: similarityMatrix.length,
      components: components,
      similarityMatrix: similarityMatrix,
      clusters: clusters,
      threshold: threshold
    };
    
    console.log(`✅ Processed results with ${threshold * 100}% threshold:`, {
      totalComponents: results.totalComponents,
      similarPairs: results.similarPairs,
      clustersCount: results.clusters.length
    });
    
    return results;
    
  } catch (error) {
    console.error('Error processing raw similarity data with threshold:', error);
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
 * Clear component similarity results from DynamoDB
 */
async function clearComponentSimilarityResults(projectId, corsHeaders) {
  try {
    const similarityTableName = `app-modex-comp-sim-${projectId}`.toLowerCase();
    const clustersTableName = `app-modex-comp-clusters-${projectId}`.toLowerCase();
    const patternsTableName = `app-modex-comp-patterns-${projectId}`.toLowerCase();
    
    console.log(`🗑️ Clearing component similarity results for project: ${projectId}`);
    console.log(`   Similarity table: ${similarityTableName}`);
    console.log(`   Clusters table: ${clustersTableName}`);
    console.log(`   Patterns table: ${patternsTableName}`);
    
    let deletedSimilarities = 0;
    let deletedClusters = 0;
    let deletedPatterns = 0;
    
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
                component_id: item.component_id,
                similar_component_id: item.similar_component_id
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
    
    // Delete all records from patterns table
    try {
      console.log(`📊 Scanning patterns table: ${patternsTableName}`);
      const patternRecords = await dynamodb.send(new ScanCommand({
        TableName: patternsTableName
      }));
      
      if (patternRecords.Items && patternRecords.Items.length > 0) {
        console.log(`🔄 Found ${patternRecords.Items.length} pattern records to delete`);
        
        // Delete in batches of 25 (DynamoDB limit)
        for (let i = 0; i < patternRecords.Items.length; i += 25) {
          const batch = patternRecords.Items.slice(i, i + 25);
          
          const deleteRequests = batch.map(item => ({
            DeleteRequest: {
              Key: {
                pattern_id: item.pattern_id
              }
            }
          }));
          
          await dynamodb.send(new BatchWriteCommand({
            RequestItems: {
              [patternsTableName]: deleteRequests
            }
          }));
          
          deletedPatterns += deleteRequests.length;
          console.log(`   ✅ Deleted batch ${Math.floor(i / 25) + 1}: ${deleteRequests.length} records`);
        }
      } else {
        console.log(`📭 No pattern records found to delete`);
      }
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`⚠️ Patterns table not found: ${patternsTableName}`);
      } else {
        throw error;
      }
    }
    
    console.log(`✅ Successfully cleared component similarity results`);
    console.log(`   📊 Deleted ${deletedSimilarities} similarity records`);
    console.log(`   📊 Deleted ${deletedClusters} cluster records`);
    console.log(`   📊 Deleted ${deletedPatterns} pattern records`);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Component similarity results cleared successfully',
        deletedSimilarities,
        deletedClusters,
        deletedPatterns,
        projectId
      })
    };
    
  } catch (error) {
    console.error('💥 Error clearing component similarity results:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to clear component similarity results'
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
