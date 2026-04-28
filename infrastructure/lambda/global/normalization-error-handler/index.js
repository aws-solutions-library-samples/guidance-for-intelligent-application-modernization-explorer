// Force deployment timestamp: 2026-01-30T00:00:00.000Z
const DEPLOYMENT_TIMESTAMP = '2026-01-30T00:00:00.000Z';

/**
 * Normalization Error Handler Lambda Function
 * 
 * Centralized error handling for Step Function failures.
 * Logs errors, updates process tracking, and sends to DLQ for recovery.
 * 
 * IAM Permissions (Least Privilege):
 * - DynamoDB: UpdateItem on app-modex-process-{projectId} tables only
 * - SQS: SendMessage to normalization DLQ only
 * - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});

// Environment variables
const NORMALIZATION_DLQ_URL = process.env.NORMALIZATION_DLQ_URL;

/**
 * Extract error information from Step Function error
 */
function extractErrorInfo(error) {
  if (typeof error === 'string') {
    return {
      message: error,
      type: 'UnknownError'
    };
  }
  
  return {
    message: error.Error || error.message || 'Unknown error',
    type: error.Cause || error.name || 'UnknownError',
    details: error
  };
}

/**
 * Update process tracking to FAILED status
 */
async function updateProcessToFailed(projectId, processId, errorInfo) {
  const tableName = `app-modex-process-${projectId}`.toLowerCase();
  const timestamp = new Date().toISOString();
  
  console.log(`📊 Updating process ${processId} to FAILED status`);
  
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: tableName,
      Key: { processId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, endTime = :endTime, errorMessage = :errorMessage, errorType = :errorType',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'FAILED',
        ':updatedAt': timestamp,
        ':endTime': timestamp,
        ':errorMessage': errorInfo.message,
        ':errorType': errorInfo.type
      }
    }));
    
    console.log(`✅ Process tracking updated to FAILED`);
    
  } catch (error) {
    console.error('❌ Error updating process tracking:', error);
    // Don't throw - we still want to send to DLQ
  }
}

/**
 * Send error to DLQ for potential recovery
 */
async function sendToDLQ(event, errorInfo) {
  if (!NORMALIZATION_DLQ_URL) {
    console.warn('⚠️ NORMALIZATION_DLQ_URL not configured, skipping DLQ');
    return;
  }
  
  console.log(`📤 Sending error to DLQ: ${NORMALIZATION_DLQ_URL}`);
  
  try {
    const message = {
      timestamp: new Date().toISOString(),
      event,
      error: errorInfo,
      source: 'normalization-error-handler'
    };
    
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: NORMALIZATION_DLQ_URL,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        errorType: {
          DataType: 'String',
          StringValue: errorInfo.type
        },
        projectId: {
          DataType: 'String',
          StringValue: event.projectId || 'unknown'
        },
        processId: {
          DataType: 'String',
          StringValue: event.processId || 'unknown'
        }
      }
    }));
    
    console.log(`✅ Error sent to DLQ successfully`);
    
  } catch (error) {
    console.error('❌ Error sending to DLQ:', error);
    // Don't throw - we've already logged the error
  }
}

/**
 * Log error details for CloudWatch
 */
function logErrorDetails(event, errorInfo) {
  console.error('❌ ========== NORMALIZATION ERROR ==========');
  console.error('Error Type:', errorInfo.type);
  console.error('Error Message:', errorInfo.message);
  console.error('Project ID:', event.projectId);
  console.error('Process ID:', event.processId);
  console.error('S3 Key:', event.s3Key);
  console.error('Filename:', event.filename);
  console.error('Full Error Details:', JSON.stringify(errorInfo.details, null, 2));
  console.error('Full Event:', JSON.stringify(event, null, 2));
  console.error('==========================================');
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  console.log('🚨 Normalization Error Handler Lambda started');
  console.log('📋 Event:', JSON.stringify(event, null, 2));
  
  const { projectId, processId, error } = event;
  
  // Validate required parameters
  if (!projectId || !processId) {
    console.error('❌ Missing required parameters: projectId or processId');
    return {
      statusCode: 400,
      message: 'Missing required parameters'
    };
  }
  
  try {
    // Extract error information
    const errorInfo = extractErrorInfo(error);
    
    // Log error details
    logErrorDetails(event, errorInfo);
    
    // Update process tracking to FAILED
    await updateProcessToFailed(projectId, processId, errorInfo);
    
    // Send to DLQ for potential recovery
    await sendToDLQ(event, errorInfo);
    
    console.log('✅ Error handling complete');
    
    return {
      statusCode: 200,
      message: 'Error handled successfully',
      projectId,
      processId,
      errorType: errorInfo.type,
      errorMessage: errorInfo.message
    };
    
  } catch (handlerError) {
    console.error('❌ Error in error handler (meta-error):', handlerError);
    
    // Last resort: just log and return
    return {
      statusCode: 500,
      message: 'Error handler failed',
      error: handlerError.message
    };
  }
};
