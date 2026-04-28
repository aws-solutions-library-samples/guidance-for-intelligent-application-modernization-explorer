// Force deployment timestamp: 2026-01-24T12:00:00.0NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-24T12:00:00.0NZ';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const dynamodbClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);
const s3 = new S3Client({});

const EXPORT_HISTORY_TABLE = process.env.EXPORT_HISTORY_TABLE;
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;

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
 * Sanitize project name for use in filenames
 */
function sanitizeProjectName(projectName) {
    if (!projectName) return 'unknown_project';
    
    return projectName
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/**
 * Export Reader Lambda Function
 * Handles GET requests for export history, details, and download URLs
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('Export Reader Event:', JSON.stringify(sanitizeEvent(event), null, 2));
    
    try {
        const { httpMethod, pathParameters, queryStringParameters } = event;
        const path = event.resource || event.path;
        
        // Extract user information from Cognito
        const userId = event.requestContext?.authorizer?.claims?.sub;
        
        if (!userId) {
            return createResponse(401, { error: 'Unauthorized: User ID not found' });
        }

        // Extract projectId from path parameters
        const projectId = pathParameters?.projectId;

        // Route requests based on HTTP method and path
        if (httpMethod === 'GET' && path.endsWith('/export/history')) {
            return await getExportHistory(queryStringParameters, userId, projectId);
        } else if (httpMethod === 'GET' && pathParameters?.exportId && path.includes('/download')) {
            return await generateDownloadUrl(pathParameters.exportId, projectId, userId);
        } else if (httpMethod === 'GET' && pathParameters?.exportId) {
            return await getExportDetails(pathParameters.exportId, projectId, userId);
        } else if (httpMethod === 'PUT' && pathParameters?.exportId && path.includes('/status')) {
            const body = event.body ? JSON.parse(event.body) : {};
            return await updateExportStatus(pathParameters.exportId, body, userId);
        } else {
            return createResponse(405, { error: 'Method Not Allowed' });
        }
    } catch (error) {
        console.error('Export Reader Error:', error);
        return createResponse(500, { 
            error: 'Internal Server Error',
            message: error.message 
        });
    }
};

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
    
    // Use stored S3 key if available, otherwise reconstruct it
    const s3Key = exportJob.zipFile || `exports/${exportId}/appmodex-${projectName}-${exportJob.projectId}.zip`;
    
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
            fileName: s3Key.split('/').pop(), // Extract filename from S3 key
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
            'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS'
        },
        body: JSON.stringify(body)
    };
}
