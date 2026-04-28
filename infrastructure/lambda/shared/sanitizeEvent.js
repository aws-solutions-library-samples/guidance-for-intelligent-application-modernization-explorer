/**
 * Sanitization utility for Lambda event logging
 * Removes sensitive data (Authorization headers, cookies, decoded tokens) from event objects
 * before logging to CloudWatch to prevent exposure of JWT tokens and user information
 * 
 * SECURITY NOTE: Works with logger.js for environment-aware logging (Remediation #5)
 * - Production (LOG_LEVEL=ERROR): Only errors logged
 * - Development (LOG_LEVEL=INFO): Info and debug messages logged
 */

const logger = require('./logger');

/**
 * Sanitizes an event object by removing sensitive headers and data
 * @param {Object} event - The Lambda event object to sanitize
 * @returns {Object} Sanitized event object safe for logging
 */
function sanitizeEvent(event) {
  if (!event) {
    return event;
  }

  const sanitized = JSON.parse(JSON.stringify(event)); // Deep copy

  // Remove sensitive headers
  if (sanitized.headers) {
    const sensitiveHeaders = ['Authorization', 'Cookie', 'X-Api-Key', 'X-Amz-Security-Token'];
    sensitiveHeaders.forEach(header => {
      delete sanitized.headers[header];
    });
  }

  // Remove sensitive multiValueHeaders
  if (sanitized.multiValueHeaders) {
    const sensitiveHeaders = ['Authorization', 'Cookie', 'X-Api-Key', 'X-Amz-Security-Token'];
    sensitiveHeaders.forEach(header => {
      delete sanitized.multiValueHeaders[header];
    });
  }

  // Remove decoded authorization context (from Cognito authorizer)
  if (sanitized.requestContext && sanitized.requestContext.authorizer) {
    delete sanitized.requestContext.authorizer;
  }

  // Remove sensitive identity information
  if (sanitized.requestContext && sanitized.requestContext.identity) {
    const identity = sanitized.requestContext.identity;
    // Keep only non-sensitive identity fields
    const safeIdentityFields = ['sourceIp', 'userAgent'];
    const safeIdentity = {};
    safeIdentityFields.forEach(field => {
      if (identity[field]) {
        safeIdentity[field] = identity[field];
      }
    });
    sanitized.requestContext.identity = safeIdentity;
  }

  // Remove body if it contains sensitive data (keep structure but not content)
  if (sanitized.body) {
    sanitized.body = '[REDACTED - see CloudWatch Logs Insights for details]';
  }

  return sanitized;
}

/**
 * Sanitizes and logs an event object using environment-aware logging
 * @param {string} message - Log message prefix
 * @param {Object} event - The Lambda event object to log
 */
function logSanitizedEvent(message, event) {
  logger.info(message, sanitizeEvent(event));
}

module.exports = {
  sanitizeEvent,
  logSanitizedEvent,
};
