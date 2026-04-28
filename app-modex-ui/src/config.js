/**
 * Application configuration
 */

// API endpoint for backend services
export const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.example.com';

// Other configuration settings
export const APP_CONFIG = {
  // Default page size for tables
  defaultPageSize: 10,
  
  // Maximum items to load at once
  maxItemsToLoad: 1000,
  
  // Default date format
  dateFormat: 'YYYY-MM-DD',
  
  // Enable/disable features
  features: {
    dataProcessing: true,
    insights: true,
    planning: true,
    execution: true
  }
};
