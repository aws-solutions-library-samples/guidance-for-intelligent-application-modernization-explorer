// Force deployment timestamp: 2025-07-26T22:41:20.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:11.3NZ';

/**
 * Automation Status API Lambda Function
 * Provides APIs to query automation status and execution history
 */

const AWS = require('aws-sdk');

// Initialize AWS clients
const codebuild = new AWS.CodeBuild();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Environment variables
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;
const CODEBUILD_PROJECT = process.env.CODEBUILD_PROJECT;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,OPTIONS'
};

const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const { httpMethod, pathParameters, queryStringParameters } = event;
    const path = event.resource;

    if (httpMethod === 'GET') {
      if (path === '/automations/status') {
        return await getAutomationStatus(queryStringParameters || {});
      } else if (path === '/automations/history') {
        return await getAutomationHistory(queryStringParameters || {});
      } else if (path === '/automations/failures') {
        return await getFailureAnalysis(queryStringParameters || {});
      } else if (path === '/automations/project/{projectId}') {
        return await getProjectAutomationStatus(pathParameters.projectId);
      }
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Endpoint not found' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

/**
 * Get current automation status for all projects
 */
async function getAutomationStatus(queryParams) {
  try {
    const { status, limit = '50' } = queryParams;
    
    // Get projects with automation-relevant statuses (transitional + recent failures)
    const scanParams = {
      TableName: PROJECTS_TABLE,
      FilterExpression: '#status IN (:pending, :provisioning, :deleting, :failedToProvision, :failedToDelete, :failedWithStack)',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':pending': 'pending',
        ':provisioning': 'provisioning',
        ':deleting': 'deleting',
        ':failedToProvision': 'failed-to-provision',
        ':failedToDelete': 'failed-to-delete',
        ':failedWithStack': 'failed-with-stack'
      },
      Limit: parseInt(limit)
    };

    // Add specific status filter if specified
    if (status) {
      scanParams.FilterExpression = '#status = :statusFilter';
      scanParams.ExpressionAttributeValues = {
        ':statusFilter': status
      };
    }

    const result = await dynamodb.scan(scanParams).promise();
    
    // Enrich with build information
    const enrichedProjects = await Promise.all(
      result.Items.map(async (project) => {
        if (project.buildId) {
          try {
            const buildInfo = await codebuild.batchGetBuilds({
              ids: [project.buildId]
            }).promise();
            
            if (buildInfo.builds && buildInfo.builds.length > 0) {
              project.buildInfo = {
                buildStatus: buildInfo.builds[0].buildStatus,
                currentPhase: buildInfo.builds[0].currentPhase,
                startTime: buildInfo.builds[0].startTime,
                endTime: buildInfo.builds[0].endTime
              };
            }
          } catch (error) {
            console.error(`Error fetching build info for ${project.buildId}:`, error);
          }
        }
        return project;
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        projects: enrichedProjects,
        count: enrichedProjects.length,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Error getting automation status:', error);
    throw error;
  }
}

/**
 * Get automation execution history with filtering
 */
async function getAutomationHistory(queryParams) {
  try {
    const { 
      startDate, 
      endDate, 
      result: resultFilter, 
      projectId,
      limit = '100',
      nextToken 
    } = queryParams;

    // Get builds for the CodeBuild project
    const listBuildsParams = {
      projectName: CODEBUILD_PROJECT,
      sortOrder: 'DESCENDING'
    };

    if (nextToken) {
      listBuildsParams.nextToken = nextToken;
    }

    const buildsResult = await codebuild.listBuildsForProject(listBuildsParams).promise();
    
    if (!buildsResult.ids || buildsResult.ids.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          executions: [],
          count: 0,
          nextToken: null
        })
      };
    }

    // Get detailed build information
    const buildDetails = await codebuild.batchGetBuilds({
      ids: buildsResult.ids.slice(0, parseInt(limit))
    }).promise();

    let executions = buildDetails.builds || [];

    // Apply filters
    if (startDate) {
      const startDateTime = new Date(startDate);
      executions = executions.filter(build => 
        build.startTime && new Date(build.startTime) >= startDateTime
      );
    }

    if (endDate) {
      const endDateTime = new Date(endDate);
      executions = executions.filter(build => 
        build.startTime && new Date(build.startTime) <= endDateTime
      );
    }

    if (resultFilter) {
      const statusMap = {
        'success': 'SUCCEEDED',
        'failure': ['FAILED', 'FAULT', 'TIMED_OUT', 'STOPPED']
      };
      
      if (resultFilter === 'success') {
        executions = executions.filter(build => build.buildStatus === 'SUCCEEDED');
      } else if (resultFilter === 'failure') {
        executions = executions.filter(build => 
          ['FAILED', 'FAULT', 'TIMED_OUT', 'STOPPED'].includes(build.buildStatus)
        );
      }
    }

    if (projectId) {
      executions = executions.filter(build => {
        const envVars = build.environment?.environmentVariables || [];
        const projectIdVar = envVars.find(v => v.name === 'PROJECT_ID');
        return projectIdVar && projectIdVar.value === projectId;
      });
    }

    // Format response with enhanced information
    const formattedExecutions = await Promise.all(executions.map(async (build) => {
      const envVars = build.environment?.environmentVariables || [];
      const projectIdVar = envVars.find(v => v.name === 'PROJECT_ID');
      const actionVar = envVars.find(v => v.name === 'ACTION');
      const stackNameVar = envVars.find(v => v.name === 'STACK_NAME');

      const projectId = projectIdVar?.value;
      const action = actionVar?.value;
      const buildStatus = build.buildStatus;

      // Get current project status to correlate with build result
      let currentProjectStatus = null;
      let resultingStatus = null;
      
      if (projectId) {
        try {
          const projectResult = await dynamodb.get({
            TableName: PROJECTS_TABLE,
            Key: { projectId }
          }).promise();
          
          currentProjectStatus = projectResult.Item?.status;
          
          // Determine what status this build result should have produced
          if (buildStatus === 'SUCCEEDED') {
            resultingStatus = action === 'deploy' ? 'active' : 'deleted';
          } else if (['FAILED', 'FAULT', 'TIMED_OUT', 'STOPPED'].includes(buildStatus)) {
            resultingStatus = action === 'deploy' ? 'failed-to-provision' : 'failed-to-delete';
          }
        } catch (error) {
          console.error(`Error fetching project ${projectId}:`, error);
        }
      }

      return {
        executionId: build.id,
        projectId: projectId,
        action: action,
        stackName: stackNameVar?.value,
        status: buildStatus,
        startTime: build.startTime,
        endTime: build.endTime,
        duration: build.endTime && build.startTime ? 
          Math.round((new Date(build.endTime) - new Date(build.startTime)) / 1000) : null,
        currentPhase: build.currentPhase,
        initiator: build.initiator,
        // Enhanced fields
        currentProjectStatus: currentProjectStatus,
        resultingStatus: resultingStatus,
        actionType: action === 'deploy' ? 'Provision' : action === 'destroy' ? 'Delete' : action
      };
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        executions: formattedExecutions,
        count: formattedExecutions.length,
        nextToken: buildsResult.nextToken || null,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Error getting automation history:', error);
    throw error;
  }
}

/**
 * Get failure analysis with breakdown by failure type
 */
async function getFailureAnalysis(queryParams) {
  try {
    const { 
      startDate, 
      endDate, 
      failureType, // 'provision' or 'delete'
      limit = '100' 
    } = queryParams;

    // Get projects with failure statuses
    const scanParams = {
      TableName: PROJECTS_TABLE,
      FilterExpression: '#status IN (:failed, :failedToProvision, :failedToDelete, :failedWithStack)',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':failed': 'failed',
        ':failedToProvision': 'failed-to-provision',
        ':failedToDelete': 'failed-to-delete',
        ':failedWithStack': 'failed-with-stack'
      },
      Limit: parseInt(limit)
    };

    // Add specific failure type filter
    if (failureType === 'provision') {
      scanParams.FilterExpression = '#status IN (:failed, :failedToProvision)';
      scanParams.ExpressionAttributeValues = {
        ':failed': 'failed',
        ':failedToProvision': 'failed-to-provision'
      };
    } else if (failureType === 'delete') {
      scanParams.FilterExpression = '#status IN (:failedToDelete, :failedWithStack)';
      scanParams.ExpressionAttributeValues = {
        ':failedToDelete': 'failed-to-delete',
        ':failedWithStack': 'failed-with-stack'
      };
    }

    const result = await dynamodb.scan(scanParams).promise();
    let failedProjects = result.Items || [];

    // Apply date filters if specified
    if (startDate || endDate) {
      failedProjects = failedProjects.filter(project => {
        const lastModified = new Date(project.lastModified);
        if (startDate && lastModified < new Date(startDate)) return false;
        if (endDate && lastModified > new Date(endDate)) return false;
        return true;
      });
    }

    // Categorize failures
    const analysis = {
      totalFailures: failedProjects.length,
      provisioningFailures: failedProjects.filter(p => 
        ['failed', 'failed-to-provision'].includes(p.status)
      ).length,
      deletionFailures: failedProjects.filter(p => 
        ['failed-to-delete', 'failed-with-stack'].includes(p.status)
      ).length,
      failuresByStatus: {
        'failed': failedProjects.filter(p => p.status === 'failed').length,
        'failed-to-provision': failedProjects.filter(p => p.status === 'failed-to-provision').length,
        'failed-to-delete': failedProjects.filter(p => p.status === 'failed-to-delete').length,
        'failed-with-stack': failedProjects.filter(p => p.status === 'failed-with-stack').length
      },
      projects: failedProjects.map(project => ({
        projectId: project.projectId,
        name: project.name,
        status: project.status,
        lastModified: project.lastModified,
        createdBy: project.createdBy,
        buildId: project.buildId,
        stackInfo: project.stackInfo
      }))
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        analysis,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Error getting failure analysis:', error);
    throw error;
  }
}
async function getProjectAutomationStatus(projectId) {
  try {
    // Get project details
    const projectResult = await dynamodb.get({
      TableName: PROJECTS_TABLE,
      Key: { projectId }
    }).promise();

    if (!projectResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Project not found' })
      };
    }

    const project = projectResult.Item;
    let response = {
      projectId,
      status: project.status,
      lastModified: project.lastModified,
      buildId: project.buildId
    };

    // Get current build information if available
    if (project.buildId) {
      try {
        const buildInfo = await codebuild.batchGetBuilds({
          ids: [project.buildId]
        }).promise();
        
        if (buildInfo.builds && buildInfo.builds.length > 0) {
          const build = buildInfo.builds[0];
          response.currentBuild = {
            buildStatus: build.buildStatus,
            currentPhase: build.currentPhase,
            startTime: build.startTime,
            endTime: build.endTime,
            phases: build.phases
          };
        }
      } catch (error) {
        console.error(`Error fetching build info for ${project.buildId}:`, error);
      }
    }

    // Get recent build history for this project
    try {
      const buildsResult = await codebuild.listBuildsForProject({
        projectName: CODEBUILD_PROJECT,
        sortOrder: 'DESCENDING'
      }).promise();

      if (buildsResult.ids && buildsResult.ids.length > 0) {
        const buildDetails = await codebuild.batchGetBuilds({
          ids: buildsResult.ids.slice(0, 10) // Get last 10 builds
        }).promise();

        // Filter builds for this project
        const projectBuilds = buildDetails.builds.filter(build => {
          const envVars = build.environment?.environmentVariables || [];
          const projectIdVar = envVars.find(v => v.name === 'PROJECT_ID');
          return projectIdVar && projectIdVar.value === projectId;
        });

        response.recentBuilds = projectBuilds.slice(0, 5).map(build => {
          const envVars = build.environment?.environmentVariables || [];
          const actionVar = envVars.find(v => v.name === 'ACTION');
          
          return {
            buildId: build.id,
            action: actionVar?.value,
            status: build.buildStatus,
            startTime: build.startTime,
            endTime: build.endTime,
            duration: build.endTime && build.startTime ? 
              Math.round((new Date(build.endTime) - new Date(build.startTime)) / 1000) : null
          };
        });
      }
    } catch (error) {
      console.error('Error fetching build history:', error);
    }

    // Add stack information if available (for failed projects)
    if (project.stackInfo) {
      response.stackInfo = project.stackInfo;
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Error getting project automation status:', error);
    throw error;
  }
}