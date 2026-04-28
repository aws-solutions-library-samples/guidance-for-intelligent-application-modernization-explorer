import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  Button,
  Grid,
  Multiselect,
  FormField,
  ColumnLayout,
  Cards,
  Link,
  StatusIndicator,
  Alert,
  Spinner
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { navigateToExportWithCategory } from '../../utils/exportNavigationUtils';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import DoughnutChart from '../../components/charts/DoughnutChart';
import BarChart from '../../components/charts/BarChart';
import InfrastructureAnalysisInfoContent from '../../components/info/InfrastructureAnalysisInfoContent';
import MissingDataAlert from '../../components/MissingDataAlert';

// Hooks
import useDataSourceCheck from '../../hooks/useDataSourceCheck';

// API services
import { getInfrastructureData } from '../../services/athenaQueryService';

/**
 * Infrastructure Analysis Page Component
 * 
 * This page displays various charts and visualizations for analyzing infrastructure resources.
 */
const InfrastructureAnalysisPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  
  // Check if required data sources exist
  const { hasData, loading: checkingData, missingDataSources } = useDataSourceCheck(['applications-portfolio', 'applications-infrastructure']);
  
  const [toolsOpen, setToolsOpen] = useState(false);
  const [infrastructureData, setInfrastructureData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  
  // Reference to the container element for the bar chart
  const barChartContainerRef = useRef(null);
  
  // State for chart dimensions
  const [barChartWidth, setBarChartWidth] = useState(800);
  
  // Chart data states
  const [serverTypeDistributionData, setServerTypeDistributionData] = useState([]);
  const [osTypeDistributionData, setOsTypeDistributionData] = useState([]);
  const [environmentDistributionData, setEnvironmentDistributionData] = useState([]);
  const [regionDistributionData, setRegionDistributionData] = useState([]);
  const [dbEngineDistributionData, setDbEngineDistributionData] = useState([]);
  const [orchestrationDistributionData, setOrchestrationDistributionData] = useState([]);
  const [resourcesPerAppData, setResourcesPerAppData] = useState([]);
  
  // Chart totals
  const [serverTypeTotal, setServerTypeTotal] = useState(0);
  const [osTypeTotal, setOsTypeTotal] = useState(0);
  const [environmentTotal, setEnvironmentTotal] = useState(0);
  const [regionTotal, setRegionTotal] = useState(0);
  const [dbEngineTotal, setDbEngineTotal] = useState(0);
  const [orchestrationTotal, setOrchestrationTotal] = useState(0);
  const [resourcesTotal, setResourcesTotal] = useState(0);
  
  // Base filter options (unfiltered)
  const [applicationOptions, setApplicationOptions] = useState([]);
  const [serverTypeOptions, setServerTypeOptions] = useState([]);
  const [osTypeOptions, setOsTypeOptions] = useState([]);
  const [environmentOptions, setEnvironmentOptions] = useState([]);
  const [regionOptions, setRegionOptions] = useState([]);
  const [dbEngineOptions, setDbEngineOptions] = useState([]);
  const [orchestrationOptions, setOrchestrationOptions] = useState([]);
  
  // Helper function to get project ID
  const getProjectId = () => {
    try {
      const projectData = localStorage.getItem('selectedProject');
      if (projectData) {
        const project = JSON.parse(projectData);
        return project.projectId;
      }
    } catch (err) {
      console.error('Error loading project data:', err);
    }
    return 'default';
  };

  const projectId = getProjectId();

  // Selected filters - initialize from localStorage with project-specific keys
  const [selectedApplications, setSelectedApplications] = useState(() => {
    const saved = localStorage.getItem(`infrastructureFilters_${projectId}_applications`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedServerTypes, setSelectedServerTypes] = useState(() => {
    const saved = localStorage.getItem(`infrastructureFilters_${projectId}_serverTypes`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedOsTypes, setSelectedOsTypes] = useState(() => {
    const saved = localStorage.getItem(`infrastructureFilters_${projectId}_osTypes`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedEnvironments, setSelectedEnvironments] = useState(() => {
    const saved = localStorage.getItem(`infrastructureFilters_${projectId}_environments`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedRegions, setSelectedRegions] = useState(() => {
    const saved = localStorage.getItem(`infrastructureFilters_${projectId}_regions`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedDbEngines, setSelectedDbEngines] = useState(() => {
    const saved = localStorage.getItem(`infrastructureFilters_${projectId}_dbEngines`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedOrchestrations, setSelectedOrchestrations] = useState(() => {
    const saved = localStorage.getItem(`infrastructureFilters_${projectId}_orchestrations`);
    return saved ? JSON.parse(saved) : [];
  });

  // Update bar chart width based on container size
  useEffect(() => {
    if (!barChartContainerRef.current) return;
    
    const updateBarChartWidth = () => {
      if (barChartContainerRef.current) {
        // Get the actual width of the container
        const containerWidth = barChartContainerRef.current.getBoundingClientRect().width;
        // Set chart width to container width minus some padding
        setBarChartWidth(Math.max(containerWidth - 40, 400));
      }
    };
    
    // Initial update
    updateBarChartWidth();
    
    // Update on resize
    const resizeObserver = new ResizeObserver(updateBarChartWidth);
    resizeObserver.observe(barChartContainerRef.current);
    
    // Also listen for window resize events as a fallback
    window.addEventListener('resize', updateBarChartWidth);
    
    // Cleanup
    return () => {
      if (barChartContainerRef.current) {
        resizeObserver.unobserve(barChartContainerRef.current);
      }
      window.removeEventListener('resize', updateBarChartWidth);
    };
  }, []);

  // Fetch infrastructure data with retry mechanism
  useEffect(() => {
    // Don't fetch if data sources are not available
    if (!hasData) {
      console.log('InfrastructureAnalysisPage: Skipping data fetch - required data sources not available');
      return;
    }
    
    const fetchInfraData = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log(`🔄 Fetching infrastructure data from Athena... (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        
        const response = await getInfrastructureData();
        console.log('✅ Infrastructure data fetched:', response);
        
        if (response && response.items) {
          setInfrastructureData(response.items);
          setFilteredData(response.items);
          
          // Extract filter options
          extractFilterOptions(response.items);
          
          // Process data for charts
          processDataForCharts(response.items);
        } else {
          console.error('❌ Unexpected data format:', response);
          setError('Received unexpected data format from the server');
        }
      } catch (error) {
        console.error('❌ Error fetching infrastructure data:', error);
        
        // Check if error is due to missing view/table (no data uploaded yet)
        if (error.message && (
          error.message.includes('does not exist') || 
          error.message.includes('FAILED') ||
          error.message.includes('Table not found') ||
          error.message.includes('View not found')
        )) {
          // Don't show error for missing data - just show empty state
          console.log('No infrastructure data uploaded yet');
          setError(null);
          setInfrastructureData([]);
        } else if (retryCount < MAX_RETRIES) {
          // If we haven't reached max retries, increment retry count
          console.log(`🔄 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          setRetryCount(retryCount + 1);
        } else {
          setError(`Failed to fetch infrastructure data after ${MAX_RETRIES + 1} attempts: ${error.message}`);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchInfraData();
  }, [retryCount, hasData]);
  
  // Function to update filter options based on current selections
  const updateFilterOptions = useCallback(() => {
    // If no filters are selected, all options are available without restrictions
    if (selectedApplications.length === 0 && 
        selectedServerTypes.length === 0 && 
        selectedOsTypes.length === 0 && 
        selectedEnvironments.length === 0 && 
        selectedRegions.length === 0 && 
        selectedDbEngines.length === 0 && 
        selectedOrchestrations.length === 0) {
      return;
    }
    
    // Get the filtered data based on current selections
    const relevantData = filteredData;
    
    // Extract unique values for each filter type from the filtered data
    const relevantApplications = [...new Set(relevantData.map(item => item.applicationName))];
    const relevantServerTypes = [...new Set(relevantData.map(item => item.serverType))];
    const relevantOsTypes = [...new Set(relevantData.map(item => item.osType))];
    const relevantEnvironments = [...new Set(relevantData.map(item => item.environment))];
    const relevantRegions = [...new Set(relevantData.map(item => item.region))];
    const relevantDbEngines = [...new Set(relevantData.map(item => item.dbEngineVersion).filter(Boolean))];
    const relevantOrchestrations = [...new Set(relevantData.map(item => item.orchestrationPlatform).filter(Boolean))];
    
    // Update application options - disable options that are not in the relevant set
    setApplicationOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantApplications.includes(option.value) && !selectedApplications.some(sel => sel.value === option.value)
    })));
    
    // Update server type options
    setServerTypeOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantServerTypes.includes(option.value) && !selectedServerTypes.some(sel => sel.value === option.value)
    })));
    
    // Update OS type options
    setOsTypeOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantOsTypes.includes(option.value) && !selectedOsTypes.some(sel => sel.value === option.value)
    })));
    
    // Update environment options
    setEnvironmentOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantEnvironments.includes(option.value) && !selectedEnvironments.some(sel => sel.value === option.value)
    })));
    
    // Update region options
    setRegionOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantRegions.includes(option.value) && !selectedRegions.some(sel => sel.value === option.value)
    })));
    
    // Update DB engine options
    setDbEngineOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantDbEngines.includes(option.value) && !selectedDbEngines.some(sel => sel.value === option.value)
    })));
    
    // Update orchestration options
    setOrchestrationOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantOrchestrations.includes(option.value) && !selectedOrchestrations.some(sel => sel.value === option.value)
    })));
  }, [filteredData, selectedApplications, selectedServerTypes, selectedOsTypes, selectedEnvironments, selectedRegions, selectedDbEngines, selectedOrchestrations]);
  
  // Call updateFilterOptions whenever filteredData changes
  useEffect(() => {
    updateFilterOptions();
  }, [filteredData, updateFilterOptions]);

  const extractFilterOptions = (data) => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('No data available for extracting filter options');
      return;
    }
    
    // Extract unique application names
    const appNames = [...new Set(data.map(item => item?.applicationName).filter(Boolean))];
    setApplicationOptions(appNames.map(name => ({ label: name, value: name, disabled: false })));
    
    // Extract unique server types
    const serverTypes = [...new Set(data.map(item => item?.serverType).filter(Boolean))];
    setServerTypeOptions(serverTypes.map(type => ({ label: type, value: type, disabled: false })));
    
    // Extract unique OS types
    const osTypes = [...new Set(data.map(item => item?.osType).filter(Boolean))];
    setOsTypeOptions(osTypes.map(type => ({ label: type, value: type, disabled: false })));
    
    // Extract unique environments
    const environments = [...new Set(data.map(item => item?.environment).filter(Boolean))];
    setEnvironmentOptions(environments.map(env => ({ label: env, value: env, disabled: false })));
    
    // Extract unique regions
    const regions = [...new Set(data.map(item => item?.region).filter(Boolean))];
    setRegionOptions(regions.map(region => ({ label: region, value: region, disabled: false })));
    
    // Extract unique DB engines
    const dbEngines = [...new Set(data.map(item => item?.dbEngineVersion).filter(Boolean))];
    setDbEngineOptions(dbEngines.map(engine => ({ label: engine, value: engine, disabled: false })));
    
    // Extract unique orchestration platforms
    const orchestrations = [...new Set(data.map(item => item?.orchestrationPlatform).filter(Boolean))];
    setOrchestrationOptions(orchestrations.map(platform => ({ label: platform, value: platform, disabled: false })));
  };
  
  // Save filters to localStorage whenever they change (project-specific)
  useEffect(() => {
    localStorage.setItem(`infrastructureFilters_${projectId}_applications`, JSON.stringify(selectedApplications));
  }, [selectedApplications, projectId]);

  useEffect(() => {
    localStorage.setItem(`infrastructureFilters_${projectId}_serverTypes`, JSON.stringify(selectedServerTypes));
  }, [selectedServerTypes, projectId]);

  useEffect(() => {
    localStorage.setItem(`infrastructureFilters_${projectId}_osTypes`, JSON.stringify(selectedOsTypes));
  }, [selectedOsTypes, projectId]);

  useEffect(() => {
    localStorage.setItem(`infrastructureFilters_${projectId}_environments`, JSON.stringify(selectedEnvironments));
  }, [selectedEnvironments, projectId]);

  useEffect(() => {
    localStorage.setItem(`infrastructureFilters_${projectId}_regions`, JSON.stringify(selectedRegions));
  }, [selectedRegions, projectId]);

  useEffect(() => {
    localStorage.setItem(`infrastructureFilters_${projectId}_dbEngines`, JSON.stringify(selectedDbEngines));
  }, [selectedDbEngines, projectId]);

  useEffect(() => {
    localStorage.setItem(`infrastructureFilters_${projectId}_orchestrations`, JSON.stringify(selectedOrchestrations));
  }, [selectedOrchestrations, projectId]);

  // Apply filters when selections change
  useEffect(() => {
    if (infrastructureData.length === 0) return;
    
    let result = [...infrastructureData];
    
    // Filter by selected applications
    if (selectedApplications.length > 0) {
      const selectedAppValues = selectedApplications.map(app => app.value);
      result = result.filter(item => selectedAppValues.includes(item.applicationName));
    }
    
    // Filter by selected server types
    if (selectedServerTypes.length > 0) {
      const selectedTypeValues = selectedServerTypes.map(type => type.value);
      result = result.filter(item => selectedTypeValues.includes(item.serverType));
    }
    
    // Filter by selected OS types
    if (selectedOsTypes.length > 0) {
      const selectedOsValues = selectedOsTypes.map(os => os.value);
      result = result.filter(item => selectedOsValues.includes(item.osType));
    }
    
    // Filter by selected environments
    if (selectedEnvironments.length > 0) {
      const selectedEnvValues = selectedEnvironments.map(env => env.value);
      result = result.filter(item => selectedEnvValues.includes(item.environment));
    }
    
    // Filter by selected regions
    if (selectedRegions.length > 0) {
      const selectedRegionValues = selectedRegions.map(region => region.value);
      result = result.filter(item => selectedRegionValues.includes(item.region));
    }
    
    // Filter by selected DB engines
    if (selectedDbEngines.length > 0) {
      const selectedEngineValues = selectedDbEngines.map(engine => engine.value);
      result = result.filter(item => selectedEngineValues.includes(item.dbEngineVersion));
    }
    
    // Filter by selected orchestration platforms
    if (selectedOrchestrations.length > 0) {
      const selectedOrchValues = selectedOrchestrations.map(orch => orch.value);
      result = result.filter(item => selectedOrchValues.includes(item.orchestrationPlatform));
    }
    
    setFilteredData(result);
    processDataForCharts(result);
  }, [
    infrastructureData,
    selectedApplications,
    selectedServerTypes,
    selectedOsTypes,
    selectedEnvironments,
    selectedRegions,
    selectedDbEngines,
    selectedOrchestrations
  ]);
  
  // Handle clearing all filters
  const handleClearAllFilters = () => {
    setSelectedApplications([]);
    setSelectedServerTypes([]);
    setSelectedOsTypes([]);
    setSelectedEnvironments([]);
    setSelectedRegions([]);
    setSelectedDbEngines([]);
    setSelectedOrchestrations([]);
    // Clear from localStorage (project-specific)
    localStorage.removeItem(`infrastructureFilters_${projectId}_applications`);
    localStorage.removeItem(`infrastructureFilters_${projectId}_serverTypes`);
    localStorage.removeItem(`infrastructureFilters_${projectId}_osTypes`);
    localStorage.removeItem(`infrastructureFilters_${projectId}_environments`);
    localStorage.removeItem(`infrastructureFilters_${projectId}_regions`);
    localStorage.removeItem(`infrastructureFilters_${projectId}_dbEngines`);
    localStorage.removeItem(`infrastructureFilters_${projectId}_orchestrations`);
  };
  // Process data for various charts
  const processDataForCharts = (data) => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('No data available for processing charts');
      
      // Set empty data for all charts
      setResourcesPerAppData([]);
      setServerTypeDistributionData([]);
      setOsTypeDistributionData([]);
      setEnvironmentDistributionData([]);
      setRegionDistributionData([]);
      setDbEngineDistributionData([]);
      setOrchestrationDistributionData([]);
      
      // Set totals to 0
      setResourcesTotal(0);
      setServerTypeTotal(0);
      setOsTypeTotal(0);
      setEnvironmentTotal(0);
      setRegionTotal(0);
      setDbEngineTotal(0);
      setOrchestrationTotal(0);
      
      return;
    }
    
    // 1. Resources per Application
    const appResourcesCount = {};
    data.forEach(item => {
      const appName = item?.applicationName;
      if (!appName) return;
      
      if (!appResourcesCount[appName]) {
        appResourcesCount[appName] = 0;
      }
      appResourcesCount[appName]++;
    });
    
    const resourcesPerApp = Object.entries(appResourcesCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    resourcesPerApp.sort((a, b) => b.value - a.value);
    
    // Calculate total resources
    const totalResources = resourcesPerApp.reduce((sum, item) => sum + item.value, 0);
    setResourcesTotal(totalResources);
    
    // Limit to top 10 if there are more than 10 applications
    const topResourcesPerApp = resourcesPerApp.slice(0, 10);
    setResourcesPerAppData(topResourcesPerApp);
    
    // 2. Server Type Distribution
    const serverTypeCount = {};
    data.forEach(item => {
      const serverType = item?.serverType;
      if (!serverType) return;
      
      if (!serverTypeCount[serverType]) {
        serverTypeCount[serverType] = 0;
      }
      serverTypeCount[serverType]++;
    });
    
    const serverTypeDistribution = Object.entries(serverTypeCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    serverTypeDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total server types
    const totalServerTypes = serverTypeDistribution.reduce((sum, item) => sum + item.value, 0);
    setServerTypeTotal(totalServerTypes);
    
    setServerTypeDistributionData(serverTypeDistribution);
    
    // 3. OS Type Distribution
    const osTypeCount = {};
    data.forEach(item => {
      const osType = item?.osType;
      if (!osType) return;
      
      if (!osTypeCount[osType]) {
        osTypeCount[osType] = 0;
      }
      osTypeCount[osType]++;
    });
    
    const osTypeDistribution = Object.entries(osTypeCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    osTypeDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total OS types
    const totalOsTypes = osTypeDistribution.reduce((sum, item) => sum + item.value, 0);
    setOsTypeTotal(totalOsTypes);
    
    setOsTypeDistributionData(osTypeDistribution);
    
    // 4. Environment Distribution
    const environmentCount = {};
    data.forEach(item => {
      const environment = item?.environment;
      if (!environment) return;
      
      if (!environmentCount[environment]) {
        environmentCount[environment] = 0;
      }
      environmentCount[environment]++;
    });
    
    const environmentDistribution = Object.entries(environmentCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    environmentDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total environments
    const totalEnvironments = environmentDistribution.reduce((sum, item) => sum + item.value, 0);
    setEnvironmentTotal(totalEnvironments);
    
    setEnvironmentDistributionData(environmentDistribution);
    
    // 5. Region Distribution
    const regionCount = {};
    data.forEach(item => {
      const region = item?.region;
      if (!region) return;
      
      if (!regionCount[region]) {
        regionCount[region] = 0;
      }
      regionCount[region]++;
    });
    
    const regionDistribution = Object.entries(regionCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    regionDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total regions
    const totalRegions = regionDistribution.reduce((sum, item) => sum + item.value, 0);
    setRegionTotal(totalRegions);
    
    setRegionDistributionData(regionDistribution);
    
    // 6. DB Engine Distribution
    const dbEngineCount = {};
    data.forEach(item => {
      const dbEngineVersion = item?.dbEngineVersion;
      if (!dbEngineVersion) return;
      
      if (!dbEngineCount[dbEngineVersion]) {
        dbEngineCount[dbEngineVersion] = 0;
      }
      dbEngineCount[dbEngineVersion]++;
    });
    
    const dbEngineDistribution = Object.entries(dbEngineCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    dbEngineDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total DB engines
    const totalDbEngines = dbEngineDistribution.reduce((sum, item) => sum + item.value, 0);
    setDbEngineTotal(totalDbEngines);
    
    setDbEngineDistributionData(dbEngineDistribution);
    
    // 7. Orchestration Platform Distribution
    const orchestrationCount = {};
    data.forEach(item => {
      const orchestrationPlatform = item?.orchestrationPlatform;
      if (!orchestrationPlatform) return;
      
      if (!orchestrationCount[orchestrationPlatform]) {
        orchestrationCount[orchestrationPlatform] = 0;
      }
      orchestrationCount[orchestrationPlatform]++;
    });
    
    const orchestrationDistribution = Object.entries(orchestrationCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    orchestrationDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total orchestration platforms
    const totalOrchestrations = orchestrationDistribution.reduce((sum, item) => sum + item.value, 0);
    setOrchestrationTotal(totalOrchestrations);
    
    setOrchestrationDistributionData(orchestrationDistribution);
  };
  // Get environment status for color coding
  const getEnvironmentStatus = (environment) => {
    switch (environment) {
      case 'Production':
        return 'error'; // Red for production
      case 'Staging':
        return 'warning'; // Yellow for staging
      case 'Development':
        return 'success'; // Green for development
      default:
        return 'info';
    }
  };

  // Find modernization candidates
  const findModernizationCandidates = () => {
    if (!filteredData.length) return [];
    
    const candidates = [];
    
    // Legacy OS versions
    const legacyOSVersions = ['Windows Server 2016', 'RHEL 7', 'Ubuntu 18.04'];
    const legacyOSCandidates = filteredData.filter(item => 
      legacyOSVersions.includes(item.osVersion)
    );
    
    // Group by application
    const legacyOSByApp = {};
    legacyOSCandidates.forEach(item => {
      if (!legacyOSByApp[item.applicationName]) {
        legacyOSByApp[item.applicationName] = [];
      }
      legacyOSByApp[item.applicationName].push(item);
    });
    
    // Add to candidates list
    Object.entries(legacyOSByApp).forEach(([appName, resources]) => {
      candidates.push({
        applicationName: appName,
        type: 'OS Upgrade',
        count: resources.length,
        details: `${resources.length} resources with legacy OS versions`,
        priority: 'High'
      });
    });
    
    // Containerization candidates (no orchestration platform)
    const containerizationCandidates = filteredData.filter(item => 
      !item.orchestrationPlatform && 
      (item.serverType.includes('t3') || item.serverType.includes('m5'))
    );
    
    // Group by application
    const containerizationByApp = {};
    containerizationCandidates.forEach(item => {
      if (!containerizationByApp[item.applicationName]) {
        containerizationByApp[item.applicationName] = [];
      }
      containerizationByApp[item.applicationName].push(item);
    });
    
    // Add to candidates list
    Object.entries(containerizationByApp).forEach(([appName, resources]) => {
      candidates.push({
        applicationName: appName,
        type: 'Containerization',
        count: resources.length,
        details: `${resources.length} resources suitable for containerization`,
        priority: resources.length > 3 ? 'High' : 'Medium'
      });
    });
    
    // Database upgrade candidates
    const legacyDBVersions = ['MySQL 5.7', 'PostgreSQL 12', 'MariaDB 10.5'];
    const dbUpgradeCandidates = filteredData.filter(item => 
      legacyDBVersions.includes(item.dbEngineVersion)
    );
    
    // Group by application
    const dbUpgradeByApp = {};
    dbUpgradeCandidates.forEach(item => {
      if (!dbUpgradeByApp[item.applicationName]) {
        dbUpgradeByApp[item.applicationName] = [];
      }
      dbUpgradeByApp[item.applicationName].push(item);
    });
    
    // Add to candidates list
    Object.entries(dbUpgradeByApp).forEach(([appName, resources]) => {
      candidates.push({
        applicationName: appName,
        type: 'Database Upgrade',
        count: resources.length,
        details: `${resources.length} databases with legacy versions`,
        priority: 'Medium'
      });
    });
    
    return candidates;
  };

  // Calculate modernization candidates
  const modernizationCandidates = findModernizationCandidates();
  
  return (
    <Layout
      activeHref="/insights/infrastructure"
      infoContent={
        <Box padding="l">
          <InfrastructureAnalysisInfoContent />
        </Box>
      }
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
    >
      <ContentLayout
        header={
          <Header variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button 
                  iconName="download"
                  onClick={() => navigateToExportWithCategory('infrastructure-analysis', navigate)}
                >
                  {t('pages:infrastructure.export')}
                </Button>
                <Button
                  iconName="refresh"
                  loading={loading}
                  onClick={() => {
                    setError(null);
                    setRetryCount(retryCount + 1);
                  }}
                >
                  {t('pages:infrastructure.refresh')}
                </Button>
              </SpaceBetween>
            }
          >
            {t('pages:infrastructure.title')}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {/* Show missing data alert if required data sources are not available */}
          {!checkingData && !hasData && (
            <MissingDataAlert missingDataSources={missingDataSources} />
          )}
          
          <div style={{ position: 'relative' }}>
            {/* Semi-transparent overlay when data is missing */}
            {!checkingData && !hasData && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                zIndex: 10,
                pointerEvents: 'all',
                cursor: 'not-allowed'
              }} />
            )}
            
          <SpaceBetween size="l">
          {/* Filters Section */}
          <Container>
            <SpaceBetween size="l">
              <Header 
                variant="h2"
                actions={
                  <Button onClick={handleClearAllFilters}>{t('pages:infrastructure.clearAllFilters')}</Button>
                }
              >
                {t('pages:infrastructure.filters')}
              </Header>
              
              {error && (
                <Alert
                  type="error"
                  header={t('pages:infrastructure.errorFetchingInfrastructureData')}
                  dismissible
                  onDismiss={() => setError(null)}
                  action={
                    <Button 
                      onClick={() => {
                        setError(null);
                        setRetryCount(retryCount + 1);
                      }}
                    >
                      {t('pages:infrastructure.retry')}
                    </Button>
                  }
                >
                  {error}
                  <Box variant="p" padding={{ top: 's' }}>
                    {t('pages:infrastructure.networkConnectionError')}
                  </Box>
                </Alert>
              )}
              
              <Grid
                gridDefinition={[
                  { colspan: { default: 12, xxs: 6, m: 4 } },
                  { colspan: { default: 12, xxs: 6, m: 4 } },
                  { colspan: { default: 12, xxs: 6, m: 4 } },
                  { colspan: { default: 12, xxs: 6, m: 4 } },
                  { colspan: { default: 12, xxs: 6, m: 4 } },
                  { colspan: { default: 12, xxs: 6, m: 4 } }
                ]}
              >
                {/* Application Filter */}
                <FormField label={t('pages:infrastructure.applications')}>
                  <Multiselect
                    selectedOptions={selectedApplications}
                    onChange={({ detail }) => setSelectedApplications(detail.selectedOptions)}
                    options={applicationOptions}
                    filteringType="auto"
                    placeholder={t('pages:infrastructure.selectApplications')}
                    deselectAriaLabel={option => `Remove ${option.label}`}
                    tokenLimit={3}
                    expandToViewport
                    i18nStrings={{
                      limitShowMore: t('pages:infrastructure.showMore'),
                      limitShowFewer: t('pages:infrastructure.showFewer'),
                      filteringAriaLabel: t('pages:infrastructure.findApplications'),
                      filteringPlaceholder: t('pages:infrastructure.findApplications'),
                      filteringClearAriaLabel: t('pages:infrastructure.clear'),
                      selectionCount: count => `${count} ${count === 1 ? t('pages:infrastructure.application') : t('pages:infrastructure.applications')} ${t('pages:infrastructure.selected')}`
                    }}
                  />
                </FormField>
                
                {/* Server Type Filter */}
                <FormField label={t('pages:infrastructure.serverTypes')}>
                  <Multiselect
                    selectedOptions={selectedServerTypes}
                    onChange={({ detail }) => setSelectedServerTypes(detail.selectedOptions)}
                    options={serverTypeOptions}
                    filteringType="auto"
                    placeholder={t('pages:infrastructure.selectServerTypes')}
                    deselectAriaLabel={option => `Remove ${option.label}`}
                    tokenLimit={3}
                    expandToViewport
                    i18nStrings={{
                      limitShowMore: t('pages:infrastructure.showMore'),
                      limitShowFewer: t('pages:infrastructure.showFewer'),
                      filteringAriaLabel: t('pages:infrastructure.findServerTypes'),
                      filteringPlaceholder: t('pages:infrastructure.findServerTypes'),
                      filteringClearAriaLabel: t('pages:infrastructure.clear'),
                      selectionCount: count => `${count} ${count === 1 ? t('pages:infrastructure.serverType') : t('pages:infrastructure.serverTypes')} ${t('pages:infrastructure.selected')}`
                    }}
                  />
                </FormField>
                
                {/* OS Type Filter */}
                <FormField label={t('pages:infrastructure.osTypes')}>
                  <Multiselect
                    selectedOptions={selectedOsTypes}
                    onChange={({ detail }) => setSelectedOsTypes(detail.selectedOptions)}
                    options={osTypeOptions}
                    filteringType="auto"
                    placeholder={t('pages:infrastructure.selectOsTypes')}
                    deselectAriaLabel={option => `Remove ${option.label}`}
                    tokenLimit={3}
                    expandToViewport
                    i18nStrings={{
                      limitShowMore: t('pages:infrastructure.showMore'),
                      limitShowFewer: t('pages:infrastructure.showFewer'),
                      filteringAriaLabel: t('pages:infrastructure.findOsTypes'),
                      filteringPlaceholder: t('pages:infrastructure.findOsTypes'),
                      filteringClearAriaLabel: t('pages:infrastructure.clear'),
                      selectionCount: count => `${count} ${count === 1 ? t('pages:infrastructure.osType') : t('pages:infrastructure.osTypes')} ${t('pages:infrastructure.selected')}`
                    }}
                  />
                </FormField>
                
                {/* Environment Filter */}
                <FormField label={t('pages:infrastructure.environments')}>
                  <Multiselect
                    selectedOptions={selectedEnvironments}
                    onChange={({ detail }) => setSelectedEnvironments(detail.selectedOptions)}
                    options={environmentOptions}
                    filteringType="auto"
                    placeholder={t('pages:infrastructure.selectEnvironments')}
                    deselectAriaLabel={option => `Remove ${option.label}`}
                    tokenLimit={3}
                    expandToViewport
                    i18nStrings={{
                      limitShowMore: t('pages:infrastructure.showMore'),
                      limitShowFewer: t('pages:infrastructure.showFewer'),
                      filteringAriaLabel: t('pages:infrastructure.findEnvironments'),
                      filteringPlaceholder: t('pages:infrastructure.findEnvironments'),
                      filteringClearAriaLabel: t('pages:infrastructure.clear'),
                      selectionCount: count => `${count} ${count === 1 ? t('pages:infrastructure.environment') : t('pages:infrastructure.environments')} ${t('pages:infrastructure.selected')}`
                    }}
                  />
                </FormField>
                
                {/* Region Filter */}
                <FormField label={t('pages:infrastructure.regions')}>
                  <Multiselect
                    selectedOptions={selectedRegions}
                    onChange={({ detail }) => setSelectedRegions(detail.selectedOptions)}
                    options={regionOptions}
                    filteringType="auto"
                    placeholder={t('pages:infrastructure.selectRegions')}
                    deselectAriaLabel={option => `Remove ${option.label}`}
                    tokenLimit={3}
                    expandToViewport
                    i18nStrings={{
                      limitShowMore: t('pages:infrastructure.showMore'),
                      limitShowFewer: t('pages:infrastructure.showFewer'),
                      filteringAriaLabel: t('pages:infrastructure.findRegions'),
                      filteringPlaceholder: t('pages:infrastructure.findRegions'),
                      filteringClearAriaLabel: t('pages:infrastructure.clear'),
                      selectionCount: count => `${count} ${count === 1 ? t('pages:infrastructure.region') : t('pages:infrastructure.regions')} ${t('pages:infrastructure.selected')}`
                    }}
                  />
                </FormField>
                
                {/* DB Engine Filter */}
                <FormField label={t('pages:infrastructure.dbEngines')}>
                  <Multiselect
                    selectedOptions={selectedDbEngines}
                    onChange={({ detail }) => setSelectedDbEngines(detail.selectedOptions)}
                    options={dbEngineOptions}
                    filteringType="auto"
                    placeholder={t('pages:infrastructure.selectDbEngines')}
                    deselectAriaLabel={option => `Remove ${option.label}`}
                    tokenLimit={3}
                    expandToViewport
                    i18nStrings={{
                      limitShowMore: t('pages:infrastructure.showMore'),
                      limitShowFewer: t('pages:infrastructure.showFewer'),
                      filteringAriaLabel: t('pages:infrastructure.findDbEngines'),
                      filteringPlaceholder: t('pages:infrastructure.findDbEngines'),
                      filteringClearAriaLabel: t('pages:infrastructure.clear'),
                      selectionCount: count => `${count} ${count === 1 ? t('pages:infrastructure.dbEngine') : t('pages:infrastructure.dbEngines')} ${t('pages:infrastructure.selected')}`
                    }}
                  />
                </FormField>
              </Grid>
            </SpaceBetween>
          </Container>
          
          {/* Row 1: Resources per Application and Server Type Distribution */}
          <Grid
            gridDefinition={[
              { colspan: { default: 12, xxs: 6 } },
              { colspan: { default: 12, xxs: 6 } }
            ]}
          >
            {/* Container 1: Resources per Application Chart */}
            <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
              <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {loading ? (
                  <Box textAlign="center" padding="xl">
                    <SpaceBetween size="m" alignItems="center">
                      <Spinner size="large" />
                      <Box variant="p">{t('pages:infrastructure.loadingResourcesChart')}</Box>
                    </SpaceBetween>
                  </Box>
                ) : resourcesPerAppData.length === 0 ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:infrastructure.noDataAvailable')}
                  </Box>
                ) : (
                  <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                      <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:infrastructure.resourcesPerApplication')} ({resourcesTotal})</h3>
                    </div>
                    <div ref={barChartContainerRef} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, width: '100%', height: 'calc(100% - 40px)' }}>
                      <BarChart
                        data={resourcesPerAppData}
                        width={barChartWidth}
                        height={300}
                        margin={{ top: 10, right: 20, bottom: 10, left: 40 }}
                        showLegend={false}
                        showAxis={false}
                        showValues={true}
                        valuesPosition="inside"
                        colorPalette="bright"
                        xAxisLabel=""
                        yAxisLabel=""
                      />
                    </div>
                  </Box>
                )}
              </Box>
            </Container>
            
            {/* Container 2: Server Type Distribution Chart */}
            <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
              <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {loading ? (
                  <Box textAlign="center" padding="xl">
                    <SpaceBetween size="m" alignItems="center">
                      <Spinner size="large" />
                      <Box variant="p">{t('pages:infrastructure.loadingServerTypeChart')}</Box>
                    </SpaceBetween>
                  </Box>
                ) : serverTypeDistributionData.length === 0 ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:infrastructure.noDataAvailable')}
                  </Box>
                ) : (
                  <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                      <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:infrastructure.serverTypeDistribution')} ({serverTypeTotal})</h3>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: 'calc(100% - 40px)' }}>
                      <DoughnutChart
                        data={serverTypeDistributionData}
                        width={300}
                        height={300}
                        innerRadius={60}
                        outerRadius={120}
                        showLegend={false}
                        showValues={true}
                        colorPalette="bright"
                        totalDisplay="none"
                      />
                    </div>
                  </Box>
                )}
              </Box>
            </Container>
          </Grid>
          
          {/* Row 2: OS Type Distribution and Environment Distribution */}
          <Grid
            gridDefinition={[
              { colspan: { default: 12, xxs: 6 } },
              { colspan: { default: 12, xxs: 6 } }
            ]}
          >
            {/* Container 3: OS Type Distribution Chart */}
            <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
              <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {loading ? (
                  <Box textAlign="center" padding="xl">
                    <SpaceBetween size="m" alignItems="center">
                      <Spinner size="large" />
                      <Box variant="p">{t('pages:infrastructure.loadingOsTypeChart')}</Box>
                    </SpaceBetween>
                  </Box>
                ) : osTypeDistributionData.length === 0 ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:infrastructure.noDataAvailable')}
                  </Box>
                ) : (
                  <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                      <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:infrastructure.osTypeDistribution')} ({osTypeTotal})</h3>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: 'calc(100% - 40px)' }}>
                      <DoughnutChart
                        data={osTypeDistributionData}
                        width={300}
                        height={300}
                        innerRadius={60}
                        outerRadius={120}
                        showLegend={false}
                        showValues={true}
                        colorPalette="bright"
                        totalDisplay="none"
                      />
                    </div>
                  </Box>
                )}
              </Box>
            </Container>
            
            {/* Container 4: Environment Distribution Chart */}
            <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
              <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {loading ? (
                  <Box textAlign="center" padding="xl">
                    <SpaceBetween size="m" alignItems="center">
                      <Spinner size="large" />
                      <Box variant="p">{t('pages:infrastructure.loadingEnvironmentChart')}</Box>
                    </SpaceBetween>
                  </Box>
                ) : environmentDistributionData.length === 0 ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:infrastructure.noDataAvailable')}
                  </Box>
                ) : (
                  <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                      <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:infrastructure.environmentDistribution')} ({environmentTotal})</h3>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: 'calc(100% - 40px)' }}>
                      <DoughnutChart
                        data={environmentDistributionData}
                        width={300}
                        height={300}
                        innerRadius={60}
                        outerRadius={120}
                        showLegend={false}
                        showValues={true}
                        colorPalette="bright"
                        totalDisplay="none"
                      />
                    </div>
                  </Box>
                )}
              </Box>
            </Container>
          </Grid>
          
          {/* Row 3: Region Distribution and DB Engine Distribution */}
          <Grid
            gridDefinition={[
              { colspan: { default: 12, xxs: 6 } },
              { colspan: { default: 12, xxs: 6 } }
            ]}
          >
            {/* Container 5: Region Distribution Chart */}
            <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
              <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {loading ? (
                  <Box textAlign="center" padding="xl">
                    <SpaceBetween size="m" alignItems="center">
                      <Spinner size="large" />
                      <Box variant="p">{t('pages:infrastructure.loadingRegionChart')}</Box>
                    </SpaceBetween>
                  </Box>
                ) : regionDistributionData.length === 0 ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:infrastructure.noDataAvailable')}
                  </Box>
                ) : (
                  <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                      <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:infrastructure.regionDistribution')} ({regionTotal})</h3>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: 'calc(100% - 40px)' }}>
                      <DoughnutChart
                        data={regionDistributionData}
                        width={300}
                        height={300}
                        innerRadius={60}
                        outerRadius={120}
                        showLegend={false}
                        showValues={true}
                        colorPalette="bright"
                        totalDisplay="none"
                      />
                    </div>
                  </Box>
                )}
              </Box>
            </Container>
            
            {/* Container 6: DB Engine Distribution Chart */}
            <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
              <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {loading ? (
                  <Box textAlign="center" padding="xl">
                    <SpaceBetween size="m" alignItems="center">
                      <Spinner size="large" />
                      <Box variant="p">{t('pages:infrastructure.loadingDbEngineChart')}</Box>
                    </SpaceBetween>
                  </Box>
                ) : dbEngineDistributionData.length === 0 ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:infrastructure.noDataAvailable')}
                  </Box>
                ) : (
                  <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                      <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:infrastructure.dbEngineDistribution')} ({dbEngineTotal})</h3>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: 'calc(100% - 40px)' }}>
                      <DoughnutChart
                        data={dbEngineDistributionData}
                        width={300}
                        height={300}
                        innerRadius={60}
                        outerRadius={120}
                        showLegend={false}
                        showValues={true}
                        colorPalette="bright"
                        totalDisplay="none"
                      />
                    </div>
                  </Box>
                )}
              </Box>
            </Container>
          </Grid>
          
          {/* Summary Section */}
          <Container>
            <SpaceBetween size="l">
              <Header variant="h2" textAlign="center">
                {t('pages:infrastructure.summary')}
              </Header>
              
              <Box padding="l">
                {loading ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:infrastructure.loadingSummaryData')}
                  </Box>
                ) : filteredData.length === 0 ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:infrastructure.noDataForSelectedFilters')}
                  </Box>
                ) : (
                  <SpaceBetween size="l">
                    <Header variant="h3" textAlign="center">{t('pages:infrastructure.keyMetrics')}</Header>
                    
                    <Grid
                      gridDefinition={[
                        { colspan: { default: 12, xxs: 6, m: 3 } },
                        { colspan: { default: 12, xxs: 6, m: 3 } },
                        { colspan: { default: 12, xxs: 6, m: 3 } },
                        { colspan: { default: 12, xxs: 6, m: 3 } }
                      ]}
                    >
                      <Box variant="awsui-key-label">
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                          {t('pages:infrastructure.totalApplications')}
                        </div>
                        <div style={{ fontSize: '24px', color: '#0073bb' }}>
                          {[...new Set(filteredData.map(item => item.applicationName))].length}
                        </div>
                      </Box>
                      
                      <Box variant="awsui-key-label">
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                          {t('pages:infrastructure.totalResources')}
                        </div>
                        <div style={{ fontSize: '24px', color: '#0073bb' }}>
                          {filteredData.length}
                        </div>
                      </Box>
                      
                      <Box variant="awsui-key-label">
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                          {t('pages:infrastructure.resourcesPerApplicationAvg')}
                        </div>
                        <div style={{ fontSize: '24px', color: '#0073bb' }}>
                          {(filteredData.length / Math.max([...new Set(filteredData.map(item => item.applicationName))].length, 1)).toFixed(1)}
                        </div>
                      </Box>
                      
                      <Box variant="awsui-key-label">
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                          {t('pages:infrastructure.productionResources')}
                        </div>
                        <div style={{ fontSize: '24px', color: '#0073bb' }}>
                          {filteredData.filter(item => item.environment === 'Production').length}
                        </div>
                      </Box>
                    </Grid>
                    
                    <Header variant="h3">{t('pages:infrastructure.infrastructureDistribution')}</Header>
                    
                    <Grid
                      gridDefinition={[
                        { colspan: { default: 12, xxs: 6, m: 3 } },
                        { colspan: { default: 12, xxs: 6, m: 3 } },
                        { colspan: { default: 12, xxs: 6, m: 3 } },
                        { colspan: { default: 12, xxs: 6, m: 3 } }
                      ]}
                    >
                      <Box variant="awsui-key-label">
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                          {t('pages:infrastructure.uniqueServerTypes')}
                        </div>
                        <div style={{ fontSize: '24px', color: '#0073bb' }}>
                          {[...new Set(filteredData.map(item => item.serverType))].length}
                        </div>
                      </Box>
                      
                      <Box variant="awsui-key-label">
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                          {t('pages:infrastructure.uniqueOsTypes')}
                        </div>
                        <div style={{ fontSize: '24px', color: '#0073bb' }}>
                          {[...new Set(filteredData.map(item => item.osType))].length}
                        </div>
                      </Box>
                      
                      <Box variant="awsui-key-label">
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                          {t('pages:infrastructure.uniqueDbEngines')}
                        </div>
                        <div style={{ fontSize: '24px', color: '#0073bb' }}>
                          {[...new Set(filteredData.map(item => item.dbEngineVersion).filter(Boolean))].length}
                        </div>
                      </Box>
                      
                      <Box variant="awsui-key-label">
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                          {t('pages:infrastructure.containerizedResources')}
                        </div>
                        <div style={{ fontSize: '24px', color: '#0073bb' }}>
                          {filteredData.filter(item => item.orchestrationPlatform).length}
                        </div>
                      </Box>
                    </Grid>
                  </SpaceBetween>
                )}
              </Box>
            </SpaceBetween>
          </Container>
          </SpaceBetween>
          </div>
        </SpaceBetween>
      </ContentLayout>
    </Layout>
  );
};

export default InfrastructureAnalysisPage;
