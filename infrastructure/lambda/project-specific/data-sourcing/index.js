const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client } = require('@aws-sdk/client-s3');

// Initialize AWS clients
const athena = new AthenaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3 = new S3Client({});

// Environment variables
const PROJECT_ID = process.env.PROJECT_ID;
const GLUE_DATABASE = process.env.GLUE_DATABASE;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET;
const WORKGROUP_NAME = process.env.WORKGROUP_NAME;

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
};

/**
 * Data Sourcing Lambda Function
 * Retrieves data from DynamoDB tables and Athena views for export processing
 * Supports all export categories: Skills, Tech Vision, Applications, Insights, Planning
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('🚀 Data Sourcing Lambda started');
    console.log('📋 Event:', JSON.stringify(sanitizeEvent(event), null, 2));
    console.log('🔧 Environment:', { PROJECT_ID, GLUE_DATABASE, RESULTS_BUCKET, WORKGROUP_NAME });
    
    try {
        const { category, projectId, exportId, selectedCategories } = event;
        
        // Validate required parameters
        if (!category) {
            throw new Error('Missing required parameter: category');
        }
        if (!projectId) {
            throw new Error('Missing required parameter: projectId');
        }
        if (!exportId) {
            throw new Error('Missing required parameter: exportId');
        }
        
        // Ensure project-specific resource isolation
        if (projectId !== PROJECT_ID) {
            throw new Error(`Access denied: projectId ${projectId} does not match Lambda PROJECT_ID ${PROJECT_ID}`);
        }
        
        // Debug logging
        console.log(`🔍 Debug - category: "${category}" (type: ${typeof category})`);
        console.log(`🔍 Debug - selectedCategories:`, JSON.stringify(selectedCategories));
        console.log(`🔍 Debug - selectedCategories.includes(category):`, selectedCategories ? selectedCategories.includes(category) : 'selectedCategories is null/undefined');
        
        // Check if this category is selected for export
        if (selectedCategories && !selectedCategories.includes(category)) {
            console.log(`❌ Category ${category} not selected for export, skipping`);
            return {
                category,
                skipped: true,
                reason: 'Category not selected'
            };
        }
        
        console.log(`📊 Sourcing data for category: ${category}`);
        
        // Get data based on category with retry logic
        const data = await retryOperation(
            () => getDataForCategory(category, projectId, exportId),
            `get data for category ${category}`
        );
        
        console.log(`✅ Successfully sourced ${data.length} records for category ${category}`);
        
        return {
            category,
            success: true,
            data,
            recordCount: data.length,
            timestamp: new Date().toISOString(),
            projectId,
            exportId
        };
    } catch (error) {
        console.error('❌ Data Sourcing Error:', error);
        
        // Return structured error response
        return {
            category: event.category || 'unknown',
            success: false,
            error: error.message,
            errorType: error.name || 'DataSourcingError',
            timestamp: new Date().toISOString(),
            projectId: event.projectId,
            exportId: event.exportId
        };
    }
};

/**
 * Get data for a specific category
 * Supports both DynamoDB tables and Athena views based on category type
 * Falls back to mock data generation when real data sources are unavailable
 */
async function getDataForCategory(category, projectId, exportId) {
    console.log(`🔍 Getting data for category: ${category}`);
    
    // Category mapping with data source information
    const categoryConfig = {
        // Data section categories - use Athena views for processed data
        'skills': {
            type: 'athena',
            source: `${GLUE_DATABASE}.v_team_skills`,
            orderBy: 'team, skill'
        },
        'technology-vision': {
            type: 'athena',
            source: `${GLUE_DATABASE}.v_tech_vision`,
            orderBy: 'quadrant, technology'
        },
        'application-portfolio': {
            type: 'athena',
            source: `${GLUE_DATABASE}.v_application_portfolio`,
            orderBy: 'department, applicationname'
        },
        'application-tech-stack': {
            type: 'athena',
            source: `${GLUE_DATABASE}.v_tech_stack`,
            orderBy: 'applicationname, componentname'
        },
        'application-infrastructure': {
            type: 'athena',
            source: `${GLUE_DATABASE}.v_infrastructure_resources`,
            orderBy: 'applicationname, servername'
        },
        'application-utilization': {
            type: 'athena',
            source: `${GLUE_DATABASE}.v_resource_utilization`,
            orderBy: 'applicationname, servername, timestamp'
        },
        
        // Insights section categories - use DynamoDB tables for analysis results
        'skills-analysis': {
            type: 'dynamodb',
            tableName: `app-modex-skills-analysis-${projectId}`.toLowerCase(),
            indexName: null
        },
        'vision-analysis': {
            type: 'dynamodb',
            tableName: `app-modex-vision-analysis-${projectId}`.toLowerCase(),
            indexName: null
        },
        'tech-stack-analysis': {
            type: 'dynamodb',
            tableName: `app-modex-tech-stack-analysis-${projectId}`.toLowerCase(),
            indexName: null
        },
        'infrastructure-analysis': {
            type: 'dynamodb',
            tableName: `app-modex-infrastructure-analysis-${projectId}`.toLowerCase(),
            indexName: null
        },
        'utilization-analysis': {
            type: 'dynamodb',
            tableName: `app-modex-utilization-analysis-${projectId}`.toLowerCase(),
            indexName: null
        },
        'team-analysis': {
            type: 'dynamodb',
            tableName: `app-modex-team-analysis-${projectId}`.toLowerCase(),
            indexName: null
        },
        
        // Planning section categories - use DynamoDB tables for planning results
        'pilot-identification': {
            type: 'dynamodb',
            tableName: `app-modex-pilot-results-${projectId}`.toLowerCase(),
            indexName: null
        },
        'application-grouping': {
            type: 'dynamodb',
            tableName: `app-modex-application-buckets-${projectId}`.toLowerCase(),
            indexName: null
        },
        'tco-estimates': {
            type: 'dynamodb',
            tableName: `app-modex-tco-estimates-${projectId}`.toLowerCase(),
            indexName: null
        },
        'team-estimates': {
            type: 'dynamodb',
            tableName: `app-modex-team-estimates-${projectId}`.toLowerCase(),
            indexName: null
        }
    };
    
    const config = categoryConfig[category];
    if (!config) {
        throw new Error(`Unknown category: ${category}`);
    }
    
    console.log(`📊 Using ${config.type} source for category ${category}`);
    
    try {
        if (config.type === 'athena') {
            return await getAthenaData(config.source, config.orderBy, projectId, exportId);
        } else if (config.type === 'dynamodb') {
            // For PLANNING macro-category, tables are project-specific and don't have projectId field
            const planningCategories = ['pilot-identification', 'application-grouping', 'tco-estimates', 'team-estimates'];
            const requiresProjectIdFilter = !planningCategories.includes(category);
            return await getDynamoDBData(config.tableName, config.indexName, projectId, requiresProjectIdFilter);
        } else {
            throw new Error(`Unsupported data source type: ${config.type}`);
        }
    } catch (error) {
        console.warn(`⚠️ Real data source failed for ${category}:`, error.message);
        throw error;
    }
}

/**
 * Get data from Athena views
 */
async function getAthenaData(source, orderBy, projectId, exportId) {
    const query = `
        SELECT * FROM ${source} 
        WHERE project_id = '${projectId}'
        ${orderBy ? `ORDER BY ${orderBy}` : ''}
    `;
    
    console.log(`🔍 Executing Athena query:`, query);
    
    // Execute Athena query
    const queryExecutionId = await executeAthenaQuery(query, exportId);
    
    // Wait for query completion and get results
    const results = await getQueryResults(queryExecutionId);
    
    return results;
}

/**
 * Get data from DynamoDB tables
 */
async function getDynamoDBData(tableName, indexName, projectId, requiresProjectIdFilter = true) {
    console.log(`🔍 Querying DynamoDB table: ${tableName}`);
    
    try {
        let params;
        
        if (indexName) {
            // Query using GSI
            params = {
                TableName: tableName,
                IndexName: indexName,
                KeyConditionExpression: 'projectId = :projectId',
                ExpressionAttributeValues: {
                    ':projectId': projectId
                }
            };
        } else if (requiresProjectIdFilter) {
            // Query using primary key or scan if no specific key structure
            params = {
                TableName: tableName,
                FilterExpression: 'projectId = :projectId',
                ExpressionAttributeValues: {
                    ':projectId': projectId
                }
            };
        } else {
            // Scan entire table (for project-specific tables that don't have projectId field)
            params = {
                TableName: tableName
            };
        }
        
        const results = [];
        let lastEvaluatedKey = null;
        
        do {
            if (lastEvaluatedKey) {
                params.ExclusiveStartKey = lastEvaluatedKey;
            }
            
            let response;
            if (indexName) {
                response = await docClient.send(new QueryCommand(params));
            } else {
                response = await docClient.send(new ScanCommand(params));
            }
            
            if (response.Items) {
                results.push(...response.Items);
            }
            
            lastEvaluatedKey = response.LastEvaluatedKey;
        } while (lastEvaluatedKey);
        
        console.log(`✅ Retrieved ${results.length} records from DynamoDB table ${tableName}`);
        return results;
        
    } catch (error) {
        // Handle case where table doesn't exist (return empty array)
        if (error.name === 'ResourceNotFoundException') {
            console.log(`⚠️ Table ${tableName} not found, returning empty results`);
            return [];
        }
        throw error;
    }
}

/**
 * Execute Athena query
 */
async function executeAthenaQuery(query, exportId) {
    const params = {
        QueryString: query,
        WorkGroup: WORKGROUP_NAME,
        QueryExecutionContext: {
            Database: GLUE_DATABASE
        },
        ResultConfiguration: {
            OutputLocation: `s3://${RESULTS_BUCKET}/export-queries/${exportId}/`
        }
    };
    
    const command = new StartQueryExecutionCommand(params);
    const result = await athena.send(command);
    return result.QueryExecutionId;
}

/**
 * Wait for query completion and get results
 */
async function getQueryResults(queryExecutionId) {
    console.log(`⏳ Waiting for query completion: ${queryExecutionId}`);
    
    // Wait for query to complete with timeout
    let status = 'RUNNING';
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout
    
    while ((status === 'RUNNING' || status === 'QUEUED') && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
        
        const command = new GetQueryExecutionCommand({
            QueryExecutionId: queryExecutionId
        });
        const execution = await athena.send(command);
        
        status = execution.QueryExecution.Status.State;
        
        if (status === 'FAILED' || status === 'CANCELLED') {
            const reason = execution.QueryExecution.Status.StateChangeReason;
            throw new Error(`Athena query failed: ${reason}`);
        }
    }
    
    if (attempts >= maxAttempts) {
        throw new Error(`Athena query timeout after ${maxAttempts} seconds`);
    }
    
    console.log(`✅ Query completed successfully: ${queryExecutionId}`);
    
    // Get query results with pagination
    const results = [];
    let nextToken = null;
    
    do {
        const params = {
            QueryExecutionId: queryExecutionId,
            MaxResults: 1000
        };
        
        if (nextToken) {
            params.NextToken = nextToken;
        }
        
        const command = new GetQueryResultsCommand(params);
        const response = await athena.send(command);
        
        if (!response.ResultSet || !response.ResultSet.Rows) {
            console.log('⚠️ No results returned from Athena query');
            break;
        }
        
        // Skip header row on first iteration
        const rows = nextToken ? response.ResultSet.Rows : response.ResultSet.Rows.slice(1);
        
        // Convert rows to objects
        const columnNames = response.ResultSet.ResultSetMetadata.ColumnInfo.map(col => col.Name);
        
        for (const row of rows) {
            const record = {};
            row.Data.forEach((cell, index) => {
                record[columnNames[index]] = cell.VarCharValue || null;
            });
            results.push(record);
        }
        
        nextToken = response.NextToken;
    } while (nextToken);
    
    console.log(`✅ Retrieved ${results.length} records from Athena`);
    return results;
}

/**
 * Retry operation with exponential backoff
 */
async function retryOperation(operation, operationName) {
    let lastError;
    
    for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            console.log(`🔄 Attempt ${attempt}/${RETRY_CONFIG.maxRetries} for ${operationName}`);
            return await operation();
        } catch (error) {
            lastError = error;
            console.error(`❌ Attempt ${attempt} failed for ${operationName}:`, error.message);
            
            // Don't retry on certain error types
            if (isNonRetryableError(error)) {
                console.log(`🚫 Non-retryable error, not retrying: ${error.message}`);
                throw error;
            }
            
            // Don't wait after the last attempt
            if (attempt < RETRY_CONFIG.maxRetries) {
                const delay = Math.min(
                    RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
                    RETRY_CONFIG.maxDelay
                );
                console.log(`⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    console.error(`❌ All retry attempts failed for ${operationName}`);
    throw lastError;
}

/**
 * Check if an error should not be retried
 */
function isNonRetryableError(error) {
    const nonRetryableErrors = [
        'ValidationException',
        'InvalidParameterException',
        'AccessDeniedException',
        'UnauthorizedException',
        'ResourceNotFoundException'
    ];
    
    return nonRetryableErrors.includes(error.name) || 
           error.message.includes('Access denied') ||
           error.message.includes('does not match Lambda PROJECT_ID') ||
           error.message.includes('Unknown category');
}