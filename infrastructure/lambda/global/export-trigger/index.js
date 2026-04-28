// Force deployment timestamp: 2025-12-18T16:32:05.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:33:05.3NZ';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { v4: uuidv4 } = require('uuid');

const dynamodbClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);
const s3 = new S3Client({});
const stepfunctions = new SFNClient({});

const EXPORT_HISTORY_TABLE = process.env.EXPORT_HISTORY_TABLE;
const EXPORT_STEP_FUNCTION_ARN_PREFIX = process.env.EXPORT_STEP_FUNCTION_ARN_PREFIX; // e.g., "arn:aws:states:region:account:stateMachine:export-"
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;

/**
 * Sanitize project name for use in filenames
 * Replaces spaces with underscores and removes special characters
 */
function sanitizeProjectName(projectName) {
    if (!projectName) return 'unknown_project';
    
    return projectName
        .toLowerCase()
        .replace(/\s+/g, '_')           // Replace spaces with underscores
        .replace(/[^a-z0-9_-]/g, '')   // Remove special characters except underscores and hyphens
        .replace(/_+/g, '_')           // Replace multiple underscores with single
        .replace(/^_|_$/g, '');        // Remove leading/trailing underscores
}

/**
 * Retrieve project name from DynamoDB
 */
async function getProjectName(projectId) {
    try {
        console.log(`🔍 Retrieving project name for projectId: ${projectId}`);
        
        const params = {
            TableName: PROJECTS_TABLE,
            Key: { projectId }
        };
        
        const result = await dynamodb.send(new GetCommand(params));
        
        if (!result.Item) {
            console.warn(`⚠️ Project not found in DynamoDB: ${projectId}`);
            return 'unknown_project';
        }
        
        const projectName = result.Item.name || 'unnamed_project';
        console.log(`✅ Retrieved project name: ${projectName}`);
        
        return sanitizeProjectName(projectName);
    } catch (error) {
        console.error('❌ Error retrieving project name:', error);
        return 'unknown_project';
    }
}

/**
 * Export Trigger Lambda Function
 * API Gateway handler for export operations - delegates actual work to project-specific Step Functions
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('Export Orchestrator Event:', JSON.stringify(sanitizeEvent(event), null, 2));
    
    try {
        const { httpMethod, pathParameters, queryStringParameters, body } = event;
        const path = event.resource || event.path;
        
        // Extract user information from Cognito
        const userId = event.requestContext?.authorizer?.claims?.sub;
        const userName = event.requestContext?.authorizer?.claims?.['cognito:username'] || 
                        event.requestContext?.authorizer?.claims?.email;
        
        if (!userId) {
            return createResponse(401, { error: 'Unauthorized: User ID not found' });
        }

        // Extract projectId from path parameters (for /projects/{projectId}/export* paths)
        const projectId = pathParameters?.projectId;

        // Route requests based on HTTP method and path
        // Support both old (/exports) and new (/projects/{projectId}/export) path patterns
        if (httpMethod === 'POST' && (path === '/exports' || path.endsWith('/export'))) {
            return await initiateExport(body, userId, userName);
        } else if (httpMethod === 'GET' && (path === '/exports/history' || path.endsWith('/export/history'))) {
            return await getExportHistory(queryStringParameters, userId, projectId);
        } else if (httpMethod === 'GET' && pathParameters?.exportId && path.includes('/download')) {
            const exportProjectId = projectId || queryStringParameters?.projectId;
            if (!exportProjectId) {
                return createResponse(400, { error: 'projectId is required' });
            }
            return await generateDownloadUrl(pathParameters.exportId, exportProjectId, userId);
        } else if (httpMethod === 'GET' && pathParameters?.exportId) {
            const exportProjectId = projectId || queryStringParameters?.projectId;
            if (!exportProjectId) {
                return createResponse(400, { error: 'projectId is required' });
            }
            return await getExportDetails(pathParameters.exportId, exportProjectId, userId);
        } else if (httpMethod === 'PUT' && pathParameters?.exportId && path.includes('/status')) {
            return await updateExportStatus(pathParameters.exportId, body, userId);
        } else {
            return createResponse(404, { error: 'Not Found' });
        }
    } catch (error) {
        console.error('Export Orchestrator Error:', error);
        return createResponse(500, { 
            error: 'Internal Server Error',
            message: error.message 
        });
    }
};

/**
 * Initiate a new export job - delegates to project-specific Step Function
 */
async function initiateExport(body, userId, userName) {
    const requestData = JSON.parse(body || '{}');
    const { projectId, selectedCategories } = requestData;
    
    // Validate input
    if (!projectId || !selectedCategories || !Array.isArray(selectedCategories) || selectedCategories.length === 0) {
        return createResponse(400, { 
            error: 'Bad Request',
            message: 'projectId and selectedCategories (non-empty array) are required' 
        });
    }
    
    const exportId = uuidv4();
    const createdAt = new Date().toISOString();
    
    // Create initial export job record
    const exportJob = {
        exportId,
        projectId,
        userId,
        userName,
        selectedCategories,
        status: 'INITIATED',
        createdAt,
        metadata: {
            totalFiles: 0,
            zipSizeBytes: 0,
            processingTimeMs: 0
        },
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    };
    
    // Save to DynamoDB
    await dynamodb.send(new PutCommand({
        TableName: EXPORT_HISTORY_TABLE,
        Item: exportJob
    }));
    
    // Start project-specific Step Function
    const stepFunctionArn = `${EXPORT_STEP_FUNCTION_ARN_PREFIX}${projectId}`;
    const executionName = `export-${exportId}-${Date.now()}`;
    
    const stepFunctionInput = {
        exportId,
        projectId,
        userId,
        userName,
        selectedCategories,
        createdAt
    };
    
    try {
        const executionResult = await stepfunctions.send(new StartExecutionCommand({
            stateMachineArn: stepFunctionArn,
            name: executionName,
            input: JSON.stringify(stepFunctionInput)
        }));
        
        // Update export job with execution details
        await dynamodb.send(new UpdateCommand({
            TableName: EXPORT_HISTORY_TABLE,
            Key: { exportId, projectId },
            UpdateExpression: 'SET executionArn = :executionArn, #status = :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':executionArn': executionResult.executionArn,
                ':status': 'PROCESSING'
            }
        }));
        
        console.log(`Export job ${exportId} initiated for project ${projectId} by user ${userId}`);
        console.log(`Step Function execution started: ${executionResult.executionArn}`);
        
        return createResponse(201, {
            exportId,
            projectId,
            status: 'PROCESSING',
            createdAt,
            selectedCategories,
            executionArn: executionResult.executionArn
        });
        
    } catch (error) {
        console.error(`Failed to start Step Function for project ${projectId}:`, error);
        
        // Update export job status to failed
        await dynamodb.send(new UpdateCommand({
            TableName: EXPORT_HISTORY_TABLE,
            Key: { exportId, projectId },
            UpdateExpression: 'SET #status = :status, errorMessage = :errorMessage',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': 'FAILED',
                ':errorMessage': error.message
            }
        }));
        
        return createResponse(500, {
            error: 'Failed to start export process',
            message: error.message,
            exportId
        });
    }
}

/**
 * Get export history with pagination and filtering
 */
async function getExportHistory(queryParams, userId, projectId) {
    const {
        projectId: queryProjectId,
        status,
        limit = '25',
        nextToken
    } = queryParams || {};
    
    // Use projectId from path parameters if available, otherwise from query string
    const finalProjectId = projectId || queryProjectId;

    let params = {
        TableName: EXPORT_HISTORY_TABLE,
        Limit: parseInt(limit),
        ScanIndexForward: false // Sort by createdAt descending
    };
    
    // Use appropriate index based on query parameters
    if (finalProjectId) {
        params.IndexName = 'projectId-createdAt-index';
        params.KeyConditionExpression = 'projectId = :projectId';
        params.ExpressionAttributeValues = { ':projectId': finalProjectId };
    } else {
        // Query by userId
        params.IndexName = 'userId-createdAt-index';
        params.KeyConditionExpression = 'userId = :userId';
        params.ExpressionAttributeValues = { ':userId': userId };
    }
    
    // Add status filter if provided
    if (status) {
        if (params.FilterExpression) {
            params.FilterExpression += ' AND #status = :status';
        } else {
            params.FilterExpression = '#status = :status';
        }
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues = {
            ...params.ExpressionAttributeValues,
            ':status': status
        };
    }
    
    // Handle pagination
    if (nextToken) {
        try {
            params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        } catch (error) {
            return createResponse(400, { error: 'Invalid nextToken' });
        }
    }
    
    const result = await dynamodb.send(new QueryCommand(params));
    
    // Prepare response
    const response = {
        items: result.Items || [],
        count: result.Count || 0
    };
    
    if (result.LastEvaluatedKey) {
        response.nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }
    
    return createResponse(200, response);
}

/**
 * Get details for a specific export
 */
async function getExportDetails(exportId, projectId, userId) {
    const params = {
        TableName: EXPORT_HISTORY_TABLE,
        Key: { exportId, projectId }
    };
    
    const result = await dynamodb.send(new GetCommand(params));
    
    if (!result.Item) {
        return createResponse(404, { error: 'Export not found' });
    }
    
    // Verify user has access to this export
    if (result.Item.userId !== userId) {
        return createResponse(403, { error: 'Access denied' });
    }
    
    return createResponse(200, result.Item);
}

/**
 * Update export status (called by frontend when Step Function completes)
 */
async function updateExportStatus(exportId, body, userId) {
    try {
        const { projectId, status, metadata } = body;
        
        if (!projectId || !status) {
            return createResponse(400, { error: 'projectId and status are required' });
        }
        
        // Update export status
        const updateParams = {
            TableName: EXPORT_HISTORY_TABLE,
            Key: { exportId, projectId },
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': status,
                ':updatedAt': new Date().toISOString()
            }
        };
        
        // Add metadata if provided
        if (metadata) {
            updateParams.UpdateExpression += ', metadata = :metadata';
            updateParams.ExpressionAttributeValues[':metadata'] = metadata;
        }
        
        await dynamodb.send(new UpdateCommand(updateParams));
        
        return createResponse(200, { 
            message: 'Export status updated successfully',
            exportId,
            status
        });
        
    } catch (error) {
        console.error('Error updating export status:', error);
        return createResponse(500, { 
            error: 'Failed to update export status',
            message: error.message 
        });
    }
}

/**
 * Generate secure download URL for completed export
 */
async function generateDownloadUrl(exportId, projectId, userId) {
    // Get export details
    const params = {
        TableName: EXPORT_HISTORY_TABLE,
        Key: { exportId, projectId }
    };
    
    const result = await dynamodb.send(new GetCommand(params));
    
    if (!result.Item) {
        return createResponse(404, { error: 'Export not found' });
    }
    
    const exportJob = result.Item;
    
    // Verify user has access
    if (exportJob.userId !== userId) {
        return createResponse(403, { error: 'Access denied' });
    }
    
    // Check if export is completed
    if (exportJob.status !== 'COMPLETED') {
        return createResponse(400, { 
            error: 'Export not ready',
            status: exportJob.status 
        });
    }
    
    // Generate signed URL for download from project-specific bucket
    const projectBucket = `app-modex-data-${exportJob.projectId}`.toLowerCase();
    
    // Get project name for the new ZIP filename
    const projectName = await getProjectName(exportJob.projectId);
    const s3Key = `exports/${exportId}/appmodex-${projectName}-${exportJob.projectId}.zip`;
    
    try {
        const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
            Bucket: projectBucket,
            Key: s3Key
        }), { expiresIn: 3600 }); // 1 hour
        
        // Update download count and last download time
        await dynamodb.send(new UpdateCommand({
            TableName: EXPORT_HISTORY_TABLE,
            Key: { exportId, projectId },
            UpdateExpression: 'ADD downloadCount :inc SET lastDownloadAt = :timestamp',
            ExpressionAttributeValues: {
                ':inc': 1,
                ':timestamp': new Date().toISOString()
            }
        }));
        
        return createResponse(200, {
            downloadUrl,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            fileName: `appmodex-${projectName}-${exportJob.projectId}.zip`,
            fileSizeBytes: exportJob.metadata?.zipSizeBytes || 0
        });
    } catch (error) {
        console.error('Error generating download URL:', error);
        return createResponse(500, { 
            error: 'Failed to generate download URL',
            message: error.message 
        });
    }
}

/**
 * Create standardized HTTP response
 */
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-project-id',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify(body)
    };
}