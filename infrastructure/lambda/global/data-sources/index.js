// Force deployment timestamp: 2025-07-22T11:18:00.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:34.3NZ';

/**
 * Data Sources Lambda Function
 * Handles retrieving data sources from DynamoDB
 */

const AWS = require('aws-sdk');

// Initialize AWS clients
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Main handler function for data sources API
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  // Set up CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*', // Update with your domain in production
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,GET'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }
  
  try {
    // Get project ID from path parameters
    const projectId = event.pathParameters?.projectId;
    
    // Get data source type from query parameters (optional)
    const dataSourceType = event.queryStringParameters?.dataSourceType;
    
    // Validate project ID
    if (!projectId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing required parameter: projectId' 
        })
      };
    }
    
    // Get the table name from environment variables
    const tableName = `app-modex-data-sources-${projectId}`.toLowerCase();
    
    console.log(`🔍 Getting data sources from DynamoDB table: ${tableName}`);
    
    let params;
    
    if (dataSourceType) {
      // Query by data source type using the GSI
      params = {
        TableName: tableName,
        IndexName: 'dataSourceType-index',
        KeyConditionExpression: 'dataSourceType = :dataSourceType',
        ExpressionAttributeValues: {
          ':dataSourceType': dataSourceType
        }
      };
      
      console.log(`🔍 Filtering by data source type: ${dataSourceType}`);
    } else {
      // Query all data sources for the project
      params = {
        TableName: tableName,
        KeyConditionExpression: 'projectId = :projectId',
        ExpressionAttributeValues: {
          ':projectId': projectId
        }
      };
    }
    
    // Query DynamoDB
    const result = await dynamodb.query(params).promise();
    
    console.log(`✅ Retrieved ${result.Items?.length || 0} data sources`);
    
    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        items: result.Items || [],
        totalItems: result.Items?.length || 0
      })
    };
  } catch (error) {
    console.error('❌ Error retrieving data sources:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to retrieve data sources',
        details: error.toString()
      })
    };
  }
};