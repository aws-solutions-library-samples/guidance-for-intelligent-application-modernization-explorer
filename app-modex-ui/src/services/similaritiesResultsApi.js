/**
 * Similarities Results API Service
 * 
 * This service handles fetching and processing similarities analysis results
 * from the backend DynamoDB table and S3 storage.
 */

import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = process.env.REACT_APP_API_URL;

/**
 * Get authentication headers for API requests
 * @returns {Promise<Object>} - Headers object with Authorization
 */
const getAuthHeaders = async () => {
  try {
    console.log('🔐 Attempting to get authentication session...');
    const session = await fetchAuthSession();
    console.log('🔐 Auth session:', { 
      hasTokens: !!session.tokens,
      hasIdToken: !!session.tokens?.idToken,
      tokenType: typeof session.tokens?.idToken
    });
    
    if (!session.tokens || !session.tokens.idToken) {
      throw new Error('No authentication token available. Please log in again.');
    }
    
    console.log('🔐 Successfully obtained authentication token');
    return {
      'Authorization': `Bearer ${session.tokens.idToken.toString()}`
    };
  } catch (error) {
    console.error('🔐 Error getting auth headers:', error);
    throw error;
  }
};

/**
 * Fetch similarities analysis results for a project
 */
export const fetchSimilaritiesResults = async (projectId) => {
  if (!projectId) {
    throw new Error('Project ID is required to fetch similarities results');
  }

  if (!API_BASE_URL) {
    throw new Error('API URL is not configured. Please check your environment variables.');
  }

  try {
    console.log(`Fetching similarities results for project: ${projectId}`);
    console.log(`Using API URL: ${API_BASE_URL}/projects/${projectId}/application-similarities`);
    
    // Get authentication headers
    const authHeaders = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/application-similarities`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      }
    });

    console.log('📡 API Response status:', response.status);
    console.log('📡 API Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = await response.json();
        console.log('📡 API Error data:', errorData);
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (parseError) {
        // If we can't parse the error response, use the status text
        console.warn('Could not parse error response:', parseError);
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('📡 Full API Response Data:', JSON.stringify(data, null, 2));
    
    // The application-similarities endpoint returns results directly
    if (data.success && data.results) {
      const { similarityMatrix } = data.results;
      
      if (!similarityMatrix || similarityMatrix.length === 0) {
        const noDataError = new Error('No similarity pairs found in the analysis results. The analysis may not have completed successfully.');
        noDataError.type = 'NO_DATA';
        throw noDataError;
      }
      
      console.log('📋 First 2 items from API similarityMatrix:', JSON.stringify(similarityMatrix.slice(0, 2), null, 2));
      
      // Transform the similarity matrix into the format expected by the visualization
      const similarityPairs = similarityMatrix.map(item => ({
        application_id: item.application_id,
        similar_app_id: item.similar_application_id,
        similarity_score: item.similarity_score,
        app1: item.application_id,
        app2: item.similar_application_id
      }));
      
      console.log('📋 First 2 transformed similarityPairs:', JSON.stringify(similarityPairs.slice(0, 2), null, 2));
      console.log(`Extracted ${similarityPairs.length} similarity pairs`);
      
      return similarityPairs;
    }
    
    // This is expected behavior when no analysis has been run
    const noDataError = new Error('No similarity analysis results found for this project. Please run the similarities analysis first.');
    noDataError.type = 'NO_DATA';
    throw noDataError;
    
  } catch (error) {
    console.error('Error fetching similarities results:', error);
    // Re-throw the error instead of falling back to mock data
    throw error;
  }
};

/**
 * Process raw similarities data into visualization format
 */
export const processSimilaritiesForVisualization = (rawData) => {
  if (!rawData || !rawData.length) {
    return {
      networkData: [],
      distributionData: [],
      summaryStats: {
        totalPairs: 0,
        averageSimilarity: 0,
        maxSimilarity: 0,
        minSimilarity: 0
      }
    };
  }

  // Process for network diagram
  const nodes = new Map();
  const links = [];
  
  // Create nodes and links
  rawData.forEach(item => {
    // Support both field name formats: (app1, app2) and (application_id, similar_app_id)
    const app1 = item.app1 || item.application_id;
    const app2 = item.app2 || item.similar_app_id;
    const similarity_score = item.similarity_score;
    
    // Add nodes
    if (!nodes.has(app1)) {
      nodes.set(app1, {
        id: app1,
        name: app1,
        group: getApplicationGroup(app1),
        connections: 0
      });
    }
    
    if (!nodes.has(app2)) {
      nodes.set(app2, {
        id: app2,
        name: app2,
        group: getApplicationGroup(app2),
        connections: 0
      });
    }
    
    // Increment connection counts
    nodes.get(app1).connections++;
    nodes.get(app2).connections++;
    
    // Add link
    links.push({
      source: app1,
      target: app2,
      similarity: similarity_score,
      strength: similarity_score
    });
  });

  // Process for distribution chart
  const distributionBuckets = {
    '0.0-0.1': 0,
    '0.1-0.2': 0,
    '0.2-0.3': 0,
    '0.3-0.4': 0,
    '0.4-0.5': 0,
    '0.5-0.6': 0,
    '0.6-0.7': 0,
    '0.7-0.8': 0,
    '0.8-0.9': 0,
    '0.9-1.0': 0
  };

  rawData.forEach(item => {
    const score = item.similarity_score;
    const bucket = Math.floor(score * 10) / 10;
    const bucketKey = `${bucket.toFixed(1)}-${(bucket + 0.1).toFixed(1)}`;
    if (distributionBuckets[bucketKey] !== undefined) {
      distributionBuckets[bucketKey]++;
    }
  });

  const distributionData = Object.entries(distributionBuckets).map(([range, count]) => ({
    range,
    count,
    percentage: (count / rawData.length * 100).toFixed(1)
  }));

  // Calculate summary statistics
  const similarities = rawData.map(item => item.similarity_score);
  const summaryStats = {
    totalPairs: rawData.length,
    averageSimilarity: (similarities.reduce((a, b) => a + b, 0) / similarities.length).toFixed(4),
    maxSimilarity: Math.max(...similarities).toFixed(4),
    minSimilarity: Math.min(...similarities).toFixed(4),
    uniqueApplications: nodes.size
  };

  return {
    networkData: {
      nodes: Array.from(nodes.values()),
      links: links
    },
    distributionData,
    summaryStats
  };
};

/**
 * Get application group based on name patterns
 */
const getApplicationGroup = (appName) => {
  // Handle undefined, null, or non-string values
  if (!appName || typeof appName !== 'string') {
    return 'other';
  }
  
  const name = appName.toLowerCase();
  
  if (name.includes('frontend') || name.includes('portal') || name.includes('dashboard')) {
    return 'frontend';
  } else if (name.includes('backend') || name.includes('api') || name.includes('service')) {
    return 'backend';
  } else if (name.includes('database') || name.includes('storage') || name.includes('warehouse')) {
    return 'data';
  } else if (name.includes('gateway') || name.includes('integration') || name.includes('hub')) {
    return 'integration';
  } else {
    return 'other';
  }
};

/**
 * Get top similar application pairs
 */
export const getTopSimilarPairs = (rawData, limit = 10) => {
  if (!rawData || !rawData.length) return [];
  
  return rawData
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, limit)
    .map(item => ({
      app1: item.app1 || item.application_id,
      app2: item.app2 || item.similar_app_id,
      similarity: (item.similarity_score * 100).toFixed(1),
      commonTechnologies: item.common_technologies || [],
      differingTechnologies: item.differing_technologies || []
    }));
};
