// Force deployment timestamp: 2025-07-22T11:18:02.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:37.3NZ';

/**
 * File Operations Lambda Function
 * Handles downloading and deleting files from S3 and DynamoDB
 */

const AWS = require('aws-sdk');

// Initialize AWS clients
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const athena = new AWS.Athena();

/**
 * Create a process tracking record
 */
async function createProcessRecord(projectId, processId, fileName, processType = 'FILE_DELETION') {
  const timestamp = new Date().toISOString();
  const processTableName = `app-modex-process-${projectId}`.toLowerCase();
  
  const processRecord = {
    processId,
    timestamp,
    processType,
    processName: `Delete ${fileName}`,
    status: 'INITIATED',
    startTime: timestamp,
    metadata: {
      fileName,
      stage: 'file-operations-lambda'
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
 * Delete processed data from Athena tables
 */
async function deleteAthenaData(projectId, dataSourceId, dataSourceType) {
  try {
    // Map data source types to Athena table names
    const tableMapping = {
      'team-skills': 'team_skills',
      'technology-vision': 'tech_vision',
      'applications-portfolio': 'application_portfolio',
      'applications-tech-stack': 'tech_stack',
      'applications-infrastructure': 'infrastructure_resources',
      'applications-utilization': 'resource_utilization'
    };
    
    const tableName = tableMapping[dataSourceType];
    if (!tableName) {
      console.log(`ℹ️ No Athena table mapping for data source type: ${dataSourceType}`);
      return;
    }
    
    const database = `app_modex_${projectId}`.toLowerCase();
    const resultsBucket = `app-modex-results-${projectId}`.toLowerCase();
    
    // Create DELETE query to remove records with matching data_source_id
    const deleteQuery = `DELETE FROM "${database}"."${tableName}" WHERE data_source_id = '${dataSourceId}'`;
    
    console.log(`🗑️ Executing Athena DELETE query: ${deleteQuery}`);
    
    const params = {
      QueryString: deleteQuery,
      QueryExecutionContext: { Database: database },
      ResultConfiguration: { OutputLocation: `s3://${resultsBucket}/athena-results/` }
    };
    
    const result = await athena.startQueryExecution(params).promise();
    const queryExecutionId = result.QueryExecutionId;
    
    console.log(`📝 Athena DELETE query started: ${queryExecutionId}`);
    
    // Wait for query to complete (max 30 seconds)
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const getResult = await athena.getQueryExecution({ QueryExecutionId: queryExecutionId }).promise();
      const status = getResult.QueryExecution.Status.State;
      
      if (status === 'SUCCEEDED') {
        console.log(`✅ Athena data deleted successfully from ${tableName}`);
        return;
      } else if (status === 'FAILED' || status === 'CANCELLED') {
        const reason = getResult.QueryExecution.Status.StateChangeReason;
        console.error(`❌ Athena DELETE query failed: ${reason}`);
        // Don't throw error - continue with deletion process
        return;
      }
    }
    
    console.log(`⏱️ Athena DELETE query still running: ${queryExecutionId}`);
  } catch (error) {
    console.error('❌ Error deleting Athena data:', error);
    // Don't throw error - continue with deletion process
  }
}

/**
 * Main handler function for file operations API
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  // Set up CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*', // Update with your domain in production
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,DELETE'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }
  
  try {
    // Get project ID and file ID from path parameters
    // Note: API Gateway passes path parameters with the resource name, so {id} becomes 'id'
    const projectId = event.pathParameters?.projectId;
    const fileId = event.pathParameters?.id;
    
    // Validate required parameters
    if (!projectId || !fileId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing required parameters: projectId and fileId' 
        })
      };
    }
    
    const tableName = `app-modex-data-sources-${projectId}`.toLowerCase();
    
    // Get the data source record from DynamoDB
    const getParams = {
      TableName: tableName,
      Key: {
        projectId,
        id: fileId
      }
    };
    
    console.log(`🔍 Getting data source from DynamoDB: ${JSON.stringify(getParams)}`);
    
    const dataSourceResult = await dynamodb.get(getParams).promise();
    const dataSource = dataSourceResult.Item;
    
    if (!dataSource) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: `Data source not found: ${fileId}` 
        })
      };
    }
    
    // Get the S3 key from the data source - check multiple possible field names
    let s3Key = dataSource['S3Key-Upload'] || dataSource['s3Key'] || dataSource['Key'];
    
    if (!s3Key) {
      console.error('No S3 key found in record:', JSON.stringify(dataSource, null, 2));
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: `Missing required key 'Key' in params: No S3 key found in record ${dataSource.dataSourceType} (${dataSource.id})` 
        })
      };
    }
    
    const bucketName = `app-modex-data-${projectId}`.toLowerCase();
    
    // Handle different HTTP methods
    if (event.httpMethod === 'GET') {
      // Download file - use the original file
      console.log(`📥 Generating presigned URL for S3 object: ${bucketName}/${s3Key}`);
      
      // Generate a presigned URL for downloading the file with longer expiration
      const presignedUrl = s3.getSignedUrl('getObject', {
        Bucket: bucketName,
        Key: s3Key,
        Expires: 60 * 15, // URL expires in 15 minutes (increased from 5)
        ResponseContentDisposition: `attachment; filename="${dataSource.filename}"`,
        ResponseContentType: dataSource.metadata?.contentType || 'application/octet-stream'
      });
      
      console.log(`✅ Generated presigned URL for download: ${presignedUrl}`);
      
      // Return the presigned URL
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          url: presignedUrl,
          filename: dataSource.filename,
          contentType: dataSource.metadata?.contentType || 'application/octet-stream'
        })
      };
    } else if (event.httpMethod === 'DELETE') {
      // Generate process ID for tracking
      const processId = `proc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      // STEP 1: Create process tracking record
      console.log(`📊 STEP 1: Creating process tracking record for deletion of ${dataSource.filename}`);
      const processRecord = await createProcessRecord(projectId, processId, dataSource.filename);
      
      try {
        // STEP 2: Delete all associated files from S3
        const filesToDelete = [];
        
        // Add original file
        filesToDelete.push({
          Bucket: bucketName,
          Key: s3Key
        });
        
        // Add processed file - construct path if processedKey is missing
        let processedKey = dataSource['processedKey'];
        if (!processedKey) {
          // Construct processed file path: data-processed/{dataSourceType}/{filename}
          processedKey = `data-processed/${dataSource.dataSourceType}/${dataSource.filename}`;
          console.log(`🔧 Constructed processed file path: ${processedKey}`);
        }
        
        filesToDelete.push({
          Bucket: bucketName,
          Key: processedKey
        });
        
        // Delete all files from S3
        console.log(`🗑️ STEP 2: Deleting ${filesToDelete.length} S3 objects for file ID: ${fileId}`);
        
        for (const deleteParams of filesToDelete) {
          console.log(`🗑️ Deleting S3 object: ${deleteParams.Bucket}/${deleteParams.Key}`);
          await s3.deleteObject(deleteParams).promise();
        }
        
        // STEP 3: Delete data source record from DynamoDB
        const deleteRecordParams = {
          TableName: tableName,
          Key: {
            projectId,
            id: fileId
          }
        };
        
        console.log(`🗑️ STEP 3: Deleting data source record from DynamoDB: ${JSON.stringify(deleteRecordParams)}`);
        
        await dynamodb.delete(deleteRecordParams).promise();
        
        // STEP 3.5: Processed data automatically removed when S3 files are deleted
        console.log(`✅ Processed data will be automatically unavailable in Athena after S3 deletion`);
        
        console.log(`✅ File, record, and processed data deleted successfully`);
        
        // STEP 4: Update process tracking to COMPLETED
        console.log(`📊 STEP 4: Updating process tracking record to COMPLETED`);
        await updateProcessRecord(projectId, processId, processRecord.timestamp, 'COMPLETED', {
          fileName: dataSource.filename,
          fileId,
          stage: 'deletion-complete',
          filesDeleted: filesToDelete.length
        });
        
        // Return success response
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: `File ${dataSource.filename} deleted successfully`,
            processId
          })
        };
      } catch (deleteError) {
        console.error('❌ Error during deletion:', deleteError);
        
        // Update process tracking to FAILED
        try {
          await updateProcessRecord(projectId, processId, processRecord.timestamp, 'FAILED', {
            fileName: dataSource.filename,
            fileId,
            stage: 'deletion-failed',
            error: deleteError.message
          }, deleteError.message);
        } catch (updateError) {
          console.error('❌ Failed to update process tracking record:', updateError);
        }
        
        throw deleteError;
      }
    } else {
      // Unsupported method
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: `Method not allowed: ${event.httpMethod}` 
        })
      };
    }
  } catch (error) {
    console.error('❌ Error processing file operation:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to process file operation',
        details: error.toString()
      })
    };
  }
};
