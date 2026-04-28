// Force deployment timestamp: 2026-02-02T00:00:00.000Z
const DEPLOYMENT_TIMESTAMP = '2026-02-02T00:00:00.000Z';

/**
 * Mapping Aggregator Lambda Function
 * 
 * Aggregates normalized mappings from all 5 parallel branches and persists to S3.
 * Each execution creates unique files to avoid race conditions with concurrent uploads.
 * Athena queries all files in the folder automatically.
 * 
 * IAM Permissions (Least Privilege):
 * - S3: PutObject on app-modex-normalized-data-{account}/normalized-data/* only
 * - Glue: UpdateTable (refresh Athena metadata)
 * - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { GlueClient, UpdateTableCommand } = require('@aws-sdk/client-glue');

const s3Client = new S3Client({});
const glueClient = new GlueClient({});

// Environment variables
const NORMALIZED_DATA_BUCKET = process.env.NORMALIZED_DATA_BUCKET;
const NORMALIZED_DATA_DATABASE = process.env.NORMALIZED_DATA_DATABASE;

// Column type to folder/table name mapping
const FOLDER_MAPPING = {
  runtimes: 'normalized-runtimes',
  frameworks: 'normalized-frameworks',
  databases: 'normalized-databases',
  integrations: 'normalized-integrations',
  storages: 'normalized-storages'
};

/**
 * Convert mappings to CSV format
 */
function convertToCsv(mappings) {
  const header = 'original_name,normalized_name,confidence_score,created_date,last_updated';
  
  const rows = mappings.map(mapping => {
    return [
      `"${mapping.original_name}"`,
      `"${mapping.normalized_name}"`,
      mapping.confidence_score,
      `"${mapping.created_date}"`,
      `"${mapping.last_updated}"`
    ].join(',');
  });
  
  return [header, ...rows].join('\n');
}

/**
 * Write CSV content to S3
 */
async function writeToS3(s3Path, csvContent) {
  console.log(`💾 Writing to S3: ${s3Path}`);
  
  await s3Client.send(new PutObjectCommand({
    Bucket: NORMALIZED_DATA_BUCKET,
    Key: s3Path,
    Body: csvContent,
    ContentType: 'text/csv'
  }));
  
  console.log(`✅ Successfully wrote to S3`);
}

/**
 * Update Glue table partition (trigger table refresh)
 */
async function updateGlueTablePartition(folderName) {
  try {
    const tableName = folderName; // Table name matches folder name
    
    console.log(`🔄 Updating Glue table: ${tableName}`);
    
    await glueClient.send(new UpdateTableCommand({
      DatabaseName: NORMALIZED_DATA_DATABASE,
      TableInput: {
        Name: tableName,
        StorageDescriptor: {
          Location: `s3://${NORMALIZED_DATA_BUCKET}/normalized-data/${folderName}/`
        }
      }
    }));
    
    console.log(`✅ Glue table updated: ${tableName}`);
    
  } catch (error) {
    console.warn('⚠️ Error updating Glue table partition:', error.message);
    // Don't fail the entire process if table update fails
  }
}

/**
 * Process mappings for one column type
 */
async function processColumnType(columnType, normalizedMappings, projectId, processId) {
  const folderName = FOLDER_MAPPING[columnType];
  if (!folderName) {
    throw new Error(`Unknown column type: ${columnType}`);
  }
  
  console.log(`\n📊 Processing ${columnType}: ${normalizedMappings.length} new mappings`);
  
  if (normalizedMappings.length === 0) {
    console.log(`ℹ️ No new mappings for ${columnType}, skipping`);
    return {
      columnType,
      newCount: 0,
      s3Path: null
    };
  }
  
  // Sort mappings by original_name for consistency
  const sortedMappings = normalizedMappings.sort((a, b) => 
    a.original_name.localeCompare(b.original_name)
  );
  
  // Convert to CSV
  const csvContent = convertToCsv(sortedMappings);
  
  // Write to S3 with unique filename: columnType-projectId-processId.csv
  const filename = `${columnType}-${projectId}-${processId}.csv`;
  const s3Path = `normalized-data/${folderName}/${filename}`;
  await writeToS3(s3Path, csvContent);
  
  // Update Glue table (points to folder, will read all CSV files)
  await updateGlueTablePartition(folderName);
  
  return {
    columnType,
    newCount: normalizedMappings.length,
    s3Path: `s3://${NORMALIZED_DATA_BUCKET}/${s3Path}`
  };
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  console.log('📦 Mapping Aggregator Lambda started');
  console.log('📋 Event:', JSON.stringify(event, null, 2));
  
  // Event is an array of results from parallel branches
  const parallelResults = Array.isArray(event) ? event : [event];
  
  // Extract common fields from first result
  const firstResult = parallelResults[0] || {};
  const { projectId, processId, originalTimestamp, s3Key, filename } = firstResult;
  
  try {
    console.log(`🔄 Aggregating results from ${parallelResults.length} parallel branches`);
    
    // Process each column type
    const aggregationResults = [];
    let totalNewMappings = 0;
    
    for (const result of parallelResults) {
      if (result.columnType && result.normalizedMappings) {
        const columnResult = await processColumnType(
          result.columnType,
          result.normalizedMappings,
          projectId,
          processId
        );
        
        aggregationResults.push(columnResult);
        totalNewMappings += columnResult.newCount;
      }
    }
    
    console.log(`\n✅ Aggregation complete:`);
    console.log(`   - Total new mappings: ${totalNewMappings}`);
    
    return {
      statusCode: 200,
      projectId,
      processId,
      originalTimestamp,
      s3Key,
      filename,
      aggregationResults,
      totalNewMappings
    };
    
  } catch (error) {
    console.error('❌ Error in mapping aggregator:', error);
    throw error;
  }
};
