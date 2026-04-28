import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { navigateToExportWithCategory } from '../../utils/exportNavigationUtils';
import {
  Box,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  Tabs,
  SegmentedControl,
  FormField,
  Multiselect,
  Grid,
  Table,
  Pagination,
  CollectionPreferences,
  Button,
  Alert,
  Spinner
} from '@cloudscape-design/components';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import LineChart from '../../components/charts/LineChart';
import UtilizationAnalysisInfoContent from '../../components/info/UtilizationAnalysisInfoContent';
import MissingDataAlert from '../../components/MissingDataAlert';

// Hooks
import useDataSourceCheck from '../../hooks/useDataSourceCheck';

// API services
import { 
  getCpuUtilizationData,
  getMemoryUtilizationData,
  getStorageUtilizationData,
  getNetworkTrafficData,
  getIOPSData
} from '../../services/athenaQueryService';

/**
 * Utilization Analysis Page Component
 * 
 * This page displays various charts and visualizations for analyzing resource utilization.
 */
const UtilizationAnalysisPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  // Check if required data sources exist
  const { hasData, loading: checkingData, missingDataSources } = useDataSourceCheck(['applications-portfolio', 'applications-infrastructure', 'applications-utilization']);
  
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState('cpu');
  const [timeframe, setTimeframe] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  
  // Chart data states
  const [cpuData, setCpuData] = useState({ series: [] });
  const [memoryData, setMemoryData] = useState({ series: [] });
  const [storageData, setStorageData] = useState({ series: [] });
  const [networkData, setNetworkData] = useState({ series: [] });
  const [iopsData, setIopsData] = useState({ series: [] });
  
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

  // Selected applications for filtering - initialize from localStorage with project-specific key
  const [selectedApplications, setSelectedApplications] = useState(() => {
    const saved = localStorage.getItem(`utilizationFilters_${projectId}_applications`);
    return saved ? JSON.parse(saved) : [];
  });
  
  // Application options for filtering
  const [applicationOptions, setApplicationOptions] = useState([]);
  
  // Filtered data based on selected applications
  const [filteredCpuData, setFilteredCpuData] = useState({ series: [] });
  const [filteredMemoryData, setFilteredMemoryData] = useState({ series: [] });
  const [filteredStorageData, setFilteredStorageData] = useState({ series: [] });
  const [filteredNetworkData, setFilteredNetworkData] = useState({ series: [] });
  const [filteredIopsData, setFilteredIopsData] = useState({ series: [] });

  // Trend table state
  const [trendTableCurrentPage, setTrendTableCurrentPage] = useState(1);
  const [trendTablePageSize, setTrendTablePageSize] = useState(10);
  const [trendTableVisibleColumns, setTrendTableVisibleColumns] = useState([
    'application', 'trend', 'percentChange', 'currentValue', 'peakValue'
  ]);
  const [trendTableSortingColumn, setTrendTableSortingColumn] = useState({ sortingField: 'name' });
  const [trendTableSortingDescending, setTrendTableSortingDescending] = useState(false);

  // Add a resize observer to adjust chart width based on container size
  const chartContainerRef = useRef(null);

  // Reset trend table page when active tab or selected applications change
  useEffect(() => {
    setTrendTableCurrentPage(1);
  }, [activeTabId, selectedApplications]);

  // Fetch utilization data
  useEffect(() => {
    // Don't fetch if data sources are not available
    if (!hasData) {
      console.log('UtilizationAnalysisPage: Skipping data fetch - required data sources not available');
      return;
    }
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log(`🔄 Fetching utilization data from Athena... (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        
        // Fetch all data types
        const [fetchedCpuData, fetchedMemoryData, fetchedStorageData, fetchedNetworkData, fetchedIopsData] = await Promise.all([
          getCpuUtilizationData(),
          getMemoryUtilizationData(),
          getStorageUtilizationData(),
          getNetworkTrafficData(),
          getIOPSData()
        ]);
        
        console.log('✅ Utilization data fetched successfully');
        
        // Set data
        setCpuData(fetchedCpuData);
        setMemoryData(fetchedMemoryData);
        setStorageData(fetchedStorageData);
        setNetworkData(fetchedNetworkData);
        setIopsData(fetchedIopsData);
        
        // Note: Filtered data will be set by the filtering effect based on selectedApplications
        
        // Extract unique application names from all data series
        const allSeries = [
          ...fetchedCpuData.series,
          ...fetchedMemoryData.series,
          ...fetchedStorageData.series,
          ...fetchedNetworkData.series,
          ...fetchedIopsData.series
        ];
        
        const uniqueAppNames = [...new Set(allSeries.map(series => series.name))];
        setApplicationOptions(uniqueAppNames.map(name => ({ label: name, value: name })));
        
      } catch (error) {
        console.error('❌ Error fetching utilization data:', error);
        
        // Check if error is due to missing view/table (no data uploaded yet)
        if (error.message && (
          error.message.includes('does not exist') || 
          error.message.includes('FAILED') ||
          error.message.includes('Table not found') ||
          error.message.includes('View not found') ||
          /No .* data available/.test(error.message)
        )) {
          // Don't show error for missing data - just show empty state
          console.log('No utilization data uploaded yet');
          setError(null);
          // Clear all chart data
          setCpuData({ series: [] });
          setMemoryData({ series: [] });
          setStorageData({ series: [] });
          setNetworkData({ series: [] });
          setIopsData({ series: [] });
        } else if (retryCount < MAX_RETRIES) {
          // If we haven't reached max retries, increment retry count
          console.log(`🔄 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          setRetryCount(retryCount + 1);
        } else {
          setError(`Failed to fetch utilization data after ${MAX_RETRIES + 1} attempts: ${error.message}`);
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [retryCount, hasData]);
  
  // Save filters to localStorage whenever they change (project-specific)
  useEffect(() => {
    localStorage.setItem(`utilizationFilters_${projectId}_applications`, JSON.stringify(selectedApplications));
  }, [selectedApplications, projectId]);

  // Filter data based on selected applications
  useEffect(() => {
    if (selectedApplications.length === 0) {
      // If no applications selected, show all data
      setFilteredCpuData(cpuData);
      setFilteredMemoryData(memoryData);
      setFilteredStorageData(storageData);
      setFilteredNetworkData(networkData);
      setFilteredIopsData(iopsData);
    } else {
      // Filter data based on selected applications
      const selectedAppNames = selectedApplications.map(app => app.value);
      
      setFilteredCpuData({
        ...cpuData,
        series: cpuData.series.filter(series => selectedAppNames.includes(series.name))
      });
      
      setFilteredMemoryData({
        ...memoryData,
        series: memoryData.series.filter(series => selectedAppNames.includes(series.name))
      });
      
      setFilteredStorageData({
        ...storageData,
        series: storageData.series.filter(series => selectedAppNames.includes(series.name))
      });
      
      setFilteredNetworkData({
        ...networkData,
        series: networkData.series.filter(series => selectedAppNames.includes(series.name))
      });
      
      setFilteredIopsData({
        ...iopsData,
        series: iopsData.series.filter(series => selectedAppNames.includes(series.name))
      });
    }
  }, [selectedApplications, cpuData, memoryData, storageData, networkData, iopsData]);

  // Get chart title based on active tab
  const getChartTitle = () => {
    switch (activeTabId) {
      case 'cpu':
        return t('pages:utilization.cpuUtilizationOverTime');
      case 'memory':
        return t('pages:utilization.memoryUtilizationOverTime');
      case 'storage':
        return t('pages:utilization.storageUtilizationOverTime');
      case 'network':
        return t('pages:utilization.networkTrafficOverTime');
      case 'iops':
        return t('pages:utilization.iopsOverTime');
      default:
        return '';
    }
  };
  
  // Get chart y-axis label based on active tab
  const getYAxisLabel = () => {
    switch (activeTabId) {
      case 'cpu':
      case 'memory':
      case 'storage':
        return t('pages:utilization.utilizationPercent');
      case 'network':
        return t('pages:utilization.trafficGBps');
      case 'iops':
        return t('pages:utilization.iops');
      default:
        return '';
    }
  };
  
  // Get current chart data based on active tab
  const getCurrentChartData = () => {
    switch (activeTabId) {
      case 'cpu':
        return filteredCpuData;
      case 'memory':
        return filteredMemoryData;
      case 'storage':
        return filteredStorageData;
      case 'network':
        return filteredNetworkData;
      case 'iops':
        return filteredIopsData;
      default:
        return { series: [] };
    }
  };

  // Get all trend items for pagination calculation
  const getAllTrendItems = () => {
    const data = getCurrentChartData();
    if (!data.series.length) return [];
    
    return data.series.map(series => {
      const values = series.values;
      if (values.length < 2) return { 
        name: series.name, 
        trend: 'stable',
        percentChange: 0,
        startValue: values.length > 0 ? values[0].value : undefined,
        currentValue: values.length > 0 ? values[values.length - 1].value : undefined,
        peakValue: values.length > 0 ? Math.max(...values.map(v => v.value)) : undefined
      };
      
      // Calculate trend by comparing first and last values
      const firstValue = values[0].value;
      const lastValue = values[values.length - 1].value;
      const percentChange = ((lastValue - firstValue) / firstValue) * 100;
      
      let trend;
      if (percentChange > 10) {
        trend = 'increasing';
      } else if (percentChange < -10) {
        trend = 'decreasing';
      } else {
        trend = 'stable';
      }
      
      // Find peak value
      const peakValue = Math.max(...values.map(v => v.value));
      
      return { 
        name: series.name, 
        trend, 
        percentChange,
        startValue: firstValue,
        currentValue: lastValue,
        peakValue: peakValue
      };
    });
  };

  return (
    <Layout
      activeHref="/insights/utilization"
      infoContent={
        <Box padding="l">
          <UtilizationAnalysisInfoContent />
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
                  onClick={() => navigateToExportWithCategory('utilization-analysis', navigate)}
                >
                  {t('common:buttons.export')}
                </Button>
                <Button
                  iconName="refresh"
                  loading={loading}
                  onClick={() => {
                    setError(null);
                    setRetryCount(retryCount + 1);
                  }}
                >
                  {t('common:buttons.refresh')}
                </Button>
              </SpaceBetween>
            }
          >
            {t('pages:utilization.title')}
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
              <Header variant="h2">
                {t('pages:utilization.filters')}
              </Header>
              
              {error && (
                <Alert
                  type="error"
                  header={t('pages:utilization.errorFetchingData')}
                  dismissible
                  onDismiss={() => setError(null)}
                  action={
                    <Button 
                      onClick={() => {
                        setError(null);
                        setRetryCount(retryCount + 1);
                      }}
                    >
                      {t('common.retry')}
                    </Button>
                  }
                >
                  {error}
                  <Box variant="p" padding={{ top: 's' }}>
                    {t('pages:utilization.networkConnectionError')}
                  </Box>
                </Alert>
              )}
              
              <Grid
                gridDefinition={[
                  { colspan: { default: 12, xxs: 6, m: 6 } },
                  { colspan: { default: 12, xxs: 6, m: 6 } }
                ]}
              >
                {/* Application Filter */}
                <FormField label={t('pages:utilization.applications')}>
                  <Multiselect
                    selectedOptions={selectedApplications}
                    onChange={({ detail }) => setSelectedApplications(detail.selectedOptions)}
                    options={applicationOptions}
                    filteringType="auto"
                    placeholder={t('pages:utilization.selectApplications')}
                    deselectAriaLabel={option => `${t('common.remove')} ${option.label}`}
                    tokenLimit={3}
                    expandToViewport
                    i18nStrings={{
                      limitShowMore: t('common.showMore'),
                      limitShowFewer: t('common.showFewer'),
                      filteringAriaLabel: t('pages:utilization.findApplications'),
                      filteringPlaceholder: t('pages:utilization.findApplications'),
                      filteringClearAriaLabel: t('common.clear'),
                      selectionCount: count => t('pages:utilization.applicationsSelected', { count })
                    }}
                  />
                </FormField>
                
                {/* Time Period Filter */}
                <FormField label={t('pages:utilization.timePeriod')}>
                  <SegmentedControl
                    selectedId={timeframe}
                    onChange={({ detail }) => setTimeframe(detail.selectedId)}
                    options={[
                      { id: '7d', text: t('pages:utilization.last7Days') },
                      { id: '30d', text: t('pages:utilization.last30Days') },
                      { id: '90d', text: t('pages:utilization.last90Days') },
                      { id: 'all', text: t('pages:utilization.allTime') }
                    ]}
                  />
                </FormField>
              </Grid>
            </SpaceBetween>
          </Container>
          
          {/* Tabs for different metrics */}
          <Container>
            <Tabs
              activeTabId={activeTabId}
              onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
              tabs={[
                {
                  id: 'cpu',
                  label: t('pages:utilization.cpu'),
                  content: (
                    <Box padding="xs" ref={chartContainerRef}>
                      {loading ? (
                        <Box textAlign="center" padding="xl">
                          <SpaceBetween size="m" alignItems="center">
                            <Spinner size="large" />
                            <Box variant="p">{t('pages:utilization.loadingCPUChart')}</Box>
                          </SpaceBetween>
                        </Box>
                      ) : filteredCpuData.series.length === 0 ? (
                        <Box textAlign="center" padding="xl">
                          {t('pages:utilization.noCPUData')}
                        </Box>
                      ) : (
                        <LineChart
                          data={filteredCpuData}
                          height={500}
                          margin={{ top: 40, right: 5, bottom: 60, left: 40 }}
                          showLegend={false}
                          colorPalette="bright"
                          showAxis={true}
                          title={getChartTitle()}
                          xAxisLabel={t('pages:utilization.date')}
                          yAxisLabel={getYAxisLabel()}
                          timeframe={timeframe}
                        />
                      )}
                    </Box>
                  )
                },
                {
                  id: 'memory',
                  label: t('pages:utilization.memory'),
                  content: (
                    <Box padding="xs" ref={chartContainerRef}>
                      {loading ? (
                        <Box textAlign="center" padding="xl">
                          <SpaceBetween size="m" alignItems="center">
                            <Spinner size="large" />
                            <Box variant="p">{t('pages:utilization.loadingMemoryChart')}</Box>
                          </SpaceBetween>
                        </Box>
                      ) : filteredMemoryData.series.length === 0 ? (
                        <Box textAlign="center" padding="xl">
                          {t('pages:utilization.noMemoryData')}
                        </Box>
                      ) : (
                        <LineChart
                          data={filteredMemoryData}
                          height={500}
                          margin={{ top: 40, right: 5, bottom: 60, left: 40 }}
                          showLegend={false}
                          colorPalette="bright"
                          showAxis={true}
                          title={getChartTitle()}
                          xAxisLabel={t('pages:utilization.date')}
                          yAxisLabel={getYAxisLabel()}
                          timeframe={timeframe}
                        />
                      )}
                    </Box>
                  )
                },
                {
                  id: 'storage',
                  label: t('pages:utilization.storage'),
                  content: (
                    <Box padding="xs" ref={chartContainerRef}>
                      {loading ? (
                        <Box textAlign="center" padding="xl">
                          <SpaceBetween size="m" alignItems="center">
                            <Spinner size="large" />
                            <Box variant="p">{t('pages:utilization.loadingStorageChart')}</Box>
                          </SpaceBetween>
                        </Box>
                      ) : filteredStorageData.series.length === 0 ? (
                        <Box textAlign="center" padding="xl">
                          {t('pages:utilization.noStorageData')}
                        </Box>
                      ) : (
                        <LineChart
                          data={filteredStorageData}
                          height={500}
                          margin={{ top: 40, right: 5, bottom: 60, left: 40 }}
                          showLegend={false}
                          colorPalette="bright"
                          showAxis={true}
                          title={getChartTitle()}
                          xAxisLabel={t('pages:utilization.date')}
                          yAxisLabel={getYAxisLabel()}
                          timeframe={timeframe}
                        />
                      )}
                    </Box>
                  )
                },
                {
                  id: 'network',
                  label: t('pages:utilization.network'),
                  content: (
                    <Box padding="xs" ref={chartContainerRef}>
                      {loading ? (
                        <Box textAlign="center" padding="xl">
                          <SpaceBetween size="m" alignItems="center">
                            <Spinner size="large" />
                            <Box variant="p">{t('pages:utilization.loadingNetworkChart')}</Box>
                          </SpaceBetween>
                        </Box>
                      ) : filteredNetworkData.series.length === 0 ? (
                        <Box textAlign="center" padding="xl">
                          {t('pages:utilization.noNetworkData')}
                        </Box>
                      ) : (
                        <LineChart
                          data={filteredNetworkData}
                          height={500}
                          margin={{ top: 40, right: 5, bottom: 60, left: 40 }}
                          showLegend={false}
                          colorPalette="bright"
                          showAxis={true}
                          title={getChartTitle()}
                          xAxisLabel={t('pages:utilization.date')}
                          yAxisLabel={getYAxisLabel()}
                          timeframe={timeframe}
                        />
                      )}
                    </Box>
                  )
                },
                {
                  id: 'iops',
                  label: t('pages:utilization.iopsLabel'),
                  content: (
                    <Box padding="xs" ref={chartContainerRef}>
                      {loading ? (
                        <Box textAlign="center" padding="xl">
                          <SpaceBetween size="m" alignItems="center">
                            <Spinner size="large" />
                            <Box variant="p">{t('pages:utilization.loadingIOPSChart')}</Box>
                          </SpaceBetween>
                        </Box>
                      ) : filteredIopsData.series.length === 0 ? (
                        <Box textAlign="center" padding="xl">
                          {t('pages:utilization.noIOPSData')}
                        </Box>
                      ) : (
                        <LineChart
                          data={filteredIopsData}
                          height={500}
                          margin={{ top: 40, right: 5, bottom: 60, left: 40 }}
                          showLegend={false}
                          colorPalette="bright"
                          showAxis={true}
                          title={getChartTitle()}
                          xAxisLabel={t('pages:utilization.date')}
                          yAxisLabel={getYAxisLabel()}
                          timeframe={timeframe}
                        />
                      )}
                    </Box>
                  )
                }
              ]}
            />
          </Container>
          
          {/* Key Metrics Section */}
          <Container>
            <SpaceBetween size="l">
              <Header variant="h2">
                {t('pages:utilization.keyMetrics')}
              </Header>
              
              <Box padding="s">
                {loading ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:utilization.loadingSummaryData')}
                  </Box>
                ) : getCurrentChartData().series.length === 0 ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:utilization.noDataAvailable')}
                  </Box>
                ) : (
                  <Grid
                    gridDefinition={[
                      { colspan: { default: 12, xxs: 6, m: 4 } },
                      { colspan: { default: 12, xxs: 6, m: 4 } },
                      { colspan: { default: 12, xxs: 6, m: 4 } }
                    ]}
                  >
                    <Box variant="awsui-key-label">
                      <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                        {t('pages:utilization.averageUtilization', { type: activeTabId.charAt(0).toUpperCase() + activeTabId.slice(1) })}
                      </div>
                      <div style={{ fontSize: '24px', color: '#0073bb' }}>
                        {(() => {
                          const data = getCurrentChartData();
                          if (!data.series.length) return t('common.na');
                          
                          // Calculate average across all series and data points
                          let sum = 0;
                          let count = 0;
                          
                          data.series.forEach(series => {
                            series.values.forEach(point => {
                              sum += point.value;
                              count++;
                            });
                          });
                          
                          return count > 0 ? `${(sum / count).toFixed(1)}${activeTabId === 'network' ? ' GB/s' : activeTabId === 'iops' ? '' : '%'}` : t('common.na');
                        })()}
                      </div>
                    </Box>
                    
                    <Box variant="awsui-key-label">
                      <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                        {t('pages:utilization.peakUtilization', { type: activeTabId.charAt(0).toUpperCase() + activeTabId.slice(1) })}
                      </div>
                      <div style={{ fontSize: '24px', color: '#0073bb' }}>
                        {(() => {
                          const data = getCurrentChartData();
                          if (!data.series.length) return t('common.na');
                          
                          // Find maximum value across all series
                          let max = 0;
                          
                          data.series.forEach(series => {
                            series.values.forEach(point => {
                              if (point.value > max) {
                                max = point.value;
                              }
                            });
                          });
                          
                          return `${max.toFixed(1)}${activeTabId === 'network' ? ' GB/s' : activeTabId === 'iops' ? '' : '%'}`;
                        })()}
                      </div>
                    </Box>
                    
                    <Box variant="awsui-key-label">
                      <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                        {t('pages:utilization.applicationsMonitored')}
                      </div>
                      <div style={{ fontSize: '24px', color: '#0073bb' }}>
                        {getCurrentChartData().series.length}
                      </div>
                    </Box>
                  </Grid>
                )}
              </Box>
            </SpaceBetween>
          </Container>
          
          {/* Trend Analysis Table */}
          <Container>
            <SpaceBetween size="l">
              <Header variant="h2">
                {t('pages:utilization.trendAnalysis')}
              </Header>
              
              <Box padding="s">
                {loading ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:utilization.loadingTrendData')}
                  </Box>
                ) : getCurrentChartData().series.length === 0 ? (
                  <Box textAlign="center" padding="xl">
                    {t('pages:utilization.noTrendData')}
                  </Box>
                ) : (
                  <Table
                    columnDefinitions={[
                      {
                        id: 'application',
                        header: t('pages:utilization.application'),
                        cell: item => item.name,
                        sortingField: 'name'
                      },
                      {
                        id: 'trend',
                        header: t('pages:utilization.trend'),
                        cell: item => (
                          <span style={{ 
                            color: item.trend === 'increasing' ? '#16805A' : 
                                  item.trend === 'decreasing' ? '#D91515' : 
                                  '#5F6B7A' 
                          }}>
                            {t(`pages.utilization.${item.trend}`)}
                          </span>
                        ),
                        sortingField: 'trend'
                      },
                      {
                        id: 'percentChange',
                        header: t('pages:utilization.changePercent'),
                        cell: item => (
                          <span style={{ 
                            color: item.percentChange > 0 ? '#16805A' : 
                                  item.percentChange < 0 ? '#D91515' : 
                                  '#5F6B7A' 
                          }}>
                            {item.percentChange !== undefined ? `${item.percentChange.toFixed(1)}%` : t('common.na')}
                          </span>
                        ),
                        sortingField: 'percentChange'
                      },
                      {
                        id: 'startValue',
                        header: t('pages:utilization.initialValue'),
                        cell: item => item.startValue !== undefined ? 
                          `${item.startValue.toFixed(1)}${activeTabId === 'network' ? ' GB/s' : activeTabId === 'iops' ? '' : '%'}` : 
                          t('common.na'),
                        sortingField: 'startValue'
                      },
                      {
                        id: 'currentValue',
                        header: t('pages:utilization.currentValue'),
                        cell: item => item.currentValue !== undefined ? 
                          `${item.currentValue.toFixed(1)}${activeTabId === 'network' ? ' GB/s' : activeTabId === 'iops' ? '' : '%'}` : 
                          t('common.na'),
                        sortingField: 'currentValue'
                      },
                      {
                        id: 'peakValue',
                        header: t('pages:utilization.peakValue'),
                        cell: item => item.peakValue !== undefined ? 
                          `${item.peakValue.toFixed(1)}${activeTabId === 'network' ? ' GB/s' : activeTabId === 'iops' ? '' : '%'}` : 
                          t('common.na'),
                        sortingField: 'peakValue'
                      }
                    ]}
                    items={(() => {
                      const data = getCurrentChartData();
                      if (!data.series.length) return [];
                      
                      // Analyze trends
                      let items = data.series.map(series => {
                        const values = series.values;
                        if (values.length < 2) return { 
                          name: series.name, 
                          trend: 'stable',
                          percentChange: 0,
                          startValue: values.length > 0 ? values[0].value : undefined,
                          currentValue: values.length > 0 ? values[values.length - 1].value : undefined,
                          peakValue: values.length > 0 ? Math.max(...values.map(v => v.value)) : undefined
                        };
                        
                        // Calculate trend by comparing first and last values
                        const firstValue = values[0].value;
                        const lastValue = values[values.length - 1].value;
                        const percentChange = ((lastValue - firstValue) / firstValue) * 100;
                        
                        let trend;
                        if (percentChange > 10) {
                          trend = 'increasing';
                        } else if (percentChange < -10) {
                          trend = 'decreasing';
                        } else {
                          trend = 'stable';
                        }
                        
                        // Find peak value
                        const peakValue = Math.max(...values.map(v => v.value));
                        
                        return { 
                          name: series.name, 
                          trend, 
                          percentChange,
                          startValue: firstValue,
                          currentValue: lastValue,
                          peakValue: peakValue
                        };
                      });
                      
                      // Apply sorting
                      if (trendTableSortingColumn && trendTableSortingColumn.sortingField) {
                        const sortingField = trendTableSortingColumn.sortingField;
                        items.sort((a, b) => {
                          const valueA = a[sortingField];
                          const valueB = b[sortingField];
                          
                          if (valueA === undefined) return 1;
                          if (valueB === undefined) return -1;
                          
                          if (typeof valueA === 'string' && typeof valueB === 'string') {
                            return trendTableSortingDescending 
                              ? valueB.localeCompare(valueA) 
                              : valueA.localeCompare(valueB);
                          } else {
                            return trendTableSortingDescending 
                              ? valueB - valueA 
                              : valueA - valueB;
                          }
                        });
                      }
                      
                      // Apply pagination
                      const startIndex = (trendTableCurrentPage - 1) * trendTablePageSize;
                      const endIndex = startIndex + trendTablePageSize;
                      
                      return items.slice(startIndex, endIndex);
                    })()}
                    sortingColumn={trendTableSortingColumn}
                    sortingDescending={trendTableSortingDescending}
                    onSortingChange={({ detail }) => {
                      setTrendTableSortingColumn(detail.sortingColumn);
                      setTrendTableSortingDescending(detail.isDescending);
                    }}
                    loading={loading}
                    loadingText={t('pages:utilization.loadingTrendAnalysis')}
                    empty={
                      <Box textAlign="center" color="inherit">
                        <b>{t('pages:utilization.noTrendDataTitle')}</b>
                        <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                          {t('pages:utilization.noTrendDataDescription')}
                        </Box>
                      </Box>
                    }
                    header={
                      <Header
                        counter={`(${getAllTrendItems().length})`}
                      >
                        {t('pages:utilization.applicationTrends')}
                      </Header>
                    }
                    pagination={
                      <Pagination
                        currentPageIndex={trendTableCurrentPage}
                        pagesCount={Math.ceil(getAllTrendItems().length / trendTablePageSize)}
                        ariaLabels={{
                          nextPageLabel: t('common.nextPage'),
                          previousPageLabel: t('common.previousPage'),
                          pageLabel: pageNumber => t('common.pageOfAll', { pageNumber })
                        }}
                        onChange={({ detail }) => setTrendTableCurrentPage(detail.currentPageIndex)}
                      />
                    }
                    preferences={
                      <CollectionPreferences
                        title={t('common.preferences')}
                        confirmLabel={t('common.confirm')}
                        cancelLabel={t('common.cancel')}
                        preferences={{
                          pageSize: trendTablePageSize,
                          visibleContent: trendTableVisibleColumns
                        }}
                        pageSizePreference={{
                          title: t('common.pageSize'),
                          options: [
                            { value: 5, label: t('pages:utilization.fiveApplications') },
                            { value: 10, label: t('pages:utilization.tenApplications') },
                            { value: 20, label: t('pages:utilization.twentyApplications') }
                          ]
                        }}
                        visibleContentPreference={{
                          title: t('common.selectVisibleColumns'),
                          options: [
                            {
                              label: t('pages:utilization.applicationProperties'),
                              options: [
                                { id: "application", label: t('pages:utilization.application') },
                                { id: "trend", label: t('pages:utilization.trend') },
                                { id: "percentChange", label: t('pages:utilization.changePercent') },
                                { id: "startValue", label: t('pages:utilization.initialValue') },
                                { id: "currentValue", label: t('pages:utilization.currentValue') },
                                { id: "peakValue", label: t('pages:utilization.peakValue') }
                              ]
                            }
                          ]
                        }}
                        onConfirm={({ detail }) => {
                          setTrendTablePageSize(detail.pageSize);
                          setTrendTableVisibleColumns(detail.visibleContent);
                        }}
                      />
                    }
                    visibleColumns={trendTableVisibleColumns}
                  />
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

export default UtilizationAnalysisPage;
