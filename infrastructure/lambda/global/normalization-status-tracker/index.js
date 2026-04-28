// Force deployment timestamp: 2026-01-30T00:00:00.000Z
const DEPLOYMENT_TIMESTAMP = '2026-01-30T00:00:00.000Z';

/**
 * Normalization Status Tracker Lambda Function
 * 
 * Updates process tracking status at each Step Function state.
 * Provides granular status updates for monitoring and debugging.
 * 
 * IAM Permissions (Least Privilege):
 * - DynamoDB: UpdateItem, GetItem on app-modex-process-{projectId} tables only
 * - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Update process tracking status
 */
async function updateProcessTracking(projectId, processId, status, metadata = {}, errorDetails = null) {
  const tableName = `app-modex-process-${projectId}`.toLowerCase();
  const timestamp = new Date().toISOString();
  
  console.log(`📊 Updating process tracking: ${processId} → ${status}`);
  
  try {
    // Get current process record
    const getResult = await dynamodb.send(new GetCommand({
      TableName: tableName,
      Key: { processId }
    }));
    
    if (!getResult.Item) {
      console.warn(`⚠️ Process ${processId} not found in table ${tableName}`);
      return {
        success: false,
        message: `Process ${processId} not found`
      };
    }
    
    // Build update expression
    let updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
    const expressionAttributeNames = { '#status': 'status' };
    const expressionAttributeValues = {
      ':status': status,
      ':updatedAt': timestamp
    };
    
    // Add metadata updates if provided
    if (metadata && Object.keys(metadata).length > 0) {
      Object.keys(metadata).forEach(key => {
        updateExpression += `, #${key} = :${key}`;
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = metadata[key];
      });
    }
    
    // Add completion timestamp if status is COMPLETED or FAILED
    if (status === 'COMPLETED' || status === 'FAILED') {
      updateExpression += ', endTime = :endTime';
      expressionAttributeValues[':endTime'] = timestamp;
      
      // Calculate duration
      if (getResult.Item.startTime) {
        const duration = (new Date(timestamp) - new Date(getResult.Item.startTime)) / 1000;
        updateExpression += ', #duration = :duration';
        expressionAttributeNames['#duration'] = 'duration';
        expressionAttributeValues[':duration'] = duration;
      }
    }
    
    // Add error details if provided
    if (errorDetails) {
      updateExpression += ', errorMessage = :errorMessage';
      expressionAttributeValues[':errorMessage'] = 
        typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails);
    }
    
    // Update the record
    await dynamodb.send(new UpdateCommand({
      TableName: tableName,
      Key: { processId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }));
    
    console.log(`✅ Process tracking updated successfully: ${status}`);
    
    return {
      success: true,
      processId,
      status,
      timestamp
    };
    
  } catch (error) {
    console.error('❌ Error updating process tracking:', error);
    throw error;
  }
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  console.log('📊 Normalization Status Tracker Lambda started');
  console.log('📋 Event:', JSON.stringify(event, null, 2));
  
  const { projectId, processId, status, metadata, errorDetails } = event;
  
  // Validate required parameters
  if (!projectId || !processId || !status) {
    throw new Error('Missing required parameters: projectId, processId, status');
  }
  
  // Validate status value
  const validStatuses = ['INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }
  
  try {
    const result = await updateProcessTracking(
      projectId,
      processId,
      status,
      metadata,
      errorDetails
    );
    
    return {
      statusCode: 200,
      ...result,
      ...event // Pass through all event data
    };
    
  } catch (error) {
    console.error('❌ Error in status tracker:', error);
    throw error;
  }
};
