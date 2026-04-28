/**
 * Data Validation Service
 * Validates that required Athena tables contain actual data
 */

import { executeAthenaTemplate } from './athenaQueryService';

/**
 * Mapping of data source types to their template IDs
 */
const DATA_SOURCE_TEMPLATE_MAP = {
  'team-skills': 'table-record-count-team-skills',
  'technology-vision': 'table-record-count-tech-vision',
  'applications-portfolio': 'table-record-count-application-portfolio',
  'applications-tech-stack': 'table-record-count-tech-stack',
  'applications-infrastructure': 'table-record-count-infrastructure-resources',
  'applications-utilization': 'table-record-count-resource-utilization'
};

/**
 * Check if a specific data source table contains data
 * @param {string} dataSourceType - The data source type (e.g., 'team-skills')
 * @returns {Promise<Object>} - { hasData: boolean, recordCount: number, error?: string }
 */
export const checkTableHasData = async (dataSourceType) => {
  try {
    const templateId = DATA_SOURCE_TEMPLATE_MAP[dataSourceType];
    
    if (!templateId) {
      return {
        hasData: false,
        recordCount: 0,
        error: `Unknown data source type: ${dataSourceType}`
      };
    }
    
    console.log(`🔍 Checking if ${dataSourceType} table has data...`);
    
    const result = await executeAthenaTemplate(templateId, {}, dataSourceType);
    
    if (!result.success) {
      return {
        hasData: false,
        recordCount: 0,
        error: result.error || 'Query failed'
      };
    }
    
    const recordCount = parseInt(result.data?.[0]?.record_count || 0, 10);
    const hasData = recordCount > 0;
    
    console.log(`✅ ${dataSourceType}: ${recordCount} records found`);
    
    return {
      hasData,
      recordCount
    };
  } catch (error) {
    console.error(`❌ Error checking ${dataSourceType} table:`, error);
    return {
      hasData: false,
      recordCount: 0,
      error: error.message
    };
  }
};

/**
 * Check multiple data source tables for data
 * @param {Array<string>} dataSourceTypes - Array of data source types to check
 * @returns {Promise<Object>} - { hasAllData: boolean, results: Object, missingDataSources: Array }
 */
export const checkMultipleTablesHaveData = async (dataSourceTypes) => {
  try {
    console.log(`🔍 Checking ${dataSourceTypes.length} data sources for data...`);
    
    // Check all tables in parallel
    const checks = await Promise.all(
      dataSourceTypes.map(async (type) => {
        const result = await checkTableHasData(type);
        return { type, ...result };
      })
    );
    
    // Build results object
    const results = {};
    const missingDataSources = [];
    
    checks.forEach(check => {
      results[check.type] = {
        hasData: check.hasData,
        recordCount: check.recordCount,
        error: check.error
      };
      
      if (!check.hasData) {
        missingDataSources.push(check.type);
      }
    });
    
    const hasAllData = missingDataSources.length === 0;
    
    console.log(`✅ Data validation complete: ${hasAllData ? 'All tables have data' : `${missingDataSources.length} tables missing data`}`);
    
    return {
      hasAllData,
      results,
      missingDataSources
    };
  } catch (error) {
    console.error('❌ Error checking multiple tables:', error);
    return {
      hasAllData: false,
      results: {},
      missingDataSources: dataSourceTypes,
      error: error.message
    };
  }
};

export default {
  checkTableHasData,
  checkMultipleTablesHaveData
};
