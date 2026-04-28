// Force deployment timestamp: 2025-12-06T18:15:00.000Z
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:20.3NZ';

/**
 * Process Tracking Lambda Function
 * Handles tracking of data processing operations across the App-ModEx platform
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { v4: uuidv4 } = require('uuid');
const { sanitizeEvent, logger } = require('app-modex-shared');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const eventBridge = new EventBridgeClient({});

// Environment variables
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;

/**
 * Initiates a new process tracking record
 * @param {Object} event - Event object containing process details
 * @param {string} event.projectId - Project ID
 * @param {string} event.processType - Type of process (FILE_UPLOAD, DATA_IMPORT, ANALYSIS, etc.)
 * @param {string} event.processName - Specific name of the process
 * @param {Object} event.metadata - Additional metadata for the process
 */
async function initiateProcess(event) {
  const processId = `proc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();
  const tableName = `app-modex-process-${event.projectId}`.toLowerCase();
  const eventBusName = `app-modex-events-${event.projectId}-${process.env.ENVIRONMENT || 'dev'}`.toLowerCase();
  
  // Standardized process type naming convention: CATEGORY_ACTION
  // Examples: FILE_UPLOAD, DATA_IMPORT, ANALYSIS_RUN, REPORT_GENERATION
  const processType = event.processType.toUpperCase();
  
  const params = {
    TableName: tableName,
    Item: {
      processId,
      timestamp,
      processType,
      processName: event.processName,
      status: 'INITIATED',
      startTime: timestamp,
      metadata: event.metadata || {},
      projectId: event.projectId
    }
  };
  
  await dynamodb.send(new PutCommand(params));
  
  // Publish to project-specific event bus
  await eventBridge.send(new PutEventsCommand({
    Entries: [{
      Source: 'app-modex.processes',
      DetailType: 'ProcessInitiated',
      Detail: JSON.stringify({
        processId,
        processType,
        processName: event.processName,
        status: 'INITIATED',
        projectId: event.projectId
      }),
      EventBusName: eventBusName
    }]
  }));
  
  return { 
    processId,
    timestamp,
    status: 'INITIATED'
  };
}

/**
 * Updates the status of an existing process
 * @param {Object} event - Event object containing update details
 * @param {string} event.projectId - Project ID
 * @param {string} event.processId - Process ID to update
 * @param {string} event.originalTimestamp - Original timestamp of the process record
 * @param {string} event.status - New status (PROCESSING, COMPLETED, FAILED)
 * @param {Object} event.metadata - Updated metadata (optional)
 * @param {Object} event.errorDetails - Error details if status is FAILED (optional)
 */
async function updateProcessStatus(event) {
  const { processId, status, metadata, errorDetails, projectId, originalTimestamp } = event;
  const timestamp = new Date().toISOString();
  const tableName = `app-modex-process-${projectId}`.toLowerCase();
  const eventBusName = `app-modex-events-${projectId}-${process.env.ENVIRONMENT || 'dev'}`.toLowerCase();
  
  // Get the current process record
  const getParams = {
    TableName: tableName,
    Key: { 
      processId // FIXED: Only use processId (no timestamp in key)
    }
  };
  
  const currentProcess = await dynamodb.send(new GetCommand(getParams));
  
  if (!currentProcess.Item) {
    throw new Error(`Process ${processId} not found`);
  }
  
  const updateParams = {
    TableName: tableName,
    Key: { 
      processId // FIXED: Only use processId (no timestamp in key)
    },
    UpdateExpression: 'set #status = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': status,
      ':updatedAt': timestamp
    },
    ReturnValues: 'ALL_NEW'
  };
  
  // Add metadata updates if provided
  if (metadata) {
    updateParams.UpdateExpression += ', metadata = :metadata';
    updateParams.ExpressionAttributeValues[':metadata'] = {
      ...currentProcess.Item.metadata,
      ...metadata
    };
  }
  
  // Add completion details if process is completed or failed
  if (status === 'COMPLETED' || status === 'FAILED') {
    updateParams.UpdateExpression += ', endTime = :endTime, #duration = :duration';
    updateParams.ExpressionAttributeNames['#duration'] = 'duration';
    updateParams.ExpressionAttributeValues[':endTime'] = timestamp;
    updateParams.ExpressionAttributeValues[':duration'] = 
      (new Date(timestamp) - new Date(currentProcess.Item.startTime)) / 1000;
  }
  
  // Add error details if provided
  if (errorDetails) {
    updateParams.UpdateExpression += ', errorDetails = :errorDetails';
    updateParams.ExpressionAttributeValues[':errorDetails'] = errorDetails;
  }
  
  const result = await dynamodb.send(new UpdateCommand(updateParams));
  
  // Publish status update event to project-specific event bus
  await eventBridge.send(new PutEventsCommand({
    Entries: [{
      Source: 'app-modex.processes',
      DetailType: 'ProcessStatusUpdated',
      Detail: JSON.stringify({
        processId,
        status,
        timestamp,
        projectId
      }),
      EventBusName: eventBusName
    }]
  }));
  
  return result.Attributes;
}

/**
 * Queries processes with filtering options
 * @param {Object} event - API Gateway event
 * @param {Object} event.queryStringParameters - Query parameters for filtering
 * @param {string} event.pathParameters.projectId - Project ID
 */
async function queryProcesses(event) {
  const projectId = event.pathParameters.projectId;
  const queryParams = event.queryStringParameters || {};
  const tableName = `app-modex-process-${projectId}`.toLowerCase();
  
  // Build query parameters
  let params = {
    TableName: tableName,
    Limit: parseInt(queryParams.limit || '50', 10)
  };
  
  // Determine which index to use based on filters
  if (queryParams.processType) {
    params.IndexName = 'processType-index';
    params.KeyConditionExpression = 'processType = :processType';
    params.ExpressionAttributeValues = {
      ':processType': queryParams.processType
    };
    
    // Add date range if provided
    if (queryParams.startDate && queryParams.endDate) {
      params.KeyConditionExpression += ' AND #startTime BETWEEN :startDate AND :endDate';
      params.ExpressionAttributeNames = { '#startTime': 'startTime' };
      params.ExpressionAttributeValues[':startDate'] = queryParams.startDate;
      params.ExpressionAttributeValues[':endDate'] = queryParams.endDate;
    }
    
    // Add status filter if provided
    if (queryParams.status) {
      params.FilterExpression = '#status = :status';
      params.ExpressionAttributeNames = { ...params.ExpressionAttributeNames, '#status': 'status' };
      params.ExpressionAttributeValues[':status'] = queryParams.status;
    }
  } else if (queryParams.status) {
    params.IndexName = 'status-index';
    params.KeyConditionExpression = '#status = :status';
    params.ExpressionAttributeNames = { '#status': 'status' };
    params.ExpressionAttributeValues = {
      ':status': queryParams.status
    };
    
    // Add date range if provided
    if (queryParams.startDate && queryParams.endDate) {
      params.KeyConditionExpression += ' AND #startTime BETWEEN :startDate AND :endDate';
      params.ExpressionAttributeNames = { ...params.ExpressionAttributeNames, '#startTime': 'startTime' };
      params.ExpressionAttributeValues[':startDate'] = queryParams.startDate;
      params.ExpressionAttributeValues[':endDate'] = queryParams.endDate;
    }
    
    // Add process type filter if provided
    if (queryParams.processType) {
      params.FilterExpression = 'processType = :processType';
      params.ExpressionAttributeValues[':processType'] = queryParams.processType;
    }
  } else {
    // Scan if no specific filters are provided (no indexes needed)
    delete params.KeyConditionExpression;
  }
  
  // Add pagination token if provided
  if (queryParams.nextToken) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(queryParams.nextToken, 'base64').toString());
  }
  
  let result;
  try {
    if (params.KeyConditionExpression) {
      result = await dynamodb.send(new QueryCommand(params));
    } else {
      result = await dynamodb.send(new ScanCommand(params));
    }
  } catch (error) {
    // If table doesn't exist, return empty result
    if (error.code === 'ResourceNotFoundException') {
      logger.warn(`Table ${tableName} not found for project ${projectId}. Returning empty result.`);
      return {
        items: [],
        count: 0
      };
    }
    throw error;
  }
  
  // Apply sorting if requested
  let sortedItems = result.Items;
  if (queryParams.sortBy && queryParams.sortOrder) {
    const sortField = queryParams.sortBy;
    const sortOrder = queryParams.sortOrder.toLowerCase();
    
    sortedItems = [...result.Items].sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];
      
      // Handle date fields
      if (sortField === 'startTime' || sortField === 'endTime' || sortField === 'timestamp') {
        aValue = new Date(aValue || 0);
        bValue = new Date(bValue || 0);
      }
      
      // Handle string fields
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });
  }
  
  // Prepare response with pagination
  const response = {
    items: sortedItems,
    count: result.Count
  };
  
  if (result.LastEvaluatedKey) {
    response.nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
  }
  
  return response;
}

/**
 * Get a specific process by ID
 * @param {Object} event - API Gateway event
 * @param {string} event.pathParameters.projectId - Project ID
 * @param {string} event.pathParameters.processId - Process ID
 */
async function getProcessById(event) {
  const projectId = event.pathParameters.projectId;
  const processId = event.pathParameters.processId;
  const tableName = `app-modex-process-${projectId}`.toLowerCase();
  
  const params = {
    TableName: tableName,
    KeyConditionExpression: 'processId = :processId',
    ExpressionAttributeValues: {
      ':processId': processId
    }
  };
  
  const result = await dynamodb.send(new QueryCommand(params));
  
  if (result.Items.length === 0) {
    return {
      statusCode: 404,
      body: { message: 'Process not found' }
    };
  }
  
  return result.Items[0];
}

/**
 * Main handler function for process tracking API
 */
exports.handler = async (event) => {
  logger.debug('Process tracking handler invoked', { eventType: event.httpMethod || event.action });
  logger.debug('Event details', sanitizeEvent(event));
  
  // Set up CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*', // Update with your domain in production
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    logger.debug('Handling CORS preflight request');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }
  
  try {
    let result;
    
    // Direct Lambda invocation (not through API Gateway)
    if (!event.httpMethod) {
      logger.info('Direct Lambda invocation', { action: event.action });
      if (event.action === 'initiateProcess') {
        result = await initiateProcess(event);
      } else if (event.action === 'updateProcessStatus') {
        result = await updateProcessStatus(event);
      } else {
        throw new Error(`Unknown action: ${event.action}`);
      }
      
      return result;
    }
    
    // API Gateway invocation
    logger.info('API Gateway invocation', { method: event.httpMethod, path: event.path });
    if (event.httpMethod === 'GET') {
      if (event.pathParameters && event.pathParameters.processId) {
        result = await getProcessById(event);
      } else {
        result = await queryProcesses(event);
      }
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      result = await initiateProcess({
        ...body,
        projectId: event.pathParameters.projectId
      });
    } else if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      result = await updateProcessStatus({
        ...body,
        projectId: event.pathParameters.projectId,
        processId: event.pathParameters.processId
      });
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: `Unsupported HTTP method: ${event.httpMethod}` 
        })
      };
    }
    
    logger.info('Request processed successfully');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (error) {
    logger.error('Error processing request', { error: error.message, stack: error.stack });
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to process request',
        details: error.toString()
      })
    };
  }
};

// Export functions for direct invocation from other Lambda functions
exports.initiateProcess = initiateProcess;
exports.updateProcessStatus = updateProcessStatus;
exports.queryProcesses = queryProcesses;
exports.getProcessById = getProcessById;
