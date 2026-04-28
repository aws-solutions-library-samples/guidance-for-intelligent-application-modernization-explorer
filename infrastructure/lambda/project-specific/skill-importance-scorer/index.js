/**
 * Skill Importance Scorer Lambda - Direct Model Invocation Version
 * 
 * ARCHITECTURE NOTE: Option C - Direct Model Invocation with Prompt Templates
 * - Replaced Bedrock Agent with direct model invocation (InvokeModelCommand)
 * - Prompts stored in DynamoDB for centralized management
 * - Supports versioning and runtime updates without redeployment
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { promptService } = require('app-modex-shared');

const s3 = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const bedrockClient = new BedrockRuntimeClient({});

const PROJECT_ID = process.env.PROJECT_ID;
const MODEL_ID = 'amazon.nova-lite-v1:0';

exports.handler = async (event) => {
  console.log('Skill Importance Scorer started');
  try {
    const { teamName, weights, skills, projectId, processId, s3OutputBucket, s3OutputPrefix, processTableName } = event;
    await updateTeamStatus(processTableName, processId, teamName, 'processing', 'Scoring skills with AI');
    
    // Fetch prompt template from DynamoDB
    const promptTemplate = await promptService.getPrompt('skill-importance', MODEL_ID);
    console.log(`📋 Retrieved prompt template for skill importance scoring`);
    
    // Build user prompt from template
    const categoryWeightsText = Object.entries(weights)
      .map(([cat, weight]) => `- ${cat}: ${weight}%`)
      .join('\n');
    
    const skillsText = skills
      .map(s => `- ${s.skill} (${s.category}): Current Proficiency ${s.proficiency}/5`)
      .join('\n');
    
    const userPrompt = promptTemplate.userPromptTemplate
      .replace('${teamName}', teamName)
      .replace('${categoryWeights}', categoryWeightsText)
      .replace('${skills}', skillsText)
      .replace('${currentProficiency}', skillsText)
      .replace('${strategicContext}', 'Team is focused on cloud modernization and digital transformation');
    
    const modelResponse = await invokeBedrockModel(
      promptTemplate.systemPrompt,
      userPrompt,
      MODEL_ID
    );
    
    const skillScores = parseModelResponse(modelResponse, teamName);
    const s3Key = await persistResultsToS3(s3OutputBucket, s3OutputPrefix, teamName, skillScores, projectId);
    await updateTeamStatus(processTableName, processId, teamName, 'completed', `Scored ${skillScores.length} skills`);
    
    return { teamName, status: 'completed', skillsScored: skillScores.length, s3Key, confidence: 85 };
  } catch (error) {
    console.error('Error scoring skills:', error);
    try {
      const { teamName, processTableName, processId } = event;
      await updateTeamStatus(processTableName, processId, teamName, 'failed', error.message);
    } catch (e) {}
    throw error;
  }
};

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
          system: [
            {
              text: systemPrompt
            }
          ],
          messages: [
            {
              role: 'user',
              content: [
                {
                  text: userPrompt
                }
              ]
            }
          ],
          inferenceConfig: {
            maxTokens: 2048,
            temperature: 0.7,
            topP: 0.9
          }
        })
      });
      
      const response = await bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      console.log('Bedrock response:', JSON.stringify(responseBody, null, 2));
      
      // Extract text from response - Nova returns output array
      const content = responseBody.output?.message?.content?.[0]?.text || 
                     responseBody.content?.[0]?.text || 
                     responseBody.message?.content?.[0]?.text ||
                     '';
      
      if (!content) {
        console.error('Could not extract content from response:', responseBody);
        throw new Error('Empty response from model');
      }
      
      return content;
      
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
 * Parse model response and extract skill scores
 */
function parseModelResponse(modelResponse, teamName) {
  try {
    // Extract JSON from response (handle potential markdown code blocks)
    const jsonMatch = modelResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in model response');
    }
    
    const parsedResponse = JSON.parse(jsonMatch[0]);
    
    if (!parsedResponse.skills || !Array.isArray(parsedResponse.skills)) {
      throw new Error('Invalid model response: missing skills array');
    }
    
    return parsedResponse.skills.map(score => ({
      team: teamName,
      skill: score.skill,
      category: score.category,
      importanceScore: score.importanceScore,
      rationale: score.rationale || '',
      confidence: parsedResponse.confidence || 85,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Error parsing model response:', error);
    throw new Error(`Failed to parse model response: ${error.message}`);
  }
}

async function persistResultsToS3(bucket, prefix, teamName, skillScores, projectId) {
  const timestamp = new Date().toISOString();
  const sanitizedTeamName = teamName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const key = `${prefix}${sanitizedTeamName}_scores.csv`;
  const csvLines = ['team,skill,category,importance_score,rationale,confidence,timestamp'];
  for (const score of skillScores) {
    csvLines.push([escapeCSV(score.team), escapeCSV(score.skill), escapeCSV(score.category), score.importanceScore, escapeCSV(score.rationale), score.confidence, score.timestamp].join(','));
  }
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: csvLines.join('\n'), ContentType: 'text/csv', Metadata: { 'project-id': projectId, 'team-name': teamName, 'skills-scored': skillScores.length.toString(), 'timestamp': timestamp } }));
  return key;
}

async function updateTeamStatus(tableName, processId, teamName, status, description) {
  const now = new Date().toISOString();
  await dynamodb.send(new UpdateCommand({
    TableName: tableName,
    Key: { processId },
    UpdateExpression: 'SET teamStatus.#teamName = :teamStatus, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#teamName': teamName },
    ExpressionAttributeValues: { ':teamStatus': { status, description, updatedAt: now }, ':updatedAt': now }
  }));
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}