// Force deployment timestamp: 2025-07-23T17:00:00.0NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:16.3NZ';

const AWS = require('aws-sdk');
const { customAlphabet } = require('nanoid');

// Create custom nanoid that only uses CloudFormation-compatible characters
// CloudFormation stack names: ^[A-Za-z][A-Za-z0-9-]*$
// - Must start with letter (handled by prefixing)
// - Can only contain letters, numbers, and hyphens (no underscores)
// - Using only lowercase letters to ensure consistent casing across all AWS resources
const cloudFormationNanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();

const PROJECTS_TABLE = process.env.PROJECTS_TABLE;
const PROJECT_DATA_TABLE = process.env.PROJECT_DATA_TABLE;
const PROJECT_OPERATIONS_QUEUE_URL = process.env.PROJECT_OPERATIONS_QUEUE_URL;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  console.log('Environment variables:', {
    PROJECTS_TABLE: process.env.PROJECTS_TABLE,
    PROJECT_DATA_TABLE: process.env.PROJECT_DATA_TABLE,
    ENVIRONMENT: process.env.ENVIRONMENT
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const { httpMethod, pathParameters, body, requestContext = {} } = event;
    const userId = requestContext.authorizer?.claims?.sub || 'anonymous';
    const userEmail = requestContext.authorizer?.claims?.email || '';
    const userName = requestContext.authorizer?.claims?.['cognito:username'] || userEmail;
    
    // For project sharing, we use the cognito:username as the primary identifier
    // This matches what we store in the sharedUsers array
    const userIdForSharing = userName || userId;
    
    console.log('User context:', { 
      userId, 
      userEmail, 
      userName, 
      userIdForSharing 
    });

    // Validate environment variables
    if (!PROJECTS_TABLE || !PROJECT_DATA_TABLE || !PROJECT_OPERATIONS_QUEUE_URL) {
      console.error('Missing environment variables:', {
        PROJECTS_TABLE,
        PROJECT_DATA_TABLE,
        PROJECT_OPERATIONS_QUEUE_URL
      });
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Server configuration error',
          message: 'Missing required environment variables'
        })
      };
    }

    switch (httpMethod) {
      case 'GET':
        if (pathParameters?.projectId) {
          return await getProject(pathParameters.projectId, userId, userIdForSharing);
        } else {
          return await listProjects(userId, userIdForSharing);
        }

      case 'POST':
        return await createProject(JSON.parse(body), userId, userName);

      case 'PUT':
        if (pathParameters?.projectId) {
          return await updateProject(pathParameters.projectId, JSON.parse(body), userId, userIdForSharing);
        }
        break;

      case 'DELETE':
        if (pathParameters?.projectId) {
          return await deleteProject(pathParameters.projectId, userId, event);
        }
        break;

      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid request' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        details: process.env.ENVIRONMENT === 'dev' ? error.stack : undefined
      })
    };
  }
};

// List projects for the authenticated user
async function listProjects(userId, userIdForSharing) {
  try {
    console.log('🔍 DETAILED LOGGING: Listing projects for user:', userId, 'userIdForSharing:', userIdForSharing);

    // Use scan on main table with consistent reads instead of GSI
    // GSI has eventual consistency which causes stale status data
    // Note: We scan all projects and filter client-side because DynamoDB's contains()
    // function doesn't work with complex nested objects in sharedUsers List
    const params = {
      TableName: PROJECTS_TABLE,
      ConsistentRead: true  // Force strongly consistent reads to get latest status
    };

    console.log('🔍 DynamoDB scan parameters:', JSON.stringify(params, null, 2));

    const result = await dynamodb.scan(params).promise();
    
    console.log('🔍 Raw DynamoDB scan result:', {
      itemCount: result.Items ? result.Items.length : 0,
      scannedCount: result.ScannedCount,
      consumedCapacity: result.ConsumedCapacity
    });

    // Log each project found in the scan
    if (result.Items && result.Items.length > 0) {
      console.log('🔍 All projects found in scan:');
      result.Items.forEach((project, index) => {
        console.log(`🔍 Project ${index + 1}:`, {
          projectId: project.projectId,
          name: project.name,
          createdBy: project.createdBy,
          isOwner: project.createdBy === userId,
          hasSharedUsers: !!(project.sharedUsers && project.sharedUsers.length > 0),
          sharedUsersCount: project.sharedUsers ? project.sharedUsers.length : 0,
          sharedUsers: project.sharedUsers ? project.sharedUsers.map(user => ({
            email: user.email,
            userId: user.userId,
            shareMode: user.shareMode,
            matchesCurrentUser: user.userId === userId || user.email === userId
          })) : []
        });
      });
    } else {
      console.log('🔍 No projects found in DynamoDB scan');
    }
    
    // Additional filtering to ensure proper shared user matching
    // DynamoDB's contains() function might not work perfectly with complex objects
    console.log('🔍 Starting client-side filtering...');
    const filteredItems = (result.Items || []).filter((project, index) => {
      console.log(`🔍 Filtering project ${index + 1} (${project.name}):`);
      
      // Include if user is the owner
      if (project.createdBy === userId) {
        console.log(`🔍   ✅ User is owner (${project.createdBy} === ${userId})`);
        return true;
      } else {
        console.log(`🔍   ❌ User is not owner (${project.createdBy} !== ${userId})`);
      }
      
      // Include if user is in sharedUsers array
      if (project.sharedUsers && Array.isArray(project.sharedUsers)) {
        console.log(`🔍   Checking ${project.sharedUsers.length} shared users:`);
        
        const isSharedUser = project.sharedUsers.some((sharedUser, userIndex) => {
          // Use userIdForSharing (cognito:username) as primary identifier for matching
          // This should match what we store in the sharedUsers array
          const matchesUserIdForSharing = sharedUser.userId === userIdForSharing;
          
          // Also check against the original userId (sub) for backward compatibility
          const matchesUserId = sharedUser.userId === userId;
          
          // Fall back to email match if userId is not available
          // This handles both the email field and the case where email is used as userId
          const matchesEmail = sharedUser.email === userIdForSharing || 
                              sharedUser.email === userId ||
                              (userIdForSharing.includes('@') && sharedUser.email === userIdForSharing) ||
                              (sharedUser.email && sharedUser.email.split('@')[0] === userIdForSharing);
          
          // Check if the username matches the local part of the email
          const emailLocalPart = sharedUser.email ? sharedUser.email.split('@')[0] : '';
          const matchesUsername = emailLocalPart === userIdForSharing || emailLocalPart === userId;
          
          const matches = matchesUserIdForSharing || matchesUserId || matchesEmail || matchesUsername;
          
          console.log(`🔍     Shared user ${userIndex + 1}:`, {
            email: sharedUser.email,
            userId: sharedUser.userId || 'not set',
            emailLocalPart: emailLocalPart,
            userIdForSharing: userIdForSharing,
            originalUserId: userId,
            matchesUserIdForSharing: matchesUserIdForSharing,
            matchesUserId: matchesUserId,
            matchesEmail: matchesEmail,
            matchesUsername: matchesUsername,
            overallMatch: matches
          });
          
          return matches;
        });
        
        if (isSharedUser) {
          console.log(`🔍   ✅ User found in shared users`);
          return true;
        } else {
          console.log(`🔍   ❌ User not found in shared users`);
        }
      } else {
        console.log(`🔍   ❌ No shared users array or empty array`);
      }
      
      console.log(`🔍   ❌ Project excluded from results`);
      return false;
    });
    
    console.log('🔍 Client-side filtering results:', {
      originalCount: result.Items ? result.Items.length : 0,
      filteredCount: filteredItems.length,
      excludedCount: (result.Items ? result.Items.length : 0) - filteredItems.length
    });
    
    // Sort by creation date (most recent first) since we can't rely on GSI ordering
    const sortedItems = filteredItems.sort((a, b) => {
      return new Date(b.createdDate) - new Date(a.createdDate);
    });
    
    const ownedProjects = sortedItems.filter(p => p.createdBy === userId);
    const sharedProjects = sortedItems.filter(p => p.createdBy !== userId);
    
    console.log('🔍 Final results summary:');
    console.log('Found projects:', sortedItems.length);
    console.log('Projects breakdown:', {
      owned: ownedProjects.length,
      shared: sharedProjects.length
    });
    
    if (ownedProjects.length > 0) {
      console.log('🔍 Owned projects:', ownedProjects.map(p => ({ id: p.projectId, name: p.name })));
    }
    
    if (sharedProjects.length > 0) {
      console.log('🔍 Shared projects:', sharedProjects.map(p => ({ id: p.projectId, name: p.name, owner: p.createdBy })));
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(sortedItems)
    };

  } catch (error) {
    console.error('🔍 Error listing projects:', error);
    throw error;
  }
}

// Get a specific project
async function getProject(projectId, userId, userIdForSharing) {
  try {
    console.log('Getting project:', projectId, 'for user:', userId, 'userIdForSharing:', userIdForSharing);

    const params = {
      TableName: PROJECTS_TABLE,
      Key: { projectId }
    };

    const result = await dynamodb.get(params).promise();

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Project not found' })
      };
    }

    // Check if user has access (owner or shared user)
    const project = result.Item;
    
    // Check if user is the owner
    const isOwner = project.createdBy === userId;
    
    // Check if user is in sharedUsers array with improved matching
    const isSharedUser = project.sharedUsers && Array.isArray(project.sharedUsers) && 
      project.sharedUsers.some(sharedUser => {
        // Use userIdForSharing (cognito:username) as primary identifier for matching
        const matchesUserIdForSharing = sharedUser.userId === userIdForSharing;
        
        // Also check against the original userId (sub) for backward compatibility
        const matchesUserId = sharedUser.userId === userId;
        
        // Fall back to email match if userId is not available
        const matchesEmail = sharedUser.email === userIdForSharing || 
                            sharedUser.email === userId ||
                            (userIdForSharing.includes('@') && sharedUser.email === userIdForSharing) ||
                            (sharedUser.email && sharedUser.email.split('@')[0] === userIdForSharing);
        
        // Check if the username matches the local part of the email
        const emailLocalPart = sharedUser.email ? sharedUser.email.split('@')[0] : '';
        const matchesUsername = emailLocalPart === userIdForSharing || emailLocalPart === userId;
        
        return matchesUserIdForSharing || matchesUserId || matchesEmail || matchesUsername;
      });
    
    const hasAccess = isOwner || isSharedUser;

    if (!hasAccess) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Access denied' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(project)
    };

  } catch (error) {
    console.error('Error getting project:', error);
    throw error;
  }
}

// Create a new project
// Reserve a project name atomically to prevent duplicates
async function reserveProjectName(projectName, projectId) {
  const normalizedName = projectName.trim().toLowerCase();
  
  try {
    await dynamodb.put({
      TableName: PROJECTS_TABLE,
      Item: {
        projectId: `NAME#${normalizedName}`,
        sk: 'RESERVED',
        actualProjectId: projectId,
        reservedAt: new Date().toISOString(),
        itemType: 'NAME_RESERVATION'
      },
      ConditionExpression: 'attribute_not_exists(projectId)'
    }).promise();
    
    console.log('✅ Project name reserved:', normalizedName);
    return true;
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      console.log('❌ Project name already exists:', normalizedName);
      return false;
    }
    throw error;
  }
}

// Release a project name reservation (cleanup on failure)
async function releaseProjectName(projectName) {
  const normalizedName = projectName.trim().toLowerCase();
  
  try {
    await dynamodb.delete({
      TableName: PROJECTS_TABLE,
      Key: {
        projectId: `NAME#${normalizedName}`
      }
    }).promise();
    
    console.log('🧹 Project name reservation released:', normalizedName);
  } catch (error) {
    console.error('⚠️ Error releasing project name reservation:', error);
    // Don't throw - this is cleanup, shouldn't fail the main operation
  }
}

async function createProject(projectData, userId, userName) {
  const projectName = projectData.name?.trim() || 'Untitled Project';
  let nameReserved = false;
  
  try {
    console.log('Creating project for user:', userId, userName);

    const now = new Date().toISOString();
    const projectId = cloudFormationNanoid(); // Generate 12-character CloudFormation-compatible ID

    // Step 1: Atomically reserve the project name
    nameReserved = await reserveProjectName(projectName, projectId);
    
    if (!nameReserved) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'DUPLICATE_PROJECT_NAME',
          message: `A project with the name "${projectName}" already exists. Please choose a different name.`
        })
      };
    }

    // Generate name prefix for search optimization
    const namePrefix = projectName.substring(0, 3).toLowerCase();

    const project = {
      projectId,
      name: projectName,
      description: projectData.description || '',
      notes: projectData.notes || '',
      createdBy: userId,
      createdByName: userName,
      createdDate: now,
      lastModified: now,
      lastModifiedBy: userId,
      isShared: 'false', // String for GSI
      sharedUsers: [],
      namePrefix, // For search optimization
      status: 'pending', // Default status is pending - SQS message will trigger provisioning
      version: 1
    };

    // Step 2: Create the actual project
    const params = {
      TableName: PROJECTS_TABLE,
      Item: project,
      ConditionExpression: 'attribute_not_exists(projectId)'
    };

    await dynamodb.put(params).promise();

    console.log('Project created with pending status:', projectId);
    
    // Step 3: Send SQS message to trigger provisioning
    await sendProjectOperationMessage({
      operation: 'CREATE',
      projectId,
      userId,
      userName,
      projectData: project
    });

    console.log('SQS message sent to trigger provisioning');

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify(project)
    };

  } catch (error) {
    console.error('Error creating project:', error);
    
    // Cleanup: Release the name reservation if we reserved it
    if (nameReserved) {
      console.log('🧹 Cleaning up name reservation due to error');
      await releaseProjectName(projectName);
    }
    
    throw error;
  }
}

// Update a project
async function updateProject(projectId, updateData, userId, userIdForSharing) {
  try {
    console.log('Updating project:', projectId, 'for user:', userId, 'userIdForSharing:', userIdForSharing);

    // First check if project exists and user has access
    const getParams = {
      TableName: PROJECTS_TABLE,
      Key: { projectId }
    };

    const existingProject = await dynamodb.get(getParams).promise();

    if (!existingProject.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Project not found' })
      };
    }

    // Check if user has write access (owner or shared user with write permission)
    const project = existingProject.Item;
    const isOwner = project.createdBy === userId;
    
    // Check if user is in sharedUsers array with improved matching
    const hasWriteAccess = isOwner || 
      (project.sharedUsers && Array.isArray(project.sharedUsers) && 
        project.sharedUsers.some(sharedUser => {
          // Use userIdForSharing (cognito:username) as primary identifier for matching
          const matchesUserIdForSharing = sharedUser.userId === userIdForSharing;
          
          // Also check against the original userId (sub) for backward compatibility
          const matchesUserId = sharedUser.userId === userId;
          
          // Fall back to email match if userId is not available
          const matchesEmail = sharedUser.email === userIdForSharing || 
                              sharedUser.email === userId ||
                              (userIdForSharing.includes('@') && sharedUser.email === userIdForSharing) ||
                              (sharedUser.email && sharedUser.email.split('@')[0] === userIdForSharing);
          
          // Check if the username matches the local part of the email
          const emailLocalPart = sharedUser.email ? sharedUser.email.split('@')[0] : '';
          const matchesUsername = emailLocalPart === userIdForSharing || emailLocalPart === userId;
          
          // Check if user has write permission
          const hasWritePermission = sharedUser.shareMode === 'read-write';
          
          return (matchesUserIdForSharing || matchesUserId || matchesEmail || matchesUsername) && hasWritePermission;
        }));

    if (!hasWriteAccess) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Write access denied' })
      };
    }

    const now = new Date().toISOString();
    const namePrefix = updateData.name ? updateData.name.substring(0, 3).toLowerCase() : project.namePrefix;

    // Build update expression
    let updateExpression = 'SET lastModified = :now, lastModifiedBy = :userId, version = version + :inc';
    let expressionAttributeValues = {
      ':now': now,
      ':userId': userId,
      ':inc': 1
    };

    if (updateData.name !== undefined) {
      updateExpression += ', #name = :name, namePrefix = :namePrefix';
      expressionAttributeValues[':name'] = updateData.name;
      expressionAttributeValues[':namePrefix'] = namePrefix;
    }

    if (updateData.description !== undefined) {
      updateExpression += ', description = :description';
      expressionAttributeValues[':description'] = updateData.description;
    }

    if (updateData.notes !== undefined) {
      updateExpression += ', notes = :notes';
      expressionAttributeValues[':notes'] = updateData.notes;
    }

    const updateParams = {
      TableName: PROJECTS_TABLE,
      Key: { projectId },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: updateData.name !== undefined ? { '#name': 'name' } : undefined,
      ReturnValues: 'ALL_NEW'
    };

    const result = await dynamodb.update(updateParams).promise();

    console.log('Project updated:', projectId);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.Attributes)
    };

  } catch (error) {
    console.error('Error updating project:', error);
    throw error;
  }
}

// Delete a project
async function deleteProject(projectId, userId, event) {
  try {
    console.log('Deleting project:', projectId, 'for user:', userId);

    // First check if project exists and user is owner
    const getParams = {
      TableName: PROJECTS_TABLE,
      Key: { projectId }
    };

    const existingProject = await dynamodb.get(getParams).promise();

    if (!existingProject.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Project not found' })
      };
    }

    // Only owner can delete
    if (existingProject.Item.createdBy !== userId) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Only project owner can delete' })
      };
    }

    // Check if project is already being deleted
    if (existingProject.Item.status === 'deleting') {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Project is already being deleted' })
      };
    }

    // Check for force delete parameter
    const isForceDelete = event.queryStringParameters?.force === 'true';
    
    if (isForceDelete) {
      // Force delete - immediately delete the project record
      console.log('Force deleting project:', projectId);
      
      // Delete from projects table
      const deleteParams = {
        TableName: PROJECTS_TABLE,
        Key: { projectId }
      };

      await dynamodb.delete(deleteParams).promise();
      
      // Release the project name reservation
      await releaseProjectName(existingProject.Item.name);

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

      console.log('✅ Project force deleted immediately:', projectId);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          message: 'Project deleted immediately',
          status: 'deleted'
        })
      };
    }

    // Normal delete flow - only allow deletion of projects in allowed statuses
    const allowedStatuses = ['active', 'failed', 'failed-to-provision', 'failed-to-delete'];
    if (!allowedStatuses.includes(existingProject.Item.status)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: `Cannot delete project in status: ${existingProject.Item.status}. Only projects with status 'active', 'failed', 'failed-to-provision', or 'failed-to-delete' can be deleted.`,
          currentStatus: existingProject.Item.status,
          allowedStatuses: allowedStatuses
        })
      };
    }

    // Update project status to "deleting" - SQS message will handle the rest
    const updateParams = {
      TableName: PROJECTS_TABLE,
      Key: { projectId },
      UpdateExpression: 'SET #status = :status, lastModified = :now, previousStatus = :previousStatus',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'deleting',
        ':previousStatus': existingProject.Item.status, // Store previous status for message handler
        ':now': new Date().toISOString()
      }
    };

    await dynamodb.update(updateParams).promise();
    console.log('Project status updated to "deleting":', projectId);
    
    // Send SQS message to trigger deletion process
    await sendProjectOperationMessage({
      operation: 'DELETE',
      projectId,
      userId,
      previousStatus: existingProject.Item.status,
      isForceDelete: false
    });

    console.log('SQS message sent to handle provisioning/cleanup automatically');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        message: 'Project deletion initiated',
        status: 'deleting'
      })
    };

  } catch (error) {
    console.error('Error deleting project:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}

/**
 * Send a message to the global project operations SQS queue
 * @param {Object} messageData - The message data to send
 */
async function sendProjectOperationMessage(messageData) {
  try {
    // Use global queue URL for project operations (create/delete)
    const message = {
      QueueUrl: PROJECT_OPERATIONS_QUEUE_URL,
      MessageBody: JSON.stringify({
        ...messageData,
        timestamp: new Date().toISOString(),
        source: 'projects-lambda'
      }),
      MessageAttributes: {
        operation: {
          DataType: 'String',
          StringValue: messageData.operation
        },
        projectId: {
          DataType: 'String',
          StringValue: messageData.projectId
        }
      }
    };

    const result = await sqs.sendMessage(message).promise();
    console.log('SQS message sent successfully:', result.MessageId);
    return result;
  } catch (error) {
    console.error('Error sending SQS message:', error);
    throw error;
  }
}