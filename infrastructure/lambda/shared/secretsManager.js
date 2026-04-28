/**
 * AWS Secrets Manager utility for Lambda functions
 * Provides cached retrieval of secrets from AWS Secrets Manager
 * 
 * SECURITY NOTE: Remediation #18
 * - Retrieves sensitive configuration from Secrets Manager at runtime
 * - Caches secrets in memory to reduce API calls
 * - Supports multiple secret formats (JSON objects, plain text)
 * - Integrates with logger for environment-aware logging
 * 
 * Usage:
 *   const secretsManager = require('./secretsManager');
 *   const config = await secretsManager.getSecret(process.env.APP_CONFIG_SECRET_ARN);
 *   const userPoolId = config.userPoolId;
 */

const AWS = require('aws-sdk');
const logger = require('./logger');

// Initialize Secrets Manager client
const secretsManagerClient = new AWS.SecretsManager({
  region: process.env.REGION || process.env.AWS_REGION || 'us-east-1'
});

// In-memory cache for secrets (TTL: 1 hour)
const secretsCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Retrieves a secret from AWS Secrets Manager with caching
 * @param {string} secretId - Secret ARN or name
 * @returns {Promise<Object|string>} Parsed secret value (JSON object or plain text)
 * @throws {Error} If secret retrieval fails
 */
async function getSecret(secretId) {
  if (!secretId) {
    throw new Error('Secret ID is required');
  }

  // Check cache first
  const cached = secretsCache.get(secretId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug('Retrieved secret from cache', { secretId });
    return cached.value;
  }

  try {
    logger.debug('Retrieving secret from Secrets Manager', { secretId });

    const response = await secretsManagerClient.getSecretValue({
      SecretId: secretId
    }).promise();

    let secretValue;

    // Handle both SecretString and SecretBinary
    if (response.SecretString) {
      try {
        // Try to parse as JSON
        secretValue = JSON.parse(response.SecretString);
        logger.debug('Parsed secret as JSON object');
      } catch (e) {
        // If not JSON, treat as plain text
        secretValue = response.SecretString;
        logger.debug('Treating secret as plain text');
      }
    } else if (response.SecretBinary) {
      secretValue = Buffer.from(response.SecretBinary, 'base64').toString('ascii');
      logger.debug('Decoded binary secret');
    } else {
      throw new Error('Secret has no SecretString or SecretBinary');
    }

    // Cache the secret
    secretsCache.set(secretId, {
      value: secretValue,
      timestamp: Date.now()
    });

    logger.info('Successfully retrieved secret from Secrets Manager', { secretId });
    return secretValue;
  } catch (error) {
    logger.error('Failed to retrieve secret from Secrets Manager', {
      secretId,
      error: error.message,
      code: error.code
    });
    throw new Error(`Failed to retrieve secret: ${error.message}`);
  }
}

/**
 * Retrieves multiple secrets in parallel
 * @param {Object} secretMap - Map of variable names to secret IDs
 *   Example: { userPoolId: 'arn:aws:secretsmanager:...', apiKey: 'my-api-key' }
 * @returns {Promise<Object>} Object with retrieved secrets
 *   Example: { userPoolId: 'pool-123', apiKey: 'key-456' }
 */
async function getSecrets(secretMap) {
  if (!secretMap || typeof secretMap !== 'object') {
    throw new Error('Secret map must be an object');
  }

  const secretPromises = Object.entries(secretMap).map(async ([key, secretId]) => {
    try {
      const value = await getSecret(secretId);
      return [key, value];
    } catch (error) {
      logger.error(`Failed to retrieve secret for key: ${key}`, { error: error.message });
      throw error;
    }
  });

  const results = await Promise.all(secretPromises);
  return Object.fromEntries(results);
}

/**
 * Clears the secrets cache
 * Useful for testing or forcing a refresh
 */
function clearCache() {
  secretsCache.clear();
  logger.debug('Secrets cache cleared');
}

/**
 * Gets cache statistics for monitoring
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
  return {
    cachedSecrets: secretsCache.size,
    cacheSize: Array.from(secretsCache.values()).reduce((sum, item) => {
      return sum + JSON.stringify(item.value).length;
    }, 0),
    cacheTTLMs: CACHE_TTL_MS
  };
}

module.exports = {
  getSecret,
  getSecrets,
  clearCache,
  getCacheStats
};
