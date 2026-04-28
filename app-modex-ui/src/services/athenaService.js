/**
 * Athena Service
 * Handles interactions with the Athena query API
 */

import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Base API URL from environment variables
 */
const API_URL = process.env.REACT_APP_API_URL || '';

/**
 * Get authentication headers for API requests
 * @returns {Promise<Object>} - Headers object with Authorization
 */
const getAuthHeaders = async () => {
  try {
    const { tokens } = await fetchAuthSession();
    if (!tokens || !tokens.idToken) {
      throw new Error('No authentication token available');
    }
    
    return {
      'Authorization': `Bearer ${tokens.idToken.toString()}`
    };
  } catch (error) {
    console.error('Error getting auth headers:', error);
    throw error;
  }
};

/**
 * Execute an Athena query
 * @param {string} query - The SQL query to execute
 * @param {string} dataType - The type of data being queried (skills, tech-vision, etc.)
 * @returns {Promise<Object>} - The query results
 */
export const executeQuery = async (query, dataType) => {
  try {
    // Get the selected project from localStorage
    const selectedProject = localStorage.getItem('selectedProject');
    if (!selectedProject) {
      throw new Error('No project selected');
    }
    
    const project = JSON.parse(selectedProject);
    const projectId = project.projectId || project.id;
    
    if (!projectId) {
      throw new Error('Invalid project ID');
    }
    
    // Get auth headers
    const authHeaders = await getAuthHeaders();
    
    // Build the API URL
    const url = `${API_URL}/athena`;
    
    console.log(`🔍 Executing Athena query for ${dataType}`);
    
    // Make API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        query,
        dataType,
        projectId
      })
    });
    
    // Parse response
    const result = await response.json();
    
    // Check for errors
    if (!response.ok) {
      throw new Error(result.error || 'Failed to execute query');
    }
    
    console.log(`✅ Query executed successfully, retrieved ${result.data.length} rows`);
    
    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  } catch (error) {
    console.error('❌ Error executing Athena query:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute query',
      data: []
    };
  }
};

/**
 * Get skills inventory data
 * @returns {Promise<Object>} - The skills inventory data
 */
export const getSkillsInventory = async () => {
  const query = `
    SELECT  skill AS skill_name,
            team AS persona,
            proficiency AS score
    FROM    team_skills
    ORDER BY team ASC, skill ASC
  `;
  return executeQuery(query, 'skills');
};

/**
 * Get technology radar data
 * @returns {Promise<Object>} - The technology radar data
 */
export const getTechnologyRadar = async () => {
  const query = `
    SELECT 
      technology_name,
      category,
      ring,
      description,
      moved
    FROM 
      tech_vision
    ORDER BY 
      category ASC,
      ring ASC
  `;
  
  return executeQuery(query, 'tech-vision');
};

/**
 * Get application portfolio data
 * @returns {Promise<Object>} - The application portfolio data
 */
export const getApplicationPortfolio = async () => {
  const query = `
    SELECT 
      app_name,
      description,
      criticality,
      business_value,
      technical_fit,
      owner,
      status
    FROM 
      applications
    ORDER BY 
      criticality DESC,
      business_value DESC
  `;
  
  return executeQuery(query, 'applications');
};

/**
 * Get technology stack data
 * @returns {Promise<Object>} - The technology stack data
 */
export const getTechnologyStack = async () => {
  const query = `
    SELECT 
      component_name,
      category,
      subcategory,
      version,
      status,
      count(app_name) as usage_count
    FROM 
      tech_stack
    GROUP BY 
      component_name,
      category,
      subcategory,
      version,
      status
    ORDER BY 
      usage_count DESC
  `;
  
  return executeQuery(query, 'tech-stack');
};

/**
 * Get infrastructure resources data
 * @returns {Promise<Object>} - The infrastructure resources data
 */
export const getInfrastructureResources = async () => {
  const query = `
    SELECT 
      resource_id,
      resource_type,
      environment,
      region,
      status,
      provisioned_date
    FROM 
      infrastructure
    ORDER BY 
      environment ASC,
      resource_type ASC
  `;
  
  return executeQuery(query, 'infrastructure');
};

/**
 * Get resource utilization data
 * @returns {Promise<Object>} - The resource utilization data
 */
export const getResourceUtilization = async () => {
  const query = `
    SELECT 
      resource_id,
      metric_name,
      avg(metric_value) as avg_value,
      max(metric_value) as max_value,
      min(metric_value) as min_value
    FROM 
      utilization
    WHERE 
      timestamp >= date_add('day', -30, current_date)
    GROUP BY 
      resource_id,
      metric_name
    ORDER BY 
      resource_id ASC
  `;
  
  return executeQuery(query, 'utilization');
};

export default {
  executeQuery,
  getSkillsInventory,
  getTechnologyRadar,
  getApplicationPortfolio,
  getTechnologyStack,
  getInfrastructureResources,
  getResourceUtilization
};
