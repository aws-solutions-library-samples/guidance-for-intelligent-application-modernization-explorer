// Force deployment timestamp: 2025-08-05T10:03:09.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:07.3NZ';

/**
 * Get Applications Lambda Function
 * 
 * This function retrieves a list of applications with optional filtering
 */

const { 
  createResponse, 
  createErrorResponse, 
  getAllApplications
} = require('./utils');

/**
 * Extract project ID from event context
 */
const getProjectIdFromEvent = (event) => {
  // Try to get project ID from various sources
  if (event.requestContext?.authorizer?.claims?.['custom:projectId']) {
    return event.requestContext.authorizer.claims['custom:projectId'];
  }
  
  // Try to get from query parameters (new approach)
  if (event.queryStringParameters?.projectId) {
    return event.queryStringParameters.projectId;
  }
  
  // Try to get from headers (fallback)
  if (event.headers?.['x-project-id']) {
    return event.headers['x-project-id'];
  }
  
  // Default project ID for testing - in production this should be required
  return 'default-project';
};

/**
 * Main Lambda handler
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));

  try {
    // Extract project ID
    const projectId = getProjectIdFromEvent(event);
    console.log('Using project ID:', projectId);

    // Get query parameters
    const queryParams = event.queryStringParameters || {};
    const department = queryParams.department;
    const criticality = queryParams.criticality;
    const limit = parseInt(queryParams.limit) || 100;
    const offset = parseInt(queryParams.offset) || 0;

    console.log(`Getting applications for project: ${projectId} with filters - department: ${department}, criticality: ${criticality}, limit: ${limit}, offset: ${offset}`);

    // Build filters
    const filters = {};
    if (department) filters.department = department;
    if (criticality) filters.criticality = criticality;

    // Get applications
    const allApplications = await getAllApplications(projectId, filters);

    // Apply pagination
    const paginatedApplications = allApplications.slice(offset, offset + limit);

    // Format response - return summary information
    const response = paginatedApplications.map(app => ({
      id: app.applicationId,
      name: app.name,
      description: app.description || app.purpose || '',
      department: app.department,
      criticality: app.criticality,
      users: app.users || 0,
      techStack: {
        runtime: app.techStack?.runtime || '',
        framework: app.techStack?.framework || '',
        database: app.techStack?.database || ''
      },
      lastUpdated: app.lastUpdated
    }));

    console.log(`Returning ${response.length} applications (${allApplications.length} total)`);

    // Include pagination metadata
    const result = {
      applications: response,
      pagination: {
        total: allApplications.length,
        offset: offset,
        limit: limit,
        hasMore: (offset + limit) < allApplications.length
      }
    };

    return createResponse(200, result);

  } catch (error) {
    console.error('Error in getApplications:', error);
    return createErrorResponse(500, 'Internal server error', error);
  }
};
