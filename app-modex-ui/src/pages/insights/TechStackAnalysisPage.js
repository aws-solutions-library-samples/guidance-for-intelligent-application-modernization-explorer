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
  Alert,
  Spinner
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { navigateToExportWithCategory } from '../../utils/exportNavigationUtils';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import BarChart from '../../components/charts/BarChart';
import DoughnutChart from '../../components/charts/DoughnutChart';
import TechStackAnalysisInfoContent from '../../components/info/TechStackAnalysisInfoContent';
import MissingDataAlert from '../../components/MissingDataAlert';

// Hooks
import useDataSourceCheck from '../../hooks/useDataSourceCheck';

// API services
import { getTechStackData } from '../../services/athenaQueryService';

/**
 * Tech Stack Analysis Page Component
 * 
 * This page displays various charts and visualizations for analyzing the technology stack.
 */
const TechStackAnalysisPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  
  // Debug: Test if we can access the translation directly
  console.log('Debug: Testing translation access');
  console.log('t("pages:techStack.title"):', t('pages:techStack.title'));
  console.log('t("techStack.title", { ns: "pages" }):', t('techStack.title', { ns: 'pages' }));
  console.log('Direct access test:', t('pages:techStack.clear'));
  console.log('Testing quotes - single:', t('pages:techStack.title'));
  console.log('Testing quotes - double:', t("pages:techStack.title"));
  
  // Check if required data sources exist
  const { hasData, loading: checkingData, missingDataSources } = useDataSourceCheck(['applications-portfolio', 'applications-tech-stack']);
  
  const [toolsOpen, setToolsOpen] = useState(false);
  const [techStackData, setTechStackData] = useState([]);
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
  const [componentsPerAppData, setComponentsPerAppData] = useState([]);
  const [runtimeDistributionData, setRuntimeDistributionData] = useState([]);
  const [frameworkDistributionData, setFrameworkDistributionData] = useState([]);
  const [databaseDistributionData, setDatabaseDistributionData] = useState([]);
  const [integrationDistributionData, setIntegrationDistributionData] = useState([]);
  const [storageDistributionData, setStorageDistributionData] = useState([]);
  
  // Chart totals
  const [componentsTotal, setComponentsTotal] = useState(0);
  const [runtimeTotal, setRuntimeTotal] = useState(0);
  const [frameworkTotal, setFrameworkTotal] = useState(0);
  const [databaseTotal, setDatabaseTotal] = useState(0);
  const [integrationTotal, setIntegrationTotal] = useState(0);
  const [storageTotal, setStorageTotal] = useState(0);
  
  // Base filter options (unfiltered)
  const [applicationOptions, setApplicationOptions] = useState([]);
  const [runtimeOptions, setRuntimeOptions] = useState([]);
  const [frameworkOptions, setFrameworkOptions] = useState([]);
  const [databaseOptions, setDatabaseOptions] = useState([]);
  const [integrationOptions, setIntegrationOptions] = useState([]);
  const [storageOptions, setStorageOptions] = useState([]);
  
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
    const saved = localStorage.getItem(`techStackFilters_${projectId}_applications`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedRuntimes, setSelectedRuntimes] = useState(() => {
    const saved = localStorage.getItem(`techStackFilters_${projectId}_runtimes`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedFrameworks, setSelectedFrameworks] = useState(() => {
    const saved = localStorage.getItem(`techStackFilters_${projectId}_frameworks`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedDatabases, setSelectedDatabases] = useState(() => {
    const saved = localStorage.getItem(`techStackFilters_${projectId}_databases`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedIntegrations, setSelectedIntegrations] = useState(() => {
    const saved = localStorage.getItem(`techStackFilters_${projectId}_integrations`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedStorages, setSelectedStorages] = useState(() => {
    const saved = localStorage.getItem(`techStackFilters_${projectId}_storages`);
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
    let resizeObserver;
    try {
      resizeObserver = new ResizeObserver((entries) => {
        try {
          updateBarChartWidth();
        } catch (error) {
          console.warn('ResizeObserver callback error:', error);
        }
      });
      resizeObserver.observe(barChartContainerRef.current);
    } catch (error) {
      console.warn('ResizeObserver creation failed:', error);
    }
    
    // Also listen for window resize events as a fallback
    window.addEventListener('resize', updateBarChartWidth);
    
    // Cleanup
    return () => {
      try {
        if (resizeObserver && barChartContainerRef.current) {
          resizeObserver.unobserve(barChartContainerRef.current);
        }
      } catch (error) {
        console.warn('ResizeObserver cleanup error:', error);
      }
      window.removeEventListener('resize', updateBarChartWidth);
    };
  }, []);

  // Fetch tech stack data with retry mechanism
  useEffect(() => {
    // Don't fetch if data sources are not available
    if (!hasData) {
      console.log('TechStackAnalysisPage: Skipping data fetch - required data sources not available');
      return;
    }
    
    const fetchTechStackData = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log(`🔄 Fetching tech stack data from Athena... (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        
        const response = await getTechStackData();
        console.log('✅ Tech stack data fetched:', response);
        
        if (response && response.items) {
          setTechStackData(response.items);
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
        console.error('❌ Error fetching tech stack data:', error);
        
        // Check if error is due to missing view/table (no data uploaded yet)
        if (error.message && (
          error.message.includes('does not exist') || 
          error.message.includes('FAILED') ||
          error.message.includes('Table not found') ||
          error.message.includes('View not found')
        )) {
          // Don't show error for missing data - just show empty state
          console.log('No tech stack data uploaded yet');
          setError(null);
          setTechStackData([]);
        } else if (retryCount < MAX_RETRIES) {
          // If we haven't reached max retries, increment retry count
          console.log(`🔄 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          setRetryCount(retryCount + 1);
        } else {
          setError(`Failed to fetch tech stack data after ${MAX_RETRIES + 1} attempts: ${error.message}`);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTechStackData();
  }, [retryCount, hasData]);
  
  // Function to update filter options based on current selections
  const updateFilterOptions = useCallback(() => {
    // If no filters are selected, all options are available without restrictions
    if (selectedApplications.length === 0 && 
        selectedRuntimes.length === 0 && 
        selectedFrameworks.length === 0 && 
        selectedDatabases.length === 0 && 
        selectedIntegrations.length === 0 && 
        selectedStorages.length === 0) {
      return;
    }
    
    // Get the filtered data based on current selections
    const relevantData = filteredData;
    
    // Extract unique values for each filter type from the filtered data
    const relevantApplications = [...new Set(relevantData.map(item => item.applicationName))];
    const relevantRuntimes = [...new Set(relevantData.map(item => item.runtime).filter(Boolean))];
    const relevantFrameworks = [...new Set(relevantData.map(item => item.framework).filter(Boolean))];
    const relevantDatabases = [...new Set(relevantData.flatMap(item => item.databases || []))];
    const relevantIntegrations = [...new Set(relevantData.flatMap(item => item.integrations || []))];
    const relevantStorages = [...new Set(relevantData.flatMap(item => item.storages || []))];
    
    // Update application options - disable options that are not in the relevant set
    setApplicationOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantApplications.includes(option.value) && !selectedApplications.some(sel => sel.value === option.value)
    })));
    
    // Update runtime options
    setRuntimeOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantRuntimes.includes(option.value) && !selectedRuntimes.some(sel => sel.value === option.value)
    })));
    
    // Update framework options
    setFrameworkOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantFrameworks.includes(option.value) && !selectedFrameworks.some(sel => sel.value === option.value)
    })));
    
    // Update database options
    setDatabaseOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantDatabases.includes(option.value) && !selectedDatabases.some(sel => sel.value === option.value)
    })));
    
    // Update integration options
    setIntegrationOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantIntegrations.includes(option.value) && !selectedIntegrations.some(sel => sel.value === option.value)
    })));
    
    // Update storage options
    setStorageOptions(prev => prev.map(option => ({
      ...option,
      disabled: !relevantStorages.includes(option.value) && !selectedStorages.some(sel => sel.value === option.value)
    })));
  }, [filteredData, selectedApplications, selectedRuntimes, selectedFrameworks, selectedDatabases, selectedIntegrations, selectedStorages]);
  
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
    
    // Extract unique runtimes
    const runtimes = [...new Set(data.map(item => item?.runtime).filter(Boolean))];
    setRuntimeOptions(runtimes.map(runtime => ({ label: runtime, value: runtime, disabled: false })));
    
    // Extract unique frameworks
    const frameworks = [...new Set(data.map(item => item?.framework).filter(Boolean))];
    setFrameworkOptions(frameworks.map(framework => ({ label: framework, value: framework, disabled: false })));
    
    // Extract unique databases
    const databases = [...new Set(data.flatMap(item => Array.isArray(item?.databases) ? item.databases : []))];
    setDatabaseOptions(databases.map(db => ({ label: db, value: db, disabled: false })));
    
    // Extract unique integrations
    const integrations = [...new Set(data.flatMap(item => Array.isArray(item?.integrations) ? item.integrations : []))];
    setIntegrationOptions(integrations.map(integration => ({ label: integration, value: integration, disabled: false })));
    
    // Extract unique storages
    const storages = [...new Set(data.flatMap(item => Array.isArray(item?.storages) ? item.storages : []))];
    setStorageOptions(storages.map(storage => ({ label: storage, value: storage, disabled: false })));
  };
  
  // Save filters to localStorage whenever they change (project-specific)
  useEffect(() => {
    localStorage.setItem(`techStackFilters_${projectId}_applications`, JSON.stringify(selectedApplications));
  }, [selectedApplications, projectId]);

  useEffect(() => {
    localStorage.setItem(`techStackFilters_${projectId}_runtimes`, JSON.stringify(selectedRuntimes));
  }, [selectedRuntimes, projectId]);

  useEffect(() => {
    localStorage.setItem(`techStackFilters_${projectId}_frameworks`, JSON.stringify(selectedFrameworks));
  }, [selectedFrameworks, projectId]);

  useEffect(() => {
    localStorage.setItem(`techStackFilters_${projectId}_databases`, JSON.stringify(selectedDatabases));
  }, [selectedDatabases, projectId]);

  useEffect(() => {
    localStorage.setItem(`techStackFilters_${projectId}_integrations`, JSON.stringify(selectedIntegrations));
  }, [selectedIntegrations, projectId]);

  useEffect(() => {
    localStorage.setItem(`techStackFilters_${projectId}_storages`, JSON.stringify(selectedStorages));
  }, [selectedStorages, projectId]);

  // Apply filters when selections change
  useEffect(() => {
    if (techStackData.length === 0) return;
    
    let result = [...techStackData];
    
    // Filter by selected applications
    if (selectedApplications.length > 0) {
      const selectedAppValues = selectedApplications.map(app => app.value);
      result = result.filter(item => selectedAppValues.includes(item.applicationName));
    }
    
    // Filter by selected runtimes
    if (selectedRuntimes.length > 0) {
      const selectedRuntimeValues = selectedRuntimes.map(runtime => runtime.value);
      result = result.filter(item => selectedRuntimeValues.includes(item.runtime));
    }
    
    // Filter by selected frameworks
    if (selectedFrameworks.length > 0) {
      const selectedFrameworkValues = selectedFrameworks.map(framework => framework.value);
      result = result.filter(item => selectedFrameworkValues.includes(item.framework));
    }
    
    // Filter by selected databases
    if (selectedDatabases.length > 0) {
      const selectedDbValues = selectedDatabases.map(db => db.value);
      result = result.filter(item => 
        item.databases && item.databases.some(db => selectedDbValues.includes(db))
      );
    }
    
    // Filter by selected integrations
    if (selectedIntegrations.length > 0) {
      const selectedIntValues = selectedIntegrations.map(int => int.value);
      result = result.filter(item => 
        item.integrations && item.integrations.some(int => selectedIntValues.includes(int))
      );
    }
    
    // Filter by selected storages
    if (selectedStorages.length > 0) {
      const selectedStorageValues = selectedStorages.map(storage => storage.value);
      result = result.filter(item => 
        item.storages && item.storages.some(storage => selectedStorageValues.includes(storage))
      );
    }
    
    setFilteredData(result);
    processDataForCharts(result);
  }, [
    techStackData,
    selectedApplications,
    selectedRuntimes,
    selectedFrameworks,
    selectedDatabases,
    selectedIntegrations,
    selectedStorages
  ]);
  
  // Handle clearing all filters
  const handleClearAllFilters = () => {
    setSelectedApplications([]);
    setSelectedRuntimes([]);
    setSelectedFrameworks([]);
    setSelectedDatabases([]);
    setSelectedIntegrations([]);
    setSelectedStorages([]);
    // Clear from localStorage (project-specific)
    localStorage.removeItem(`techStackFilters_${projectId}_applications`);
    localStorage.removeItem(`techStackFilters_${projectId}_runtimes`);
    localStorage.removeItem(`techStackFilters_${projectId}_frameworks`);
    localStorage.removeItem(`techStackFilters_${projectId}_databases`);
    localStorage.removeItem(`techStackFilters_${projectId}_integrations`);
    localStorage.removeItem(`techStackFilters_${projectId}_storages`);
  };

  // Process data for various charts
  const processDataForCharts = (data) => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('No data available for processing charts');
      
      // Set empty data for all charts
      setComponentsPerAppData([]);
      setRuntimeDistributionData([]);
      setFrameworkDistributionData([]);
      setDatabaseDistributionData([]);
      setIntegrationDistributionData([]);
      setStorageDistributionData([]);
      
      // Set totals to 0
      setComponentsTotal(0);
      setRuntimeTotal(0);
      setFrameworkTotal(0);
      setDatabaseTotal(0);
      setIntegrationTotal(0);
      setStorageTotal(0);
      
      return;
    }
    
    // 1. Components per Application
    const appComponentsCount = {};
    data.forEach(item => {
      const appName = item?.applicationName;
      if (!appName) return;
      
      if (!appComponentsCount[appName]) {
        appComponentsCount[appName] = 0;
      }
      appComponentsCount[appName]++;
    });
    
    const componentsPerApp = Object.entries(appComponentsCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    componentsPerApp.sort((a, b) => b.value - a.value);
    
    // Calculate total components
    const totalComponents = componentsPerApp.reduce((sum, item) => sum + item.value, 0);
    setComponentsTotal(totalComponents);
    
    // Limit to top 10 if there are more than 10 applications
    const topComponentsPerApp = componentsPerApp.slice(0, 10);
    setComponentsPerAppData(topComponentsPerApp);
    
    // 2. Runtime Distribution
    const runtimeCount = {};
    data.forEach(item => {
      const runtime = item?.runtime;
      if (runtime) {
        if (!runtimeCount[runtime]) {
          runtimeCount[runtime] = 0;
        }
        runtimeCount[runtime]++;
      }
    });
    
    const runtimeDistribution = Object.entries(runtimeCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    runtimeDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total runtimes
    const totalRuntimes = runtimeDistribution.reduce((sum, item) => sum + item.value, 0);
    setRuntimeTotal(totalRuntimes);
    
    setRuntimeDistributionData(runtimeDistribution);
    
    // 3. Framework Distribution
    const frameworkCount = {};
    data.forEach(item => {
      const framework = item?.framework;
      if (framework) {
        if (!frameworkCount[framework]) {
          frameworkCount[framework] = 0;
        }
        frameworkCount[framework]++;
      }
    });
    
    const frameworkDistribution = Object.entries(frameworkCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    frameworkDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total frameworks
    const totalFrameworks = frameworkDistribution.reduce((sum, item) => sum + item.value, 0);
    setFrameworkTotal(totalFrameworks);
    
    setFrameworkDistributionData(frameworkDistribution);
    
    // 4. Database Distribution
    const databaseCount = {};
    data.forEach(item => {
      const databases = item?.databases;
      if (databases && Array.isArray(databases)) {
        databases.forEach(db => {
          if (db) {
            if (!databaseCount[db]) {
              databaseCount[db] = 0;
            }
            databaseCount[db]++;
          }
        });
      }
    });
    
    const databaseDistribution = Object.entries(databaseCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    databaseDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total databases
    const totalDatabases = databaseDistribution.reduce((sum, item) => sum + item.value, 0);
    setDatabaseTotal(totalDatabases);
    
    setDatabaseDistributionData(databaseDistribution);
    
    // 5. Integration Distribution
    const integrationCount = {};
    data.forEach(item => {
      const integrations = item?.integrations;
      if (integrations && Array.isArray(integrations)) {
        integrations.forEach(integration => {
          if (integration) {
            if (!integrationCount[integration]) {
              integrationCount[integration] = 0;
            }
            integrationCount[integration]++;
          }
        });
      }
    });
    
    const integrationDistribution = Object.entries(integrationCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    integrationDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total integrations
    const totalIntegrations = integrationDistribution.reduce((sum, item) => sum + item.value, 0);
    setIntegrationTotal(totalIntegrations);
    
    setIntegrationDistributionData(integrationDistribution);
    
    // 6. Storage Distribution
    const storageCount = {};
    data.forEach(item => {
      const storages = item?.storages;
      if (storages && Array.isArray(storages)) {
        storages.forEach(storage => {
          if (storage) {
            if (!storageCount[storage]) {
              storageCount[storage] = 0;
            }
            storageCount[storage]++;
          }
        });
      }
    });
    
    const storageDistribution = Object.entries(storageCount).map(([label, value]) => ({
      label,
      value
    }));
    
    // Sort by value in descending order
    storageDistribution.sort((a, b) => b.value - a.value);
    
    // Calculate total storages
    const totalStorages = storageDistribution.reduce((sum, item) => sum + item.value, 0);
    setStorageTotal(totalStorages);
    
    setStorageDistributionData(storageDistribution);
  };

  return (
    <Layout
      activeHref="/insights/tech-stack"
      infoContent={
        <Box padding="l">
          <TechStackAnalysisInfoContent />
        </Box>
      }
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
    >
      <ContentLayout
        header={
          <Header 
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button 
                  iconName="download"
                  onClick={() => navigateToExportWithCategory('tech-stack-analysis', navigate)}
                >
                  {t('pages:techStack.export')}
                </Button>
                <Button
                  iconName="refresh"
                  loading={loading}
                  onClick={() => {
                    setError(null);
                    setRetryCount(retryCount + 1);
                  }}
                >
                  {t('pages:techStack.refresh')}
                </Button>
              </SpaceBetween>
            }
          >
            {t('techStack.title', { ns: 'pages' })}
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
                    <Button onClick={handleClearAllFilters}>{t('pages:techStack.clearAllFilters')}</Button>
                  }
                >
                  {t('pages:techStack.filters')}
                </Header>
                
                {error && (
                  <Alert
                    type="error"
                    header={t('pages:techStack.errorFetchingTechStackData')}
                    dismissible
                    onDismiss={() => setError(null)}
                    action={
                      <Button 
                        onClick={() => {
                          setError(null);
                          setRetryCount(retryCount + 1);
                        }}
                      >
                        {t('pages:techStack.retry')}
                      </Button>
                    }
                  >
                    {error}
                    <Box variant="p" padding={{ top: 's' }}>
                      {t('pages:techStack.networkConnectionError')}
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
                  <FormField label={t('pages:techStack.applications')}>
                    <Multiselect
                      selectedOptions={selectedApplications}
                      onChange={({ detail }) => setSelectedApplications(detail.selectedOptions)}
                      options={applicationOptions}
                      filteringType="auto"
                      placeholder={t('pages:techStack.selectApplications')}
                      deselectAriaLabel={option => `Remove ${option.label}`}
                      tokenLimit={3}
                      expandToViewport
                      i18nStrings={{
                        limitShowMore: t('pages:techStack.showMore'),
                        limitShowFewer: t('pages:techStack.showFewer'),
                        filteringAriaLabel: t('pages:techStack.findApplications'),
                        filteringPlaceholder: t('pages:techStack.findApplications'),
                        filteringClearAriaLabel: t('pages:techStack.clear'),
                        selectionCount: count => `${count} ${count === 1 ? t('pages:techStack.application') : t('pages:techStack.applications')} ${t('pages:techStack.selected')}`
                      }}
                    />
                  </FormField>
                  
                  {/* Runtime Filter */}
                  <FormField label={t('pages:techStack.runtimes')}>
                    <Multiselect
                      selectedOptions={selectedRuntimes}
                      onChange={({ detail }) => setSelectedRuntimes(detail.selectedOptions)}
                      options={runtimeOptions}
                      filteringType="auto"
                      placeholder={t('pages:techStack.selectRuntimes')}
                      deselectAriaLabel={option => `Remove ${option.label}`}
                      tokenLimit={3}
                      expandToViewport
                      i18nStrings={{
                        limitShowMore: t('pages:techStack.showMore'),
                        limitShowFewer: t('pages:techStack.showFewer'),
                        filteringAriaLabel: t('pages:techStack.findRuntimes'),
                        filteringPlaceholder: t('pages:techStack.findRuntimes'),
                        filteringClearAriaLabel: t('pages:techStack.clear'),
                        selectionCount: count => `${count} ${count === 1 ? t('pages:techStack.runtime') : t('pages:techStack.runtimes')} ${t('pages:techStack.selected')}`
                      }}
                    />
                  </FormField>
                  
                  {/* Framework Filter */}
                  <FormField label={t('pages:techStack.frameworks')}>
                    <Multiselect
                      selectedOptions={selectedFrameworks}
                      onChange={({ detail }) => setSelectedFrameworks(detail.selectedOptions)}
                      options={frameworkOptions}
                      filteringType="auto"
                      placeholder={t('pages:techStack.selectFrameworks')}
                      deselectAriaLabel={option => `Remove ${option.label}`}
                      tokenLimit={3}
                      expandToViewport
                      i18nStrings={{
                        limitShowMore: t('pages:techStack.showMore'),
                        limitShowFewer: t('pages:techStack.showFewer'),
                        filteringAriaLabel: t('pages:techStack.findFrameworks'),
                        filteringPlaceholder: t('pages:techStack.findFrameworks'),
                        filteringClearAriaLabel: t('pages:techStack.clear'),
                        selectionCount: count => `${count} ${count === 1 ? t('pages:techStack.framework') : t('pages:techStack.frameworks')} ${t('pages:techStack.selected')}`
                      }}
                    />
                  </FormField>
                  
                  {/* Database Filter */}
                  <FormField label={t('pages:techStack.databases')}>
                    <Multiselect
                      selectedOptions={selectedDatabases}
                      onChange={({ detail }) => setSelectedDatabases(detail.selectedOptions)}
                      options={databaseOptions}
                      filteringType="auto"
                      placeholder={t('pages:techStack.selectDatabases')}
                      deselectAriaLabel={option => `Remove ${option.label}`}
                      tokenLimit={3}
                      expandToViewport
                      i18nStrings={{
                        limitShowMore: t('pages:techStack.showMore'),
                        limitShowFewer: t('pages:techStack.showFewer'),
                        filteringAriaLabel: t('pages:techStack.findDatabases'),
                        filteringPlaceholder: t('pages:techStack.findDatabases'),
                        filteringClearAriaLabel: t('pages:techStack.clear'),
                        selectionCount: count => `${count} ${count === 1 ? t('pages:techStack.database') : t('pages:techStack.databases')} ${t('pages:techStack.selected')}`
                      }}
                    />
                  </FormField>
                  
                  {/* Integration Filter */}
                  <FormField label={t('pages:techStack.integrations')}>
                    <Multiselect
                      selectedOptions={selectedIntegrations}
                      onChange={({ detail }) => setSelectedIntegrations(detail.selectedOptions)}
                      options={integrationOptions}
                      filteringType="auto"
                      placeholder={t('pages:techStack.selectIntegrations')}
                      deselectAriaLabel={option => `Remove ${option.label}`}
                      tokenLimit={3}
                      expandToViewport
                      i18nStrings={{
                        limitShowMore: t('pages:techStack.showMore'),
                        limitShowFewer: t('pages:techStack.showFewer'),
                        filteringAriaLabel: t('pages:techStack.findIntegrations'),
                        filteringPlaceholder: t('pages:techStack.findIntegrations'),
                        filteringClearAriaLabel: t('pages:techStack.clear'),
                        selectionCount: count => `${count} ${count === 1 ? t('pages:techStack.integration') : t('pages:techStack.integrations')} ${t('pages:techStack.selected')}`
                      }}
                    />
                  </FormField>
                  
                  {/* Storage Filter */}
                  <FormField label={t('pages:techStack.storage')}>
                    <Multiselect
                      selectedOptions={selectedStorages}
                      onChange={({ detail }) => setSelectedStorages(detail.selectedOptions)}
                      options={storageOptions}
                      filteringType="auto"
                      placeholder={t('pages:techStack.selectStorageOptions')}
                      deselectAriaLabel={option => `Remove ${option.label}`}
                      tokenLimit={3}
                      expandToViewport
                      i18nStrings={{
                        limitShowMore: t('pages:techStack.showMore'),
                        limitShowFewer: t('pages:techStack.showFewer'),
                        filteringAriaLabel: t('pages:techStack.findStorageOptions'),
                        filteringPlaceholder: t('pages:techStack.findStorageOptions'),
                        filteringClearAriaLabel: t('pages:techStack.clear'),
                        selectionCount: count => `${count} ${count === 1 ? t('pages:techStack.storageOption') : t('pages:techStack.storageOptions')} ${t('pages:techStack.selected')}`
                      }}
                    />
                  </FormField>
                </Grid>
              </SpaceBetween>
            </Container>
            
            {/* Row 1: Components per Application and Runtime Distribution */}
            <Grid
              gridDefinition={[
                { colspan: { default: 12, xxs: 6 } },
                { colspan: { default: 12, xxs: 6 } }
              ]}
            >
              {/* Container 1: Components per Application Chart */}
              <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
                <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {loading ? (
                    <Box textAlign="center" padding="xl">
                      <SpaceBetween size="m" alignItems="center">
                        <Spinner size="large" />
                        <Box variant="p">{t('pages:techStack.loadingComponentsChart')}</Box>
                      </SpaceBetween>
                    </Box>
                  ) : componentsPerAppData.length === 0 ? (
                    <Box textAlign="center" padding="xl">
                      {t('pages:techStack.noDataAvailable')}
                    </Box>
                  ) : (
                    <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                        <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:techStack.componentsPerApplication')} ({componentsTotal})</h3>
                      </div>
                      <div ref={barChartContainerRef} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, width: '100%', height: 'calc(100% - 40px)' }}>
                        <BarChart
                          data={componentsPerAppData}
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
              
              {/* Container 2: Runtime Distribution Chart */}
              <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
                <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {loading ? (
                    <Box textAlign="center" padding="xl">
                      <SpaceBetween size="m" alignItems="center">
                        <Spinner size="large" />
                        <Box variant="p">{t('pages:techStack.loadingRuntimeChart')}</Box>
                      </SpaceBetween>
                    </Box>
                  ) : runtimeDistributionData.length === 0 ? (
                    <Box textAlign="center" padding="xl">
                      {t('pages:techStack.noDataAvailable')}
                    </Box>
                  ) : (
                    <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                        <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:techStack.runtimeDistribution')} ({runtimeTotal})</h3>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: 'calc(100% - 40px)' }}>
                        <DoughnutChart
                          data={runtimeDistributionData}
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
            
            {/* Row 2: Framework Distribution and Database Distribution */}
            <Grid
              gridDefinition={[
                { colspan: { default: 12, xxs: 6 } },
                { colspan: { default: 12, xxs: 6 } }
              ]}
            >
              {/* Container 3: Framework Distribution Chart */}
              <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
                <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {loading ? (
                    <Box textAlign="center" padding="xl">
                      <SpaceBetween size="m" alignItems="center">
                        <Spinner size="large" />
                        <Box variant="p">{t('pages:techStack.loadingFrameworkChart')}</Box>
                      </SpaceBetween>
                    </Box>
                  ) : frameworkDistributionData.length === 0 ? (
                    <Box textAlign="center" padding="xl">
                      {t('pages:techStack.noDataAvailable')}
                    </Box>
                  ) : (
                    <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                        <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:techStack.frameworkDistribution')} ({frameworkTotal})</h3>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: 'calc(100% - 40px)' }}>
                        <DoughnutChart
                          data={frameworkDistributionData}
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
              
              {/* Container 4: Database Distribution Chart */}
              <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
                <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {loading ? (
                    <Box textAlign="center" padding="xl">
                      <SpaceBetween size="m" alignItems="center">
                        <Spinner size="large" />
                        <Box variant="p">{t('pages:techStack.loadingDatabaseChart')}</Box>
                      </SpaceBetween>
                    </Box>
                  ) : databaseDistributionData.length === 0 ? (
                    <Box textAlign="center" padding="xl">
                      {t('pages:techStack.noDataAvailable')}
                    </Box>
                  ) : (
                    <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                        <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:techStack.databaseDistribution')} ({databaseTotal})</h3>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: 'calc(100% - 40px)' }}>
                        <DoughnutChart
                          data={databaseDistributionData}
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
            
            {/* Row 3: Integration Distribution and Storage Distribution */}
            <Grid
              gridDefinition={[
                { colspan: { default: 12, xxs: 6 } },
                { colspan: { default: 12, xxs: 6 } }
              ]}
            >
              {/* Container 5: Integration Distribution Chart */}
              <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
                <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {loading ? (
                    <Box textAlign="center" padding="xl">
                      <SpaceBetween size="m" alignItems="center">
                        <Spinner size="large" />
                        <Box variant="p">{t('pages:techStack.loadingIntegrationChart')}</Box>
                      </SpaceBetween>
                    </Box>
                  ) : integrationDistributionData.length === 0 ? (
                    <Box textAlign="center" padding="xl">
                      {t('pages:techStack.noDataAvailable')}
                    </Box>
                  ) : (
                    <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                        <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:techStack.integrationDistribution')} ({integrationTotal})</h3>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: 'calc(100% - 40px)' }}>
                        <DoughnutChart
                          data={integrationDistributionData}
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
              
              {/* Container 6: Storage Distribution Chart */}
              <Container style={{ height: '450px', minHeight: '450px', maxHeight: '450px' }}>
                <Box padding="l" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {loading ? (
                    <Box textAlign="center" padding="xl">
                      <SpaceBetween size="m" alignItems="center">
                        <Spinner size="large" />
                        <Box variant="p">{t('pages:techStack.loadingStorageChart')}</Box>
                      </SpaceBetween>
                    </Box>
                  ) : storageDistributionData.length === 0 ? (
                    <Box textAlign="center" padding="xl">
                      {t('pages:techStack.noDataAvailable')}
                    </Box>
                  ) : (
                    <Box textAlign="center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '40px' }}>
                        <h3 style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('pages:techStack.storageDistribution')} ({storageTotal})</h3>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: 'calc(100% - 40px)' }}>
                        <DoughnutChart
                          data={storageDistributionData}
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
                  {t('pages:techStack.summary')}
                </Header>
                
                <Box padding="l">
                  {loading ? (
                    <Box textAlign="center" padding="xl">
                      {t('pages:techStack.loadingChartData')}
                    </Box>
                  ) : filteredData.length === 0 ? (
                    <Box textAlign="center" padding="xl">
                      {t('pages:techStack.noDataForSelectedFilters')}
                    </Box>
                  ) : (
                    <SpaceBetween size="l">
                      <Header variant="h3" textAlign="center">{t('pages:techStack.keyInsights')}</Header>
                      
                      <Grid
                        gridDefinition={[
                          { colspan: { default: 12, xxs: 6, m: 4 } },
                          { colspan: { default: 12, xxs: 6, m: 4 } },
                          { colspan: { default: 12, xxs: 6, m: 4 } }
                        ]}
                      >
                        <Box variant="awsui-key-label">
                          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                            {t('pages:techStack.totalApplications')}
                          </div>
                          <div style={{ fontSize: '24px', color: '#0073bb' }}>
                            {[...new Set(filteredData.map(item => item.applicationName))].length}
                          </div>
                        </Box>
                        
                        <Box variant="awsui-key-label">
                          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                            {t('pages:techStack.totalComponents')}
                          </div>
                          <div style={{ fontSize: '24px', color: '#0073bb' }}>
                            {filteredData.length}
                          </div>
                        </Box>
                        
                        <Box variant="awsui-key-label">
                          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                            {t('pages:techStack.componentsPerApplicationAvg')}
                          </div>
                          <div style={{ fontSize: '24px', color: '#0073bb' }}>
                            {(filteredData.length / Math.max([...new Set(filteredData.map(item => item.applicationName))].length, 1)).toFixed(1)}
                          </div>
                        </Box>
                      </Grid>
                      
                      <Header variant="h3">{t('pages:techStack.technologyDistribution')}</Header>
                      
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
                            {t('pages:techStack.uniqueRuntimes')}
                          </div>
                          <div style={{ fontSize: '24px', color: '#0073bb' }}>
                            {[...new Set(filteredData.map(item => item.runtime).filter(Boolean))].length}
                          </div>
                        </Box>
                        
                        <Box variant="awsui-key-label">
                          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                            {t('pages:techStack.uniqueFrameworks')}
                          </div>
                          <div style={{ fontSize: '24px', color: '#0073bb' }}>
                            {[...new Set(filteredData.map(item => item.framework).filter(Boolean))].length}
                          </div>
                        </Box>
                        
                        <Box variant="awsui-key-label">
                          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                            {t('pages:techStack.uniqueDatabases')}
                          </div>
                          <div style={{ fontSize: '24px', color: '#0073bb' }}>
                            {[...new Set(filteredData.flatMap(item => item.databases || []))].length}
                          </div>
                        </Box>
                        
                        <Box variant="awsui-key-label">
                          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                            {t('pages:techStack.uniqueIntegrations')}
                          </div>
                          <div style={{ fontSize: '24px', color: '#0073bb' }}>
                            {[...new Set(filteredData.flatMap(item => item.integrations || []))].length}
                          </div>
                        </Box>
                      </Grid>
                      
                      <Header variant="h3" textAlign="center">{t('pages:techStack.mostCommonTechnologies')}</Header>
                      
                      <Grid
                        gridDefinition={[
                          { colspan: { default: 12, xxs: 6, m: 4 } },
                          { colspan: { default: 12, xxs: 6, m: 4 } },
                          { colspan: { default: 12, xxs: 6, m: 4 } }
                        ]}
                      >
                        <Box>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                            {t('pages:techStack.topRuntime')}
                          </div>
                          <div style={{ fontSize: '18px' }}>
                            {runtimeDistributionData.length > 0 ? runtimeDistributionData[0].label : t('pages:techStack.na')}
                          </div>
                          <div style={{ fontSize: '14px', color: '#666' }}>
                            {runtimeDistributionData.length > 0 ? `${runtimeDistributionData[0].value} ${t('pages:techStack.components')} (${Math.round(runtimeDistributionData[0].value / runtimeTotal * 100)}%)` : ''}
                          </div>
                        </Box>
                        
                        <Box>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                            {t('pages:techStack.topFramework')}
                          </div>
                          <div style={{ fontSize: '18px' }}>
                            {frameworkDistributionData.length > 0 ? frameworkDistributionData[0].label : t('pages:techStack.na')}
                          </div>
                          <div style={{ fontSize: '14px', color: '#666' }}>
                            {frameworkDistributionData.length > 0 ? `${frameworkDistributionData[0].value} ${t('pages:techStack.components')} (${Math.round(frameworkDistributionData[0].value / frameworkTotal * 100)}%)` : ''}
                          </div>
                        </Box>
                        
                        <Box>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                            {t('pages:techStack.topDatabase')}
                          </div>
                          <div style={{ fontSize: '18px' }}>
                            {databaseDistributionData.length > 0 ? databaseDistributionData[0].label : t('pages:techStack.na')}
                          </div>
                          <div style={{ fontSize: '14px', color: '#666' }}>
                            {databaseDistributionData.length > 0 ? `${databaseDistributionData[0].value} ${t('pages:techStack.components')} (${Math.round(databaseDistributionData[0].value / databaseTotal * 100)}%)` : ''}
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

export default TechStackAnalysisPage;
