/**
 * Improved Project-Specific Data Processing Lambda Function
 * Implements proper transformation pipeline with data source type-specific processing
 * Processes files uploaded to project-specific S3 buckets
 * Consumes messages from project-specific SQS data processing queues
 */

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');

const s3 = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const athena = new AthenaClient({});
const sqs = new SQSClient({});
const lambdaClient = new LambdaClient({});
const stepFunctions = new SFNClient({});

// Environment variables
const PROJECT_ID = process.env.PROJECT_ID;
const ENVIRONMENT = process.env.ENVIRONMENT;
const PROJECT_BUCKET = process.env.PROJECT_BUCKET;
const DATA_SOURCES_TABLE = process.env.DATA_SOURCES_TABLE;
const PROCESS_TRACKING_LAMBDA = process.env.PROCESS_TRACKING_LAMBDA || 'app-modex-process-tracking';

// Data source types mapping for transformations
const DATA_SOURCE_TYPES = {
  'team-skills': 'team-skills',
  'technology-vision': 'technology-vision', 
  'applications-portfolio': 'applications-portfolio',
  'applications-tech-stack': 'applications-tech-stack',
  'applications-infrastructure': 'applications-infrastructure',
  'applications-utilization': 'applications-utilization'
};



const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('🚀 Project-specific data processing started');
  console.log('📋 Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  console.log('🔧 Environment:', { PROJECT_ID, ENVIRONMENT, PROJECT_BUCKET, DATA_SOURCES_TABLE });
  
  const results = [];
  
  for (const record of event.Records) {
    let processRecord = null;
    let genaiProcessResult = null;
    let normalizationData = null;
    
    try {
      const message = JSON.parse(record.body);
      console.log('📁 Processing file:', message);
      
      const { projectId, dataSourceId, s3Key, dataSourceType, fileFormat, filename, processId, processTimestamp } = message;
      
      // Validate that this message is for the correct project
      if (projectId !== PROJECT_ID) {
        console.error(`❌ Message projectId ${projectId} does not match Lambda PROJECT_ID ${PROJECT_ID}`);
        throw new Error(`Invalid project ID: expected ${PROJECT_ID}, got ${projectId}`);
      }
      
      // Extract bucket name from environment and use s3Key as objectKey
      const bucketName = PROJECT_BUCKET;
      const objectKey = s3Key;
      
      // STEP 0: Update existing process tracking record (created by file-upload Lambda)
      console.log(`📊 STEP 0: Updating existing process tracking record to PROCESSING`);
      
      // Use the processId and processTimestamp from the SQS message (created by file-upload Lambda)
      if (processId && processTimestamp) {
        processRecord = {
          processId,
          timestamp: processTimestamp
        };
        
        await updateProcessStatus({
          projectId,
          processId,
          timestamp: processTimestamp,
          status: 'PROCESSING',
          metadata: {
            step: 'processing_data',
            dataSourceId,
            dataSourceType,
            stage: 'data-processing-lambda',
            s3Key
          }
        });
      } else {
        console.warn('⚠️ No processId or processTimestamp in SQS message - process tracking may be incomplete');
      }
      
      // STEP 1: Update data source status to processing
      try {
        console.log(`🔄 STEP 1: Updating status to processing for record ${dataSourceId}`);
        console.log(`   Table: ${DATA_SOURCES_TABLE}`);
        console.log(`   Key: { projectId: "${projectId}", id: "${dataSourceId}" }`);
        
        const updateResult = await docClient.send(new UpdateCommand({
          TableName: DATA_SOURCES_TABLE,
          Key: { projectId, id: dataSourceId },
          UpdateExpression: 'SET processingStatus = :status, lastUpdated = :timestamp',
          ExpressionAttributeValues: {
            ':status': 'processing',
            ':timestamp': new Date().toISOString()
          },
          ReturnValues: 'ALL_NEW'
        }));
        
        console.log(`✅ Successfully updated data source ${dataSourceId} status to processing`);
        console.log(`   Updated attributes:`, JSON.stringify(updateResult.Attributes, null, 2));
      } catch (updateError) {
        console.error(`❌ Failed to update status to processing for ${dataSourceId}:`, updateError);
        throw new Error(`DynamoDB update failed: ${updateError.message}`);
      }
      
      // STEP 2: Download file from S3
      console.log(`📥 STEP 2: Downloading file from S3`);
      console.log(`   Bucket: ${bucketName}`);
      console.log(`   Key: ${objectKey}`);
      
      const getObjectResponse = await s3.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey
      }));
      
      const fileContent = await streamToString(getObjectResponse.Body);
      console.log(`✅ Downloaded file, size: ${fileContent.length} characters`);
      
      // STEP 3: Parse and process CSV data
      console.log(`🔄 STEP 3: Processing CSV data for type: ${dataSourceType}`);
      const processedData = await processCSV(fileContent, dataSourceType, projectId, dataSourceId, fileFormat);
      
      // STEP 4: Upload processed data to S3
      const processedKey = `data-processed/${dataSourceType}/${filename}`;
      console.log(`📤 STEP 4: Uploading processed data to S3`);
      console.log(`   Processed Key: ${processedKey}`);
      
      await s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: processedKey,
        Body: processedData,
        ContentType: 'text/csv'
      }));
      
      console.log(`✅ Uploaded processed data to ${processedKey}`);
      
      // STEP 4.5: Send normalization message for tech stack files
      if (dataSourceType === 'applications-tech-stack') {
        console.log(`📤 STEP 4.5: Initiating GenAI normalization process for tech stack file`);
        
        // Create a new process tracking record for GenAI normalization
        genaiProcessResult = await initiateProcessTracking({
          projectId,
          processType: 'GENAI_NORMALIZATION',
          processName: `Unified Normalization - ${filename}`,
          metadata: {
            dataSourceId,
            dataSourceType,
            s3Key: processedKey,
            filename,
            originalFileProcessId: processRecord?.processId
          }
        });
        
        // Store normalization data for later (after processing is complete)
        normalizationData = {
          messageType: 'NORMALIZATION',
          projectId,
          dataSourceId,
          dataSourceType,
          s3Key: processedKey, // Use the processed file key
          filename,
          fileFormat: 'csv',
          processId: genaiProcessResult.processId,
          originalTimestamp: genaiProcessResult.timestamp
        };
      }
      
      // STEP 5: Update data source status to processed
      console.log(`🔄 STEP 5: Updating status to processed for record ${dataSourceId}`);
      
      await docClient.send(new UpdateCommand({
        TableName: DATA_SOURCES_TABLE,
        Key: { projectId, id: dataSourceId },
        UpdateExpression: 'SET processingStatus = :status, lastUpdated = :timestamp, processedS3Key = :processedKey',
        ExpressionAttributeValues: {
          ':status': 'processed',
          ':timestamp': new Date().toISOString(),
          ':processedKey': processedKey
        }
      }));
      
      console.log(`✅ Successfully updated data source ${dataSourceId} status to processed`);
            
      // STEP 6: Update process tracking record to completed
      if (processRecord) {
        await updateProcessStatus({
          projectId,
          processId: processRecord.processId,
          timestamp: processRecord.timestamp,
          status: 'COMPLETED',
          metadata: {
            step: 'completed',
            dataSourceId,
            processedKey: processedKey,
            originalSize: fileContent.length,
            processedSize: processedData.length,
            recordsProcessed: processedData.split('\n').length - 1
          }
        });
      }

      // STEP 7: Trigger normalization Step Function AFTER processing is complete
      if (dataSourceType === 'applications-tech-stack' && normalizationData) {
        console.log(`📤 STEP 7: Triggering normalization Step Function after processing completion`);
        await triggerNormalizationStepFunction(normalizationData);
      }

      
      results.push({
        messageId: record.messageId,
        status: 'success',
        dataSourceId,
        processedKey
      });
      
    } catch (error) {
      console.error(`❌ Error processing record:`, error);
      
      // Update data source status to failed
      try {
        const { projectId, dataSourceId } = JSON.parse(record.body);
        
        await docClient.send(new UpdateCommand({
          TableName: DATA_SOURCES_TABLE,
          Key: { projectId, id: dataSourceId },
          UpdateExpression: 'SET processingStatus = :status, lastUpdated = :timestamp, errorMessage = :error',
          ExpressionAttributeValues: {
            ':status': 'failed',
            ':timestamp': new Date().toISOString(),
            ':error': error.message
          }
        }));
        
        // Update process tracking record to failed
        // If error occurred during normalization (genaiProcessResult exists), update that process
        // Otherwise, update the original FILE_UPLOAD process
        if (genaiProcessResult) {
          console.log(`📊 Error occurred during normalization - updating GENAI_NORMALIZATION process`);
          await updateProcessStatus({
            projectId,
            processId: genaiProcessResult.processId,
            timestamp: genaiProcessResult.timestamp,
            status: 'FAILED',
            errorDetails: {
              message: error.message,
              stack: error.stack,
              phase: 'genai_normalization'
            }
          });
        } else if (processRecord) {
          console.log(`📊 Error occurred during file processing - updating FILE_UPLOAD process`);
          await updateProcessStatus({
            projectId,
            processId: processRecord.processId,
            timestamp: processRecord.timestamp,
            status: 'FAILED',
            errorDetails: {
              message: error.message,
              stack: error.stack,
              phase: 'data_processing'
            }
          });
        }
        
      } catch (updateError) {
        console.error(`❌ Failed to update error status:`, updateError);
      }
      
      results.push({
        messageId: record.messageId,
        status: 'error',
        error: error.message,
        itemIdentifier: record.messageId
      });
    }
  }
  
  console.log('🏁 Processing completed');
  console.log('📊 Results:', JSON.stringify(results, null, 2));
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Files processed', results }),
    batchItemFailures: results.filter(r => r.status === 'error').map(r => ({ itemIdentifier: r.itemIdentifier }))
  };
};

/**
 * Convert stream to string
 */
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Process CSV data based on data source type
 */
async function processCSV(csvData, dataSourceType, projectId, dataSourceId, originalFormat) {
  console.log(`Processing CSV for data source type: ${dataSourceType}`);
  
  const lines = csvData.split('\n');
  const header = lines[0];
  
  if (!header) {
    throw new Error('CSV file is empty or has no header');
  }
  
  // Add processing metadata columns
  const processedHeader = header.trim() + ',processed_at,project_id,data_source_id,transformation_type,original_format';
  const processedLines = [processedHeader];
  
  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      // Add processing metadata
      const processedLine = line + ',' + 
        new Date().toISOString() + ',' + 
        projectId + ',' + 
        dataSourceId + ',' + 
        'csv-normalization' + ',' + 
        originalFormat;
      processedLines.push(processedLine);
    }
  }
  
  console.log(`Processed ${processedLines.length - 1} data rows`);
  return processedLines.join('\n');
}

/**
 * Trigger normalization Step Function directly for tech stack files
 * @param {Object} messageData - The message data to send to Step Function
 */
async function triggerNormalizationStepFunction(messageData) {
  const STATE_MACHINE_ARN = process.env.TECH_STACK_NORMALIZATION_STATE_MACHINE_ARN;

  if (!STATE_MACHINE_ARN) {
    throw new Error('TECH_STACK_NORMALIZATION_STATE_MACHINE_ARN environment variable is not set');
  }

  try {
    console.log('🚀 Triggering normalization Step Function:', messageData);
    console.log('   State Machine ARN:', STATE_MACHINE_ARN);
    
    const executionName = `norm-${messageData.processId}-${Date.now()}`;
    
    const command = new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      input: JSON.stringify(messageData),
      name: executionName
    });
    
    const result = await stepFunctions.send(command);
    console.log(`✅ Step Function triggered successfully. Execution ARN: ${result.executionArn}`);
    return result;
    
  } catch (error) {
    console.error('❌ Error triggering normalization Step Function:', error);
    // Don't fail the entire process if Step Function trigger fails
    // This is a best-effort enhancement
    console.warn('⚠️ Continuing despite Step Function trigger failure');
  }
}



/**
 * Initiate a new process tracking record
 * @param {Object} data - Process initiation data
 * @returns {Promise<Object>} - Process tracking result with processId and timestamp
 */
async function initiateProcessTracking(data) {
  try {
    console.log('📊 Initiating new process tracking:', data);
    
    const command = new InvokeCommand({
      FunctionName: PROCESS_TRACKING_LAMBDA,
      InvocationType: 'RequestResponse', // Synchronous invocation to get processId
      Payload: JSON.stringify({
        action: 'initiateProcess',
        projectId: data.projectId,
        processType: data.processType,
        processName: data.processName,
        metadata: data.metadata
      })
    });
    
    const response = await lambdaClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    console.log('✅ Process tracking initiated successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ Error initiating process tracking:', error);
    throw error;
  }
}

/**
 * Update process tracking status
 * @param {Object} data - Process tracking update data
 * @returns {Promise<Object>} - Process tracking result
 */
async function updateProcessStatus(data) {
  try {
    console.log('📊 Updating process status:', data);
    
    const command = new InvokeCommand({
      FunctionName: PROCESS_TRACKING_LAMBDA,
      InvocationType: 'Event', // Asynchronous invocation
      Payload: JSON.stringify({
        action: 'updateProcessStatus',
        projectId: data.projectId,
        processId: data.processId,
        originalTimestamp: data.timestamp,
        status: data.status,
        metadata: data.metadata,
        errorDetails: data.errorDetails
      })
    });
    
    await lambdaClient.send(command);
    console.log('✅ Process status updated successfully');
    return true;
  } catch (error) {
    console.error('❌ Error updating process status:', error);
    return false;
  }
}