// Force deployment timestamp: 2026-01-19T00:00:00.0Z
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:39.3NZ';

/**
 * AI Enhance Scores Lambda - Direct Model Invocation Version
 * 
 * ARCHITECTURE NOTE: Option C - Direct Model Invocation with Prompt Templates
 * - Replaced Bedrock Agent with direct model invocation (InvokeModelCommand)
 * - Prompts stored in DynamoDB for centralized management
 * - Supports versioning and runtime updates without redeployment
 * 
 * Uses direct Claude Sonnet 4.6 model to enhance pilot identification scores 
 * with contextual intelligence from technology vision, skills, and similarity data.
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { promptService, sanitizeEvent } = require('app-modex-shared');

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const MODEL_ID = 'global.anthropic.claude-sonnet-4-6';

exports.handler = async (event) => {
  console.log('AI Enhance Scores - Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  const { projectId, jobId, applications, criteria, contextData } = event;
  
  if (!projectId || !jobId) {
    throw new Error('projectId and jobId are required');
  }
  
  if (!applications || !Array.isArray(applications)) {
    throw new Error('applications array is required');
  }
  
  if (!contextData) {
    throw new Error('contextData is required');
  }
  
  try {
    // Fetch prompt template from DynamoDB
    const promptTemplate = await promptService.getPrompt('pilot-analysis', MODEL_ID);
    console.log(`📋 Retrieved prompt template for pilot analysis`);
    
    const aiEnhancedApplications = [];
    
    console.log(`Processing partition with ${applications.length} applications`);
    
    // Process applications in this partition sequentially
    for (let i = 0; i < applications.length; i++) {
      const app = applications[i];
      
      const appName = app.applicationName || app.application_name;
      console.log(`Processing application ${i + 1}/${applications.length}: ${appName}`);
      
      try {
        // Enrich application with relevant context data
        const enrichedApp = enrichApplicationWithContext(app, contextData);
        
        const aiEnhancement = await enhanceApplicationWithAI(
          enrichedApp,
          criteria,
          contextData,
          promptTemplate
        );
        
        aiEnhancedApplications.push({
          ...app,
          aiEnhancement
        });
        
        // Store AI-enhanced result immediately
        await storeAIEnhancedResult(projectId, jobId, appName, aiEnhancement);
        
      } catch (error) {
        console.error(`Error enhancing ${appName}:`, error);
        
        // Store error state but continue processing
        aiEnhancedApplications.push({
          ...app,
          aiEnhancement: {
            error: error.message,
            aiEnhancedScore: app.algorithmicScore || 0, // Fallback to algorithmic score
            confidence: 0
          }
        });
      }
    }
    
    console.log(`AI enhancement completed for ${aiEnhancedApplications.length} applications in this partition`);
    
    return {
      projectId,
      jobId,
      applications: aiEnhancedApplications,
      aiSummary: {
        totalProcessed: aiEnhancedApplications.length,
        successfulEnhancements: aiEnhancedApplications.filter(a => !a.aiEnhancement.error).length,
        failedEnhancements: aiEnhancedApplications.filter(a => a.aiEnhancement.error).length
      }
    };
    
  } catch (error) {
    console.error('Error in AI enhancement:', error);
    throw error;
  }
};

/**
 * Enrich application with relevant context data
 */
function enrichApplicationWithContext(application, contextData) {
  const {
    applicationSimilarities = [],
    componentSimilarities = [],
    teamSkills = [],
    skillExpectations = [],
    skillGaps = [],
    technologyVision = [],
    teamWeights = []
  } = contextData;
  
  // Filter similarities for this specific application
  const appName = application.applicationName || application.application_name;
  const appSimilarities = applicationSimilarities.filter(
    sim => sim.applicationName === appName || sim.application_name === appName
  );
  
  const appComponentSimilarities = componentSimilarities.filter(
    comp => comp.applicationName === appName || comp.application_name === appName
  );
  
  return {
    ...application,
    contextData: {
      applicationSimilarities: appSimilarities,
      componentSimilarities: appComponentSimilarities,
      teamSkills,
      skillExpectations,
      skillGaps,
      technologyVision,
      teamWeights
    }
  };
}

/**
 * Enhance a single application with AI analysis using direct model invocation
 */
async function enhanceApplicationWithAI(application, criteria, sharedContextData, promptTemplate) {
  const { contextData } = application;
  
  if (!contextData) {
    throw new Error('Context data is required for AI enhancement');
  }
  
  const prompt = buildComprehensivePrompt(application, criteria, contextData, promptTemplate);
  
  const response = await invokeBedrockModel(
    promptTemplate.systemPrompt,
    prompt,
    MODEL_ID
  );
  
  return response;
}

/**
 * Build comprehensive AI prompt for pilot evaluation
 */
function buildComprehensivePrompt(application, criteria, contextData, promptTemplate) {
  const {
    applicationSimilarities = [],
    componentSimilarities = [],
    teamSkills = [],
    skillExpectations = [],
    skillGaps = [],
    technologyVision = [],
    teamWeights = [],
    totalApplications = 0
  } = contextData;
  
  // Format technology vision
  const visionText = technologyVision
    .map(tech => `- ${tech.technology}: ${tech.phase} phase (${tech.quadrant} quadrant)`)
    .join('\n') || 'No technology vision data available';
  
  // Format team skills
  const skillsText = teamSkills
    .map(skill => `- ${skill.skill} (${skill.category}): Current Level ${skill.proficiency}/5`)
    .join('\n') || 'No team skills data available';
  
  // Format skill gaps
  const gapsText = skillGaps
    .map(gap => `- ${gap.skill}: Gap of ${gap.gap} points (${gap.severity} severity)`)
    .join('\n') || 'No significant skill gaps identified';
  
  // Format application similarities
  const similaritiesText = applicationSimilarities
    .slice(0, 10) // Top 10 similar apps
    .map(sim => `- ${sim.similarApplicationName}: ${sim.similarityScore}% similar`)
    .join('\n') || 'No similarity data available';
  
  // Build user prompt from template
  const userPrompt = promptTemplate.userPromptTemplate
    .replace('${applicationName}', application.applicationName || application.application_name)
    .replace('${technologies}', `${application.runtime || 'Unknown'}, ${application.framework || 'Unknown'}`)
    .replace('${teamSkills}', skillsText)
    .replace('${skillGaps}', gapsText)
    .replace('${strategicAlignment}', visionText)
    .replace('${organizationalContext}', `Portfolio of ${totalApplications} applications`)
    .replace('${similarApplications}', similaritiesText);
  
  return userPrompt;
}

/**
 * Invoke Bedrock model directly with retry logic
 */
async function invokeBedrockModel(systemPrompt, userPrompt, modelId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        guardrailIdentifier: process.env.BEDROCK_GUARDRAIL_ID,
        guardrailVersion: process.env.BEDROCK_GUARDRAIL_VERSION || 'DRAFT',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          messages: [
            {
              role: 'user',
              content: userPrompt
            }
          ],
          system: systemPrompt,
          max_tokens: 2048,
          temperature: 0.3
        })
      });
      
      const response = await bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      // Extract text from response
      const content = responseBody.content?.[0]?.text || '';
      
      if (!content) {
        throw new Error('Empty response from model');
      }
      
      // Parse JSON from the response (handle potential markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in model response');
      }
      
      const result = JSON.parse(jsonMatch[0]);
      
      // Map finalScore to aiEnhancedScore for compatibility with combine-scores Lambda
      if (result.finalScore !== undefined && result.aiEnhancedScore === undefined) {
        result.aiEnhancedScore = result.finalScore;
      }
      
      console.log('Bedrock Model response received successfully');
      return result;
      
    } catch (error) {
      console.error(`Model invocation attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const backoffDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.log(`Retrying in ${backoffDelay}ms...`);
      await delay(backoffDelay);
    }
  }
}

/**
 * Delay helper function
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Store AI-enhanced result in DynamoDB
 */
async function storeAIEnhancedResult(projectId, jobId, applicationName, aiEnhancement) {
  const tableName = `app-modex-pilot-results-${projectId}`.toLowerCase();
  
  const item = {
    jobId,
    candidateId: `${applicationName}#AI_ENHANCED`,
    applicationName,
    resultType: 'AI_ENHANCED',
    timestamp: new Date().toISOString(),
    ...aiEnhancement
  };
  
  const params = {
    TableName: tableName,
    Item: item
  };
  
  await docClient.send(new PutCommand(params));
  console.log(`Stored AI-enhanced result for ${applicationName}`);
}
