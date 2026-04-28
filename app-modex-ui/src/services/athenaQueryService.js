/**
 * Service for executing Athena queries using secure templates
 * 
 * SECURITY IMPLEMENTATION:
 * =======================
 * This service uses pre-defined query templates to prevent SQL injection attacks.
 * All queries are executed via template IDs with parameterized inputs.
 * 
 * SECURITY FEATURES:
 * - ✅ No raw SQL queries accepted from frontend
 * - ✅ All queries use pre-defined templates in backend Lambda
 * - ✅ User inputs are safely parameterized
 * - ✅ Template validation prevents unauthorized query execution
 * 
 * MIGRATION COMPLETED:
 * - All 13 query functions migrated to secure templates
 * - Legacy executeAthenaQuery() function removed
 * - SQL injection vulnerabilities eliminated
 * 
 * @version 2.0.0 - Secure Template Implementation
 * @date 2024-12-22
 */

import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = process.env.REACT_APP_API_URL;

// Helper function to get auth headers
const getAuthHeaders = async () => {
  try {
    const session = await fetchAuthSession();
    
    // Use ID token instead of access token for API Gateway Cognito authorizer
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
 * Execute an Athena query using a pre-defined template
 * @param {string} templateId - The ID of the query template to use
 * @param {Object} parameters - Parameters for the template
 * @param {string} dataType - The type of data being queried (e.g., 'team-skills')
 * @returns {Promise<Object>} - The query results
 */
export const executeAthenaTemplate = async (templateId, parameters = {}, dataType) => {
  try {
    const headers = await getAuthHeaders();
    
    // Get the current project ID from localStorage - using selectedProject key
    const selectedProject = JSON.parse(localStorage.getItem('selectedProject') || '{}');
    const projectId = selectedProject.projectId;
    
    if (!projectId) {
      throw new Error('No project ID available. Please select a project first.');
    }
    
    const url = `${API_BASE_URL}/projects/${projectId}/athena-query`;
    
    console.log('🔄 Executing Athena template:', templateId, 'with parameters:', parameters, 'for project:', projectId);
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        templateId,
        parameters,
        dataType,
        projectId
      })
    });

    console.log('🔧 Athena template response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: response.url
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Athena template error response:', errorData);
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Athena template result:', {
      success: result.success,
      dataCount: result.data?.length || 0,
      templateId: result.metadata?.templateId
    });
    
    return result;
  } catch (error) {
    console.error('❌ Error executing Athena template:', error);
    
    // Add more specific error information
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error - check if API is accessible and CORS is configured');
    }
    
    throw error;
  }
};

/**
 * Get team skills data from Athena using secure templates
 * @param {boolean} useDistinct - Whether to use DISTINCT to deduplicate data
 * @returns {Promise<Array>} - The team skills data
 */
export const getTeamSkills = async (useDistinct = false) => {
  try {
    console.log(`🔄 Fetching team skills data from Athena (${useDistinct ? 'DISTINCT' : 'RAW'})...`);
    
    const templateId = useDistinct ? 'team-skills-distinct' : 'team-skills-all';
    const result = await executeAthenaTemplate(templateId, {}, 'team-skills');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve team skills data');
    }

    console.log(`✅ Team skills data fetched (${useDistinct ? 'DISTINCT' : 'RAW'}):`, result.data?.length || 0);
    return result.data || [];
  } catch (error) {
    console.error('❌ Error retrieving team skills data:', error);
    throw new Error(`Failed to fetch team skills data: ${error.message}`);
  }
};

/**
 * Get technology radar data from Athena using secure templates
 * @param {boolean} useDistinct - Whether to use DISTINCT to deduplicate data
 * @returns {Promise<Object>} - The technology radar data
 */
export const getTechRadarData = async (useDistinct = false) => {
  try {
    console.log(`🔄 Fetching technology radar data from Athena (${useDistinct ? 'DISTINCT' : 'RAW'})...`);
    
    const templateId = useDistinct ? 'tech-vision-distinct' : 'tech-vision-all';
    const result = await executeAthenaTemplate(templateId, {}, 'tech-vision');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve technology radar data');
    }

    console.log(`✅ Technology radar data fetched (${useDistinct ? 'DISTINCT' : 'RAW'}):`, result.data?.length || 0);
    
    // Return the data in the expected format for the UI
    return {
      success: true,
      data: result.data || [],
      totalItems: result.data?.length || 0
    };
  } catch (error) {
    console.error('❌ Error retrieving technology radar data:', error);
    throw new Error(`Failed to fetch technology radar data: ${error.message}`);
  }
};

/**
 * Get application portfolio data from Athena using secure templates
 * @param {boolean} useDistinct - Whether to use DISTINCT to deduplicate data
 * @returns {Promise<Object>} - The application portfolio data
 */
export const getApplicationPortfolioData = async (useDistinct = false) => {
  try {
    console.log(`🔄 Fetching application portfolio data from Athena (${useDistinct ? 'DISTINCT' : 'RAW'})...`);
    
    const templateId = useDistinct ? 'application-portfolio-distinct' : 'application-portfolio-all';
    const result = await executeAthenaTemplate(templateId, {}, 'application-portfolio');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve application portfolio data');
    }

    console.log(`✅ Application portfolio data fetched (${useDistinct ? 'DISTINCT' : 'RAW'}):`, result.data?.length || 0);
    return {
      items: result.data || [],
      totalItems: result.data?.length || 0
    };
  } catch (error) {
    console.error('❌ Error retrieving application portfolio data:', error);
    throw new Error(`Failed to fetch application portfolio data: ${error.message}`);
  }
};

/**
 * Get tech stack data from Athena using secure templates
 * @param {boolean} useDistinct - Whether to use DISTINCT to deduplicate data
 * @returns {Promise<Object>} - The tech stack data
 */
export const getTechStackData = async (useDistinct = false) => {
  try {
    console.log(`🔄 Fetching tech stack data from Athena (${useDistinct ? 'DISTINCT' : 'RAW'})...`);
    
    const templateId = useDistinct ? 'tech-stack-distinct' : 'tech-stack-all';
    const result = await executeAthenaTemplate(templateId, {}, 'tech-stack');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve tech stack data');
    }

    // Process the data to handle array fields
    const processedData = result.data.map(item => {
      return {
        ...item,
        databases: item.databases && typeof item.databases === 'string' ? 
          item.databases.split(',').map(db => db.trim()) : [],
        integrations: item.integrations && typeof item.integrations === 'string' ? 
          item.integrations.split(',').map(int => int.trim()) : [],
        storages: item.storages && typeof item.storages === 'string' ? 
          item.storages.split(',').map(store => store.trim()) : []
      };
    });

    console.log(`✅ Tech stack data fetched (${useDistinct ? 'DISTINCT' : 'RAW'}):`, processedData.length);
    return {
      items: processedData || [],
      totalItems: processedData.length || 0
    };
  } catch (error) {
    console.error('❌ Error retrieving tech stack data:', error);
    throw new Error(`Failed to fetch tech stack data: ${error.message}`);
  }
};

/**
 * Get infrastructure data from Athena using secure templates
 * @param {boolean} useDistinct - Whether to use DISTINCT to deduplicate data
 * @returns {Promise<Object>} - The infrastructure data
 */
export const getInfrastructureData = async (useDistinct = false) => {
  try {
    console.log(`🔄 Fetching infrastructure data from Athena (${useDistinct ? 'DISTINCT' : 'RAW'})...`);
    
    const templateId = useDistinct ? 'infrastructure-distinct' : 'infrastructure-all';
    const result = await executeAthenaTemplate(templateId, {}, 'infrastructure-resources');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve infrastructure data');
    }

    console.log(`✅ Infrastructure data fetched (${useDistinct ? 'DISTINCT' : 'RAW'}):`, result.data?.length || 0);
    return {
      items: result.data || [],
      totalItems: result.data?.length || 0
    };
  } catch (error) {
    console.error('❌ Error retrieving infrastructure data:', error);
    throw new Error(`Failed to fetch infrastructure data: ${error.message}`);
  }
};

/**
 * Get resource utilization data from Athena using secure templates
 * @param {boolean} useDistinct - Whether to use DISTINCT to deduplicate data
 * @returns {Promise<Object>} - The resource utilization data
 */
export const getUtilizationData = async (useDistinct = false) => {
  try {
    console.log(`🔄 Fetching resource utilization data from Athena (${useDistinct ? 'DISTINCT' : 'RAW'})...`);
    
    const templateId = useDistinct ? 'resource-utilization-distinct' : 'resource-utilization-all';
    const result = await executeAthenaTemplate(templateId, {}, 'resource-utilization');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve resource utilization data');
    }

    // Process the data to map column names to the expected format for the UI
    const processedData = result.data.map(item => {
      const processedItem = {
        id: item.id,
        timestamp: item.timestamp,
        applicationName: item.applicationname || item.application_name || item.applicationName || '',
        serverName: item.servername || item.server_name || item.serverName || '',
        cpuUtilization: parseFloat(item.cpuutilization || item.cpu_utilization || item.cpuUtilization || 0),
        memoryUtilization: parseFloat(item.memoryutilization || item.memory_utilization || item.memoryUtilization || 0),
        storageUtilization: parseFloat(item.storageutilization || item.storage_utilization || item.storageUtilization || 0),
        networkTraffic: parseFloat(item.networktraffic || item.network_traffic || item.networkTraffic || 0),
        iops: parseInt(item.iops || 0, 10),
        notes: item.notes || ''
      };
      
      return processedItem;
    });

    console.log(`✅ Resource utilization data fetched (${useDistinct ? 'DISTINCT' : 'RAW'}):`, processedData.length);
    
    return {
      items: processedData || [],
      totalItems: processedData.length || 0
    };
  } catch (error) {
    console.error('❌ Error retrieving resource utilization data:', error);
    throw new Error(`Failed to fetch resource utilization data: ${error.message}`);
  }
};
/**
 * Get skill gap data for visualization using secure templates
 * @returns {Promise<Object>} - The skill gap data in matrix format
 */
export const getSkillGapData = async () => {
  try {
    console.log('🔄 Fetching skill gap data from Athena...');
    
    const result = await executeAthenaTemplate('skill-gaps-all', {}, 'skill-gaps');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve skill gap data');
    }

    const skillGapData = result.data || [];
    
    if (skillGapData.length === 0) {
      throw new Error('No skill gap data available');
    }
    
    // Extract unique teams and skills for matrix visualization
    const teams = [...new Set(skillGapData.map(item => item.team))];
    const skills = [...new Set(skillGapData.map(item => item.skill))];
    
    console.log('📊 Unique teams:', teams.length);
    console.log('📊 Unique skills:', skills.length);
    
    // Create a matrix of skill gaps for heatmap visualization
    const values = [];
    
    teams.forEach(team => {
      const teamRow = [];
      
      skills.forEach(skill => {
        const teamSkill = skillGapData.find(item => item.team === team && item.skill === skill);
        const skillGap = teamSkill ? parseFloat(teamSkill.skill_gap) : 0;
        teamRow.push(skillGap);
      });
      
      values.push(teamRow);
    });
    
    const matrixResult = {
      rows: teams,
      columns: skills,
      values: values
    };
    
    console.log('✅ Skill gap data processed:', {
      teams: teams.length,
      skills: skills.length,
      values: values.length,
      rawDataCount: skillGapData.length
    });
    
    return matrixResult;
  } catch (error) {
    console.error('❌ Error retrieving skill gap data:', error);
    throw new Error(`Failed to fetch skill gap data: ${error.message}`);
  }
};

/**
 * Get detailed skill information for a specific team using secure templates
 * @param {string} team - The team name
 * @returns {Promise<Object>} - The team's skill details with gap analysis
 */
export const getTeamSkillDetailsData = async (team) => {
  try {
    console.log('🔄 Fetching team skill details for', team);
    
    const result = await executeAthenaTemplate('team-skill-details', { team }, 'team-skill-details');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve team skill details');
    }

    const skillDetails = result.data || [];
    
    if (skillDetails.length === 0) {
      throw new Error(`No skill data found for team: ${team}`);
    }
    
    // Transform the data to match the expected UI format
    const details = skillDetails.map(item => {
      // Parse expected proficiency - handle null/empty strings
      const expectedValue = item.expected_proficiency;
      const expected = (expectedValue === null || expectedValue === '' || expectedValue === 'null') ? null : parseFloat(expectedValue);
      
      // Parse skill gap - handle null/empty strings and NaN
      const gapValue = item.skill_gap;
      let gap = null;
      if (gapValue !== null && gapValue !== '' && gapValue !== 'null') {
        const parsedGap = parseFloat(gapValue);
        gap = isNaN(parsedGap) ? null : parsedGap;
      }
      
      // Parse needs upskilling - handle null properly
      let needsUpskilling = null;
      if (item.needs_upskilling === 'true' || item.needs_upskilling === true) {
        needsUpskilling = true;
      } else if (item.needs_upskilling === 'false' || item.needs_upskilling === false) {
        needsUpskilling = false;
      }
      
      return {
        skill: item.skill,
        category: item.category,
        actual: parseFloat(item.actual_proficiency),
        expected: expected,
        gap: gap,
        status: item.gap_severity || null,
        needsUpskilling: needsUpskilling,
        categoryWeight: parseFloat(item.category_weight) || 0
      };
    });
    
    console.log('✅ Team skill details fetched for', team, ':', details.length, 'skills');
    
    return {
      team,
      details
    };
  } catch (error) {
    console.error(`❌ Error retrieving team skill details for ${team}:`, error);
    throw new Error(`Failed to fetch team skill details: ${error.message}`);
  }
};

/**
 * Get detailed information about all teams' skills with expected proficiency calculation
 * 
 * ALL TEAMS SKILL DETAILS ANALYSIS:
 * =================================
 * 
 * This function provides comprehensive skill gap analysis across all teams, enabling:
 * • Organization-wide skill gap identification
 * • Cross-team skill comparison
 * • Resource allocation planning
 * • Training program prioritization
 * 
 * CALCULATION METHODOLOGY:
 * -----------------------
 * Uses the same expected proficiency calculation as individual team analysis:
 * Expected_Proficiency = 2.0 + (category_weight / 100.0 × 3.0)
 * 
 * DATA AGGREGATION:
 * ----------------
 * • Combines all teams' skill data with their respective capacity allocations
 * • Calculates expected proficiency based on each team's category weights
 * • Provides gap analysis and severity classification for every team-skill combination
 * 
 * USE CASES:
 * ---------
 * • Skills dashboard showing organization-wide gaps
 * • Training budget allocation based on gap severity
 * • Identifying teams with similar skill profiles
 * • Cross-team mentoring opportunity identification
 * 
 * @returns {Promise<Array>} - All teams' skill details with gap analysis
 */
export const getAllTeamsSkillDetailsData = async () => {
  try {
    console.log('🔄 Fetching all teams skill details');
    
    const result = await executeAthenaTemplate('all-teams-skill-details', {}, 'all-teams-skill-details');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve all teams skill details');
    }

    const allSkillDetails = result.data || [];
    
    if (allSkillDetails.length === 0) {
      throw new Error('No team skills data available');
    }
    
    // Transform the data to match the expected UI format
    const allDetails = allSkillDetails.map(item => {
      // Parse expected proficiency - handle null/empty strings
      const expectedValue = item.expected_proficiency;
      const expected = (expectedValue === null || expectedValue === '' || expectedValue === 'null') ? null : parseFloat(expectedValue);
      
      // Parse skill gap - handle null/empty strings and NaN
      const gapValue = item.skill_gap;
      let gap = null;
      if (gapValue !== null && gapValue !== '' && gapValue !== 'null') {
        const parsedGap = parseFloat(gapValue);
        gap = isNaN(parsedGap) ? null : parsedGap;
      }
      
      // Parse needs upskilling - handle null properly
      let needsUpskilling = null;
      if (item.needs_upskilling === 'true' || item.needs_upskilling === true) {
        needsUpskilling = true;
      } else if (item.needs_upskilling === 'false' || item.needs_upskilling === false) {
        needsUpskilling = false;
      }
      
      return {
        team: item.team,
        skill: item.skill,
        category: item.category,
        actual: parseFloat(item.actual_proficiency),
        expected: expected,
        gap: gap,
        status: item.gap_severity || null,
        needsUpskilling: needsUpskilling,
        categoryWeight: parseFloat(item.category_weight) || 0
      };
    });
    
    // Calculate organization-wide statistics (excluding N/A values)
    const validGaps = allDetails.filter(d => d.gap !== null);
    const stats = {
      totalSkills: allDetails.length,
      totalTeams: [...new Set(allDetails.map(d => d.team))].length,
      totalCategories: [...new Set(allDetails.map(d => d.category))].length,
      gapSeverityDistribution: {
        critical: allDetails.filter(d => d.status === 'Critical').length,
        high: allDetails.filter(d => d.status === 'High').length,
        medium: allDetails.filter(d => d.status === 'Medium').length,
        low: allDetails.filter(d => d.status === 'Low').length,
        aligned: allDetails.filter(d => d.status === 'Aligned').length,
        exceeds: allDetails.filter(d => d.status === 'Exceeds').length,
        notAvailable: allDetails.filter(d => d.status === null).length
      },
      skillsNeedingUpskilling: allDetails.filter(d => d.needsUpskilling === true).length,
      averageGap: validGaps.length > 0 ? validGaps.reduce((sum, d) => sum + d.gap, 0) / validGaps.length : 0
    };
    
    console.log('✅ All teams skill details fetched:', allDetails.length, 'records');
    console.log('📊 Organization-wide skill gap statistics:', stats);
    
    return allDetails;
  } catch (error) {
    console.error('❌ Error retrieving all teams skill details:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw new Error(`Failed to fetch all teams skill details: ${error.message}`);
  }
};

/**
 * Get vision skill gap data for visualization with expected proficiency calculation
 * 
 * VISION SKILL GAP CALCULATION METHODOLOGY:
 * ========================================
 * 
 * Vision skill gaps compare team proficiency against technology vision requirements.
 * This analysis helps identify gaps between current team capabilities and the 
 * organization's technology direction as defined in the tech radar.
 * 
 * APPROACH:
 * --------
 * 1. Map team skills to technology vision items by matching skill names to technologies
 * 2. Calculate expected proficiency based on technology phase in the radar:
 *    - "Adopt": Expected proficiency = 4.0-5.0 (should be actively using)
 *    - "Trial": Expected proficiency = 3.0-4.0 (should be experimenting)
 *    - "Assess": Expected proficiency = 2.0-3.0 (should be learning about)
 *    - "Hold": Expected proficiency = 1.0-2.0 (minimal knowledge needed)
 * 3. Compare actual team proficiency with vision-based expectations
 * 
 * EXPECTED PROFICIENCY BY PHASE:
 * ------------------------------
 * - Adopt: 4.5 (teams should be proficient in adopted technologies)
 * - Trial: 3.5 (teams should be experimenting with trial technologies)
 * - Assess: 2.5 (teams should be aware of assess technologies)
 * - Hold: 1.5 (minimal knowledge of hold technologies)
 * 
 * @returns {Promise<Object>} - The vision skill gap data in matrix format
 */
export const getVisionSkillGapData = async () => {
  try {
    console.log('🔄 Fetching vision skill gap data from Athena...');
    
    const result = await executeAthenaTemplate('vision-skill-gaps-all', {}, 'vision-skill-gaps');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve vision skill gap data');
    }

    const visionSkillGapData = result.data || [];
    
    if (visionSkillGapData.length === 0) {
      console.warn('⚠️ No vision skill gap data available - this may indicate:');
      console.warn('   1. No matching skills between team_skills and tech_vision tables');
      console.warn('   2. Tech vision data is not populated');
      console.warn('   3. Skill names do not match technology names');
      
      // Return empty matrix structure
      return {
        rows: [],
        columns: [],
        values: []
      };
    }
    
    // Extract unique teams and technologies for matrix visualization
    const teams = [...new Set(visionSkillGapData.map(item => item.team))];
    const technologies = [...new Set(visionSkillGapData.map(item => item.skill))];
    
    console.log('📊 Vision analysis - Unique teams:', teams.length);
    console.log('📊 Vision analysis - Unique technologies:', technologies.length);
    
    // Create a matrix of vision skill gaps
    const values = [];
    
    teams.forEach(team => {
      const teamRow = [];
      
      technologies.forEach(technology => {
        // Find the team's vision skill gap for this technology
        const teamTech = visionSkillGapData.find(item => item.team === team && item.skill === technology);
        
        // Use the calculated vision skill gap, or 0 if not found
        const visionGap = teamTech ? parseFloat(teamTech.skill_gap) : 0;
        
        teamRow.push(visionGap);
      });
      
      values.push(teamRow);
    });
    
    const matrixResult = {
      rows: teams,
      columns: technologies,
      values: values
    };
    
    console.log('✅ Vision skill gap data processed:', {
      teams: teams.length,
      technologies: technologies.length,
      values: values.length,
      rawDataCount: visionSkillGapData.length
    });
    
    return matrixResult;
  } catch (error) {
    console.error('❌ Error retrieving vision skill gap data:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw new Error(`Failed to fetch vision skill gap data: ${error.message}`);
  }
};

/**
 * Get detailed vision skill information for a specific team with expected proficiency calculation
 * 
 * TEAM VISION SKILL DETAILS CALCULATION:
 * ======================================
 * 
 * This function provides detailed vision skill gap analysis for a specific team, comparing
 * their current skill levels against the organization's technology vision requirements.
 * 
 * VISION-BASED EXPECTED PROFICIENCY:
 * ----------------------------------
 * Expected proficiency is determined by the technology's phase in the tech radar:
 * • Adopt (4.5): Technologies the organization has decided to use
 * • Trial (3.5): Technologies being piloted and evaluated
 * • Assess (2.5): Technologies being monitored and researched
 * • Hold (1.5): Technologies being phased out or avoided
 * 
 * BUSINESS LOGIC:
 * --------------
 * Teams should have higher proficiency in "Adopt" technologies and lower proficiency
 * in "Hold" technologies, with "Trial" and "Assess" falling in between based on
 * the organization's technology strategy.
 * 
 * @param {string} team - The team name
 * @returns {Promise<Object>} - The team's vision skill details with gap analysis
 */
export const getTeamVisionSkillDetailsData = async (team) => {
  try {
    console.log('🔄 Fetching team vision skill details for', team);
    
    const result = await executeAthenaTemplate('team-vision-skill-details', { team }, 'team-vision-skill-details');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve team vision skill details');
    }

    const visionSkillDetails = result.data || [];
    
    if (visionSkillDetails.length === 0) {
      console.warn(`⚠️ No vision skill data found for team: ${team}`);
      console.warn('   This may indicate:');
      console.warn('   1. Team has no skills that match technology vision items');
      console.warn('   2. Tech vision data is not populated');
      console.warn('   3. Skill names do not match technology names');
      
      return {
        team,
        details: []
      };
    }
    
    // Transform the data to match the expected UI format
    const details = visionSkillDetails.map(item => ({
      skill: item.skill,
      category: item.category,
      actual: parseFloat(item.actual_proficiency),
      expected: parseFloat(item.expected_proficiency),
      gap: parseFloat(item.skill_gap),
      status: item.gap_severity,
      needsUpskilling: item.needs_upskilling === 'true' || item.needs_upskilling === true,
      quadrant: item.quadrant,
      phase: item.phase
    }));
    
    console.log('✅ Team vision skill details fetched for', team, ':', details.length, 'skills');
    console.log('📊 Vision gap severity distribution:', {
      critical: details.filter(d => d.status === 'Critical').length,
      high: details.filter(d => d.status === 'High').length,
      medium: details.filter(d => d.status === 'Medium').length,
      low: details.filter(d => d.status === 'Low').length,
      aligned: details.filter(d => d.status === 'Aligned').length,
      exceeds: details.filter(d => d.status === 'Exceeds').length
    });
    
    return {
      team,
      details
    };
  } catch (error) {
    console.error(`❌ Error retrieving team vision skill details for ${team}:`, error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw new Error(`Failed to fetch team vision skill details: ${error.message}`);
  }
};

/**
 * Get detailed information about all teams' vision skills with expected proficiency calculation
 * 
 * ALL TEAMS VISION SKILL DETAILS ANALYSIS:
 * ========================================
 * 
 * This function provides comprehensive vision skill gap analysis across all teams,
 * comparing current capabilities against the organization's technology vision.
 * 
 * STRATEGIC IMPORTANCE:
 * --------------------
 * Vision skill gaps indicate misalignment between team capabilities and strategic
 * technology direction. This analysis helps prioritize:
 * • Training programs for adopted technologies
 * • Pilot programs for trial technologies
 * • Research initiatives for assess technologies
 * • Phase-out planning for hold technologies
 * 
 * ORGANIZATION-WIDE INSIGHTS:
 * --------------------------
 * • Identify teams ready to adopt new technologies
 * • Find teams that need support for strategic technologies
 * • Discover expertise that can be shared across teams
 * • Plan technology transition timelines based on current capabilities
 * 
 * @returns {Promise<Array>} - All teams' vision skill details with gap analysis
 */
export const getAllTeamsVisionSkillDetailsData = async () => {
  try {
    console.log('🔄 Fetching all teams vision skill details');
    
    const result = await executeAthenaTemplate('all-teams-vision-skill-details', {}, 'all-teams-vision-skill-details');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve all teams vision skill details');
    }

    const allVisionSkillDetails = result.data || [];
    
    if (allVisionSkillDetails.length === 0) {
      console.warn('⚠️ No vision skill data available for any team');
      console.warn('   This may indicate:');
      console.warn('   1. No skills match technology vision items');
      console.warn('   2. Tech vision data is not populated');
      console.warn('   3. Skill names do not match technology names');
      
      return [];
    }
    
    // Transform the data to match the expected UI format
    const allDetails = allVisionSkillDetails.map(item => ({
      team: item.team,
      skill: item.skill,
      category: item.category,
      actual: parseFloat(item.actual_proficiency),
      expected: parseFloat(item.expected_proficiency),
      gap: parseFloat(item.skill_gap),
      status: item.gap_severity,
      needsUpskilling: item.needs_upskilling === 'true' || item.needs_upskilling === true,
      quadrant: item.quadrant,
      phase: item.phase
    }));
    
    // Calculate organization-wide vision statistics
    const visionStats = {
      totalVisionSkills: allDetails.length,
      totalTeams: [...new Set(allDetails.map(d => d.team))].length,
      totalTechnologies: [...new Set(allDetails.map(d => d.skill))].length,
      phaseDistribution: {
        adopt: allDetails.filter(d => d.phase === 'Adopt').length,
        trial: allDetails.filter(d => d.phase === 'Trial').length,
        assess: allDetails.filter(d => d.phase === 'Assess').length,
        hold: allDetails.filter(d => d.phase === 'Hold').length
      },
      gapSeverityDistribution: {
        critical: allDetails.filter(d => d.status === 'Critical').length,
        high: allDetails.filter(d => d.status === 'High').length,
        medium: allDetails.filter(d => d.status === 'Medium').length,
        low: allDetails.filter(d => d.status === 'Low').length,
        aligned: allDetails.filter(d => d.status === 'Aligned').length,
        exceeds: allDetails.filter(d => d.status === 'Exceeds').length
      },
      visionSkillsNeedingUpskilling: allDetails.filter(d => d.needsUpskilling).length,
      averageVisionGap: allDetails.reduce((sum, d) => sum + d.gap, 0) / allDetails.length
    };
    
    console.log('✅ All teams vision skill details fetched:', allDetails.length, 'records');
    console.log('📊 Organization-wide vision skill gap statistics:', visionStats);
    
    return allDetails;
  } catch (error) {
    console.error('❌ Error retrieving all teams vision skill details:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw new Error(`Failed to fetch all teams vision skill details: ${error.message}`);
  }
};
/**
 * Get CPU utilization data from Athena
 * @returns {Promise<Object>} - The CPU utilization data formatted for charts
 */
export const getCpuUtilizationData = async () => {
  try {
    console.log('🔄 Fetching CPU utilization data from Athena...');
    
    const utilizationData = await getUtilizationData();
    
    if (!utilizationData || !utilizationData.items || utilizationData.items.length === 0) {
      throw new Error('No utilization data available');
    }
    
    // Group data by application name
    const groupedByApp = {};
    utilizationData.items.forEach(item => {
      if (!item.applicationName) return;
      
      if (!groupedByApp[item.applicationName]) {
        groupedByApp[item.applicationName] = [];
      }
      
      groupedByApp[item.applicationName].push({
        date: item.timestamp,
        value: item.cpuUtilization
      });
    });
    
    // Convert to series format expected by the chart component
    const series = Object.keys(groupedByApp).map(appName => {
      // Sort values by date (ascending)
      const values = groupedByApp[appName].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
      );
      
      return {
        name: appName,
        values
      };
    });
    
    console.log('✅ CPU utilization data processed:', series.length, 'applications');
    
    return { series };
  } catch (error) {
    console.error('❌ Error retrieving CPU utilization data:', error);
    throw new Error(`Failed to fetch CPU utilization data: ${error.message}`);
  }
};

/**
 * Get memory utilization data from Athena
 * @returns {Promise<Object>} - The memory utilization data formatted for charts
 */
export const getMemoryUtilizationData = async () => {
  try {
    console.log('🔄 Fetching memory utilization data from Athena...');
    
    const utilizationData = await getUtilizationData();
    
    if (!utilizationData || !utilizationData.items || utilizationData.items.length === 0) {
      throw new Error('No utilization data available');
    }
    
    // Group data by application name
    const groupedByApp = {};
    utilizationData.items.forEach(item => {
      if (!item.applicationName) return;
      
      if (!groupedByApp[item.applicationName]) {
        groupedByApp[item.applicationName] = [];
      }
      
      groupedByApp[item.applicationName].push({
        date: item.timestamp,
        value: item.memoryUtilization
      });
    });
    
    // Convert to series format expected by the chart component
    const series = Object.keys(groupedByApp).map(appName => {
      // Sort values by date (ascending)
      const values = groupedByApp[appName].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
      );
      
      return {
        name: appName,
        values
      };
    });
    
    console.log('✅ Memory utilization data processed:', series.length, 'applications');
    
    return { series };
  } catch (error) {
    console.error('❌ Error retrieving memory utilization data:', error);
    throw new Error(`Failed to fetch memory utilization data: ${error.message}`);
  }
};

/**
 * Get storage utilization data from Athena
 * @returns {Promise<Object>} - The storage utilization data formatted for charts
 */
export const getStorageUtilizationData = async () => {
  try {
    console.log('🔄 Fetching storage utilization data from Athena...');
    
    const utilizationData = await getUtilizationData();
    
    if (!utilizationData || !utilizationData.items || utilizationData.items.length === 0) {
      throw new Error('No utilization data available');
    }
    
    // Group data by application name
    const groupedByApp = {};
    utilizationData.items.forEach(item => {
      if (!item.applicationName) return;
      
      if (!groupedByApp[item.applicationName]) {
        groupedByApp[item.applicationName] = [];
      }
      
      groupedByApp[item.applicationName].push({
        date: item.timestamp,
        value: item.storageUtilization
      });
    });
    
    // Convert to series format expected by the chart component
    const series = Object.keys(groupedByApp).map(appName => {
      // Sort values by date (ascending)
      const values = groupedByApp[appName].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
      );
      
      return {
        name: appName,
        values
      };
    });
    
    console.log('✅ Storage utilization data processed:', series.length, 'applications');
    
    return { series };
  } catch (error) {
    console.error('❌ Error retrieving storage utilization data:', error);
    throw new Error(`Failed to fetch storage utilization data: ${error.message}`);
  }
};

/**
 * Get network traffic data from Athena
 * @returns {Promise<Object>} - The network traffic data formatted for charts
 */
export const getNetworkTrafficData = async () => {
  try {
    console.log('🔄 Fetching network traffic data from Athena...');
    
    const utilizationData = await getUtilizationData();
    
    if (!utilizationData || !utilizationData.items || utilizationData.items.length === 0) {
      throw new Error('No utilization data available');
    }
    
    // Group data by application name
    const groupedByApp = {};
    utilizationData.items.forEach(item => {
      if (!item.applicationName) return;
      
      if (!groupedByApp[item.applicationName]) {
        groupedByApp[item.applicationName] = [];
      }
      
      groupedByApp[item.applicationName].push({
        date: item.timestamp,
        value: item.networkTraffic
      });
    });
    
    // Convert to series format expected by the chart component
    const series = Object.keys(groupedByApp).map(appName => {
      // Sort values by date (ascending)
      const values = groupedByApp[appName].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
      );
      
      return {
        name: appName,
        values
      };
    });
    
    console.log('✅ Network traffic data processed:', series.length, 'applications');
    
    return { series };
  } catch (error) {
    console.error('❌ Error retrieving network traffic data:', error);
    throw new Error(`Failed to fetch network traffic data: ${error.message}`);
  }
};

/**
 * Get IOPS data from Athena
 * @returns {Promise<Object>} - The IOPS data formatted for charts
 */
export const getIOPSData = async () => {
  try {
    console.log('🔄 Fetching IOPS data from Athena...');
    
    const utilizationData = await getUtilizationData();
    
    if (!utilizationData || !utilizationData.items || utilizationData.items.length === 0) {
      throw new Error('No utilization data available');
    }
    
    // Group data by application name
    const groupedByApp = {};
    utilizationData.items.forEach(item => {
      if (!item.applicationName) return;
      
      if (!groupedByApp[item.applicationName]) {
        groupedByApp[item.applicationName] = [];
      }
      
      groupedByApp[item.applicationName].push({
        date: item.timestamp,
        value: item.iops
      });
    });
    
    // Convert to series format expected by the chart component
    const series = Object.keys(groupedByApp).map(appName => {
      // Sort values by date (ascending)
      const values = groupedByApp[appName].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
      );
      
      return {
        name: appName,
        values
      };
    });
    
    console.log('✅ IOPS data processed:', series.length, 'applications');
    
    return { series };
  } catch (error) {
    console.error('❌ Error retrieving IOPS data:', error);
    throw new Error(`Failed to fetch IOPS data: ${error.message}`);
  }
};

/**
 * Get Vision Gaps - Technologies from vision that have no corresponding team skills
 * 
 * This function identifies strategic technology gaps by finding technologies in the
 * technology vision that have no corresponding skill proficiency in any team.
 * These represent areas where the organization lacks capabilities for strategic technologies.
 * 
 * BUSINESS LOGIC:
 * --------------
 * • Technologies in "Adopt" phase with no skills represent critical capability gaps
 * • Technologies in "Trial" phase with no skills indicate missed experimentation opportunities
 * • Technologies in "Assess" phase with no skills suggest evaluation blind spots
 * • Technologies in "Hold" phase with no skills may be acceptable (intentional avoidance)
 * 
 * @returns {Promise<Array>} - Vision gaps with expected proficiency levels
 */
export const getVisionGapsData = async () => {
  try {
    console.log('🔄 Fetching vision gaps data from Athena...');
    
    const result = await executeAthenaTemplate('vision-gaps', {}, 'vision-gaps');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve vision gaps data');
    }

    const visionGapsData = result.data || [];
    
    console.log('✅ Vision gaps data processed:', {
      totalGaps: visionGapsData.length,
      criticalGaps: visionGapsData.filter(item => item.gap_severity === 'Critical').length,
      highGaps: visionGapsData.filter(item => item.gap_severity === 'High').length,
      mediumGaps: visionGapsData.filter(item => item.gap_severity === 'Medium').length,
      lowGaps: visionGapsData.filter(item => item.gap_severity === 'Low').length
    });
    
    return visionGapsData;
    
  } catch (error) {
    console.error('❌ Error retrieving vision gaps data:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw new Error(`Failed to fetch vision gaps data: ${error.message}`);
  }
};
