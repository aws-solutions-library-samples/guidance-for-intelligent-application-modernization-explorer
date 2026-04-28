/**
 * Utility functions for comparing data to detect changes
 * Used for smart refresh - only update UI when data actually changes
 */

/**
 * Compare two data objects/arrays to detect if they've changed
 * @param {any} oldData - Current data
 * @param {any} newData - New data to compare
 * @returns {boolean} - True if data has changed, false otherwise
 */
export const hasDataChanged = (oldData, newData) => {
  // Handle null/undefined cases
  if (oldData === null && newData === null) return false;
  if (oldData === undefined && newData === undefined) return false;
  if (oldData === null || oldData === undefined) return true;
  if (newData === null || newData === undefined) return true;
  
  // For arrays, compare length first (fast check)
  if (Array.isArray(oldData) && Array.isArray(newData)) {
    if (oldData.length !== newData.length) return true;
  }
  
  // Deep comparison using JSON.stringify
  // This is fast enough for our use case and handles nested objects
  try {
    const oldJson = JSON.stringify(oldData);
    const newJson = JSON.stringify(newData);
    return oldJson !== newJson;
  } catch (error) {
    console.error('Error comparing data:', error);
    // If comparison fails, assume data changed to be safe
    return true;
  }
};

/**
 * Create a hash of data for quick comparison
 * Alternative to JSON.stringify for very large datasets
 * @param {any} data - Data to hash
 * @returns {string} - Hash string
 */
export const hashData = (data) => {
  try {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  } catch (error) {
    console.error('Error hashing data:', error);
    return Date.now().toString(); // Return timestamp as fallback
  }
};

/**
 * Compare data using hash (faster for large datasets)
 * @param {any} oldData - Current data
 * @param {any} newData - New data to compare
 * @returns {boolean} - True if data has changed, false otherwise
 */
export const hasDataChangedByHash = (oldData, newData) => {
  const oldHash = hashData(oldData);
  const newHash = hashData(newData);
  return oldHash !== newHash;
};
