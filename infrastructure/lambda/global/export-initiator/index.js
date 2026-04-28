// Force deployment timestamp: 2026-01-24T12:00:00.0NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-24T12:00:00.0NZ';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { customAlphabet } = require('nanoid');

// Create custom nanoid that only uses CloudFormation-compatible characters
// CloudFormation stack names: ^[A-Za-z][A-Za-z0-9-]*$
// - Must start with letter (handled by prefixing)
// - Can only contain letters, numbers, and hyphens (no underscores)
// - Using only lowercase letters to ensure consistent casing across all AWS resources
const cloudFormationNanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

const dynamodbClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);
const stepfunctions = new SFNClient({});

const EXPORT_HISTORY_TABLE = process.env.EXPORT_HISTORY_TABLE;
const EXPORT_STEP_FUNCTION_ARN_PREFIX = process.env.EXPORT_STEP_FUNCTION_ARN_PREFIX;
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
 * Export Initiator Lambda Function
 * Handles POST /projects/{projectId}/export - initiates new export jobs
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('Export Initiator Event:', JSON.stringify(sanitizeEvent(event), null, 2));
    
    try {
        const { httpMethod, body } = event;
        
        // Extract user information from Cognito
        const userId = event.requestContext?.authorizer?.claims?.sub;
        const userName = event.requestContext?.authorizer?.claims?.['cognito:username'] || 
                        event.requestContext?.authorizer?.claims?.email;
        
        if (!userId) {
            return createResponse(401, { error: 'Unauthorized: User ID not found' });
        }

        // Only handle POST requests
        if (httpMethod !== 'POST') {
            return createResponse(405, { error: 'Method Not Allowed' });
        }

        return await initiateExport(body, userId, userName);
        
    } catch (error) {
        console.error('Export Initiator Error:', error);
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
    
    const exportId = cloudFormationNanoid(); // Generate 12-character CloudFormation-compatible ID
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
 * Create standardized HTTP response
 */
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-project-id',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        body: JSON.stringify(body)
    };
}
