// Force deployment timestamp: 2025-08-06T19:57:05.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:56.3NZ';

/**
 * Step Function Trigger Lambda Function
 * 
 * This function receives SQS messages from various sources and routes them
 * to the appropriate Step Functions:
 * - Normalization messages → Normalization Step Function
 * - Skill Importance messages → Project-specific Skill Importance Step Function
 */

const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const stepfunctions = new SFNClient({});
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN; // Normalization Step Function
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;
const PROJECT_DATA_TABLE = process.env.PROJECT_DATA_TABLE;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';
const REGION = process.env.REGION || process.env.AWS_REGION;
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;

/**
 * Update process tracking record to PROCESSING status
 */
async function updateProcessTrackingRecord(projectId, processId, processTimestamp, dataSourceId, filename) {
  try {
    const now = new Date().toISOString();
    const processTableName = `app-modex-process-${projectId}`.toLowerCase();
    
    await dynamodb.send(new UpdateCommand({
      TableName: processTableName,
      Key: { 
        processId // FIXED: Only use processId (no timestamp in key)
      },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, metadata.stage = :stage',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'PROCESSING',
        ':updatedAt': now,
        ':stage': 'step-function-started'
      }
    }));
    
    console.log(`✅ Updated process tracking record: ${processId} to PROCESSING`);
  } catch (error) {
    console.error('❌ Error updating process tracking record:', error);
    throw error;
  }
}

/**
 * Route message to appropriate Step Function based on message type
 */
async function routeMessage(message) {
  const { messageType, projectId } = message;
  
  console.log(`🔀 Routing message type: ${messageType} for project: ${projectId}`);
  
  switch (messageType) {
    case 'NORMALIZATION':
      return await handleNormalizationMessage(message);
    case 'SKILL_IMPORTANCE':
      return await handleSkillImportanceMessage(message);
    default:
      throw new Error(`Unknown message type: ${messageType}`);
  }
}

/**
 * Handle normalization messages (existing logic)
 */
async function handleNormalizationMessage(message) {
  const { projectId, dataSourceId, s3Key, filename, processId, processTimestamp } = message;
  
  // Validate required fields for normalization
  if (!projectId || !dataSourceId || !s3Key || !filename || !processId || !processTimestamp) {
    throw new Error('Missing required fields for normalization message');
  }
  
  // Update process tracking record to PROCESSING
  await updateProcessTrackingRecord(projectId, processId, processTimestamp, dataSourceId, filename);
  
  // Prepare Step Function input
  const stepFunctionInput = {
    projectId,
    dataSourceId,
    s3Key,
    filename,
    processId,
    originalTimestamp: processTimestamp
  };
  
  console.log('🔄 Starting Normalization Step Function execution with input:', stepFunctionInput);
  
  // Start Normalization Step Function execution
  const executionResult = await stepfunctions.send(new StartExecutionCommand({
    stateMachineArn: STATE_MACHINE_ARN,
    name: `genai-norm-${processId}`,
    input: JSON.stringify(stepFunctionInput)
  }));
  
  console.log('✅ Normalization Step Function execution started:', executionResult.executionArn);
  
  return {
    type: 'normalization',
    executionArn: executionResult.executionArn,
    processId
  };
}

/**
 * Handle skill importance messages (new logic)
 */
async function handleSkillImportanceMessage(message) {
  const { projectId, processId, processTimestamp, triggeredBy } = message;
  
  // Validate required fields for skill importance
  if (!projectId || !processId || !processTimestamp) {
    throw new Error('Missing required fields for skill importance message');
  }
  
  // Construct project-specific skill importance Step Function ARN
  const skillImportanceStepFunctionArn = `arn:aws:states:${REGION}:${ACCOUNT_ID}:stateMachine:app-modex-skill-importance-${projectId.toLowerCase()}`;
  
  // Update process tracking record to PROCESSING
  await updateSkillImportanceProcessTracking(projectId, processId, processTimestamp);
  
  // Prepare Step Function input
  const stepFunctionInput = {
    projectId,
    processId,
    processTableName: `app-modex-process-${projectId}`.toLowerCase(),
    triggeredBy: triggeredBy || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  console.log('🔄 Starting Skill Importance Step Function execution with input:', stepFunctionInput);
  console.log('🎯 Step Function ARN:', skillImportanceStepFunctionArn);
  
  // Start Skill Importance Step Function execution
  const executionResult = await stepfunctions.send(new StartExecutionCommand({
    stateMachineArn: skillImportanceStepFunctionArn,
    name: `skill-importance-${processId}`,
    input: JSON.stringify(stepFunctionInput)
  }));
  
  console.log('✅ Skill Importance Step Function execution started:', executionResult.executionArn);
  
  return {
    type: 'skill_importance',
    executionArn: executionResult.executionArn,
    processId
  };
}

/**
 * Update process tracking for skill importance
 */
async function updateSkillImportanceProcessTracking(projectId, processId, processTimestamp) {
  try {
    const now = new Date().toISOString();
    const processTableName = `app-modex-process-${projectId}`.toLowerCase();
    
    await dynamodb.send(new UpdateCommand({
      TableName: processTableName,
      Key: { 
        processId
      },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, metadata.stage = :stage',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'PROCESSING',
        ':updatedAt': now,
        ':stage': 'skill-importance-step-function-started'
      }
    }));
    
    console.log(`✅ Updated skill importance process tracking record: ${processId} to PROCESSING`);
  } catch (error) {
    console.error('❌ Error updating skill importance process tracking record:', error);
    throw error;
  }
}





/**
 * Main Lambda handler
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('🚀 Step Function Trigger Lambda started');
  console.log('📋 Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  const results = [];
  
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      console.log('📁 Processing trigger message:', message);
      
      // Route message based on type
      const result = await routeMessage(message);
      
      results.push({
        messageId: record.messageId,
        status: 'success',
        ...result
      });
      
    } catch (error) {
      console.error('💥 Error processing message:', error);
      
      // Update process tracking to FAILED if we have the processId
      try {
        const message = JSON.parse(record.body);
        if (message.processId && message.projectId) {
          const processTableName = `app-modex-process-${message.projectId}`.toLowerCase();
          const now = new Date().toISOString();
          
          await dynamodb.send(new UpdateCommand({
            TableName: processTableName,
            Key: { 
              processId: message.processId
            },
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage, stage = :stage',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':status': 'FAILED',
              ':updatedAt': now,
              ':errorMessage': error.message,
              ':stage': 'step-function-trigger-failed'
            }
          }));
          
          console.log(`❌ Updated process ${message.processId} status to FAILED`);
        }
      } catch (updateError) {
        console.error('💥 Error updating process status to FAILED:', updateError);
      }
      
      results.push({
        messageId: record.messageId,
        status: 'error',
        error: error.message
      });
    }
  }
  
  console.log('🎉 Step Function Trigger Lambda completed');
  console.log('📊 Results:', results);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ 
      message: 'Step Function triggers processed', 
      results 
    })
  };
};
