// Force deployment timestamp: 2026-01-30T00:00:00.000Z
const DEPLOYMENT_TIMESTAMP = '2026-01-30T00:00:00.000Z';

/**
 * Normalization DLQ Processor Lambda Function
 * 
 * Processes messages from the Dead Letter Queue.
 * Attempts recovery or alerts operations team for manual intervention.
 * 
 * IAM Permissions (Least Privilege):
 * - SQS: ReceiveMessage, DeleteMessage on normalization DLQ only
 * - DynamoDB: UpdateItem on app-modex-process-{projectId} tables only
 * - SNS: Publish to alert topic only
 * - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
 */

const { SQSClient, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const sqsClient = new SQSClient({});
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

// Environment variables
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN;

/**
 * Parse DLQ message
 */
function parseDLQMessage(record) {
  try {
    const body = JSON.parse(record.body);
    return {
      timestamp: body.timestamp,
      event: body.event,
      error: body.error,
      source: body.source,
      receiptHandle: record.receiptHandle
    };
  } catch (error) {
    console.error('❌ Error parsing DLQ message:', error);
    return null;
  }
}

/**
 * Update process tracking with DLQ information
 */
async function updateProcessWithDLQInfo(projectId, processId, errorInfo) {
  const tableName = `app-modex-process-${projectId}`.toLowerCase();
  const timestamp = new Date().toISOString();
  
  console.log(`📊 Updating process ${processId} with DLQ information`);
  
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: tableName,
      Key: { processId },
      UpdateExpression: 'SET dlqProcessedAt = :dlqProcessedAt, dlqAttempts = if_not_exists(dlqAttempts, :zero) + :one',
      ExpressionAttributeValues: {
        ':dlqProcessedAt': timestamp,
        ':zero': 0,
        ':one': 1
      }
    }));
    
    console.log(`✅ Process tracking updated with DLQ info`);
    
  } catch (error) {
    console.error('❌ Error updating process tracking:', error);
    // Don't throw - we still want to send alert
  }
}

/**
 * Send alert to operations team
 */
async function sendAlert(message) {
  if (!ALERT_TOPIC_ARN) {
    console.warn('⚠️ ALERT_TOPIC_ARN not configured, skipping alert');
    return;
  }
  
  console.log(`📧 Sending alert to SNS topic: ${ALERT_TOPIC_ARN}`);
  
  try {
    const alertMessage = {
      timestamp: new Date().toISOString(),
      severity: 'HIGH',
      component: 'Normalization Workflow',
      message: 'Normalization process failed and requires manual intervention',
      details: message
    };
    
    await snsClient.send(new PublishCommand({
      TopicArn: ALERT_TOPIC_ARN,
      Subject: '🚨 AppModEx: Normalization Failure - Manual Intervention Required',
      Message: JSON.stringify(alertMessage, null, 2)
    }));
    
    console.log(`✅ Alert sent successfully`);
    
  } catch (error) {
    console.error('❌ Error sending alert:', error);
    // Don't throw - we've already logged the error
  }
}

/**
 * Determine if error is recoverable
 */
function isRecoverable(errorInfo) {
  const recoverableErrors = [
    'ThrottlingException',
    'ServiceUnavailable',
    'RequestTimeout',
    'TooManyRequestsException'
  ];
  
  return recoverableErrors.some(err => 
    errorInfo.type.includes(err) || errorInfo.message.includes(err)
  );
}

/**
 * Process a single DLQ message
 */
async function processDLQMessage(message) {
  console.log('🔄 Processing DLQ message...');
  
  const { event, error, timestamp, receiptHandle } = message;
  const { projectId, processId, s3Key, filename } = event;
  
  console.log(`📋 Message details:`);
  console.log(`   Project ID: ${projectId}`);
  console.log(`   Process ID: ${processId}`);
  console.log(`   File: ${filename}`);
  console.log(`   Error Type: ${error.type}`);
  console.log(`   Error Message: ${error.message}`);
  console.log(`   Original Timestamp: ${timestamp}`);
  
  // Update process tracking
  await updateProcessWithDLQInfo(projectId, processId, error);
  
  // Check if error is recoverable
  const recoverable = isRecoverable(error);
  
  if (recoverable) {
    console.log('♻️ Error appears recoverable - consider retry logic');
    // TODO: Implement retry logic here if needed
    // For now, just alert operations team
  } else {
    console.log('❌ Error is not recoverable - manual intervention required');
  }
  
  // Send alert to operations team
  await sendAlert({
    projectId,
    processId,
    filename,
    s3Key,
    errorType: error.type,
    errorMessage: error.message,
    recoverable,
    timestamp
  });
  
  console.log('✅ DLQ message processed');
}

/**
 * Main handler function (triggered by SQS event)
 */
exports.handler = async (event) => {
  console.log('🔄 Normalization DLQ Processor Lambda started');
  console.log('📋 Event:', JSON.stringify(event, null, 2));
  
  // Process each SQS record
  const results = [];
  
  for (const record of event.Records) {
    try {
      const message = parseDLQMessage(record);
      
      if (!message) {
        console.error('❌ Failed to parse DLQ message, skipping');
        continue;
      }
      
      await processDLQMessage(message);
      
      results.push({
        messageId: record.messageId,
        status: 'processed'
      });
      
    } catch (error) {
      console.error('❌ Error processing DLQ message:', error);
      
      results.push({
        messageId: record.messageId,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  console.log(`✅ Processed ${results.length} DLQ messages`);
  console.log('Results:', JSON.stringify(results, null, 2));
  
  return {
    statusCode: 200,
    processedCount: results.filter(r => r.status === 'processed').length,
    failedCount: results.filter(r => r.status === 'failed').length,
    results
  };
};
