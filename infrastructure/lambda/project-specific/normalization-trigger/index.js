/**
 * Normalization Trigger Lambda Function (Per Project)
 * 
 * This function processes SQS messages from the project-specific normalization queue
 * and triggers the global Step Function workflow for technology normalization.
 * It's deployed per project but triggers the global normalization workflow.
 */

const AWS = require('aws-sdk');

const stepfunctions = new AWS.StepFunctions();

// Environment variables
const GLOBAL_STATE_MACHINE_ARN = process.env.GLOBAL_STATE_MACHINE_ARN;

/**
 * Main handler function for processing SQS messages
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Normalization Trigger Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  const batchItemFailures = [];
  
  // Process each SQS record
  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      console.log('Processing normalization message:', messageBody);
      
      await triggerNormalizationWorkflow(messageBody);
      
    } catch (error) {
      console.error(`Error processing SQS record ${record.messageId}:`, error);
      
      // Add to batch item failures for partial batch failure handling
      batchItemFailures.push({
        itemIdentifier: record.messageId
      });
    }
  }
  
  // Return partial batch failure response if there were any failures
  if (batchItemFailures.length > 0) {
    return {
      batchItemFailures
    };
  }
  
  return { statusCode: 200, body: 'Normalization workflows triggered successfully' };
};

/**
 * Trigger the Step Function workflow for normalization
 */
async function triggerNormalizationWorkflow(message) {
  const { 
    projectId, 
    dataSourceId, 
    dataSourceType, 
    s3Key, 
    filename, 
    fileFormat 
  } = message;
  
  // Only process tech stack files
  if (dataSourceType !== 'applications-tech-stack') {
    console.log(`Skipping normalization for data source type: ${dataSourceType}`);
    return;
  }
  
  // Only process CSV files
  if (fileFormat !== 'csv') {
    console.log(`Skipping normalization for file format: ${fileFormat}`);
    return;
  }
  
  console.log(`Triggering global normalization workflow for tech stack file: ${filename}`);
  
  // Prepare input for Global Step Function
  const stepFunctionInput = {
    projectId,
    dataSourceId,
    dataSourceType,
    s3Key,
    filename,
    fileFormat,
    timestamp: new Date().toISOString(),
    requestId: generateRequestId()
  };
  
  // Start Global Step Function execution
  const params = {
    stateMachineArn: GLOBAL_STATE_MACHINE_ARN,
    name: `normalization-${projectId}-${dataSourceId}-${Date.now()}`,
    input: JSON.stringify(stepFunctionInput)
  };
  
  try {
    const result = await stepfunctions.startExecution(params).promise();
    console.log(`Started Global Step Function execution: ${result.executionArn}`);
    
    return {
      success: true,
      executionArn: result.executionArn,
      projectId,
      dataSourceId
    };
    
  } catch (error) {
    console.error('Error starting Global Step Function execution:', error);
    throw error;
  }
}

/**
 * Generate a unique request ID
 */
function generateRequestId() {
  return `norm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
