// Force deployment timestamp: 2026-01-30T00:00:00.000Z
const DEPLOYMENT_TIMESTAMP = '2026-01-30T00:00:00.000Z';

/**
 * Athena Lookup Service Lambda Function
 * 
 * Performs a SINGLE Athena query to validate all unique values across all 5 column types.
 * Returns which values are already known (exist in normalized tables) vs unknown (need normalization).
 * 
 * This replaces the old approach of 5 separate Athena queries (one per column type).
 * 
 * IAM Permissions (Least Privilege):
 * - Athena: StartQueryExecution, GetQueryResults, GetQueryExecution on app-modex-workgroup-{projectId}
 * - S3: GetObject, PutObject on app-modex-results-{projectId}/* (for Athena results)
 * - Glue: GetDatabase, GetTable (read catalog only)
 * - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
 */

const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');

const athenaClient = new AthenaClient({});

// Environment variables
const GLUE_DATABASE = process.env.GLUE_DATABASE || 'app-modex-${projectId}';
const RESULTS_BUCKET = process.env.RESULTS_BUCKET || 'app-modex-results-${projectId}';
const NORMALIZED_DATA_DATABASE = process.env.NORMALIZED_DATA_DATABASE;

// Column type to table name mapping
const TABLE_MAPPING = {
  runtimes: 'normalized_runtimes',
  frameworks: 'normalized_frameworks',
  databases: 'normalized_databases',
  integrations: 'normalized_integrations',
  storages: 'normalized_storages'
};

/**
 * Build a UNION query to check all column types in a single Athena query
 */
function buildUnifiedQuery(uniqueValues, account) {
  const queries = [];
  
  for (const [columnType, values] of Object.entries(uniqueValues)) {
    if (values.length === 0) continue;
    
    const tableName = TABLE_MAPPING[columnType];
    const quotedValues = values.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
    
    // Query for this column type
    queries.push(`
      SELECT 
        '${columnType}' as column_type,
        original,
        normalized,
        confidence_score,
        timestamp as last_updated
      FROM "${NORMALIZED_DATA_DATABASE}".${tableName}
      WHERE confidence_score > 0.8
        AND date_diff('day', CAST(timestamp AS timestamp), current_timestamp) <= 30
        AND original IN (${quotedValues})
    `);
  }
  
  if (queries.length === 0) {
    return null;
  }
  
  // Combine all queries with UNION ALL
  return queries.join('\nUNION ALL\n');
}

/**
 * Wait for Athena query to complete
 */
async function waitForQueryCompletion(queryExecutionId, maxWaitTime = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const response = await athenaClient.send(new GetQueryExecutionCommand({
      QueryExecutionId: queryExecutionId
    }));
    
    const status = response.QueryExecution.Status.State;
    
    if (status === 'SUCCEEDED') {
      return true;
    } else if (status === 'FAILED' || status === 'CANCELLED') {
      const reason = response.QueryExecution.Status.StateChangeReason;
      throw new Error(`Athena query ${status}: ${reason}`);
    }
    
    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Athena query timeout after ${maxWaitTime}ms`);
}

/**
 * Parse Athena results into structured format
 */
function parseAthenaResults(results) {
  const existingNormalizations = {
    runtimes: new Map(),
    frameworks: new Map(),
    databases: new Map(),
    integrations: new Map(),
    storages: new Map()
  };
  
  if (!results.ResultSet || !results.ResultSet.Rows || results.ResultSet.Rows.length <= 1) {
    return existingNormalizations;
  }
  
  // Skip header row
  const dataRows = results.ResultSet.Rows.slice(1);
  
  for (const row of dataRows) {
    const columnType = row.Data[0]?.VarCharValue;
    const original = row.Data[1]?.VarCharValue;
    const normalized = row.Data[2]?.VarCharValue;
    const confidence = parseFloat(row.Data[3]?.VarCharValue || '0');
    const lastUpdated = row.Data[4]?.VarCharValue;
    
    if (columnType && original && normalized) {
      existingNormalizations[columnType].set(original, {
        normalized,
        confidence,
        lastUpdated
      });
    }
  }
  
  return existingNormalizations;
}

/**
 * Categorize values as known vs unknown for each column type
 */
function categorizeValues(uniqueValues, existingNormalizations) {
  const result = {};
  
  for (const [columnType, values] of Object.entries(uniqueValues)) {
    const known = [];
    const unknown = [];
    const knownMappings = {};
    
    for (const value of values) {
      if (existingNormalizations[columnType].has(value)) {
        known.push(value);
        knownMappings[value] = existingNormalizations[columnType].get(value);
      } else {
        unknown.push(value);
      }
    }
    
    result[columnType] = {
      total: values.length,
      known: known.length,
      unknown: unknown.length,
      knownValues: known,
      unknownValues: unknown,
      knownMappings
    };
  }
  
  return result;
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  console.log('🔍 Athena Lookup Service Lambda started');
  console.log('📋 Event:', JSON.stringify(event, null, 2));
  
  const { projectId, uniqueValues, processId, originalTimestamp, s3Key, filename } = event;
  
  // Validate required parameters
  if (!projectId || !uniqueValues) {
    throw new Error('Missing required parameters: projectId, uniqueValues');
  }
  
  try {
    const account = process.env.AWS_ACCOUNT_ID;
    const resultsBucket = RESULTS_BUCKET.replace('${projectId}', projectId.toLowerCase());
    
    // Build unified query
    console.log('🔨 Building unified Athena query...');
    const query = buildUnifiedQuery(uniqueValues, account);
    
    if (!query) {
      console.log('ℹ️ No values to query - all columns are empty');
      return {
        statusCode: 200,
        projectId,
        processId,
        originalTimestamp,
        s3Key,
        filename,
        lookupResults: {
          runtimes: { total: 0, known: 0, unknown: 0, knownValues: [], unknownValues: [], knownMappings: {} },
          frameworks: { total: 0, known: 0, unknown: 0, knownValues: [], unknownValues: [], knownMappings: {} },
          databases: { total: 0, known: 0, unknown: 0, knownValues: [], unknownValues: [], knownMappings: {} },
          integrations: { total: 0, known: 0, unknown: 0, knownValues: [], unknownValues: [], knownMappings: {} },
          storages: { total: 0, known: 0, unknown: 0, knownValues: [], unknownValues: [], knownMappings: {} }
        },
        totalKnown: 0,
        totalUnknown: 0
      };
    }
    
    console.log('📊 Unified query built successfully');
    console.log('Query preview:', query.substring(0, 500) + '...');
    
    // Execute Athena query
    console.log('🚀 Executing Athena query...');
    const queryExecution = await athenaClient.send(new StartQueryExecutionCommand({
      QueryString: query,
      QueryExecutionContext: {
        Database: NORMALIZED_DATA_DATABASE
      },
      ResultConfiguration: {
        OutputLocation: `s3://${resultsBucket}/athena-results/normalization/`
      },
      WorkGroup: 'primary'
    }));
    
    const queryExecutionId = queryExecution.QueryExecutionId;
    console.log(`✅ Query started: ${queryExecutionId}`);
    
    // Wait for query completion
    console.log('⏳ Waiting for query completion...');
    await waitForQueryCompletion(queryExecutionId);
    console.log('✅ Query completed successfully');
    
    // Get query results
    console.log('📥 Fetching query results...');
    const results = await athenaClient.send(new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId
    }));
    
    const rowCount = results.ResultSet?.Rows?.length || 0;
    console.log(`✅ Retrieved ${rowCount} result rows`);
    
    // Parse results
    console.log('🔄 Parsing Athena results...');
    const existingNormalizations = parseAthenaResults(results);
    
    // Categorize values as known vs unknown
    console.log('📊 Categorizing values...');
    const lookupResults = categorizeValues(uniqueValues, existingNormalizations);
    
    // Calculate totals
    let totalKnown = 0;
    let totalUnknown = 0;
    
    for (const columnType of Object.keys(lookupResults)) {
      totalKnown += lookupResults[columnType].known;
      totalUnknown += lookupResults[columnType].unknown;
      
      console.log(`   ${columnType}: ${lookupResults[columnType].known} known, ${lookupResults[columnType].unknown} unknown`);
    }
    
    console.log(`✅ Lookup complete: ${totalKnown} known, ${totalUnknown} unknown (total: ${totalKnown + totalUnknown})`);
    
    return {
      statusCode: 200,
      projectId,
      processId,
      originalTimestamp,
      s3Key,
      filename,
      lookupResults,
      totalKnown,
      totalUnknown,
      queryExecutionId
    };
    
  } catch (error) {
    console.error('❌ Error in Athena lookup service:', error);
    throw error;
  }
};
