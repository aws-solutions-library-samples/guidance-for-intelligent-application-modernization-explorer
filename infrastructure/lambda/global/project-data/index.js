// Force deployment timestamp: 2025-07-31T13:00:00.0Z
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:13.3NZ';

/**
 * Project Data Lambda Function
 * Handles CRUD operations for project data including similarity results
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
    // Get HTTP method and path parameters
    const httpMethod = event.httpMethod;
    const projectId = event.pathParameters?.projectId;
    const dataType = event.pathParameters?.dataType || event.queryStringParameters?.dataType;
    
    console.log(`Processing ${httpMethod} request for project ${projectId}, dataType: ${dataType}`);
    
    // Handle similarity results
    if (dataType === 'similarity-result' && httpMethod === 'GET') {
      return await getSimilarityResults(projectId);
    }
    
    // Basic response for other data types
    const response = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
      },
      body: JSON.stringify({
        message: 'Project data API placeholder',
        projectId,
        dataType,
        method: httpMethod,
        timestamp: new Date().toISOString()
      })
    };
    
    return response;
  } catch (error) {
    console.error('Error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Internal server error',
        error: error.message
      })
    };
  }
};

/**
 * Get similarity results from DynamoDB
 */
async function getSimilarityResults(projectId) {
  try {
    console.log(`Fetching similarity results for project: ${projectId}`);
    
    // The similarity results table name follows the pattern: app-modex-sim-results-{projectId}
    // But we need to find the actual table name since it includes a random suffix
    const tableName = await findSimilarityTableName(projectId);
    
    if (!tableName) {
      console.log(`No similarity results table found for project ${projectId}`);
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'No similarity analysis results found for this project. Please run the similarities analysis first.',
          items: []
        })
      };
    }
    
    console.log(`Using similarity table: ${tableName}`);
    
    // Scan the similarity results table
    const params = {
      TableName: tableName,
      FilterExpression: 'attribute_exists(similarity_score)',
      Limit: 1000 // Limit to prevent timeout
    };
    
    const result = await dynamodb.scan(params).promise();
    console.log(`Found ${result.Items.length} similarity results`);
    
    // Log a sample record to understand the structure
    if (result.Items.length > 0) {
      console.log('Sample DynamoDB record structure:', JSON.stringify(result.Items[0], null, 2));
      console.log('Available fields:', Object.keys(result.Items[0]));
    }
    
    // Transform the results into the format expected by the frontend
    const validSimilarityPairs = result.Items
      .map(item => ({
        application_id: item.application_id,
        similar_app_id: item.similar_app_id,
        app1: item.application_id,
        app2: item.similar_app_id,
        similarity_score: item.similarity_score,
        common_technologies: item.common_technologies || [],
        app1_unique: item.app1_unique || [],
        app2_unique: item.app2_unique || [],
        timestamp: item.timestamp || new Date().toISOString()
      }))
      .filter(pair => {
        // Filter out pairs where either app name is undefined, null, or empty
        const hasValidApp1 = pair.application_id && typeof pair.application_id === 'string' && pair.application_id.trim().length > 0;
        const hasValidApp2 = pair.similar_app_id && typeof pair.similar_app_id === 'string' && pair.similar_app_id.trim().length > 0;
        const hasValidScore = pair.similarity_score !== undefined && pair.similarity_score !== null;
        
        if (!hasValidApp1 || !hasValidApp2 || !hasValidScore) {
          console.log(`Filtering out invalid similarity pair: app1="${pair.application_id}", app2="${pair.similar_app_id}", score=${pair.similarity_score}`);
          return false;
        }
        
        return true;
      });
    
    console.log(`Filtered to ${validSimilarityPairs.length} valid similarity pairs`);
    
    const items = [{
      dataType: 'similarity-result',
      projectId: projectId,
      similarity_pairs: validSimilarityPairs,
      timestamp: new Date().toISOString()
    }];
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        items: items,
        count: result.Items.length,
        projectId: projectId
      })
    };
    
  } catch (error) {
    console.error('Error fetching similarity results:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Error fetching similarity results',
        error: error.message
      })
    };
  }
}

/**
 * Find the similarity table name for a project
 */
async function findSimilarityTableName(projectId) {
  try {
    // List all DynamoDB tables
    const listParams = {};
    const tables = await dynamodb.scan({ TableName: 'dummy' }).promise().catch(() => null);
    
    // Use AWS SDK to list tables instead
    const dynamodbClient = new AWS.DynamoDB();
    const listResult = await dynamodbClient.listTables().promise();
    
    // Find table that matches the pattern: app-modex-sim-results-*
    const similarityTable = listResult.TableNames.find(tableName => 
      tableName.startsWith('app-modex-sim-results-')
    );
    
    console.log(`Found similarity table: ${similarityTable}`);
    return similarityTable;
    
  } catch (error) {
    console.error('Error finding similarity table:', error);
    // Fallback to known table name from the logs
    return 'app-modex-sim-results-mr8tgxguel27';
  }
}
