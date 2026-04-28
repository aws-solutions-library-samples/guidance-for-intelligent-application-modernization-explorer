// Force deployment timestamp: 2025-07-23T17:00:00.0NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:19.3NZ';

/**
 * Project Provisioning Lambda Function
 * Handles SQS messages for project operations (create, delete)
 * Triggers CodeBuild for provisioning and destruction
 */

const AWS = require('aws-sdk');
const { sanitizeEvent } = require('app-modex-shared');

// Initialize AWS clients
const dynamodb = new AWS.DynamoDB.DocumentClient();
const codebuild = new AWS.CodeBuild();
const cloudformation = new AWS.CloudFormation();
const secretsManager = new AWS.SecretsManager();

// Environment variables
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;
const PROJECT_DATA_TABLE = process.env.PROJECT_DATA_TABLE;
const DEPLOYMENT_BUCKET = process.env.DEPLOYMENT_BUCKET;
const CODEBUILD_PROJECT = process.env.CODEBUILD_PROJECT;
const APP_CONFIG_SECRET_ARN = process.env.APP_CONFIG_SECRET_ARN;

// Cache for secrets (loaded at cold start)
let appConfig = null;

/**
 * Load configuration from Secrets Manager
 */
async function loadConfig() {
  if (appConfig) return appConfig;
  
  const response = await secretsManager.getSecretValue({ SecretId: APP_CONFIG_SECRET_ARN }).promise();
  appConfig = JSON.parse(response.SecretString);
  return appConfig;
}

/**
 * Main handler function for SQS messages
 */
exports.handler = async (event) => {
  console.log('SQS Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  // Load configuration from Secrets Manager
  const config = await loadConfig();
  const IDENTITY_POOL_ID = config.identityPoolId;
  
  const batchItemFailures = [];
  
  try {
    // Process each SQS record
    for (const record of event.Records) {
      try {
        const messageBody = JSON.parse(record.body);
        console.log('Processing message:', messageBody);
        
        await handleProjectOperation(messageBody);
        
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
    
    return { statusCode: 200, body: 'SQS messages processed successfully' };
  } catch (error) {
    console.error('Error processing SQS messages:', error);
    throw error; // Let Lambda retry the batch
  }
};

/**
 * Handle project operations from SQS messages
 */
async function handleProjectOperation(message) {
  try {
    const { operation, projectId, userId, previousStatus } = message;
    
    if (!projectId || !operation) {
      console.log('Skipping message - missing projectId or operation');
      return;
    }
    
    console.log(`Processing ${operation} operation for project ${projectId}`);
    
    // Handle different operations
    switch (operation) {
      case 'CREATE':
        // New project created - trigger provisioning
        console.log(`New project ${projectId} created - triggering provisioning`);
        await triggerCodeBuild(projectId, 'deploy');
        break;
        
      case 'DELETE':
        // Project deletion requested
        console.log(`Project ${projectId} deletion requested - previous status: ${previousStatus}`);
        
        if (previousStatus === 'failed-to-provision' || previousStatus === 'failed') {
          // If project failed to provision, check for existing stack before deleting
          console.log(`Project ${projectId} failed to provision - checking for existing CDK stack`);
          const stackInfo = await checkStackExists(projectId);
          
          if (stackInfo) {
            // Stack exists - update project with stack info for UI to display modal
            console.log(`CDK stack found for failed project ${projectId}:`, stackInfo.StackName, stackInfo.StackStatus);
            await updateProjectWithStackInfo(projectId, stackInfo);
          } else {
            // No stack found - delete immediately
            console.log(`No CDK stack found for failed project ${projectId} - deleting record immediately`);
            await deleteProjectRecord(projectId);
          }
        } else if (previousStatus === 'failed-to-delete') {
          // If project failed to delete, it means the stack still exists - show stack info
          console.log(`Project ${projectId} failed to delete - checking stack status`);
          const stackInfo = await checkStackExists(projectId);
          
          if (stackInfo) {
            console.log(`CDK stack still exists for failed-to-delete project ${projectId}:`, stackInfo.StackName, stackInfo.StackStatus);
            await updateProjectWithStackInfo(projectId, stackInfo);
          } else {
            // Stack was somehow deleted externally - delete project record
            console.log(`No CDK stack found for failed-to-delete project ${projectId} - deleting record`);
            await deleteProjectRecord(projectId);
          }
        } else if (previousStatus === 'active' || previousStatus === 'provisioned') {
          // If project was active, trigger destroy build
          console.log(`Project ${projectId} was active - triggering destroy build`);
          await triggerCodeBuild(projectId, 'destroy');
        } else {
          // For other statuses (pending, provisioning), delete immediately
          console.log(`Project ${projectId} was ${previousStatus} - deleting record immediately`);
          await deleteProjectRecord(projectId);
        }
        break;
        
      default:
        console.log(`Unknown operation: ${operation}`);
    }
    
  } catch (error) {
    console.error('Error handling project operation:', error);
    throw error;
  }
}

/**
 * Trigger CodeBuild for deploy or destroy
 */
async function triggerCodeBuild(projectId, action) {
  try {
    console.log(`Triggering CodeBuild ${action} for project ${projectId}`);
    
    // Load configuration to get Identity Pool ID
    const config = await loadConfig();
    const IDENTITY_POOL_ID = config.identityPoolId;
    
    // Update project status based on action
    if (action === 'deploy') {
      await updateProjectStatus(projectId, 'provisioning');
    }
    // For 'destroy' action, keep current status (should be 'deleting')
    // Don't change status for destroy - let it remain 'deleting'
    
    // Start CodeBuild project
    const stackName = `App-ModEx-Project-${projectId}`;
    const buildParams = {
      projectName: CODEBUILD_PROJECT,
      environmentVariablesOverride: [
        {
          name: 'PROJECT_ID',
          value: projectId
        },
        {
          name: 'STACK_NAME',
          value: stackName
        },
        {
          name: 'ACTION',
          value: action
        },
        {
          name: 'ENVIRONMENT',
          value: process.env.ENVIRONMENT || 'dev'
        },
        {
          name: 'DEPLOYMENT_BUCKET',
          value: DEPLOYMENT_BUCKET
        }
      ]
    };
    
    // Add Identity Pool ID for deploy actions
    if (action === 'deploy' && IDENTITY_POOL_ID) {
      buildParams.environmentVariablesOverride.push({
        name: 'IDENTITY_POOL_ID',
        value: IDENTITY_POOL_ID
      });
    }
    
    const buildResult = await codebuild.startBuild(buildParams).promise();
    console.log(`CodeBuild ${action} started:`, buildResult.build.id);
    
    // Store build ID in project record for tracking
    await updateProjectWithBuildId(projectId, buildResult.build.id);
    
    return buildResult.build.id;
  } catch (error) {
    console.error(`Error triggering CodeBuild ${action}:`, error);
    
    // Update project status to failed
    await updateProjectStatus(projectId, 'failed', error.message);
    throw error;
  }
}

/**
 * Update project status in DynamoDB
 */
async function updateProjectStatus(projectId, status, errorMessage = null) {
  try {
    const now = new Date().toISOString();
    
    const params = {
      TableName: PROJECTS_TABLE,
      Key: { projectId },
      UpdateExpression: 'SET #status = :status, lastModified = :now',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':now': now
      }
    };
    
    // Add error message if provided
    if (errorMessage) {
      params.UpdateExpression += ', provisioningError = :error';
      params.ExpressionAttributeValues[':error'] = errorMessage;
    } else if (status !== 'failed') {
      // Clear error message if not failed
      params.UpdateExpression += ' REMOVE provisioningError';
    }
    
    await dynamodb.update(params).promise();
    console.log(`Project ${projectId} status updated to ${status}`);
  } catch (error) {
    console.error('Error updating project status:', error);
    throw error;
  }
}

/**
 * Update project record with build ID for tracking
 */
async function updateProjectWithBuildId(projectId, buildId) {
  try {
    const now = new Date().toISOString();
    
    const params = {
      TableName: PROJECTS_TABLE,
      Key: { projectId },
      UpdateExpression: 'SET buildId = :buildId, lastModified = :now',
      ExpressionAttributeValues: {
        ':buildId': buildId,
        ':now': now
      }
    };
    
    await dynamodb.update(params).promise();
    console.log(`Updated project ${projectId} with build ID ${buildId}`);
  } catch (error) {
    console.error('Error updating project with build ID:', error);
    // Don't throw error here as it's not critical
  }
}

/**
 * Check if a CloudFormation stack exists for the project
 */
async function checkStackExists(projectId) {
  try {
    const stackName = `App-ModEx-Project-${projectId}`;
    console.log(`Checking if stack exists: ${stackName}`);
    
    const result = await cloudformation.describeStacks({
      StackName: stackName
    }).promise();
    
    if (result.Stacks && result.Stacks.length > 0) {
      const stack = result.Stacks[0];
      return {
        StackName: stack.StackName,
        StackStatus: stack.StackStatus,
        CreationTime: stack.CreationTime,
        LastUpdatedTime: stack.LastUpdatedTime,
        StackStatusReason: stack.StackStatusReason
      };
    }
    
    return null;
  } catch (error) {
    if (error.code === 'ValidationError' && error.message.includes('does not exist')) {
      console.log(`Stack does not exist for project ${projectId}`);
      return null;
    }
    console.error('Error checking stack existence:', error);
    throw error;
  }
}

/**
 * Update project with stack information for UI modal display
 */
async function updateProjectWithStackInfo(projectId, stackInfo) {
  try {
    const now = new Date().toISOString();
    
    const params = {
      TableName: PROJECTS_TABLE,
      Key: { projectId },
      UpdateExpression: 'SET stackInfo = :stackInfo, lastModified = :now, #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':stackInfo': stackInfo,
        ':status': 'failed-with-stack', // Special status to indicate stack exists
        ':now': now
      }
    };
    
    await dynamodb.update(params).promise();
    console.log(`Updated project ${projectId} with stack information`);
  } catch (error) {
    console.error('Error updating project with stack info:', error);
    throw error;
  }
}
async function deleteProjectRecord(projectId) {
  try {
    console.log('Deleting project record immediately:', projectId);

    // Delete from projects table
    const deleteParams = {
      TableName: PROJECTS_TABLE,
      Key: { projectId }
    };

    await dynamodb.delete(deleteParams).promise();

    // Also delete associated project data
    const dataParams = {
      TableName: PROJECT_DATA_TABLE,
      KeyConditionExpression: 'projectId = :projectId',
      ExpressionAttributeValues: {
        ':projectId': projectId
      }
    };

    const projectData = await dynamodb.query(dataParams).promise();

    // Delete all project data items
    if (projectData.Items && projectData.Items.length > 0) {
      const deleteRequests = projectData.Items.map(item => ({
        DeleteRequest: {
          Key: {
            projectId: item.projectId,
            dataType: item.dataType
          }
        }
      }));

      // Batch delete in chunks of 25 (DynamoDB limit)
      for (let i = 0; i < deleteRequests.length; i += 25) {
        const chunk = deleteRequests.slice(i, i + 25);
        const batchParams = {
          RequestItems: {
            [PROJECT_DATA_TABLE]: chunk
          }
        };
        await dynamodb.batchWrite(batchParams).promise();
      }
    }

    console.log('✅ Project record deleted successfully:', projectId);
  } catch (error) {
    console.error('❌ Error deleting project record:', error);
    throw error;
  }
}
