/**
 * Helper module for Lambda functions to initialize and retrieve secrets
 * Simplifies the pattern of retrieving secrets from Secrets Manager at function startup
 * 
 * SECURITY NOTE: Remediation #18
 * - Retrieves secrets once at function initialization
 * - Caches in memory for the lifetime of the Lambda container
 * - Reduces Secrets Manager API calls
 * - Integrates with logger for environment-aware logging
 * 
 * Usage:
 *   const secretsHelper = require('./secretsHelper');
 *   
 *   exports.handler = async (event) => {
 *     // Initialize secrets (called once per container)
 *     const secrets = await secretsHelper.initializeSecrets({
 *       appConfig: process.env.APP_CONFIG_SECRET_ARN
 *     });
 *     
 *     // Use secrets
 *     const userPoolId = secrets.appConfig.userPoolId;
 *     const agentId = secrets.appConfig.normalizationAgentId;
 *   };
 */

const secretsManager = require('./secretsManager');
const logger = require('./logger');

// Store initialized secrets for reuse across invocations
let initializedSecrets = null;
let secretsInitialized = false;

/**
 * Initializes secrets from Secrets Manager
 * Caches results in memory for reuse across Lambda invocations
 * 
 * @param {Object} secretMap - Map of variable names to secret ARNs/names
 *   Example: {
 *     appConfig: process.env.APP_CONFIG_SECRET_ARN,
 *     apiKeys: process.env.API_KEYS_SECRET_ARN
 *   }
 * @returns {Promise<Object>} Object with retrieved secrets
 *   Example: {
 *     appConfig: { userPoolId: '...', agentId: '...' },
 *     apiKeys: { key1: '...', key2: '...' }
 *   }
 */
async function initializeSecrets(secretMap) {
  // Return cached secrets if already initialized
  if (secretsInitialized && initializedSecrets) {
    logger.debug('Using cached secrets from previous invocation');
    return initializedSecrets;
  }

  try {
    logger.info('Initializing secrets from Secrets Manager');

    const secrets = {};

    // Retrieve each secret
    for (const [key, secretId] of Object.entries(secretMap)) {
      if (!secretId) {
        logger.warn(`Secret ID not provided for key: ${key}`);
        continue;
      }

      try {
        logger.debug(`Retrieving secret: ${key}`);
        secrets[key] = await secretsManager.getSecret(secretId);
      } catch (error) {
        logger.error(`Failed to retrieve secret for key: ${key}`, {
          error: error.message
        });
        throw error;
      }
    }

    // Cache for reuse
    initializedSecrets = secrets;
    secretsInitialized = true;

    logger.info('Secrets initialized successfully', {
      secretCount: Object.keys(secrets).length
    });

    return secrets;
  } catch (error) {
    logger.error('Failed to initialize secrets', { error: error.message });
    throw new Error(`Secrets initialization failed: ${error.message}`);
  }
}

/**
 * Gets the current initialized secrets
 * Returns null if secrets haven't been initialized yet
 * 
 * @returns {Object|null} Initialized secrets or null
 */
function getInitializedSecrets() {
  if (!secretsInitialized) {
    logger.warn('Secrets not yet initialized');
    return null;
  }
  return initializedSecrets;
}

/**
 * Resets the secrets cache
 * Useful for testing or forcing a refresh
 */
function resetSecrets() {
  initializedSecrets = null;
  secretsInitialized = false;
  secretsManager.clearCache();
  logger.debug('Secrets cache reset');
}

module.exports = {
  initializeSecrets,
  getInitializedSecrets,
  resetSecrets
};
