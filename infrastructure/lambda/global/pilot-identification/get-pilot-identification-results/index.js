// Force deployment timestamp: 2025-08-07T16:30:00.000Z
const DEPLOYMENT_TIMESTAMP = '2025-08-07T16:30:00.000Z';

/**
 * Get Pilot Identification Results Lambda Function
 * 
 * Simple project-based endpoint that returns pilot identification results
 * if they exist for the project. Scans the results table directly.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

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
  console.log('📊 Get Pilot Identification Results - Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
    // Extract project ID
    const projectId = getProjectIdFromEvent(event);
    if (!projectId) {
      return createResponse(400, {
        error: 'Project ID is required',
        message: 'Please provide a valid project ID'
      });
    }
    
    console.log('🔍 Looking for pilot identification results for project:', projectId);
    
    // Get results table name
    const normalizedProjectId = projectId.toLowerCase();
    const resultsTableName = `app-modex-pilot-results-${normalizedProjectId}`;
    
    console.log('📋 Scanning results table:', resultsTableName);
    
    try {
      // Scan the results table to find any results (regardless of jobId)
      const scanResult = await dynamodb.send(new ScanCommand({
        TableName: resultsTableName,
        // No filter needed - get all results from this project's table
      }));
      
      if (!scanResult.Items || scanResult.Items.length === 0) {
        console.log('📭 No pilot identification results found for project:', projectId);
        return createResponse(404, {
          error: 'No results found',
          message: 'No pilot identification results found for this project'
        });
      }
      
      console.log('✅ Found pilot identification results:', scanResult.Items.length, 'items');
      
      // Separate results by type
      const ruleBasedResults = [];
      const aiEnhancedResults = [];
      const consolidatedResults = [];
      
      console.log('🔍 Processing items from DynamoDB:');
      for (const item of scanResult.Items) {
        const resultType = item.resultType || 'UNKNOWN';
        console.log(`  - Item: ${item.applicationName}, resultType: ${resultType}, candidateId: ${item.candidateId}`);
        
        if (resultType === 'RULE_BASED') {
          ruleBasedResults.push(item);
        } else if (resultType === 'AI_ENHANCED') {
          aiEnhancedResults.push(item);
        } else if (resultType === 'CONSOLIDATED') {
          consolidatedResults.push(item);
        } else {
          console.warn(`⚠️ Unknown resultType: ${resultType} for ${item.applicationName}`);
        }
      }
      
      console.log(`📊 Results breakdown:`, {
        ruleBased: ruleBasedResults.length,
        aiEnhanced: aiEnhancedResults.length,
        consolidated: consolidatedResults.length,
        total: scanResult.Items.length
      });
      
      // Log sample items for debugging
      if (ruleBasedResults.length > 0) {
        console.log('📝 Sample rule-based result:', JSON.stringify(ruleBasedResults[0], null, 2));
      }
      if (aiEnhancedResults.length > 0) {
        console.log('📝 Sample AI-enhanced result:', JSON.stringify(aiEnhancedResults[0], null, 2));
      }
      if (consolidatedResults.length > 0) {
        console.log('📝 Sample consolidated result:', JSON.stringify(consolidatedResults[0], null, 2));
      }
      
      // Sort each result type by score (descending)
      const sortByScore = (a, b) => (b.score || 0) - (a.score || 0);
      ruleBasedResults.sort(sortByScore);
      aiEnhancedResults.sort(sortByScore);
      consolidatedResults.sort(sortByScore);
      
      const results = {
        success: true,
        ruleBased: ruleBasedResults,
        aiEnhanced: aiEnhancedResults,
        consolidated: consolidatedResults,
        metadata: {
          totalApplications: consolidatedResults.length,
          ruleBasedCount: ruleBasedResults.length,
          aiEnhancedCount: aiEnhancedResults.length,
          consolidatedCount: consolidatedResults.length,
          projectId: projectId,
          retrievedAt: new Date().toISOString()
        }
      };
      
      console.log('✅ Returning pilot identification results:', {
        ruleBasedCount: ruleBasedResults.length,
        aiEnhancedCount: aiEnhancedResults.length,
        consolidatedCount: consolidatedResults.length,
        projectId: projectId
      });
      
      return createResponse(200, {
        success: true,
        results: results
      });
      
    } catch (scanError) {
      console.error('❌ Error scanning results table:', scanError);
      
      // If table doesn't exist, return 404
      if (scanError.name === 'ResourceNotFoundException') {
        return createResponse(404, {
          error: 'No results found',
          message: 'No pilot identification results found for this project'
        });
      }
      
      throw scanError;
    }
    
  } catch (error) {
    console.error('❌ Error getting pilot identification results:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message
    });
  }
};
