import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  Button,
  Modal,
  ColumnLayout,
  StatusIndicator,
  Table,
  CollectionPreferences,
  Pagination,
  Tabs,
  TextFilter,
  Select,
  Alert,
  Spinner
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { navigateToExportWithCategory } from '../../utils/exportNavigationUtils';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import TechRadarChart from '../../components/charts/TechRadarChart';
import VisionAnalysisInfoContent from '../../components/info/VisionAnalysisInfoContent';
import MissingDataAlert from '../../components/MissingDataAlert';

// Hooks
import useDataSourceCheck from '../../hooks/useDataSourceCheck';

// API services
// Import from Athena query service instead of mock API
import { getTechRadarData } from '../../services/athenaQueryService';

/**
 * Vision Analysis Page Component
 * 
 * This page displays a Tech Radar visualization of the organization's technology vision,
 * along with detailed information about technologies in different quadrants and rings.
 */
const VisionAnalysisPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  // Check if required data sources exist
  const { hasData, loading: checkingData, missingDataSources } = useDataSourceCheck(['technology-vision']);
  
  const [toolsOpen, setToolsOpen] = useState(false);
  const [techRadarData, setTechRadarData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [error, setError] = useState(null);
  
  // State for table sorting, pagination, filtering
  const [tableSortingState, setTableSortingState] = useState({
    Techniques: { sortingColumn: { sortingField: 'name' }, sortingDescending: false },
    Tools: { sortingColumn: { sortingField: 'name' }, sortingDescending: false },
    Platforms: { sortingColumn: { sortingField: 'name' }, sortingDescending: false },
    'Languages & Frameworks': { sortingColumn: { sortingField: 'name' }, sortingDescending: false }
  });
  const [tablePaginationState, setTablePaginationState] = useState({
    Techniques: { currentPageIndex: 1, pageSize: 10 },
    Tools: { currentPageIndex: 1, pageSize: 10 },
    Platforms: { currentPageIndex: 1, pageSize: 10 },
    'Languages & Frameworks': { currentPageIndex: 1, pageSize: 10 }
  });
  const [tablePreferencesState, setTablePreferencesState] = useState({
    Techniques: { pageSize: 10, visibleContent: ['name', 'ring', 'status'] },
    Tools: { pageSize: 10, visibleContent: ['name', 'ring', 'status'] },
    Platforms: { pageSize: 10, visibleContent: ['name', 'ring', 'status'] },
    'Languages & Frameworks': { pageSize: 10, visibleContent: ['name', 'ring', 'status'] }
  });
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

  const [tableFilterState, setTableFilterState] = useState(() => {
    const saved = localStorage.getItem(`visionFilters_${projectId}_tableFilters`);
    return saved ? JSON.parse(saved) : {
      Techniques: { filterText: '', filterColumn: { value: 'all', label: 'All columns' } },
      Tools: { filterText: '', filterColumn: { value: 'all', label: 'All columns' } },
      Platforms: { filterText: '', filterColumn: { value: 'all', label: 'All columns' } },
      'Languages & Frameworks': { filterText: '', filterColumn: { value: 'all', label: 'All columns' } }
    };
  });
  
  // State for active quadrant tab
  const [activeQuadrantTab, setActiveQuadrantTab] = useState('techniques-tab');

  // State for retry mechanism
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  // Fetch tech radar data with retry mechanism
  useEffect(() => {
    // Don't fetch if data sources are not available
    if (!hasData) {
      console.log('VisionAnalysisPage: Skipping data fetch - required data sources not available');
      return;
    }
    
    const fetchTechRadarData = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log(`🔄 Fetching tech radar data from Athena... (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        
        const result = await getTechRadarData();
        console.log('📊 Raw result from Athena:', result);
        console.log('📊 Result type:', typeof result);
        console.log('📊 Result keys:', result ? Object.keys(result) : 'null');
        console.log('📊 Result.success:', result?.success);
        console.log('📊 Result.data type:', typeof result?.data);
        console.log('📊 Result.data length:', result?.data?.length);
        console.log('📊 First item:', result?.data?.[0]);
        
        // Check if we got the expected data format with success flag
        if (result && result.success === true && Array.isArray(result.data)) {
          console.log('✅ Tech radar data fetched successfully:', result.data.length);
          
          // Map the data structure to match what TechRadarChart expects
          // The Athena API returns 'technology' and 'phase' fields, but our component expects 'name' and 'ring'
          const mappedData = result.data.map(item => ({
            ...item,
            name: item.technology,  // Map 'technology' to 'name'
            ring: item.phase        // Map 'phase' to 'ring'
          }));
          
          console.log('✅ Mapped tech radar data:', mappedData.length);
          console.log('✅ First mapped item:', mappedData[0]);
          setTechRadarData(mappedData);
        } else if (Array.isArray(result)) {
          // Handle direct array response
          console.log('✅ Tech radar data fetched successfully (direct array):', result.length);
          
          // Map the data structure if needed
          const mappedData = result.map(item => ({
            ...item,
            name: item.technology || item.name,
            ring: item.phase || item.ring
          }));
          
          console.log('✅ Mapped direct array data:', mappedData.length);
          setTechRadarData(mappedData);
        } else {
          console.error('❌ Unexpected data format:', result);
          console.error('❌ Expected: { success: true, data: [...] } or [...]');
          console.error('❌ Received:', result);
          setError('Received unexpected data format from the server');
        }
      } catch (error) {
        console.error('❌ Error fetching tech radar data:', error);
        
        // Check if error is due to missing view/table (no data uploaded yet)
        if (error.message && (
          error.message.includes('does not exist') || 
          error.message.includes('FAILED') ||
          error.message.includes('Table not found') ||
          error.message.includes('View not found')
        )) {
          // Don't show error for missing data - just show empty state
          console.log('No technology vision data uploaded yet');
          setError(null);
          setTechRadarData([]);
        } else if (retryCount < MAX_RETRIES) {
          // If we haven't reached max retries, increment retry count
          console.log(`🔄 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          setRetryCount(retryCount + 1);
        } else {
          setError(`Failed to fetch tech radar data after ${MAX_RETRIES + 1} attempts: ${error.message}`);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTechRadarData();
  }, [retryCount, hasData]);

  // Handle item click in tech radar
  const handleItemClick = (item) => {
    setSelectedItem(item);
    setIsModalVisible(true);
  };

  // Get status indicator based on ring/phase
  const getStatusIndicator = (value) => {
    // Normalize the value to handle both 'ring' and 'phase' fields
    const normalizedValue = value ? value.toLowerCase() : '';
    
    switch (normalizedValue) {
      case 'adopt':
        return <StatusIndicator type="success">{t('pages:visionAnalysis.adopt')}</StatusIndicator>;
      case 'trial':
        return <StatusIndicator type="info">{t('pages:visionAnalysis.trial')}</StatusIndicator>;
      case 'assess':
        return <StatusIndicator type="warning">{t('pages:visionAnalysis.assess')}</StatusIndicator>;
      case 'hold':
        return <StatusIndicator type="error">{t('pages:visionAnalysis.hold')}</StatusIndicator>;
      default:
        return <StatusIndicator type="stopped">{value}</StatusIndicator>;
    }
  };

  // Check if any items in a quadrant have status values
  const hasStatusValues = (quadrant) => {
    const quadrantData = Array.isArray(techRadarData) 
      ? techRadarData.filter(item => item.quadrant === quadrant) 
      : [];
      
    return quadrantData.some(item => item.status);
  };

  // Get visible columns for a quadrant
  const getVisibleColumns = (quadrant) => {
    return hasStatusValues(quadrant) ? ['name', 'ring', 'status'] : ['name', 'ring'];
  };

  // Group data by quadrant for table view and apply sorting and filtering
  const getGroupedAndSortedData = () => {
    // Ensure techRadarData is an array before processing
    const dataArray = Array.isArray(techRadarData) ? techRadarData : [];
    
    const grouped = dataArray.reduce((acc, item) => {
      // Ensure quadrant exists, default to uncategorized if not
      const quadrant = item.quadrant || t('pages:visionAnalysis.uncategorized');
      
      if (!acc[quadrant]) {
        acc[quadrant] = [];
      }
      acc[quadrant].push(item);
      return acc;
    }, {});
    
    // Apply filtering and sorting to each quadrant
    Object.keys(grouped).forEach(quadrant => {
      let result = [...grouped[quadrant]];
      
      // Apply filtering
      const { filterText, filterColumn } = tableFilterState[quadrant] || { filterText: '', filterColumn: { value: 'all' } };
      
      if (filterText) {
        if (filterColumn.value === 'all') {
          result = result.filter(item => 
            (item.name && item.name.toLowerCase().includes(filterText.toLowerCase())) ||
            (item.technology && item.technology.toLowerCase().includes(filterText.toLowerCase())) ||
            (item.ring && item.ring.toLowerCase().includes(filterText.toLowerCase())) ||
            (item.phase && item.phase.toLowerCase().includes(filterText.toLowerCase())) ||
            (item.status && item.status.toLowerCase().includes(filterText.toLowerCase()))
          );
        } else {
          result = result.filter(item => {
            // Handle both field naming conventions
            let value;
            if (filterColumn.value === 'name' && !item.name && item.technology) {
              value = item.technology;
            } else if (filterColumn.value === 'ring' && !item.ring && item.phase) {
              value = item.phase;
            } else {
              value = item[filterColumn.value];
            }
            return value && String(value).toLowerCase().includes(filterText.toLowerCase());
          });
        }
      }
      
      // Apply sorting
      const sortingState = tableSortingState[quadrant];
      if (sortingState && sortingState.sortingColumn) {
        const { sortingField } = sortingState.sortingColumn;
        const isDescending = sortingState.sortingDescending;
        
        result.sort((a, b) => {
          let valueA = a[sortingField];
          let valueB = b[sortingField];
          
          // Handle string comparison
          if (typeof valueA === 'string' && typeof valueB === 'string') {
            valueA = valueA.toLowerCase();
            valueB = valueB.toLowerCase();
            return isDescending 
              ? valueB.localeCompare(valueA) 
              : valueA.localeCompare(valueB);
          }
          
          // Handle numeric comparison
          return isDescending 
            ? valueB - valueA 
            : valueA - valueB;
        });
      }
      
      grouped[quadrant] = result;
    });
    
    return grouped;
  };
  
  // Get sorted and grouped data
  const groupedByQuadrant = getGroupedAndSortedData();
  
  // Log the grouped data for debugging
  useEffect(() => {
    if (!loading) {
      console.log('📊 Grouped data by quadrant:', groupedByQuadrant);
      console.log('📊 Available quadrants:', Object.keys(groupedByQuadrant));
      
      // Log sample items from each quadrant
      Object.keys(groupedByQuadrant).forEach(quadrant => {
        const items = groupedByQuadrant[quadrant];
        if (items && items.length > 0) {
          console.log(`📊 Sample item from ${quadrant}:`, items[0]);
        } else {
          console.log(`📊 No items in ${quadrant}`);
        }
      });
    }
  }, [loading, groupedByQuadrant]);
  
  // Save table filters to localStorage (project-specific)
  useEffect(() => {
    localStorage.setItem(`visionFilters_${projectId}_tableFilters`, JSON.stringify(tableFilterState));
  }, [tableFilterState, projectId]);

  // Handle filter text change for a specific quadrant
  const handleFilterChange = (quadrant, detail) => {
    setTableFilterState(prev => ({
      ...prev,
      [quadrant]: {
        ...prev[quadrant],
        filterText: detail.filteringText
      }
    }));
    
    // Log filter change for debugging
    console.log(`🔍 Filter changed for ${quadrant}:`, detail.filteringText);
  };
  
  // Handle filter column change for a specific quadrant
  const handleFilterColumnChange = (quadrant, detail) => {
    setTableFilterState(prev => ({
      ...prev,
      [quadrant]: {
        ...prev[quadrant],
        filterColumn: detail.selectedOption
      }
    }));
  };
  
  // Get filter column options for a quadrant
  const getFilterColumnOptions = (quadrant) => {
    const options = [
      { value: 'all', label: 'All columns' },
      { value: 'name', label: 'Technology' },
      { value: 'ring', label: 'Ring' }
    ];
    
    // Add technology option if using Athena data format
    const hasAthenaFormat = techRadarData.some(item => item.technology);
    if (hasAthenaFormat) {
      options.push({ value: 'technology', label: 'Technology' });
    }
    
    // Add phase option if using Athena data format
    const hasPhaseField = techRadarData.some(item => item.phase);
    if (hasPhaseField) {
      options.push({ value: 'phase', label: 'Phase' });
    }
    
    // Add status option if any items have status
    if (hasStatusValues(quadrant)) {
      options.push({ value: 'status', label: 'Status' });
    }
    
    return options;
  };
  
  // Handle sorting change for a specific quadrant
  const handleSortingChange = (quadrant, detail) => {
    setTableSortingState(prev => ({
      ...prev,
      [quadrant]: {
        sortingColumn: detail.sortingColumn,
        sortingDescending: detail.isDescending
      }
    }));
  };
  
  // Handle pagination change for a specific quadrant
  const handlePaginationChange = (quadrant, detail) => {
    setTablePaginationState(prev => ({
      ...prev,
      [quadrant]: {
        ...prev[quadrant],
        currentPageIndex: detail.currentPageIndex
      }
    }));
  };
  
  // Handle preferences change for a specific quadrant
  const handlePreferencesChange = (quadrant, detail) => {
    setTablePreferencesState(prev => ({
      ...prev,
      [quadrant]: detail
    }));
    
    // Update page size in pagination state
    setTablePaginationState(prev => ({
      ...prev,
      [quadrant]: {
        ...prev[quadrant],
        pageSize: detail.pageSize,
        currentPageIndex: 1 // Reset to first page when changing page size
      }
    }));
  };
  
  // Handle quadrant tab change
  const handleQuadrantTabChange = ({ detail }) => {
    setActiveQuadrantTab(detail.activeTabId);
  };
  
  // Get column definitions for a quadrant
  const getColumnDefinitions = (quadrant) => {
    const hasStatus = hasStatusValues(quadrant);
    
    const columns = [
      {
        id: 'name',
        header: 'Technology',
        cell: item => item.name || item.technology || '',
        sortingField: 'name',
        width: 200
      },
      {
        id: 'ring',
        header: 'Ring',
        cell: item => getStatusIndicator(item.ring || item.phase),
        sortingField: 'ring',
        width: 120
      }
    ];
    
    if (hasStatus) {
      columns.push({
        id: 'status',
        header: 'Status',
        cell: item => item.status || '-',
        width: 300
      });
    }
    
    return columns;
  };

  return (
    <Layout
      activeHref="/insights/vision"
      infoContent={
        <Box padding="l">
          <VisionAnalysisInfoContent />
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
              <Button 
                iconName="download"
                onClick={() => navigateToExportWithCategory('vision-analysis', navigate)}
              >
                {t('common:buttons.export')}
              </Button>
            }
          >
            {t('pages:visionAnalysis.title')}
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
          {/* Tech Radar Section */}
          <Container>
            <SpaceBetween size="l">
              <Header variant="h2"
                actions={
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
                }
              >
                {t('pages:visionAnalysis.technologyVisionRadar')}
              </Header>
              
              {error && (
                <Alert
                  type="error"
                  header={t('pages:visionAnalysis.errorFetchingTechRadarData')}
                  dismissible
                  onDismiss={() => setError(null)}
                  action={
                    <Button 
                      onClick={() => {
                        setError(null);
                        setRetryCount(retryCount + 1);
                      }}
                    >
                      {t('common:buttons.retry')}
                    </Button>
                  }
                >
                  {error}
                  <Box variant="p" padding={{ top: 's' }}>
                    {t('common:messages.networkError')}
                  </Box>
                </Alert>
              )}
              
              <Box padding="l">
                {loading ? (
                  <Box textAlign="center" padding="xl">
                    <SpaceBetween size="m" alignItems="center">
                      <Spinner size="large" />
                      <Box variant="p">{t('pages:visionAnalysis.loadingTechRadarChart')}</Box>
                    </SpaceBetween>
                  </Box>
                ) : (
                  <Box textAlign="center">
                    <TechRadarChart
                      data={techRadarData}
                      width={800}
                      height={800}
                      onItemClick={handleItemClick}
                      showItemLabels={true}
                    />
                    {techRadarData.length === 0 && !loading && !error && (
                      <Box padding="l">
                        <Alert type="info" header={t('pages:visionAnalysis.noDataAvailable')}>
                          {t('pages:visionAnalysis.noTechnologyVisionData')}
                        </Alert>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </SpaceBetween>
          </Container>

          {/* Technologies Table Section */}
          <Container>
            <SpaceBetween size="l">
              <Header variant="h2">
                {t('pages:visionAnalysis.technologiesByQuadrant')}
              </Header>
              
              <Tabs
                activeTabId={activeQuadrantTab}
                onChange={handleQuadrantTabChange}
                tabs={[
                  {
                    label: "Techniques",
                    id: "techniques-tab",
                    content: (
                      <SpaceBetween size="m">
                        {loading ? (
                          <Box textAlign="center" padding="xl">
                            <SpaceBetween size="m" alignItems="center">
                              <Spinner size="large" />
                              <Box variant="p">{t('pages:visionAnalysis.loadingTechniquesTable')}</Box>
                            </SpaceBetween>
                          </Box>
                        ) : (
                          <Table
                            columnDefinitions={getColumnDefinitions('Techniques')}
                            items={groupedByQuadrant['Techniques'] || []}
                            visibleColumns={getVisibleColumns('Techniques')}
                            sortingColumn={tableSortingState['Techniques']?.sortingColumn}
                            sortingDescending={tableSortingState['Techniques']?.sortingDescending}
                            onSortingChange={({ detail }) => handleSortingChange('Techniques', detail)}
                            variant="embedded"
                            stickyHeader={true}
                            empty={
                              <Box textAlign="center" color="inherit">
                                <b>{t('pages:visionAnalysis.noTechnologies')}</b>
                                <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                                  {t('pages:visionAnalysis.noTechnologiesInQuadrant')}
                                </Box>
                              </Box>
                            }
                            filter={
                              <SpaceBetween direction="horizontal" size="xs">
                                <Select
                                  selectedOption={tableFilterState['Techniques']?.filterColumn || { value: 'all', label: 'All columns' }}
                                  onChange={({ detail }) => handleFilterColumnChange('Techniques', detail)}
                                  options={getFilterColumnOptions('Techniques')}
                                  ariaLabel={t('components:common.filterColumn')}
                                />
                                <div style={{ width: '300px' }}>
                                  <TextFilter
                                    filteringText={tableFilterState['Techniques']?.filterText || ''}
                                    filteringPlaceholder={`${t('components:common.findBy')} ${tableFilterState['Techniques']?.filterColumn?.label?.toLowerCase() || t('components:common.allColumns')}`}
                                    filteringAriaLabel={`${t('components:common.findBy')} ${tableFilterState['Techniques']?.filterColumn?.label?.toLowerCase() || t('components:common.allColumns')}`}
                                    onChange={({ detail }) => handleFilterChange('Techniques', detail)}
                                  />
                                </div>
                              </SpaceBetween>
                            }
                            pagination={
                              <Pagination
                                pageSize={tablePaginationState['Techniques']?.pageSize || 10}
                                currentPageIndex={tablePaginationState['Techniques']?.currentPageIndex || 1}
                                pagesCount={Math.ceil((groupedByQuadrant['Techniques']?.length || 0) / (tablePaginationState['Techniques']?.pageSize || 10))}
                                onChange={({ detail }) => handlePaginationChange('Techniques', detail)}
                                ariaLabels={{
                                  nextPageLabel: 'Next page',
                                  previousPageLabel: 'Previous page',
                                  pageLabel: pageNumber => `Page ${pageNumber} of all pages`
                                }}
                              />
                            }
                            preferences={
                              <CollectionPreferences
                                title={t('common:general.preferences')}
                                confirmLabel={t('common:general.confirm')}
                                cancelLabel={t('common:general.cancel')}
                                preferences={tablePreferencesState['Techniques'] || { pageSize: 10 }}
                                pageSizePreference={{
                                  title: "Page size",
                                  options: [
                                    { value: 5, label: "5 technologies" },
                                    { value: 10, label: "10 technologies" },
                                    { value: 20, label: "20 technologies" }
                                  ]
                                }}
                                visibleContentPreference={{
                                  title: "Select visible columns",
                                  options: [
                                    {
                                      label: "Technology properties",
                                      options: [
                                        { id: "name", label: "Technology" },
                                        { id: "ring", label: "Ring" },
                                        ...(hasStatusValues('Techniques') ? [{ id: "status", label: "Status" }] : [])
                                      ]
                                    }
                                  ]
                                }}
                                onConfirm={({ detail }) => handlePreferencesChange('Techniques', detail)}
                              />
                            }
                          />
                        )}
                      </SpaceBetween>
                    )
                  },
                  {
                    label: "Tools",
                    id: "tools-tab",
                    content: (
                      <SpaceBetween size="m">
                        {loading ? (
                          <Box textAlign="center" padding="xl">
                            <SpaceBetween size="m" alignItems="center">
                              <Spinner size="large" />
                              <Box variant="p">{t('pages:visionAnalysis.loadingToolsTable')}</Box>
                            </SpaceBetween>
                          </Box>
                        ) : (
                          <Table
                            columnDefinitions={getColumnDefinitions('Tools')}
                            items={groupedByQuadrant['Tools'] || []}
                            visibleColumns={getVisibleColumns('Tools')}
                            sortingColumn={tableSortingState['Tools']?.sortingColumn}
                            sortingDescending={tableSortingState['Tools']?.sortingDescending}
                            onSortingChange={({ detail }) => handleSortingChange('Tools', detail)}
                            variant="embedded"
                            stickyHeader={true}
                            empty={
                              <Box textAlign="center" color="inherit">
                                <b>{t('pages:visionAnalysis.noTechnologies')}</b>
                                <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                                  {t('pages:visionAnalysis.noTechnologiesInQuadrant')}
                                </Box>
                              </Box>
                            }
                            filter={
                              <SpaceBetween direction="horizontal" size="xs">
                                <Select
                                  selectedOption={tableFilterState['Tools']?.filterColumn || { value: 'all', label: 'All columns' }}
                                  onChange={({ detail }) => handleFilterColumnChange('Tools', detail)}
                                  options={getFilterColumnOptions('Tools')}
                                  ariaLabel={t('components:common.filterColumn')}
                                />
                                <div style={{ width: '300px' }}>
                                  <TextFilter
                                    filteringText={tableFilterState['Tools']?.filterText || ''}
                                    filteringPlaceholder={`${t('components:common.findBy')} ${tableFilterState['Tools']?.filterColumn?.label?.toLowerCase() || t('components:common.allColumns')}`}
                                    filteringAriaLabel={`${t('components:common.findBy')} ${tableFilterState['Tools']?.filterColumn?.label?.toLowerCase() || t('components:common.allColumns')}`}
                                    onChange={({ detail }) => handleFilterChange('Tools', detail)}
                                  />
                                </div>
                              </SpaceBetween>
                            }
                            pagination={
                              <Pagination
                                pageSize={tablePaginationState['Tools']?.pageSize || 10}
                                currentPageIndex={tablePaginationState['Tools']?.currentPageIndex || 1}
                                pagesCount={Math.ceil((groupedByQuadrant['Tools']?.length || 0) / (tablePaginationState['Tools']?.pageSize || 10))}
                                onChange={({ detail }) => handlePaginationChange('Tools', detail)}
                                ariaLabels={{
                                  nextPageLabel: 'Next page',
                                  previousPageLabel: 'Previous page',
                                  pageLabel: pageNumber => `Page ${pageNumber} of all pages`
                                }}
                              />
                            }
                            preferences={
                              <CollectionPreferences
                                title={t('common:general.preferences')}
                                confirmLabel={t('common:general.confirm')}
                                cancelLabel={t('common:general.cancel')}
                                preferences={tablePreferencesState['Tools'] || { pageSize: 10 }}
                                pageSizePreference={{
                                  title: "Page size",
                                  options: [
                                    { value: 5, label: "5 technologies" },
                                    { value: 10, label: "10 technologies" },
                                    { value: 20, label: "20 technologies" }
                                  ]
                                }}
                                visibleContentPreference={{
                                  title: "Select visible columns",
                                  options: [
                                    {
                                      label: "Technology properties",
                                      options: [
                                        { id: "name", label: "Technology" },
                                        { id: "ring", label: "Ring" },
                                        ...(hasStatusValues('Tools') ? [{ id: "status", label: "Status" }] : [])
                                      ]
                                    }
                                  ]
                                }}
                                onConfirm={({ detail }) => handlePreferencesChange('Tools', detail)}
                              />
                            }
                          />
                        )}
                      </SpaceBetween>
                    )
                  },
                  {
                    label: "Platforms",
                    id: "platforms-tab",
                    content: (
                      <SpaceBetween size="m">
                        {loading ? (
                          <Box textAlign="center" padding="xl">
                            <SpaceBetween size="m" alignItems="center">
                              <Spinner size="large" />
                              <Box variant="p">{t('pages:visionAnalysis.loadingPlatformsTable')}</Box>
                            </SpaceBetween>
                          </Box>
                        ) : (
                          <Table
                            columnDefinitions={getColumnDefinitions('Platforms')}
                            items={groupedByQuadrant['Platforms'] || []}
                            visibleColumns={getVisibleColumns('Platforms')}
                            sortingColumn={tableSortingState['Platforms']?.sortingColumn}
                            sortingDescending={tableSortingState['Platforms']?.sortingDescending}
                            onSortingChange={({ detail }) => handleSortingChange('Platforms', detail)}
                            variant="embedded"
                            stickyHeader={true}
                            empty={
                              <Box textAlign="center" color="inherit">
                                <b>{t('pages:visionAnalysis.noTechnologies')}</b>
                                <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                                  {t('pages:visionAnalysis.noTechnologiesInQuadrant')}
                                </Box>
                              </Box>
                            }
                            filter={
                              <SpaceBetween direction="horizontal" size="xs">
                                <Select
                                  selectedOption={tableFilterState['Platforms']?.filterColumn || { value: 'all', label: 'All columns' }}
                                  onChange={({ detail }) => handleFilterColumnChange('Platforms', detail)}
                                  options={getFilterColumnOptions('Platforms')}
                                  ariaLabel={t('components:common.filterColumn')}
                                />
                                <div style={{ width: '300px' }}>
                                  <TextFilter
                                    filteringText={tableFilterState['Platforms']?.filterText || ''}
                                    filteringPlaceholder={`${t('components:common.findBy')} ${tableFilterState['Platforms']?.filterColumn?.label?.toLowerCase() || t('components:common.allColumns')}`}
                                    filteringAriaLabel={`${t('components:common.findBy')} ${tableFilterState['Platforms']?.filterColumn?.label?.toLowerCase() || t('components:common.allColumns')}`}
                                    onChange={({ detail }) => handleFilterChange('Platforms', detail)}
                                  />
                                </div>
                              </SpaceBetween>
                            }
                            pagination={
                              <Pagination
                                pageSize={tablePaginationState['Platforms']?.pageSize || 10}
                                currentPageIndex={tablePaginationState['Platforms']?.currentPageIndex || 1}
                                pagesCount={Math.ceil((groupedByQuadrant['Platforms']?.length || 0) / (tablePaginationState['Platforms']?.pageSize || 10))}
                                onChange={({ detail }) => handlePaginationChange('Platforms', detail)}
                                ariaLabels={{
                                  nextPageLabel: 'Next page',
                                  previousPageLabel: 'Previous page',
                                  pageLabel: pageNumber => `Page ${pageNumber} of all pages`
                                }}
                              />
                            }
                            preferences={
                              <CollectionPreferences
                                title={t('common:general.preferences')}
                                confirmLabel={t('common:general.confirm')}
                                cancelLabel={t('common:general.cancel')}
                                preferences={tablePreferencesState['Platforms'] || { pageSize: 10 }}
                                pageSizePreference={{
                                  title: "Page size",
                                  options: [
                                    { value: 5, label: "5 technologies" },
                                    { value: 10, label: "10 technologies" },
                                    { value: 20, label: "20 technologies" }
                                  ]
                                }}
                                visibleContentPreference={{
                                  title: "Select visible columns",
                                  options: [
                                    {
                                      label: "Technology properties",
                                      options: [
                                        { id: "name", label: "Technology" },
                                        { id: "ring", label: "Ring" },
                                        ...(hasStatusValues('Platforms') ? [{ id: "status", label: "Status" }] : [])
                                      ]
                                    }
                                  ]
                                }}
                                onConfirm={({ detail }) => handlePreferencesChange('Platforms', detail)}
                              />
                            }
                          />
                        )}
                      </SpaceBetween>
                    )
                  },
                  {
                    label: "Languages & Frameworks",
                    id: "languages-frameworks-tab",
                    content: (
                      <SpaceBetween size="m">
                        {loading ? (
                          <Box textAlign="center" padding="xl">
                            <SpaceBetween size="m" alignItems="center">
                              <Spinner size="large" />
                              <Box variant="p">{t('pages:visionAnalysis.loadingLanguagesFrameworksTable')}</Box>
                            </SpaceBetween>
                          </Box>
                        ) : (
                          <Table
                            columnDefinitions={getColumnDefinitions('Languages & Frameworks')}
                            items={groupedByQuadrant['Languages & Frameworks'] || []}
                            visibleColumns={getVisibleColumns('Languages & Frameworks')}
                            sortingColumn={tableSortingState['Languages & Frameworks']?.sortingColumn}
                            sortingDescending={tableSortingState['Languages & Frameworks']?.sortingDescending}
                            onSortingChange={({ detail }) => handleSortingChange('Languages & Frameworks', detail)}
                            variant="embedded"
                            stickyHeader={true}
                            empty={
                              <Box textAlign="center" color="inherit">
                                <b>{t('pages:visionAnalysis.noTechnologies')}</b>
                                <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                                  {t('pages:visionAnalysis.noTechnologiesInQuadrant')}
                                </Box>
                              </Box>
                            }
                            filter={
                              <SpaceBetween direction="horizontal" size="xs">
                                <Select
                                  selectedOption={tableFilterState['Languages & Frameworks']?.filterColumn || { value: 'all', label: 'All columns' }}
                                  onChange={({ detail }) => handleFilterColumnChange('Languages & Frameworks', detail)}
                                  options={getFilterColumnOptions('Languages & Frameworks')}
                                  ariaLabel={t('components:common.filterColumn')}
                                />
                                <div style={{ width: '300px' }}>
                                  <TextFilter
                                    filteringText={tableFilterState['Languages & Frameworks']?.filterText || ''}
                                    filteringPlaceholder={`${t('components:common.findBy')} ${tableFilterState['Languages & Frameworks']?.filterColumn?.label?.toLowerCase() || t('components:common.allColumns')}`}
                                    filteringAriaLabel={`${t('components:common.findBy')} ${tableFilterState['Languages & Frameworks']?.filterColumn?.label?.toLowerCase() || t('components:common.allColumns')}`}
                                    onChange={({ detail }) => handleFilterChange('Languages & Frameworks', detail)}
                                  />
                                </div>
                              </SpaceBetween>
                            }
                            pagination={
                              <Pagination
                                pageSize={tablePaginationState['Languages & Frameworks']?.pageSize || 10}
                                currentPageIndex={tablePaginationState['Languages & Frameworks']?.currentPageIndex || 1}
                                pagesCount={Math.ceil((groupedByQuadrant['Languages & Frameworks']?.length || 0) / (tablePaginationState['Languages & Frameworks']?.pageSize || 10))}
                                onChange={({ detail }) => handlePaginationChange('Languages & Frameworks', detail)}
                                ariaLabels={{
                                  nextPageLabel: 'Next page',
                                  previousPageLabel: 'Previous page',
                                  pageLabel: pageNumber => `Page ${pageNumber} of all pages`
                                }}
                              />
                            }
                            preferences={
                              <CollectionPreferences
                                title={t('common:general.preferences')}
                                confirmLabel={t('common:general.confirm')}
                                cancelLabel={t('common:general.cancel')}
                                preferences={tablePreferencesState['Languages & Frameworks'] || { pageSize: 10 }}
                                pageSizePreference={{
                                  title: "Page size",
                                  options: [
                                    { value: 5, label: "5 technologies" },
                                    { value: 10, label: "10 technologies" },
                                    { value: 20, label: "20 technologies" }
                                  ]
                                }}
                                visibleContentPreference={{
                                  title: "Select visible columns",
                                  options: [
                                    {
                                      label: "Technology properties",
                                      options: [
                                        { id: "name", label: "Technology" },
                                        { id: "ring", label: "Ring" },
                                        ...(hasStatusValues('Languages & Frameworks') ? [{ id: "status", label: "Status" }] : [])
                                      ]
                                    }
                                  ]
                                }}
                                onConfirm={({ detail }) => handlePreferencesChange('Languages & Frameworks', detail)}
                              />
                            }
                          />
                        )}
                      </SpaceBetween>
                    )
                  }
                ]}
              />
            </SpaceBetween>
          </Container>
          </SpaceBetween>
        </div>
        </SpaceBetween>
        
        <Modal
          visible={isModalVisible}
          onDismiss={() => setIsModalVisible(false)}
          header={selectedItem ? (selectedItem.name || selectedItem.technology) : t('pages:visionAnalysis.technologyDetails')}
          footer={
            <Box float="right">
              <Button variant="primary" onClick={() => setIsModalVisible(false)}>{t('common:close')}</Button>
            </Box>
          }
        >
          {selectedItem && (
            <ColumnLayout columns={1} variant="text-grid">
              <SpaceBetween size="l">
                <div>
                  <Box variant="h3">{t('pages:visionAnalysis.quadrant')}</Box>
                  <p>{selectedItem.quadrant}</p>
                </div>
                
                <div>
                  <Box variant="h3">{t('pages:visionAnalysis.ring')}</Box>
                  <p>{getStatusIndicator(selectedItem.ring || selectedItem.phase)}</p>
                </div>
                
                {selectedItem.status && (
                  <div>
                    <Box variant="h3">{t('pages:visionAnalysis.currentStatus')}</Box>
                    <p>{selectedItem.status}</p>
                  </div>
                )}
                
                {selectedItem.id && (
                  <div>
                    <Box variant="h3">{t('pages:visionAnalysis.id')}</Box>
                    <p>{selectedItem.id}</p>
                  </div>
                )}
              </SpaceBetween>
            </ColumnLayout>
          )}
        </Modal>
      </ContentLayout>
    </Layout>
  );
};

export default VisionAnalysisPage;
