// Force deployment timestamp: 2025-11-07T09:52:01.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:35.3NZ';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Gather Context Data Lambda
 * 
 * Aggregates all available context data for AI-enhanced pilot identification:
 * - Application similarity scores
 * - Component similarity scores
 * - Team skills data
 * - Skill expectations and gaps
 * - Technology vision
 * - Team weights/capacity allocation
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Gather Context Data - Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  const { projectId } = event;
  
  if (!projectId) {
    throw new Error('projectId is required');
  }
  
  try {
    // Gather all context data in parallel (once for the entire project)
    const [
      applicationSimilarities,
      componentSimilarities,
      teamSkills,
      skillExpectations,
      technologyVision,
      teamWeights
    ] = await Promise.all([
      getApplicationSimilarities(projectId),
      getComponentSimilarities(projectId),
      getTeamSkills(projectId),
      getSkillExpectations(projectId),
      getTechnologyVision(projectId),
      getTeamWeights(projectId)
    ]);
    
    // Calculate skill gaps from skills and expectations
    const skillGaps = calculateSkillGaps(teamSkills, skillExpectations);
    
    // Return context data that will be shared across all partitions
    const contextData = {
      applicationSimilarities,
      componentSimilarities,
      teamSkills,
      skillExpectations,
      skillGaps,
      technologyVision,
      teamWeights
    };
    
    console.log('Context data gathered successfully');
    console.log(`- Application similarities: ${applicationSimilarities.length}`);
    console.log(`- Component patterns: ${componentSimilarities.length}`);
    console.log(`- Team skills: ${teamSkills.length}`);
    console.log(`- Skill expectations: ${skillExpectations.length}`);
    console.log(`- Skill gaps: ${skillGaps.length}`);
    console.log(`- Technology vision: ${technologyVision.length}`);
    console.log(`- Team weights: ${teamWeights.length}`);
    
    return contextData;
    
  } catch (error) {
    console.error('Error gathering context data:', error);
    throw error;
  }
};

/**
 * Get application similarity scores from DynamoDB
 */
async function getApplicationSimilarities(projectId) {
  try {
    const tableName = `app-modex-similarity-results-${projectId}`;
    
    const params = {
      TableName: tableName
    };
    
    const result = await docClient.send(new ScanCommand(params));
    return result.Items || [];
  } catch (error) {
    console.warn('Could not fetch application similarities:', error.message);
    return [];
  }
}

/**
 * Get component similarity scores from DynamoDB
 */
async function getComponentSimilarities(projectId) {
  try {
    const tableName = `app-modex-component-similarity-results-${projectId}`;
    
    const params = {
      TableName: tableName
    };
    
    const result = await docClient.send(new ScanCommand(params));
    return result.Items || [];
  } catch (error) {
    console.warn('Could not fetch component similarities:', error.message);
    return [];
  }
}

/**
 * Get team skills data from DynamoDB
 */
async function getTeamSkills(projectId) {
  try {
    const tableName = `app-modex-skills-${projectId}`;
    
    const params = {
      TableName: tableName
    };
    
    const result = await docClient.send(new ScanCommand(params));
    return result.Items || [];
  } catch (error) {
    console.warn('Could not fetch team skills:', error.message);
    return [];
  }
}

/**
 * Get skill expectations from DynamoDB
 */
async function getSkillExpectations(projectId) {
  try {
    const tableName = `app-modex-skill-expectations-${projectId}`;
    
    const params = {
      TableName: tableName
    };
    
    const result = await docClient.send(new ScanCommand(params));
    return result.Items || [];
  } catch (error) {
    console.warn('Could not fetch skill expectations:', error.message);
    return [];
  }
}

/**
 * Get technology vision from DynamoDB
 */
async function getTechnologyVision(projectId) {
  try {
    const tableName = `app-modex-tech-radar-${projectId}`;
    
    const params = {
      TableName: tableName
    };
    
    const result = await docClient.send(new ScanCommand(params));
    return result.Items || [];
  } catch (error) {
    console.warn('Could not fetch technology vision:', error.message);
    return [];
  }
}

/**
 * Get team weights/capacity allocation from DynamoDB
 */
async function getTeamWeights(projectId) {
  try {
    const tableName = `app-modex-team-weights-${projectId}`;
    
    const params = {
      TableName: tableName
    };
    
    const result = await docClient.send(new ScanCommand(params));
    return result.Items || [];
  } catch (error) {
    console.warn('Could not fetch team weights:', error.message);
    return [];
  }
}

/**
 * Calculate skill gaps from skills and expectations
 */
function calculateSkillGaps(teamSkills, skillExpectations) {
  const gaps = [];
  
  // Create a map of expectations by skill name
  const expectationsMap = {};
  skillExpectations.forEach(exp => {
    expectationsMap[exp.skill] = exp.expectationScore || 0;
  });
  
  // Calculate gaps for each skill
  teamSkills.forEach(skill => {
    const currentLevel = (skill.proficiency || 0) * 20; // Convert 1-5 to 0-100 scale
    const expectedLevel = expectationsMap[skill.skill] || 0;
    const gap = expectedLevel - currentLevel;
    
    if (gap > 0) {
      gaps.push({
        skill: skill.skill,
        category: skill.category,
        currentLevel,
        expectedLevel,
        gap,
        severity: gap > 40 ? 'High' : gap > 20 ? 'Medium' : 'Low'
      });
    }
  });
  
  return gaps;
}
