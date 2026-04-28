/**
 * Prompt Template Service for Lambda functions
 * Provides cached retrieval of AI prompts from DynamoDB
 * 
 * ARCHITECTURE NOTE: Option C - Direct Model Invocation with Prompt Templates
 * - Replaces Bedrock Agent infrastructure with direct model calls
 * - Centralizes prompt management in DynamoDB
 * - Supports versioning and per-model customization
 * - Enables runtime prompt updates without Lambda redeployment
 * 
 * Usage:
 *   const promptService = require('./promptService');
 *   const prompt = await promptService.getPrompt('normalization', 'amazon.nova-lite-v1:0');
 *   const systemPrompt = prompt.systemPrompt;
 *   const userPromptTemplate = prompt.userPromptTemplate;
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const logger = require('./logger');

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-2'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// In-memory cache for prompts (TTL: 1 hour)
const promptCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const PROMPT_TEMPLATES_TABLE = process.env.PROMPT_TEMPLATES_TABLE || 'app-modex-prompt-templates';

/**
 * Retrieves a prompt template from DynamoDB with caching
 * @param {string} promptType - Type of prompt (e.g., 'normalization', 'pilot-analysis', 'skill-importance')
 * @param {string} model - Model identifier (e.g., 'amazon.nova-lite-v1:0', 'anthropic.claude-3-7-sonnet-20250219-v1:0')
 * @param {string} version - Optional version (defaults to 'latest')
 * @returns {Promise<Object>} Prompt template with systemPrompt and userPromptTemplate
 * @throws {Error} If prompt not found or retrieval fails
 */
async function getPrompt(promptType, model, version = 'latest') {
  if (!promptType || !model) {
    throw new Error('promptType and model are required');
  }

  // Create cache key
  const cacheKey = `${promptType}#${model}#${version}`;

  // Check cache first
  const cached = promptCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug('Retrieved prompt from cache', { promptType, model, version });
    return cached.value;
  }

  try {
    logger.debug('Retrieving prompt from DynamoDB', { promptType, model, version });

    // Query DynamoDB for the prompt
    const command = new GetCommand({
      TableName: PROMPT_TEMPLATES_TABLE,
      Key: {
        promptId: promptType,
        modelVersion: `${model}#${version}`
      }
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      // Try to get latest version if specific version not found
      if (version !== 'latest') {
        logger.warn('Prompt version not found, trying latest', { promptType, model, version });
        return getPrompt(promptType, model, 'latest');
      }

      throw new Error(`Prompt not found: ${promptType} for model ${model}`);
    }

    const promptTemplate = {
      promptId: response.Item.promptId,
      model: response.Item.model,
      version: response.Item.version,
      systemPrompt: response.Item.systemPrompt,
      userPromptTemplate: response.Item.userPromptTemplate,
      outputFormat: response.Item.outputFormat || 'json',
      status: response.Item.status,
      createdAt: response.Item.createdAt,
      updatedAt: response.Item.updatedAt
    };

    // Cache the prompt
    promptCache.set(cacheKey, {
      value: promptTemplate,
      timestamp: Date.now()
    });

    logger.info('Successfully retrieved prompt from DynamoDB', { promptType, model, version });
    return promptTemplate;
  } catch (error) {
    logger.error('Failed to retrieve prompt from DynamoDB', {
      promptType,
      model,
      version,
      error: error.message
    });
    throw new Error(`Failed to retrieve prompt: ${error.message}`);
  }
}

/**
 * Retrieves all prompts for a specific type across all models
 * @param {string} promptType - Type of prompt
 * @returns {Promise<Array>} Array of prompt templates
 */
async function getPromptsByType(promptType) {
  if (!promptType) {
    throw new Error('promptType is required');
  }

  try {
    logger.debug('Retrieving all prompts for type', { promptType });

    const command = new QueryCommand({
      TableName: PROMPT_TEMPLATES_TABLE,
      KeyConditionExpression: 'promptId = :promptId',
      ExpressionAttributeValues: {
        ':promptId': promptType
      }
    });

    const response = await docClient.send(command);

    const prompts = (response.Items || []).map(item => ({
      promptId: item.promptId,
      model: item.model,
      version: item.version,
      systemPrompt: item.systemPrompt,
      userPromptTemplate: item.userPromptTemplate,
      outputFormat: item.outputFormat || 'json',
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));

    logger.info('Successfully retrieved prompts by type', { promptType, count: prompts.length });
    return prompts;
  } catch (error) {
    logger.error('Failed to retrieve prompts by type', {
      promptType,
      error: error.message
    });
    throw new Error(`Failed to retrieve prompts: ${error.message}`);
  }
}

/**
 * Clears the prompt cache
 * Useful for testing or forcing a refresh
 */
function clearCache() {
  promptCache.clear();
  logger.debug('Prompt cache cleared');
}

/**
 * Gets cache statistics for monitoring
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
  return {
    cachedPrompts: promptCache.size,
    cacheSize: Array.from(promptCache.values()).reduce((sum, item) => {
      return sum + JSON.stringify(item.value).length;
    }, 0),
    cacheTTLMs: CACHE_TTL_MS
  };
}

module.exports = {
  getPrompt,
  getPromptsByType,
  clearCache,
  getCacheStats
};
