// Force deployment timestamp: 2025-07-26T22:41:29.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:21.3NZ';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, DeleteCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Build event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
    const buildStatus = event.detail['build-status'];
    const projectName = event.detail['project-name'];
    
    // Extract project ID and action from environment variables
    const envVars = event.detail['additional-information']?.environment?.['environment-variables'] || [];
    const projectIdVar = envVars.find(v => v.name === 'PROJECT_ID');
    const actionVar = envVars.find(v => v.name === 'ACTION');
    
    if (!projectIdVar) {
      console.log('No PROJECT_ID found in build environment variables');
      return;
    }
    
    const projectId = projectIdVar.value;
    const action = actionVar?.value || 'deploy';
    console.log(`Processing build completion for project ${projectId}, action: ${action}, status: ${buildStatus}`);
    
    if (buildStatus === 'SUCCEEDED') {
      if (action === 'deploy') {
        // Update project status to active
        await updateProjectStatus(projectId, 'active');
      } else if (action === 'destroy') {
        // Delete project record and associated data
        await deleteProjectCompletely(projectId);
      }
    } else if (['FAILED', 'FAULT', 'TIMED_OUT', 'STOPPED'].includes(buildStatus)) {
      // Set specific failure status based on the action that failed
      if (action === 'deploy') {
        await updateProjectStatus(projectId, 'failed-to-provision');
      } else if (action === 'destroy') {
        await updateProjectStatus(projectId, 'failed-to-delete');
      } else {
        // Fallback to generic failed status
        await updateProjectStatus(projectId, 'failed');
      }
    } else {
      console.log(`Ignoring build status: ${buildStatus}`);
      return;
    }
    
  } catch (error) {
    console.error('Error processing build completion:', error);
  }
};

async function updateProjectStatus(projectId, status) {
  const command = new UpdateCommand({
    TableName: process.env.PROJECTS_TABLE,
    Key: { projectId },
    UpdateExpression: 'SET #status = :status, lastModified = :now',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': status,
      ':now': new Date().toISOString()
    }
  });
  
  await dynamodb.send(command);
  console.log(`Successfully updated project ${projectId} status to ${status}`);
}

async function deleteProjectCompletely(projectId) {
  console.log('Deleting project completely:', projectId);
  
  // Delete from projects table
  const deleteProjectCommand = new DeleteCommand({
    TableName: process.env.PROJECTS_TABLE,
    Key: { projectId }
  });
  
  await dynamodb.send(deleteProjectCommand);
  
  // Query and delete associated project data
  const queryCommand = new QueryCommand({
    TableName: process.env.PROJECT_DATA_TABLE,
    KeyConditionExpression: 'projectId = :projectId',
    ExpressionAttributeValues: {
      ':projectId': projectId
    }
  });
  
  const projectData = await dynamodb.send(queryCommand);
  
  if (projectData.Items && projectData.Items.length > 0) {
    // Batch delete in chunks of 25 (DynamoDB limit)
    const deleteRequests = projectData.Items.map(item => ({
      DeleteRequest: {
        Key: {
          projectId: item.projectId,
          dataType: item.dataType
        }
      }
    }));
    
    for (let i = 0; i < deleteRequests.length; i += 25) {
      const chunk = deleteRequests.slice(i, i + 25);
      const batchCommand = new BatchWriteCommand({
        RequestItems: {
          [process.env.PROJECT_DATA_TABLE]: chunk
        }
      });
      await dynamodb.send(batchCommand);
    }
  }
  
  console.log(`Successfully deleted project ${projectId} and all associated data`);
}
