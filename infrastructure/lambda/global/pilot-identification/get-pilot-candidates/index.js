// Force deployment timestamp: 2025-08-05T10:03:13.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:13.3NZ';

/**
 * Get Pilot Candidates Lambda Function
 * 
 * This function implements the main pilot identification algorithm
 * based on the specifications in ALGORITHM.md
 */

const { 
  createResponse, 
  createErrorResponse, 
  getAllApplications, 
  getSimilarApplications,
  calculateFinalScore 
} = require('./utils');

/**
 * Filter applications based on team capabilities
 */
const filterByTeamCapabilities = (applications, teamCapabilities) => {
  if (!teamCapabilities || teamCapabilities.length === 0) {
    return applications;
  }

  return applications.filter(app => {
    const techStack = app.techStack || {};
    const techValues = Object.values(techStack).map(tech => tech.toLowerCase());
    
    // Check if any of the team capabilities match the app's tech stack
    return teamCapabilities.some(capability => 
      techValues.some(tech => tech.includes(capability.toLowerCase()))
    );
  });
};

/**
 * Extract project ID from event context
 */
const getProjectIdFromEvent = (event) => {
  // Try to get project ID from various sources
  if (event.requestContext?.authorizer?.claims?.['custom:projectId']) {
    return event.requestContext.authorizer.claims['custom:projectId'];
  }
  
  // Try to get from headers
  if (event.headers?.['x-project-id']) {
    return event.headers['x-project-id'];
  }
  
  // Try to get from body
  try {
    const body = JSON.parse(event.body);
    if (body.projectId) {
      return body.projectId;
    }
  } catch (error) {
    // Ignore parsing errors
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

    // Parse request body
    let criteria;
    try {
      criteria = JSON.parse(event.body);
    } catch (error) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    // Validate required parameters
    if (!criteria.drivers && !criteria.events) {
      return createErrorResponse(400, 'At least one business driver or compelling event must be selected');
    }

    console.log('Criteria:', JSON.stringify(criteria, null, 2));

    // Get all applications for the project
    const allApplications = await getAllApplications(projectId);
    console.log(`Found ${allApplications.length} total applications for project ${projectId}`);

    if (allApplications.length === 0) {
      return createResponse(200, []);
    }

    // Filter by team capabilities if specified
    let filteredApplications = filterByTeamCapabilities(allApplications, criteria.teamCapabilities);
    console.log(`After team capabilities filter: ${filteredApplications.length} applications`);

    // Calculate scores for each application
    const scoredApplications = await Promise.all(
      filteredApplications.map(async (app) => {
        // Get similar applications FIRST (needed for scoring)
        const similarApps = await getSimilarApplications(
          app.applicationId, 
          projectId,
          criteria.similarityThreshold || 80,
          50
        );
        
        // Calculate scores with similar app count for reusability multiplier
        const scores = calculateFinalScore(app, criteria, similarApps.length);

        return {
          id: app.applicationId,
          name: app.name,
          description: app.description || app.purpose || '',
          department: app.department,
          criticality: app.criticality,
          users: app.users || 0,
          driverAlignment: scores.driverAlignment,
          feasibility: scores.feasibility,
          techStack: {
            runtime: app.techStack?.runtime || '',
            framework: app.techStack?.framework || '',
            database: app.techStack?.database || '',
            integration: app.techStack?.integration || ''
          },
          infrastructure: {
            serverType: app.infrastructure?.serverType || '',
            environment: app.infrastructure?.environment || '',
            cpu: app.infrastructure?.cpu || '',
            memory: app.infrastructure?.memory || ''
          },
          utilization: {
            cpu: app.utilization?.cpu || 0,
            memory: app.utilization?.memory || 0,
            storage: app.utilization?.storage || 0,
            network: app.utilization?.network || 0
          },
          similarApps: similarApps,
          similarApplicationCount: similarApps.length,
          reusabilityMultiplier: scores.reusabilityMultiplier,
          finalScore: scores.finalScore,
          eventAlignment: scores.eventAlignment,
          impact: scores.impact
        };
      })
    );

    // Sort by final score (descending)
    scoredApplications.sort((a, b) => b.finalScore - a.finalScore);

    // Apply maxCandidates limit if specified
    let finalCandidates = scoredApplications;
    if (criteria.maxCandidates && criteria.maxCandidates < scoredApplications.length) {
      finalCandidates = scoredApplications.slice(0, criteria.maxCandidates);
    }

    console.log(`Returning ${finalCandidates.length} pilot candidates`);

    return createResponse(200, finalCandidates);

  } catch (error) {
    console.error('Error in getPilotCandidates:', error);
    return createErrorResponse(500, 'Internal server error', error);
  }
};
