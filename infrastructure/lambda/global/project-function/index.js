// Force deployment timestamp: 2025-10-27T12:49:11.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:57.3NZ';

/**
 * Project-specific Lambda Function
 * Handles operations specific to a single project
 */

const AWS = require('aws-sdk');

// Initialize AWS clients
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

// Environment variables
const PROJECT_ID = process.env.PROJECT_ID;
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;
const PROJECT_DATA_TABLE = process.env.PROJECT_DATA_TABLE;
const PROJECT_BUCKET = process.env.PROJECT_BUCKET;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  try {
    // Get project details
    const project = await getProject();
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Project function executed successfully',
        projectId: PROJECT_ID,
        projectName: project?.name || 'Unknown',
        projectStatus: project?.status || 'Unknown',
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

/**
 * Get project details from DynamoDB
 */
async function getProject() {
  try {
    const params = {
      TableName: PROJECTS_TABLE,
      Key: { projectId: PROJECT_ID }
    };
    
    const result = await dynamodb.get(params).promise();
    return result.Item;
  } catch (error) {
    console.error('Error getting project:', error);
    throw error;
  }
}
