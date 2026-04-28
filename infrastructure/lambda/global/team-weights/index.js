// Force deployment timestamp: 2026-02-03T11:00:00.000Z
const DEPLOYMENT_TIMESTAMP = '2026-02-03T11:00:00.000Z';

const AWS = require('aws-sdk');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { sanitizeEvent, logger } = require('app-modex-shared');

const s3 = new AWS.S3();
const stepfunctions = new SFNClient({});
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const DATA_BUCKET_PREFIX = process.env.DATA_BUCKET_PREFIX || 'app-modex-data-';
const REGION = process.env.AWS_REGION || process.env.REGION;
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;

/**
 * Lambda function to save team skill category weights to S3
 */
exports.handler = async (event) => {
  logger.info('Team weights request received');
  logger.debug('Event details', sanitizeEvent(event));
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    logger.debug('Handling CORS preflight request');
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }

  try {
    const { projectId, teams, updatedBy } = JSON.parse(event.body);
    
    // Validate required fields
    if (!projectId) {
      throw new Error('Project ID is required');
    }
    
    if (!teams || !Array.isArray(teams)) {
      throw new Error('Teams array is required');
    }
    
    // Validate each team's weights
    for (const team of teams) {
      if (!team.teamName) {
        throw new Error('Team name is required for all teams');
      }
      
      const totalWeight = Object.values(team.weights || {}).reduce((sum, weight) => {
        return sum + (parseFloat(weight) || 0);
      }, 0);
      
      if (totalWeight > 100) {
        throw new Error(`Team "${team.teamName}" has total weight of ${totalWeight}% which exceeds 100%`);
      }
    }
    
    // Create the weights data structure as CSV rows
    const csvRows = [];
    // Use Unix timestamp (seconds since epoch) for better Athena compatibility
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Add header row
    csvRows.push('projectId,teamName,category,weight,lastUpdated,updatedBy,version');
    
    // Add data rows - one row per team-category combination
    teams.forEach(team => {
      let processedWeights = {};
      
      if (team.weights) {
        if (typeof team.weights === 'string') {
          try {
            processedWeights = JSON.parse(team.weights);
          } catch (e) {
            logger.warn(`Could not parse weights for team ${team.teamName}, using empty object`);
            processedWeights = {};
          }
        } else if (typeof team.weights === 'object') {
          // Filter out any non-numeric values or strange keys
          Object.entries(team.weights).forEach(([key, value]) => {
            // Skip keys that are numeric indices or special characters
            if (!/^\d+$/.test(key) && key !== '{' && key !== '}') {
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                processedWeights[key] = numValue;
              }
            }
          });
        }
      }
      
      // Create a row for each category weight
      Object.entries(processedWeights).forEach(([category, weight]) => {
        csvRows.push([
          projectId,
          team.teamName,
          category,
          weight,
          timestamp,
          updatedBy || 'unknown',
          1
        ].map(field => `"${field}"`).join(','));
      });
    });
    
    const csvContent = csvRows.join('\n') + '\n';
    
    // Save to S3 as CSV
    const bucketName = `${DATA_BUCKET_PREFIX}${projectId.toLowerCase()}`;
    const s3Key = `data-processed/team-category-weights/weights.csv`;
    
    logger.info(`Saving team weights to S3`, { bucket: bucketName, key: s3Key });
    
    await s3.putObject({
      Bucket: bucketName,
      Key: s3Key,
      Body: Buffer.from(csvContent, 'utf8'),
      ContentType: 'text/csv; charset=utf-8',
      Metadata: {
        'project-id': projectId,
        'updated-by': updatedBy || 'unknown',
        'team-count': teams.length.toString(),
        'total-rows': (csvRows.length - 1).toString() // Exclude header
      }
    }).promise();
    
    logger.info('Team weights saved successfully as CSV');
    
    // Trigger Skill Importance Scoring via Direct Step Function Invocation
    let skillImportanceScoringTriggered = false;
    let processId = null;
    let executionArn = null;
    
    try {
      logger.info('Triggering Skill Importance Scoring via Step Function');
      
      processId = `skill-importance-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const processTableName = `app-modex-process-${projectId}`.toLowerCase();
      const processTimestamp = new Date().toISOString();
      
      // Create process tracking record
      await dynamodb.send(new PutCommand({
        TableName: processTableName,
        Item: {
          processId,
          processName: 'Skill Importance Scoring',
          processType: 'GENAI-SKILL_IMPORTANCE',
          status: 'INITIATED',
          projectId,
          startTime: processTimestamp,
          updatedAt: processTimestamp,
          metadata: {
            teamCount: teams.length,
            s3Key,
            triggeredBy: updatedBy || 'unknown'
          },
          teamStatus: {}
        }
      }));
      
      logger.info(`Created process tracking record`, { processId });
      
      // Construct project-specific skill importance Step Function ARN
      const skillImportanceStepFunctionArn = `arn:aws:states:${REGION}:${ACCOUNT_ID}:stateMachine:app-modex-skill-importance-${projectId.toLowerCase()}`;
      
      // Prepare Step Function input
      const stepFunctionInput = {
        projectId,
        processId,
        processTableName,
        triggeredBy: updatedBy || 'unknown',
        timestamp: processTimestamp
      };
      
      logger.debug('Starting Skill Importance Step Function execution', { 
        arn: skillImportanceStepFunctionArn,
        input: stepFunctionInput 
      });
      
      // Update process status to PROCESSING
      await dynamodb.send(new UpdateCommand({
        TableName: processTableName,
        Key: { processId },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'PROCESSING',
          ':updatedAt': new Date().toISOString()
        }
      }));
      
      // Start Skill Importance Step Function execution
      const executionResult = await stepfunctions.send(new StartExecutionCommand({
        stateMachineArn: skillImportanceStepFunctionArn,
        name: `skill-importance-${processId}`,
        input: JSON.stringify(stepFunctionInput)
      }));
      
      executionArn = executionResult.executionArn;
      logger.info('Skill Importance Step Function execution started', { executionArn });
      skillImportanceScoringTriggered = true;
      
    } catch (error) {
      logger.error('Error triggering skill importance scoring', { error: error.message, stack: error.stack });
      
      // Update process status to FAILED
      if (processId) {
        try {
          const processTableName = `app-modex-process-${projectId}`.toLowerCase();
          await dynamodb.send(new UpdateCommand({
            TableName: processTableName,
            Key: { processId },
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':status': 'FAILED',
              ':updatedAt': new Date().toISOString(),
              ':errorMessage': error.message
            }
          }));
        } catch (updateError) {
          console.error('❌ Error updating process status to FAILED:', updateError);
        }
      }
      
      // Don't fail the request if trigger fails - weights are still saved
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Team weights saved successfully as CSV',
        data: {
          projectId,
          teamCount: teams.length,
          totalRows: csvRows.length - 1, // Exclude header
          lastUpdated: timestamp,
          s3Key,
          bucketName,
          format: 'CSV',
          skillImportanceScoringTriggered: skillImportanceScoringTriggered,
          processId: processId,
          executionArn: executionArn
        }
      })
    };
    
  } catch (error) {
    logger.error('Error saving team weights', { error: error.message, stack: error.stack });
    
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message,
        details: error.stack
      })
    };
  }
};
