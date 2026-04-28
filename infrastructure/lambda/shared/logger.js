/**
 * Centralized logging utility for App-ModEx Lambda functions
 * Provides environment-aware logging with configurable log levels
 * 
 * Log Levels (in order of severity):
 * - ERROR: Only errors (always logged)
 * - WARN: Warnings and errors
 * - INFO: Info, warnings, and errors (default for development)
 * - DEBUG: All messages including debug (verbose)
 * 
 * Usage:
 *   const logger = require('./logger');
 *   logger.info('Processing started');
 *   logger.debug('Detailed information');
 *   logger.warn('Warning message');
 *   logger.error('Error occurred');
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Get current log level from environment variable
// Default: ERROR for production, INFO for development
const getLogLevel = () => {
  const logLevelEnv = process.env.LOG_LEVEL || 'INFO';
  return LOG_LEVELS[logLevelEnv.toUpperCase()] !== undefined 
    ? LOG_LEVELS[logLevelEnv.toUpperCase()] 
    : LOG_LEVELS.INFO;
};

const currentLogLevel = getLogLevel();

/**
 * Log error messages (always logged)
 * @param {string} message - Log message
 * @param {*} data - Optional data to log
 */
function error(message, data) {
  if (currentLogLevel >= LOG_LEVELS.ERROR) {
    if (data !== undefined) {
      console.error(message, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
    } else {
      console.error(message);
    }
  }
}

/**
 * Log warning messages
 * @param {string} message - Log message
 * @param {*} data - Optional data to log
 */
function warn(message, data) {
  if (currentLogLevel >= LOG_LEVELS.WARN) {
    if (data !== undefined) {
      console.warn(message, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
    } else {
      console.warn(message);
    }
  }
}

/**
 * Log info messages
 * @param {string} message - Log message
 * @param {*} data - Optional data to log
 */
function info(message, data) {
  if (currentLogLevel >= LOG_LEVELS.INFO) {
    if (data !== undefined) {
      console.log(message, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
    } else {
      console.log(message);
    }
  }
}

/**
 * Log debug messages (verbose)
 * @param {string} message - Log message
 * @param {*} data - Optional data to log
 */
function debug(message, data) {
  if (currentLogLevel >= LOG_LEVELS.DEBUG) {
    if (data !== undefined) {
      console.log(`[DEBUG] ${message}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
    } else {
      console.log(`[DEBUG] ${message}`);
    }
  }
}

/**
 * Log with custom level
 * @param {string} level - Log level (ERROR, WARN, INFO, DEBUG)
 * @param {string} message - Log message
 * @param {*} data - Optional data to log
 */
function log(level, message, data) {
  const levelUpper = level.toUpperCase();
  if (LOG_LEVELS[levelUpper] !== undefined) {
    const logFunc = {
      ERROR: error,
      WARN: warn,
      INFO: info,
      DEBUG: debug
    }[levelUpper];
    logFunc(message, data);
  }
}

module.exports = {
  error,
  warn,
  info,
  debug,
  log,
  LOG_LEVELS,
  getCurrentLogLevel: () => Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === currentLogLevel)
};
