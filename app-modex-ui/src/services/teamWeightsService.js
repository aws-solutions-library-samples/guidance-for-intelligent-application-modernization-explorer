/**
 * Service for managing team skill category weights via S3 and Athena
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { executeAthenaTemplate } from './athenaQueryService';

const API_BASE_URL = process.env.REACT_APP_API_URL;

// Helper function to get auth headers
const getAuthHeaders = async () => {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    
    if (!token) {
      throw new Error('No ID token available');
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  } catch (error) {
    console.error('Error getting auth headers:', error);
    throw new Error('Authentication required');
  }
};

/**
 * Get team weights data
 * @returns {Promise<Array>} - The team weights data
 */
export const getTeamWeights = async () => {
  try {
    console.log('🔄 Fetching team weights data...');
    
    // Get the current project ID from localStorage - using selectedProject key
    const selectedProject = JSON.parse(localStorage.getItem('selectedProject') || '{}');
    const projectId = selectedProject.projectId;
    
    if (!projectId) {
      throw new Error('No project ID available. Please select a project first.');
    }

    console.log('🔍 Executing team weights analysis query for project:', projectId);
    const result = await executeAthenaTemplate('team-weights-analysis', { projectId }, 'team-analysis');
    
    console.log('🔍 Raw query result:', JSON.stringify(result, null, 2));
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve team weights data');
    }

    // Process the data to handle the map and array fields properly
    const processedData = result.data.map(item => {
      console.log('🔍 Processing item:', item);
      
      // Parse categories from string if needed
      let categories = [];
      if (Array.isArray(item.categories)) {
        categories = item.categories;
      } else if (typeof item.categories === 'string') {
        try {
          // Handle format like "[API, Backend]"
          categories = item.categories
            .replace(/^\[|\]$/g, '') // Remove brackets
            .split(', ')             // Split by comma and space
            .filter(Boolean);        // Remove empty strings
        } catch (e) {
          console.error('Error parsing categories:', e);
          categories = [];
        }
      }
      
      // Parse weights from string if needed
      let weights = {};
      if (typeof item.weights === 'object' && !Array.isArray(item.weights) && item.weights !== null) {
        console.log('🔍 Item weights is an object:', item.weights);
        weights = item.weights;
      } else if (typeof item.weights === 'string') {
        console.log('🔍 Item weights is a string:', item.weights);
        try {
          // Handle format like "{cloud=14.0, database=15.0}"
          const weightsStr = item.weights.replace(/^\{|\}$/g, ''); // Remove curly braces
          if (weightsStr) {
            const pairs = weightsStr.split(', ');
            pairs.forEach(pair => {
              const [key, value] = pair.split('=');
              if (key && value) {
                weights[key.trim()] = parseFloat(value);
              }
            });
          }
          console.log('🔍 Parsed weights:', weights);
        } catch (e) {
          console.error('Error parsing weights:', e);
          weights = {};
        }
      } else {
        console.log('🔍 Item weights is neither an object nor a string:', item.weights);
      }
      
      const result = {
        id: item.teamName,
        teamName: item.teamName,
        memberCount: parseInt(item.memberCount) || 0,
        skillCount: parseInt(item.skillCount) || 0,
        categories: categories,
        weights: weights,
        totalWeight: parseFloat(item.totalWeight) || 0
      };
      
      console.log('🔍 Processed item:', result);
      return result;
    });

    console.log('✅ Team weights data fetched:', processedData.length, 'teams');
    return processedData;
  } catch (error) {
    console.error('❌ Error retrieving team weights data:', error);
    throw new Error(`Failed to fetch team weights data: ${error.message}`);
  }
};

/**
 * Save all team weights to S3
 * @param {Array} teams - Array of team objects with weights
 * @returns {Promise<Object>} - The save result
 */
export const saveAllTeamWeights = async (teams) => {
  try {
    console.log('🔄 Saving team weights for', teams.length, 'teams');
    
    const headers = await getAuthHeaders();
    
    // Get the current project ID from localStorage - using selectedProject key
    const selectedProject = JSON.parse(localStorage.getItem('selectedProject') || '{}');
    const projectId = selectedProject.projectId;
    
    if (!projectId) {
      throw new Error('No project ID available. Please select a project first.');
    }
    
    const url = `${API_BASE_URL}/projects/${projectId}/team-weights`;
    
    // Get user information from Cognito session
    const session = await fetchAuthSession();
    const userEmail = session.tokens?.idToken?.payload?.email || 'unknown';
    const userName = session.tokens?.idToken?.payload?.['cognito:username'] || userEmail;
    
    // Process teams to ensure weights are proper objects with numeric values
    const processedTeams = teams.map(team => {
      // Ensure weights is a proper object with numeric values
      const processedWeights = {};
      
      if (team.weights) {
        Object.entries(team.weights).forEach(([key, value]) => {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            processedWeights[key] = numValue;
          }
        });
      }
      
      // Calculate total weight
      const totalWeight = Object.values(processedWeights).reduce((sum, weight) => {
        return sum + (parseFloat(weight) || 0);
      }, 0);
      
      return {
        teamName: team.teamName,
        weights: processedWeights,
        totalWeight
      };
    });
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId,
        teams: processedTeams,
        updatedBy: userName || userEmail || 'unknown'
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('✅ Team weights saved successfully:', result);
    
    return result;
  } catch (error) {
    console.error('❌ Error saving team weights:', error);
    throw new Error(`Failed to save team weights: ${error.message}`);
  }
};

/**
 * Validate weights for a single team
 * @param {Object} weights - The weights object
 * @returns {Object} - Validation result
 */
export const validateWeights = (weights) => {
  const totalWeight = Object.values(weights || {}).reduce((sum, weight) => {
    // Skip empty strings and only add valid numbers
    if (weight === '') return sum;
    const numWeight = parseFloat(weight);
    return sum + (isNaN(numWeight) ? 0 : numWeight);
  }, 0);
  
  // Ensure we don't exceed 2 decimal places and handle potential floating point issues
  const roundedTotal = Math.round(totalWeight * 100) / 100;
  
  return {
    totalWeight: roundedTotal,
    remainingWeight: Math.max(0, Math.round((100 - roundedTotal) * 100) / 100),
    isValid: roundedTotal <= 100
  };
};

/**
 * Validate weights for all teams
 * @param {Array} teams - Array of team objects with weights
 * @returns {Object} - Validation result
 */
export const validateAllTeamWeights = (teams) => {
  const invalidTeams = teams.filter(team => {
    const validation = validateWeights(team.weights || {});
    return !validation.isValid;
  });
  
  return {
    isValid: invalidTeams.length === 0,
    invalidTeams
  };
};

/**
 * Get team analysis data (alias for getTeamWeights for backward compatibility)
 * @returns {Promise<Array>} - The team analysis data
 */
export const getTeamAnalysisData = async () => {
  try {
    console.log('🔄 Fetching team analysis data...');
    
    // Get team weights data
    const teamWeightsData = await getTeamWeights();
    
    console.log('🔍 Team weights data:', teamWeightsData);
    
    return teamWeightsData;
  } catch (error) {
    console.error('❌ Error retrieving team analysis data:', error);
    throw new Error(`Failed to fetch team analysis data: ${error.message}`);
  }
};

/**
 * Get all unique categories from team skills
 * @returns {Promise<Array>} - Array of unique categories
 */
export const getAllCategories = async () => {
  try {
    console.log('🔄 Fetching all skill categories...');
    
    // Get team weights data which already includes categories
    const teamData = await getTeamWeights();
    
    // Extract all unique categories from the team data
    const categoriesSet = new Set();
    teamData.forEach(team => {
      if (team.categories && Array.isArray(team.categories)) {
        team.categories.forEach(category => {
          if (category) categoriesSet.add(category);
        });
      }
    });
    
    const categories = Array.from(categoriesSet).sort();
    console.log('✅ Skill categories extracted from team data:', categories.length, 'categories');
    
    return categories;
  } catch (error) {
    console.error('❌ Error retrieving skill categories:', error);
    throw new Error(`Failed to fetch skill categories: ${error.message}`);
  }
};
