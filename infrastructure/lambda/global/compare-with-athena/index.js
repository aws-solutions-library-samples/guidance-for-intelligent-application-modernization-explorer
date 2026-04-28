// Force deployment timestamp: 2025-07-26T22:41:30.3NZ
const DEPLOYMENT_TIMESTAMP = '2025-12-14T22:38:46.3NZ';

/**
 * Compare with Athena Lambda Function
 * 
 * This function compares unique values from CSV with existing normalized data in Athena tables.
 * It returns only the values that don't exist in the corresponding Athena table.
 */

const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const athenaClient = new AthenaClient({});
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const GLUE_DATABASE = process.env.GLUE_DATABASE;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET;

// Process tracking helper function
async function updateProcessTracking(projectId, processId, originalTimestamp, status, metadata = {}, errorDetails = null) {
  try {
    const environment = process.env.ENVIRONMENT || 'dev';
    const tableName = `app-modex-process-${projectId}`.toLowerCase();
    const timestamp = new Date().toISOString();
    
    // Get the current process record
    const currentProcess = await dynamodb.send(new GetCommand({
      TableName: tableName,
      Key: { 
        processId // FIXED: Only use processId (no timestamp in key)
      }
    }));
    
    if (!currentProcess.Item) {
      console.warn(`Process ${processId} not found, skipping update`);
      return;
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
      }
    };
    
    // Add metadata updates if provided
    if (metadata && Object.keys(metadata).length > 0) {
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
    
    await dynamodb.send(new UpdateCommand(updateParams));
    console.log(`✅ Process tracking updated: ${status}`);
  } catch (error) {
    console.error('❌ Failed to update process tracking:', error);
    // Don't fail the main process if tracking fails
  }
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  console.log('Compare with Athena Event:', JSON.stringify(event, null, 2));
  
  const { columnType, projectId, dataSourceId, uniqueValues, s3Key, filename, processId, originalTimestamp } = event;
  
  try {
    if (!columnType || !uniqueValues || !Array.isArray(uniqueValues)) {
      throw new Error('Missing required parameters: columnType, uniqueValues');
    }
    
    // Update process tracking - starting comparison
    if (processId && originalTimestamp) {
      await updateProcessTracking(projectId, processId, originalTimestamp, 'PROCESSING', {
        step: 'compare_with_athena',
        columnType,
        uniqueValuesCount: uniqueValues.length
      });
    }
    
    if (uniqueValues.length === 0) {
      console.log('No unique values to compare');
      return {
        statusCode: 200,
        columnType,
        projectId,
        dataSourceId,
        newValues: [],
        existingValues: [],
        totalNewCount: 0,
        s3Key,
        filename,
        processId,
        originalTimestamp
      };
    }
    
    console.log(`Comparing ${uniqueValues.length} values for ${columnType} with Athena table`);
    
    // Get existing values from Athena table
    const existingValues = await getExistingValuesFromAthena(columnType, uniqueValues);
    
    // Find values that don't exist in Athena
    const existingSet = new Set(existingValues);
    const newValues = uniqueValues.filter(value => !existingSet.has(value));
    
    console.log(`Found ${newValues.length} new values that need normalization:`, newValues);
    console.log(`Found ${existingValues.length} existing values:`, existingValues);
    
    // Update process tracking - comparison completed
    if (processId && originalTimestamp) {
      await updateProcessTracking(projectId, processId, originalTimestamp, 'PROCESSING', {
        step: 'compare_with_athena_completed',
        columnType,
        newValuesCount: newValues.length,
        existingValuesCount: existingValues.length
      });
    }
    
    return {
      statusCode: 200,
      columnType,
      projectId,
      dataSourceId,
      newValues,
      existingValues,
      totalNewCount: newValues.length,
      s3Key,
      filename,
      processId,
      originalTimestamp
    };
    
  } catch (error) {
    console.error('Error comparing with Athena:', error);
    
    // Update process tracking - comparison failed
    if (processId && originalTimestamp) {
      await updateProcessTracking(projectId, processId, originalTimestamp, 'FAILED', {
        step: 'compare_with_athena_failed',
        columnType
      }, {
        error: error.message,
        stack: error.stack
      });
    }
    
    throw error;
  }
};

/**
 * Get existing values from Athena table
 */
async function getExistingValuesFromAthena(columnType, valuesToCheck) {
  try {
    // Map column types to table names
    const tableMapping = {
      'runtimes': 'normalized-runtimes',
      'frameworks': 'normalized-frameworks',
      'databases': 'normalized-databases',
      'integrations': 'normalized-integrations',
      'storage': 'normalized-storages'
    };
    
    const tableName = tableMapping[columnType];
    if (!tableName) {
      throw new Error(`Unknown column type: ${columnType}`);
    }
    
    // Create a query to check which values already exist
    const valuesList = valuesToCheck.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
    const query = `
      SELECT DISTINCT original_name 
      FROM "${GLUE_DATABASE}"."${tableName}" 
      WHERE original_name IN (${valuesList})
    `;
    
    console.log(`Executing Athena query: ${query}`);
    
    // Execute the query
    const queryExecutionId = await startAthenaQuery(query);
    const status = await waitForQueryCompletion(queryExecutionId);
    
    if (status === 'SUCCEEDED') {
      const results = await getQueryResults(queryExecutionId);
      return processQueryResults(results);
    } else {
      console.warn(`Query failed with status: ${status}. Assuming no existing values.`);
      return [];
    }
    
  } catch (error) {
    console.error('Error querying Athena:', error);
    // If there's an error (e.g., table doesn't exist yet), assume no existing values
    console.log('Assuming no existing values due to error');
    return [];
  }
}

/**
 * Start an Athena query execution
 */
async function startAthenaQuery(query) {
  const params = {
    QueryString: query,
    QueryExecutionContext: {
      Database: GLUE_DATABASE
    },
    ResultConfiguration: {
      OutputLocation: `s3://${RESULTS_BUCKET}/normalization-queries/`
    }
  };
  
  const result = await athenaClient.send(new StartQueryExecutionCommand(params));
  return result.QueryExecutionId;
}

/**
 * Wait for an Athena query to complete
 */
async function waitForQueryCompletion(queryExecutionId) {
  let status = 'QUEUED';
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max wait time
  
  while ((status === 'QUEUED' || status === 'RUNNING') && attempts < maxAttempts) {
    const queryExecution = await athenaClient.send(new GetQueryExecutionCommand({
      QueryExecutionId: queryExecutionId
    }));
    status = queryExecution.QueryExecution.Status.State;
    
    if (status === 'QUEUED' || status === 'RUNNING') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
  }
  
  return status;
}

/**
 * Get query results
 */
async function getQueryResults(queryExecutionId) {
  const params = {
    QueryExecutionId: queryExecutionId,
    MaxResults: 1000
  };
  
  const results = [];
  let nextToken = null;
  
  do {
    if (nextToken) {
      params.NextToken = nextToken;
    }
    
    const response = await athenaClient.send(new GetQueryResultsCommand(params));
    results.push(...response.ResultSet.Rows);
    nextToken = response.NextToken;
    
  } while (nextToken);
  
  return results;
}

/**
 * Process query results to extract values
 */
function processQueryResults(rows) {
  if (!rows || rows.length <= 1) {
    return []; // No data or only header row
  }
  
  // Skip the header row and extract values
  return rows.slice(1).map(row => {
    const data = row.Data;
    return data && data[0] && data[0].VarCharValue ? data[0].VarCharValue : null;
  }).filter(value => value !== null);
}
