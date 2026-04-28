// Force deployment timestamp: 2025-11-07T09:52:05.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:42.3NZ';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Combine Scores Lambda
 * 
 * Combines rule-based algorithmic scores with AI-enhanced scores to produce
 * consolidated recommendations. Stores all three result types for comparison.
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Combine Scores - Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  const { projectId, jobId, ai_partition_results, criteria } = event;
  
  if (!projectId || !jobId) {
    throw new Error('projectId and jobId are required');
  }
  
  if (!ai_partition_results || !Array.isArray(ai_partition_results)) {
    throw new Error('ai_partition_results array is required');
  }
  
  try {
    // Flatten partition results into single array of applications
    const applications = [];
    for (const partitionResult of ai_partition_results) {
      if (partitionResult.applications && Array.isArray(partitionResult.applications)) {
        applications.push(...partitionResult.applications);
      }
    }
    
    console.log(`Flattened ${applications.length} applications from ${ai_partition_results.length} partitions`);
    
    const consolidatedApplications = [];
    
    // Process each application to combine scores
    for (const app of applications) {
      // Debug logging
      if (!app.applicationName) {
        console.warn('WARNING: Application missing applicationName:', JSON.stringify(app, null, 2));
      }
      
      const consolidated = combineScores(app, criteria);
      consolidatedApplications.push(consolidated);
      
      // Store all three result types
      await storeAllResults(projectId, jobId, app, consolidated);
    }
    
    // Sort by consolidated score
    consolidatedApplications.sort((a, b) => b.consolidatedScore - a.consolidatedScore);
    
    console.log(`Combined scores for ${consolidatedApplications.length} applications`);
    
    return {
      projectId,
      jobId,
      applications: consolidatedApplications,
      summary: {
        totalApplications: consolidatedApplications.length,
        averageAlgorithmicScore: calculateAverage(consolidatedApplications, 'algorithmicScore'),
        averageAIScore: calculateAverage(consolidatedApplications, 'aiEnhancedScore'),
        averageConsolidatedScore: calculateAverage(consolidatedApplications, 'consolidatedScore'),
        topCandidate: consolidatedApplications[0]?.applicationName || 'None'
      }
    };
    
  } catch (error) {
    console.error('Error combining scores:', error);
    throw error;
  }
};

/**
 * Combine algorithmic and AI scores using configurable weights
 */
function combineScores(application, criteria) {
  const algorithmicScore = application.algorithmicScore || 0;
  const aiEnhancement = application.aiEnhancement || {};
  const aiEnhancedScore = aiEnhancement.aiEnhancedScore || algorithmicScore; // Fallback to algorithmic
  const aiConfidence = aiEnhancement.confidence || 0;
  
  // Configurable weights (can be adjusted based on criteria or user preferences)
  // Higher AI confidence = more weight on AI score
  const aiWeight = aiConfidence > 70 ? 0.7 : aiConfidence > 50 ? 0.5 : 0.3;
  const algorithmicWeight = 1 - aiWeight;
  
  // Calculate consolidated score
  const consolidatedScore = Math.round(
    (algorithmicScore * algorithmicWeight) + (aiEnhancedScore * aiWeight)
  );
  
  // Determine recommendation level
  let recommendation = 'NOT_RECOMMENDED';
  if (consolidatedScore >= 80) {
    recommendation = 'HIGHLY_RECOMMENDED';
  } else if (consolidatedScore >= 65) {
    recommendation = 'RECOMMENDED';
  } else if (consolidatedScore >= 50) {
    recommendation = 'CONSIDER';
  }
  
  // Calculate score differences for analysis
  const scoreDifference = aiEnhancedScore - algorithmicScore;
  const agreementLevel = Math.abs(scoreDifference) <= 10 ? 'HIGH' : 
                        Math.abs(scoreDifference) <= 20 ? 'MEDIUM' : 'LOW';
  
  return {
    applicationName: application.applicationName || application.application_name,
    department: application.department,
    criticality: application.criticality,
    
    // All three scores
    algorithmicScore,
    aiEnhancedScore,
    consolidatedScore,
    
    // Scoring metadata
    aiConfidence,
    aiWeight,
    algorithmicWeight,
    scoreDifference,
    agreementLevel,
    recommendation,
    
    // Detailed breakdowns
    algorithmicBreakdown: application.scoreBreakdown || {},
    aiInsights: {
      strategicTechnologyAlignment: aiEnhancement.strategicTechnologyAlignment || 0,
      skillsAwareFeasibility: aiEnhancement.skillsAwareFeasibility || 0,
      organizationalImpact: aiEnhancement.organizationalImpact || 0,
      riskAssessment: aiEnhancement.riskAssessment || 0,
      strategicLearningValue: aiEnhancement.strategicLearningValue || 0,
      keyInsights: aiEnhancement.keyInsights || [],
      recommendations: aiEnhancement.recommendations || []
    },
    
    // Context data for reference
    contextSummary: {
      similarApplicationsCount: application.contextData?.applicationSimilarities?.length || 0,
      componentPatternsCount: application.contextData?.componentSimilarities?.length || 0,
      skillGapsCount: application.contextData?.skillGaps?.length || 0
    }
  };
}

/**
 * Store all three result types in DynamoDB
 */
async function storeAllResults(projectId, jobId, application, consolidated) {
  const tableName = `app-modex-pilot-results-${projectId}`.toLowerCase();
  const timestamp = new Date().toISOString();
  
  // Store rule-based result
  const appName = application.applicationName || application.application_name;
  const ruleBased = {
    jobId,
    candidateId: `${appName}#RULE_BASED`,
    applicationName: appName,
    resultType: 'RULE_BASED',
    department: application.department,
    criticality: application.criticality,
    timestamp,
    score: application.algorithmicScore || 0,
    scoreBreakdown: application.scoreBreakdown || {}
  };
  
  // Store AI-enhanced result
  const aiEnhanced = {
    jobId,
    candidateId: `${appName}#AI_ENHANCED`,
    applicationName: appName,
    resultType: 'AI_ENHANCED',
    department: application.department,
    criticality: application.criticality,
    timestamp,
    score: consolidated.aiEnhancedScore,
    confidence: consolidated.aiConfidence,
    aiInsights: consolidated.aiInsights
  };
  
  // Store consolidated result
  const consolidatedResult = {
    jobId,
    candidateId: `${appName}#CONSOLIDATED`,
    applicationName: appName,
    resultType: 'CONSOLIDATED',
    department: application.department,
    criticality: application.criticality,
    timestamp,
    score: consolidated.consolidatedScore,
    algorithmicScore: consolidated.algorithmicScore,
    aiEnhancedScore: consolidated.aiEnhancedScore,
    aiWeight: consolidated.aiWeight,
    algorithmicWeight: consolidated.algorithmicWeight,
    scoreDifference: consolidated.scoreDifference,
    agreementLevel: consolidated.agreementLevel,
    recommendation: consolidated.recommendation,
    algorithmicBreakdown: consolidated.algorithmicBreakdown,
    aiInsights: consolidated.aiInsights,
    contextSummary: consolidated.contextSummary
  };
  
  // Store all three in parallel
  await Promise.all([
    docClient.send(new PutCommand({ TableName: tableName, Item: ruleBased })),
    docClient.send(new PutCommand({ TableName: tableName, Item: aiEnhanced })),
    docClient.send(new PutCommand({ TableName: tableName, Item: consolidatedResult }))
  ]);
  
  console.log(`Stored all three result types for ${application.applicationName}`);
}

/**
 * Calculate average score across applications
 */
function calculateAverage(applications, scoreField) {
  if (applications.length === 0) return 0;
  
  const sum = applications.reduce((acc, app) => acc + (app[scoreField] || 0), 0);
  return Math.round(sum / applications.length);
}
