/**
 * Shared utilities for Pilot Identification Lambda functions
 */

const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');

// Initialize Athena client
const athena = new AthenaClient({ region: process.env.AWS_REGION || 'us-west-2' });

/**
 * Standard HTTP response helper
 */
const createResponse = (statusCode, body, headers = {}) => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      ...headers
    },
    body: JSON.stringify(body)
  };
};

/**
 * Error response helper
 */
const createErrorResponse = (statusCode, message, error = null) => {
  console.error('Error:', message, error);
  return createResponse(statusCode, {
    error: message,
    details: error ? error.message : undefined
  });
};

/**
 * Execute Athena query directly using AWS SDK v3
 */
const executeAthenaQuery = async (query, projectId) => {
  try {
    const finalQuery = query.replace(/\$\{projectId\}/g, projectId);
    const database = `app_modex_${projectId}`;
    const resultsBucket = `app-modex-results-${projectId}`.toLowerCase();
    
    console.log('Executing Athena query:', finalQuery);
    console.log(`Using database: ${database}, results bucket: ${resultsBucket}`);

    // Start query execution
    const startCommand = new StartQueryExecutionCommand({
      QueryString: finalQuery,
      QueryExecutionContext: {
        Database: database
      },
      ResultConfiguration: {
        OutputLocation: `s3://${resultsBucket}/pilot-identification/`
      }
    });

    const startResult = await athena.send(startCommand);
    const queryExecutionId = startResult.QueryExecutionId;

    // Wait for query to complete
    let status = 'QUEUED';
    while (status === 'QUEUED' || status === 'RUNNING') {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const statusCommand = new GetQueryExecutionCommand({
        QueryExecutionId: queryExecutionId
      });
      
      const statusResult = await athena.send(statusCommand);
      status = statusResult.QueryExecution.Status.State;
      
      if (status === 'FAILED' || status === 'CANCELLED') {
        const reason = statusResult.QueryExecution.Status.StateChangeReason;
        throw new Error(`Query failed: ${reason}`);
      }
    }

    // Get query results
    const resultsCommand = new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId,
      MaxResults: 1000
    });

    const resultsData = await athena.send(resultsCommand);
    
    // Parse results
    const rows = resultsData.ResultSet.Rows;
    if (rows.length === 0) {
      return [];
    }

    // Extract column names from first row
    const columns = rows[0].Data.map(col => col.VarCharValue);
    
    // Convert remaining rows to objects
    const data = rows.slice(1).map(row => {
      const obj = {};
      row.Data.forEach((cell, index) => {
        obj[columns[index]] = cell.VarCharValue || null;
      });
      return obj;
    });

    console.log(`Query returned ${data.length} rows`);
    return data;
  } catch (error) {
    console.error('Error executing Athena query:', error);
    throw error;
  }
};

/**
 * Get application portfolio data from Athena
 */
const getApplicationPortfolioData = async (projectId) => {
  try {
    const query = `
      SELECT 
        id,
        applicationname as applicationName,
        department,
        criticality,
        purpose
      FROM 
        "app_modex_\${projectId}".application_portfolio
      ORDER BY 
        applicationname ASC
    `;

    const data = await executeAthenaQuery(query, projectId);
    return data;
  } catch (error) {
    console.error('Error getting application portfolio data:', error);
    throw error;
  }
};

/**
 * Get tech stack data from Athena
 */
const getTechStackData = async (projectId) => {
  try {
    const query = `
      SELECT 
        id,
        applicationname as applicationName,
        componentname as componentName,
        runtime,
        framework,
        databases,
        integrations,
        storages
      FROM 
        "app_modex_\${projectId}".tech_stack
      ORDER BY 
        applicationname ASC, componentname ASC
    `;

    const data = await executeAthenaQuery(query, projectId);
    
    // Process the data to handle array fields
    return data.map(item => ({
      ...item,
      databases: item.databases && typeof item.databases === 'string' ? 
        item.databases.split(',').map(db => db.trim()) : [],
      integrations: item.integrations && typeof item.integrations === 'string' ? 
        item.integrations.split(',').map(int => int.trim()) : [],
      storages: item.storages && typeof item.storages === 'string' ? 
        item.storages.split(',').map(store => store.trim()) : []
    }));
  } catch (error) {
    console.error('Error getting tech stack data:', error);
    throw error;
  }
};

/**
 * Get infrastructure data from Athena
 */
const getInfrastructureData = async (projectId) => {
  try {
    const query = `
      SELECT 
        applicationname as applicationName,
        servertype as serverType,
        environment
      FROM 
        "app_modex_\${projectId}".infrastructure_resources
      ORDER BY 
        applicationname ASC
    `;

    const data = await executeAthenaQuery(query, projectId);
    return data;
  } catch (error) {
    console.error('Error getting infrastructure data:', error);
    // Return empty array if infrastructure data doesn't exist
    console.log('Infrastructure table may not have data, returning empty array');
    return [];
  }
};

/**
 * Get utilization data from Athena
 */
const getUtilizationData = async (projectId) => {
  try {
    const query = `
      SELECT 
        applicationname as applicationName
      FROM 
        "app_modex_\${projectId}".resource_utilization
      ORDER BY 
        applicationname ASC
    `;

    const data = await executeAthenaQuery(query, projectId);
    return data;
  } catch (error) {
    console.error('Error getting utilization data:', error);
    // Return empty array if utilization data doesn't exist
    console.log('Utilization table may not have data, returning empty array');
    return [];
  }
};

/**
 * Get all applications with combined data from all Athena tables
 */
const getAllApplications = async (projectId, filters = {}) => {
  try {
    // Get data from all tables in parallel
    const [portfolioData, techStackData, infrastructureData, utilizationData] = await Promise.all([
      getApplicationPortfolioData(projectId),
      getTechStackData(projectId),
      getInfrastructureData(projectId),
      getUtilizationData(projectId)
    ]);

    // Create maps for easy lookup
    const techStackMap = new Map();
    const infrastructureMap = new Map();
    const utilizationMap = new Map();

    // Group tech stack data by application name
    techStackData.forEach(item => {
      if (!techStackMap.has(item.applicationName)) {
        techStackMap.set(item.applicationName, []);
      }
      techStackMap.get(item.applicationName).push(item);
    });

    infrastructureData.forEach(item => {
      infrastructureMap.set(item.applicationName, item);
    });

    utilizationData.forEach(item => {
      utilizationMap.set(item.applicationName, item);
    });

    // Combine all data
    let applications = portfolioData.map(app => {
      const techStackItems = techStackMap.get(app.applicationName) || [];
      const infrastructure = infrastructureMap.get(app.applicationName) || {};
      const utilization = utilizationMap.get(app.applicationName) || {};

      // Combine tech stack data (take first component or aggregate)
      const primaryTechStack = techStackItems[0] || {};

      return {
        applicationId: app.id,
        name: app.applicationName,
        description: app.purpose || '',
        department: app.department,
        criticality: app.criticality,
        purpose: app.purpose,
        users: Math.floor(Math.random() * 5000) + 100, // Mock user count - would need real data
        techStack: {
          runtime: primaryTechStack.runtime || '',
          framework: primaryTechStack.framework || '',
          database: primaryTechStack.databases?.[0] || '',
          integration: primaryTechStack.integrations?.[0] || '',
          components: techStackItems.map(item => item.componentName).filter(Boolean),
          languages: [] // Would need to be added to schema
        },
        infrastructure: {
          serverName: infrastructure.serverName || '',
          serverType: infrastructure.serverType || '',
          orchestrationPlatform: infrastructure.orchestrationPlatform || '',
          environment: infrastructure.environment || '',
          cpu: infrastructure.cpu || '',
          memory: infrastructure.memory || '',
          storage: infrastructure.storage || '',
          network: infrastructure.network || ''
        },
        utilization: {
          cpu: utilization.cpu || 0,
          memory: utilization.memory || 0,
          storage: utilization.storage || 0,
          network: utilization.network || 0
        }
      };
    });

    // Apply filters
    if (filters.department) {
      applications = applications.filter(app => app.department === filters.department);
    }
    if (filters.criticality) {
      applications = applications.filter(app => app.criticality === filters.criticality);
    }

    return applications;
  } catch (error) {
    console.error('Error getting all applications:', error);
    throw error;
  }
};

/**
 * Get application by ID with all related data
 */
const getApplicationById = async (applicationId, projectId) => {
  try {
    const applications = await getAllApplications(projectId);
    return applications.find(app => app.applicationId === applicationId) || null;
  } catch (error) {
    console.error('Error getting application by ID:', error);
    throw error;
  }
};

/**
 * Calculate similarity between two applications based on tech stack
 * This is a simplified version - in production you'd want more sophisticated similarity calculation
 */
const calculateSimilarity = (app1, app2) => {
  let score = 0;
  let factors = 0;

  // Runtime similarity
  if (app1.techStack.runtime && app2.techStack.runtime) {
    factors++;
    if (app1.techStack.runtime === app2.techStack.runtime) {
      score += 30;
    }
  }

  // Framework similarity
  if (app1.techStack.framework && app2.techStack.framework) {
    factors++;
    if (app1.techStack.framework === app2.techStack.framework) {
      score += 25;
    }
  }

  // Database similarity
  if (app1.techStack.database && app2.techStack.database) {
    factors++;
    if (app1.techStack.database === app2.techStack.database) {
      score += 20;
    }
  }

  // Department similarity
  if (app1.department && app2.department) {
    factors++;
    if (app1.department === app2.department) {
      score += 15;
    }
  }

  // Infrastructure similarity
  if (app1.infrastructure.serverType && app2.infrastructure.serverType) {
    factors++;
    if (app1.infrastructure.serverType === app2.infrastructure.serverType) {
      score += 10;
    }
  }

  // Return normalized score
  return factors > 0 ? Math.min(100, score) : 0;
};

/**
 * Get similar applications for a given application
 */
const getSimilarApplications = async (applicationId, projectId, threshold = 80, limit = 50) => {
  try {
    const applications = await getAllApplications(projectId);
    const targetApp = applications.find(app => app.applicationId === applicationId);
    
    if (!targetApp) {
      return [];
    }

    const similarApps = applications
      .filter(app => app.applicationId !== applicationId)
      .map(app => ({
        id: app.applicationId,
        name: app.name,
        similarity: calculateSimilarity(targetApp, app),
        department: app.department,
        criticality: app.criticality,
        commonTechnologies: [
          targetApp.techStack.runtime === app.techStack.runtime ? app.techStack.runtime : null,
          targetApp.techStack.framework === app.techStack.framework ? app.techStack.framework : null,
          targetApp.techStack.database === app.techStack.database ? app.techStack.database : null
        ].filter(Boolean)
      }))
      .filter(app => app.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return similarApps;
  } catch (error) {
    console.error('Error getting similar applications:', error);
    throw error;
  }
};

/**
 * Business Driver Alignment Scoring
 * Based on ALGORITHM.md specifications
 */
const scoreBusinessDrivers = (application, businessDrivers) => {
  if (!businessDrivers || businessDrivers.length === 0) {
    return 50; // Neutral score if no drivers selected
  }

  let totalScore = 0;

  businessDrivers.forEach(driver => {
    switch (driver) {
      case 'cost':
        // Higher score for high criticality apps (more cost savings potential)
        if (application.criticality === 'High') totalScore += 30;
        else if (application.criticality === 'Medium') totalScore += 20;
        else totalScore += 10;

        // Higher score for certain departments known to have cost challenges
        if (['Finance', 'Operations', 'IT'].includes(application.department)) {
          totalScore += 20;
        }
        break;

      case 'agility':
        // Higher score for customer-facing applications
        if (application.purpose && application.purpose.toLowerCase().includes('customer')) {
          totalScore += 25;
        }

        // Higher score for certain departments focused on innovation
        if (['Marketing', 'Product', 'Sales'].includes(application.department)) {
          totalScore += 25;
        }
        break;

      case 'risk':
        // Higher score for high criticality apps
        if (application.criticality === 'High') totalScore += 30;
        else if (application.criticality === 'Medium') totalScore += 15;

        // Higher score for certain departments with compliance needs
        if (['Finance', 'Legal', 'HR'].includes(application.department)) {
          totalScore += 20;
        }
        break;

      case 'performance':
        // Higher score for customer-facing applications
        if (application.purpose && application.purpose.toLowerCase().includes('customer')) {
          totalScore += 25;
        }

        // Higher score for certain departments
        if (['Sales', 'Customer Service', 'E-Commerce'].includes(application.department)) {
          totalScore += 25;
        }
        break;

      case 'competitive':
        // Higher score for high criticality apps
        if (application.criticality === 'High') totalScore += 20;
        else if (application.criticality === 'Medium') totalScore += 15;

        // Higher score for certain departments
        if (['E-Commerce', 'Operations', 'Product'].includes(application.department)) {
          totalScore += 30;
        }
        break;

      default:
        // Default scoring for other drivers
        if (application.criticality === 'High') totalScore += 20;
        else if (application.criticality === 'Medium') totalScore += 15;
        else totalScore += 10;
        break;
    }
  });

  // Normalize score based on number of drivers
  return Math.min(100, totalScore / businessDrivers.length);
};

/**
 * Compelling Event Alignment Scoring
 * Based on ALGORITHM.md specifications
 */
const scoreCompellingEvents = (application, compellingEvents) => {
  if (!compellingEvents || compellingEvents.length === 0) {
    return 50; // Neutral score if no events selected
  }

  let totalScore = 0;

  compellingEvents.forEach(event => {
    switch (event) {
      case 'support':
        // Higher score for apps with imminent EOL technologies
        totalScore += 50;
        break;

      case 'datacenter':
        // Higher score for apps in targeted datacenters
        totalScore += 50;
        break;

      case 'merger':
        // Higher score for apps affected by M&A activities
        totalScore += 50;
        break;

      case 'compliance':
        // Higher score for apps with compliance requirements
        if (['Finance', 'Legal', 'HR', 'Healthcare'].includes(application.department)) {
          totalScore += 50;
        }
        break;

      case 'initiative':
        // Higher score for apps limiting business growth
        if (['Sales', 'Marketing', 'Product', 'E-Commerce'].includes(application.department)) {
          totalScore += 50;
        }
        break;

      default:
        totalScore += 25; // Default score for other events
        break;
    }
  });

  // Normalize score based on number of events
  return Math.min(100, totalScore / compellingEvents.length);
};

/**
 * Technical Feasibility Scoring
 * Based on ALGORITHM.md specifications
 */
const scoreTechnicalFeasibility = (application) => {
  let score = 50; // Base score

  // Adjust based on criticality (lower criticality is easier to modernize)
  if (application.criticality === 'Low') {
    score += 20;
  } else if (application.criticality === 'Medium') {
    score += 10;
  }

  // Adjust based on technology stack complexity
  const techStack = application.techStack || {};
  
  // Modern technologies get higher feasibility scores
  if (techStack.runtime === 'Node.js' || techStack.runtime === 'Python') {
    score += 10;
  } else if (techStack.runtime === 'Java' && techStack.framework === 'Spring Boot') {
    score += 5;
  }

  // Container-based infrastructure is easier to modernize
  // Check orchestration platform for containerization
  const orchestrationPlatform = application.infrastructure?.orchestrationPlatform?.toLowerCase() || '';
  if (orchestrationPlatform) {
    if (orchestrationPlatform.includes('kubernetes') || 
        orchestrationPlatform.includes('eks') || 
        orchestrationPlatform.includes('ecs') || 
        orchestrationPlatform.includes('docker')) {
      score += 10; // Containerized workload - easier to modernize
    } else if (orchestrationPlatform === 'none' || orchestrationPlatform === '') {
      score += 5; // Traditional VM - moderate modernization effort
    }
  } else {
    // Fallback: check if serverType suggests containerization
    const serverType = application.infrastructure?.serverType?.toLowerCase() || '';
    if (serverType.includes('container')) {
      score += 10;
    } else if (serverType.includes('virtual') || serverType.includes('vm')) {
      score += 5;
    }
  }

  // Ensure score is within 0-100 range
  return Math.max(0, Math.min(100, score));
};

/**
 * Business Impact Scoring
 * Based on ALGORITHM.md specifications
 * 
 * @param {Object} application - The application to score
 * @param {number} similarAppCount - Number of similar applications (for reusability multiplier)
 * @returns {number} Impact score (0-100)
 */
const scoreBusinessImpact = (application, similarAppCount = 0) => {
  let score = 40; // Base score

  // Adjust based on criticality (higher criticality has more impact)
  if (application.criticality === 'High') {
    score += 30;
  } else if (application.criticality === 'Medium') {
    score += 15;
  }

  // Adjust based on user count (more users = higher impact)
  if (application.users > 1000) {
    score += 15;
  } else if (application.users > 100) {
    score += 10;
  }

  // Customer-facing applications have higher impact
  if (application.purpose && application.purpose.toLowerCase().includes('customer')) {
    score += 15;
  }

  // Apply reusability multiplier based on similar applications
  // The more similar applications, the higher the impact of modernizing this pilot
  let reusabilityMultiplier = 1.0;
  if (similarAppCount >= 10) {
    reusabilityMultiplier = 1.5; // 50% boost for 10+ similar apps
  } else if (similarAppCount >= 5) {
    reusabilityMultiplier = 1.3; // 30% boost for 5-9 similar apps
  } else if (similarAppCount >= 2) {
    reusabilityMultiplier = 1.15; // 15% boost for 2-4 similar apps
  } else if (similarAppCount === 1) {
    reusabilityMultiplier = 1.05; // 5% boost for 1 similar app
  } else {
    reusabilityMultiplier = 0.7; // 30% penalty for 0 similar apps
  }

  score = score * reusabilityMultiplier;

  // Ensure score is within 0-100 range
  return Math.max(0, Math.min(100, score));
};

/**
 * Calculate final pilot candidate score
 * Based on ALGORITHM.md specifications
 */
const calculateFinalScore = (application, criteria, similarAppCount = 0) => {
  const weights = criteria.weights || {
    businessDriver: 0.30,
    compellingEvent: 0.25,
    feasibility: 0.25,
    impact: 0.20
  };

  const businessDriverScore = scoreBusinessDrivers(application, criteria.drivers);
  const compellingEventScore = scoreCompellingEvents(application, criteria.events);
  const feasibilityScore = scoreTechnicalFeasibility(application);
  const impactScore = scoreBusinessImpact(application, similarAppCount);

  const finalScore = (
    (businessDriverScore * weights.businessDriver) +
    (compellingEventScore * weights.compellingEvent) +
    (feasibilityScore * weights.feasibility) +
    (impactScore * weights.impact)
  );

  // Calculate reusability multiplier for display
  let reusabilityMultiplier = 1.0;
  if (similarAppCount >= 10) {
    reusabilityMultiplier = 1.5;
  } else if (similarAppCount >= 5) {
    reusabilityMultiplier = 1.3;
  } else if (similarAppCount >= 2) {
    reusabilityMultiplier = 1.15;
  } else if (similarAppCount === 1) {
    reusabilityMultiplier = 1.05;
  } else {
    reusabilityMultiplier = 0.7;
  }

  return {
    finalScore: Math.round(finalScore * 100) / 100,
    driverAlignment: Math.round(businessDriverScore * 100) / 100,
    eventAlignment: Math.round(compellingEventScore * 100) / 100,
    feasibility: Math.round(feasibilityScore * 100) / 100,
    impact: Math.round(impactScore * 100) / 100,
    reusabilityMultiplier: Math.round(reusabilityMultiplier * 100) / 100,
    similarApplicationCount: similarAppCount
  };
};

module.exports = {
  createResponse,
  createErrorResponse,
  getAllApplications,
  getApplicationById,
  getSimilarApplications,
  scoreBusinessDrivers,
  scoreCompellingEvents,
  scoreTechnicalFeasibility,
  scoreBusinessImpact,
  calculateFinalScore
};
