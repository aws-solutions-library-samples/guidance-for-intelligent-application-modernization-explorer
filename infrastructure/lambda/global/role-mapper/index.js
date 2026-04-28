// Force deployment timestamp: 2025-07-22T11:17:56.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:00.3NZ';

/**
 * Role Mapper Lambda Function
 * Maps Cognito users to IAM roles based on project sharing permissions
 */

const AWS = require('aws-sdk');
const { sanitizeEvent } = require('app-modex-shared');

// Initialize AWS clients
const cognitoIdentity = new AWS.CognitoIdentity();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const secretsManager = new AWS.SecretsManager();

// Environment variables
const APP_CONFIG_SECRET_ARN = process.env.APP_CONFIG_SECRET_ARN;
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';
const REGION = process.env.AWS_REGION;
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || process.env.ACCOUNT_ID;

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
 * Main handler function
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
    // Load configuration from Secrets Manager
    const config = await loadConfig();
    const IDENTITY_POOL_ID = config.identityPoolId;
  
  try {
    // Process DynamoDB stream events
    if (event.Records && Array.isArray(event.Records)) {
      for (const record of event.Records) {
        // Only process MODIFY events for project sharing changes
        if (record.eventName === 'MODIFY' && 
            record.dynamodb && 
            record.dynamodb.NewImage && 
            record.dynamodb.OldImage) {
          
          const projectId = record.dynamodb.NewImage.projectId.S;
          
          // Check if sharing has changed
          const newSharedUsers = record.dynamodb.NewImage.sharedUsers ? 
            record.dynamodb.NewImage.sharedUsers.L || [] : [];
          
          const oldSharedUsers = record.dynamodb.OldImage.sharedUsers ? 
            record.dynamodb.OldImage.sharedUsers.L || [] : [];
          
          // If shared users have changed, update role mappings
          if (JSON.stringify(newSharedUsers) !== JSON.stringify(oldSharedUsers)) {
            console.log(`Sharing changed for project ${projectId}, updating role mappings`);
            await updateRoleMappingsForProject(projectId, newSharedUsers);
          }
        }
      }
      
      return { statusCode: 200, body: 'Role mappings updated successfully' };
    }
    
    // Direct invocation for updating all role mappings
    if (event.action === 'updateAllMappings') {
      await updateAllRoleMappings();
      return { statusCode: 200, body: 'All role mappings updated successfully' };
    }
    
    return { statusCode: 400, body: 'Invalid event format' };
  } catch (error) {
    console.error('Error processing event:', error);
    return { statusCode: 500, body: `Error: ${error.message}` };
  }
};

/**
 * Update role mappings for a specific project
 */
async function updateRoleMappingsForProject(projectId, sharedUsers) {
  try {
    // Get current role mappings
    const currentRoleMappings = await getCurrentRoleMappings();
    
    // Process shared users
    for (const userItem of sharedUsers) {
      const user = userItem.M;
      const userId = user.userId.S;
      const permission = user.permission.S;
      
      // Determine role ARN based on permission
      const roleArn = permission === 'write' 
        ? `arn:aws:iam::${ACCOUNT_ID}:role/app-modex-project-${projectId}-write`
        : `arn:aws:iam::${ACCOUNT_ID}:role/app-modex-project-${projectId}-read`;
      
      // Add or update rule for this user and project
      await addRoleMapping(currentRoleMappings, userId, projectId, roleArn);
    }
    
    // Update identity pool role mappings
    await updateIdentityPoolRoleMappings(currentRoleMappings);
    
    console.log(`Role mappings updated for project ${projectId}`);
  } catch (error) {
    console.error(`Error updating role mappings for project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Update all role mappings based on all projects
 */
async function updateAllRoleMappings() {
  try {
    // Get all projects
    const projects = await getAllProjects();
    
    // Initialize role mappings
    const roleMappings = {};
    
    // Process each project
    for (const project of projects) {
      if (project.sharedUsers && project.sharedUsers.length > 0) {
        for (const user of project.sharedUsers) {
          const userId = user.userId;
          const permission = user.permission;
          const projectId = project.projectId;
          
          // Determine role ARN based on permission
          const roleArn = permission === 'write' 
            ? `arn:aws:iam::${ACCOUNT_ID}:role/app-modex-project-${projectId}-write`
            : `arn:aws:iam::${ACCOUNT_ID}:role/app-modex-project-${projectId}-read`;
          
          // Add or update rule for this user and project
          if (!roleMappings[userId]) {
            roleMappings[userId] = {
              Type: 'Rules',
              AmbiguousRoleResolution: 'AuthenticatedRole',
              RulesConfiguration: {
                Rules: []
              }
            };
          }
          
          // Add rule for this project
          roleMappings[userId].RulesConfiguration.Rules.push({
            Claim: 'custom:projectId',
            MatchType: 'Equals',
            Value: projectId,
            RoleARN: roleArn
          });
        }
      }
    }
    
    // Update identity pool role mappings
    await cognitoIdentity.setIdentityPoolRoles({
      IdentityPoolId: IDENTITY_POOL_ID,
      RoleMappings: roleMappings
    }).promise();
    
    console.log('All role mappings updated successfully');
  } catch (error) {
    console.error('Error updating all role mappings:', error);
    throw error;
  }
}

/**
 * Get current role mappings from Cognito Identity Pool
 */
async function getCurrentRoleMappings() {
  try {
    const result = await cognitoIdentity.getIdentityPoolRoles({
      IdentityPoolId: IDENTITY_POOL_ID
    }).promise();
    
    return result.RoleMappings || {};
  } catch (error) {
    console.error('Error getting current role mappings:', error);
    throw error;
  }
}

/**
 * Add or update a role mapping for a user and project
 */
async function addRoleMapping(roleMappings, userId, projectId, roleArn) {
  // Initialize role mapping for this user if it doesn't exist
  if (!roleMappings[userId]) {
    roleMappings[userId] = {
      Type: 'Rules',
      AmbiguousRoleResolution: 'AuthenticatedRole',
      RulesConfiguration: {
        Rules: []
      }
    };
  }
  
  // Check if a rule for this project already exists
  const existingRuleIndex = roleMappings[userId].RulesConfiguration.Rules.findIndex(
    rule => rule.Claim === 'custom:projectId' && rule.Value === projectId
  );
  
  if (existingRuleIndex >= 0) {
    // Update existing rule
    roleMappings[userId].RulesConfiguration.Rules[existingRuleIndex].RoleARN = roleArn;
  } else {
    // Add new rule
    roleMappings[userId].RulesConfiguration.Rules.push({
      Claim: 'custom:projectId',
      MatchType: 'Equals',
      Value: projectId,
      RoleARN: roleArn
    });
  }
  
  return roleMappings;
}

/**
 * Update identity pool role mappings
 */
async function updateIdentityPoolRoleMappings(roleMappings) {
  try {
    await cognitoIdentity.setIdentityPoolRoles({
      IdentityPoolId: IDENTITY_POOL_ID,
      RoleMappings: roleMappings
    }).promise();
    
    console.log('Identity pool role mappings updated successfully');
  } catch (error) {
    console.error('Error updating identity pool role mappings:', error);
    throw error;
  }
}

/**
 * Get all projects from DynamoDB
 */
async function getAllProjects() {
  try {
    const params = {
      TableName: PROJECTS_TABLE
    };
    
    const result = await dynamodb.scan(params).promise();
    return result.Items || [];
  } catch (error) {
    console.error('Error getting all projects:', error);
    throw error;
  }
}
