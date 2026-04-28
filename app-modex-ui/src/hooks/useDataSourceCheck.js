import { useState, useEffect } from 'react';
import { checkMultipleTablesHaveData } from '../services/dataValidationService';

/**
 * Custom hook to check if required data sources exist and contain actual data
 * Uses Athena queries to validate that tables have records
 * @param {Array<string>} requiredDataSources - Array of required data source types
 * @returns {Object} - { hasData, loading, missingDataSources }
 */
const useDataSourceCheck = (requiredDataSources = []) => {
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [missingDataSources, setMissingDataSources] = useState([]);

  useEffect(() => {
    const checkDataSources = async () => {
      if (!requiredDataSources || requiredDataSources.length === 0) {
        setHasData(true);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Check if Athena tables contain actual data by running COUNT queries
        const validation = await checkMultipleTablesHaveData(requiredDataSources);
        
        setMissingDataSources(validation.missingDataSources);
        setHasData(validation.hasAllData);
        
        console.log('📊 Data validation results:', {
          hasAllData: validation.hasAllData,
          missingDataSources: validation.missingDataSources,
          details: validation.results
        });
      } catch (error) {
        console.error('Error checking data sources:', error);
        // If we can't check, assume data is missing
        setMissingDataSources(requiredDataSources);
        setHasData(false);
      } finally {
        setLoading(false);
      }
    };

    checkDataSources();
  }, [requiredDataSources.join(',')]); // Re-run if required data sources change

  return { hasData, loading, missingDataSources };
};

export default useDataSourceCheck;
