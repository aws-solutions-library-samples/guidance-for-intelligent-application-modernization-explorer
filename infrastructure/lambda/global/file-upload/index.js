// Force deployment timestamp: 2025-07-23T17:00:00.0NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:31.3NZ';

/**
 * File Upload Lambda Function (CSV-Only)
 * Handles secure CSV file uploads to S3 and records metadata in DynamoDB
 * Now sends SQS messages to trigger data processing instead of relying on DynamoDB Streams
 * 
 * IMPORTANT: Only CSV files are supported. Other formats will be rejected.
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS clients
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();

// Environment variables
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;
// NOTE: Data processing queue URL is now project-specific and determined dynamically
// const DATA_PROCESSING_QUEUE_URL = process.env.DATA_PROCESSING_QUEUE_URL;

// Helper function to get project-specific SQS queue URL
const getProjectQueueUrl = async (projectId, queueType = 'data') => {
  try {
    const queueName = queueType === 'operations' 
      ? `app-modex-operations-${projectId}`.toLowerCase()
      : `app-modex-data-${projectId}`.toLowerCase();
    
    const result = await sqs.getQueueUrl({ QueueName: queueName }).promise();
    return result.QueueUrl;
  } catch (error) {
    console.error(`Error getting queue URL for project ${projectId}:`, error);
    throw new Error(`Project-specific SQS queue not found: ${queueName}`);
  }
};

/**
 * Check if user has write permissions to a project
 * @param {string} projectId - The project ID
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} - True if user has write access, false otherwise
 */
async function hasWritePermission(projectId, userId) {
  try {
    console.log(`🔍 Checking write permissions for user ${userId} on project ${projectId}`);
    
    const params = {
      TableName: PROJECTS_TABLE,
      Key: { projectId }
    };
    
    const result = await dynamodb.get(params).promise();
    
    if (!result.Item) {
      console.log(`❌ Project ${projectId} not found`);
      return false;
    }
    
    const project = result.Item;
    
    // Check if user is the owner
    if (project.createdBy === userId) {
      console.log(`✅ User ${userId} is the owner of project ${projectId}`);
      return true;
    }
    
    // Check if user is in sharedUsers with read-write permission
    if (project.sharedUsers && Array.isArray(project.sharedUsers)) {
      const sharedUser = project.sharedUsers.find(user => 
        user.userId === userId && user.shareMode === 'read-write'
      );
      
      if (sharedUser) {
        console.log(`✅ User ${userId} has read-write access to project ${projectId}`);
        return true;
      }
    }
    
    console.log(`❌ User ${userId} does not have write access to project ${projectId}`);
    return false;
  } catch (error) {
    console.error('Error checking permissions:', error);
    return false;
  }
}

/**
 * Create a process tracking record
 */
async function createProcessRecord(projectId, processId, fileName, dataSourceType) {
  const timestamp = new Date().toISOString();
  const processTableName = `app-modex-process-${projectId}`.toLowerCase();
  
  const processRecord = {
    processId, // Primary key - unique, no sort key needed
    timestamp, // Keep as attribute for reference
    processType: 'FILE_UPLOAD',
    processName: `Upload ${fileName}`,
    status: 'INITIATED',
    startTime: timestamp,
    metadata: {
      fileName,
      dataSourceType,
      stage: 'file-upload-lambda'
    },
    projectId
  };
  
  await dynamodb.put({
    TableName: processTableName,
    Item: processRecord
  }).promise();
  
  console.log(`✅ Created process tracking record: ${processId}`);
  return { ...processRecord };
}

/**
 * Update process tracking record
 */
async function updateProcessRecord(projectId, processId, timestamp, status, metadata = {}, errorMessage = null) {
  const processTableName = `app-modex-process-${projectId}`.toLowerCase();
  const now = new Date().toISOString();
  
  let updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
  const expressionAttributeNames = { '#status': 'status' };
  const expressionAttributeValues = {
    ':status': status,
    ':updatedAt': now
  };
  
  // Add metadata updates
  if (Object.keys(metadata).length > 0) {
    updateExpression += ', metadata = :metadata';
    expressionAttributeValues[':metadata'] = metadata;
  }
  
  // Add error message if provided
  if (errorMessage) {
    updateExpression += ', errorMessage = :errorMessage';
    expressionAttributeValues[':errorMessage'] = errorMessage;
  }
  
  await dynamodb.update({
    TableName: processTableName,
    Key: { processId }, // FIXED: Only use processId (no timestamp in key)
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  }).promise();
  
  console.log(`✅ Updated process tracking record: ${processId} to ${status}`);
}

/**
 * Main handler function for file upload API
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  // Set up CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*', // Update with your domain in production
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }
  
  let processId = null;
  let processTimestamp = null;
  let projectId = null;
  let processRecord = null;
  
  try {
    // Parse request body
    const body = JSON.parse(event.body);
    const { projectId: reqProjectId, fileName, fileType, fileSize, fileContent, folderPath = 'data-uploaded/skills/', dataSourceType = 'skills', isLastChunk = true, chunkIndex = 1, totalChunks = 1, originalFilename = fileName } = body;
    projectId = reqProjectId;
    
    // Generate process ID
    processId = `proc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    processTimestamp = new Date().toISOString();
    
    // STEP 0: Create process tracking record with status 'uploading'
    console.log(`📊 STEP 0: Creating process tracking record for ${fileName}`);
    const processRecord = await createProcessRecord(projectId, processId, fileName, dataSourceType);
    
    // Validate required fields
    if (!projectId || !fileName || !fileContent) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: projectId, fileName, fileContent' 
        })
      };
    }
    
    // Get user ID from event context
    const userId = event.requestContext?.authorizer?.claims?.sub || 'unknown';
    const username = event.requestContext?.authorizer?.claims?.['cognito:username'] || 
                     event.requestContext?.authorizer?.claims?.email || 
                     'unknown';
    
    console.log(`🔍 File upload request from user: ${userId} (${username}) for project: ${projectId}`);
    
    // Check if user has write permissions to the project
    const hasWriteAccess = await hasWritePermission(projectId, userId);
    
    if (!hasWriteAccess) {
      console.log(`❌ Access denied: User ${userId} does not have write permissions for project ${projectId}`);
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Access denied. You need read-write permissions to upload files to this project.' 
        })
      };
    }
    
    console.log(`✅ Permission check passed for user ${userId} on project ${projectId}`);
    
    // Create a unique ID for the file
    const fileId = uuidv4();
    
    // Ensure folder path ends with a slash
    const normalizedFolderPath = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
    
    // Create a key for the file (path + unique ID + filename)
    const key = `${normalizedFolderPath}${fileId}-${fileName}`;
    
    // Dynamically set the bucket name based on the project ID
    const bucketName = `app-modex-data-${projectId}`.toLowerCase();
    
    console.log(`🔄 Uploading file ${fileName} to S3 bucket ${bucketName}`);
    
    // Decode base64 file content
    const fileBuffer = Buffer.from(fileContent.replace(/^data:.+;base64,/, ''), 'base64');
    
    // Upload file to S3
    const uploadParams = {
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: fileType,
      Metadata: {
        projectId,
        uploadDate: new Date().toISOString(),
        dataSourceType,
        uploadedBy: username
      }
    };
    
    const uploadResult = await s3.upload(uploadParams).promise();
    console.log('✅ File uploaded successfully to S3:', uploadResult);
    
    // Determine file format based on extension - CSV only
    const extension = fileName.split('.').pop().toLowerCase();
    let fileFormat;
    
    if (extension === 'csv') {
      fileFormat = 'CSV';
    } else {
      // Reject non-CSV files
      console.error(`❌ Unsupported file format: ${extension}. Only CSV files are supported.`);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: `Unsupported file format: ${extension}. Only CSV files are supported.` 
        })
      };
    }
    
    // Create data source record in DynamoDB
    const dataSource = {
      projectId,
      id: `ds-${fileId}`,
      filename: fileName,
      fileFormat,
      fileSize,
      s3Key: key,
      s3Url: uploadResult.Location,
      dataSourceType,
      status: 'uploaded',
      uploadedBy: username,
      processingStatus: 'pending',
      timestamp: new Date().toISOString(),
      metadata: {
        contentType: fileType,
        lastModified: new Date().toISOString()
      }
    };
    
    // Get the table name from environment variables
    const tableName = `app-modex-data-sources-${projectId}`.toLowerCase();
    
    // Add data source to DynamoDB
    const putParams = {
      TableName: tableName,
      Item: dataSource
    };
    
    await dynamodb.put(putParams).promise();
    console.log('✅ Data source added to DynamoDB:', dataSource);
    
    // Only send SQS message to trigger data processing if this is the last chunk
    if (isLastChunk) {
      console.log('📤 Last chunk uploaded - sending SQS message to trigger data processing');
      
      // Send SQS message to trigger data processing
      await sendDataProcessingMessage({
        projectId,
        dataSourceId: dataSource.id,
        dataSourceType,
        bucketName,
        s3Key: key,
        filename: fileName,
        fileFormat,
        tableName,
        processId,
        processTimestamp,
        // Multi-chunk metadata
        isMultiChunk: totalChunks > 1,
        totalChunks,
        originalFilename,
        folderPath: normalizedFolderPath
      });
      
      console.log('✅ SQS message sent to trigger data processing');
      
      // STEP 6: Update process tracking to 'INITIATED' (file uploaded, queued for processing)
      console.log(`📊 STEP 6: Updating process tracking record to INITIATED`);
      await updateProcessRecord(projectId, processId, processRecord.timestamp, 'INITIATED', {
        fileName,
        dataSourceType,
        stage: 'file-uploaded-queued-for-processing',
        dataSourceId: dataSource.id,
        s3Key: key,
        s3Url: uploadResult.Location
      });
    } else {
      console.log('⏭️ Intermediate chunk uploaded - skipping SQS message (waiting for last chunk)');
      
      // Update process tracking to COMPLETED for intermediate chunk
      console.log(`📊 Updating process tracking record for intermediate chunk to COMPLETED`);
      await updateProcessRecord(projectId, processId, processRecord.timestamp, 'COMPLETED', {
        fileName,
        dataSourceType,
        stage: 'chunk-uploaded',
        dataSourceId: dataSource.id,
        s3Key: key,
        s3Url: uploadResult.Location
      });
    }
    
    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        key,
        url: uploadResult.Location,
        dataSource,
        processId,
        fileInfo: {
          name: fileName,
          type: fileType,
          size: fileSize,
          uploadDate: new Date().toISOString()
        }
      })
    };
  } catch (error) {
    console.error('❌ Error processing file upload:', error);
    
    // Update process tracking to FAILED
    if (processId && processRecord && projectId) {
      try {
        await updateProcessRecord(projectId, processId, processRecord.timestamp, 'FAILED', {
          stage: 'file-upload-lambda',
          error: error.message
        }, error.message);
      } catch (updateError) {
        console.error('❌ Failed to update process tracking record:', updateError);
      }
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to upload file',
        details: error.toString(),
        processId
      })
    };
  }
};

/**
 * Send a message to the project-specific data processing SQS queue
 * @param {Object} messageData - The message data to send
 */
async function sendDataProcessingMessage(messageData) {
  try {
    // Get project-specific queue URL
    const queueUrl = await getProjectQueueUrl(messageData.projectId, 'data');
    
    const message = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        ...messageData,
        timestamp: new Date().toISOString(),
        source: 'file-upload-lambda'
      }),
      MessageAttributes: {
        dataSourceType: {
          DataType: 'String',
          StringValue: messageData.dataSourceType
        },
        projectId: {
          DataType: 'String',
          StringValue: messageData.projectId
        },
        fileFormat: {
          DataType: 'String',
          StringValue: messageData.fileFormat
        },
        processId: {
          DataType: 'String',
          StringValue: messageData.processId || 'unknown'
        }
      }
    };

    const result = await sqs.sendMessage(message).promise();
    console.log('Data processing SQS message sent successfully:', result.MessageId);
    return result;
  } catch (error) {
    console.error('Error sending data processing SQS message:', error);
    throw error;
  }
}
