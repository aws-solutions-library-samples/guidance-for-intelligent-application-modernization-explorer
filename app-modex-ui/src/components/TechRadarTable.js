import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table,
  Box,
  Pagination,
  TextFilter,
  CollectionPreferences,
  SpaceBetween,
  Button,
  Header,
  Select,
  Badge,
  Modal,
  ButtonDropdown,
  StatusIndicator
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { getTechRadarData } from '../services/athenaQueryService';
import DownloadDropdownButton from './DownloadDropdownButton';
import AutoRefreshControl from './AutoRefreshControl';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { hasDataChanged } from '../utils/dataComparisonUtils';

function TechRadarTable({ externalRefreshTrigger }) {
  const { t } = useTranslation(['components', 'common']);
  const [allTechnologies, setAllTechnologies] = useState([]);
  const [filteredTechnologies, setFilteredTechnologies] = useState([]);
  const [displayedTechnologies, setDisplayedTechnologies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [filterColumn, setFilterColumn] = useState({ value: 'all', label: 'All columns' });
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'technology' });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['technology', 'quadrant', 'phase']
  });
  const [error, setError] = useState(null);

  // Get badge color based on quadrant
  const getQuadrantBadgeColor = (quadrant) => {
    switch (quadrant) {
      case 'Techniques':
        return '#16808f'; // Teal
      case 'Tools':
        return '#8f4586'; // Purple
      case 'Platforms':
        return '#d14343'; // Red
      case 'Languages & Frameworks':
        return '#2e7d32'; // Green
      default:
        return '#5f6b7a'; // Default gray
    }
  };
  
  // For debugging
  useEffect(() => {
    if (allTechnologies.length > 0) {
      console.log('Sample technology data:', allTechnologies[0]);
    }
  }, [allTechnologies]);

  // Get badge variant based on phase
  const getPhaseBadgeVariant = (phase) => {
    switch (phase) {
      case 'Adopt':
        return 'success'; // Green
      case 'Trial':
        return 'info'; // Blue
      case 'Assess':
        return 'warning'; // Yellow
      case 'Hold':
        return 'error'; // Red
      default:
        return 'normal'; // Default
    }
  };

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'technology',
      header: t('techRadarTable.technology'),
      cell: item => item.technology,
      sortingField: 'technology'
    },
    {
      id: 'quadrant',
      header: t('techRadarTable.quadrant'),
      cell: item => {
        console.log('Rendering quadrant for item:', item);
        return item.quadrant ? (
          <span>{item.quadrant}</span>
        ) : (
          <Box color="text-body-secondary" fontStyle="italic">{t('techRadarTable.unknown')}</Box>
        );
      },
      sortingField: 'quadrant'
    },
    {
      id: 'phase',
      header: t('techRadarTable.phase'),
      cell: item => {
        const getPhaseStyle = (phase) => {
          const baseStyle = {
            display: 'inline-block',
            width: '80px',
            textAlign: 'center',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px'
          };
          
          switch (phase) {
            case 'Adopt':
              return { ...baseStyle, backgroundColor: '#2e7d32' }; // Green
            case 'Trial':
              return { ...baseStyle, backgroundColor: '#0073bb' }; // Blue
            case 'Assess':
              return { ...baseStyle, backgroundColor: '#ff9900' }; // Orange
            case 'Hold':
              return { ...baseStyle, backgroundColor: '#d13212' }; // Red
            default:
              return { ...baseStyle, backgroundColor: '#5f6b7a' }; // Gray
          }
        };
        
        return (
          <span style={getPhaseStyle(item.phase)}>{item.phase}</span>
        );
      },
      sortingField: 'phase'
    }
  ];

  // Download columns (same as table columns but without rendering functions)
  const downloadColumns = [
    { id: 'technology', header: t('techRadarTable.technology') },
    { id: 'quadrant', header: t('techRadarTable.quadrant') },
    { id: 'phase', header: t('techRadarTable.phase') }
  ];

  // Filter column options
  const filterColumnOptions = [
    { value: 'all', label: t('techRadarTable.allColumns') },
    { value: 'technology', label: t('techRadarTable.technology') },
    { value: 'quadrant', label: t('techRadarTable.quadrant') },
    { value: 'phase', label: t('techRadarTable.phase') }
  ];

  // Store current data for comparison
  const currentDataRef = useRef(null);
  
  // Load all technologies when component mounts
  const loadAllTechnologies = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCurrentPage(1);
    try {
      // Use the Athena query service with DISTINCT view
      const response = await getTechRadarData(true);
      const technologies = response?.data || [];
      
      // Generate unique IDs for each record
      const technologiesWithUniqueIds = technologies.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      
      // Smart refresh: only update if data actually changed
      if (hasDataChanged(currentDataRef.current, technologiesWithUniqueIds)) {
        console.log('📊 [TechRadarTable] data changed, updating UI');
        currentDataRef.current = technologiesWithUniqueIds;
        setAllTechnologies(technologiesWithUniqueIds);
      } else {
        console.log('✓ [TechRadarTable] data unchanged, skipping UI update');
      }
    } catch (error) {
      console.error('Error loading technology radar data:', error);
      
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
      } else {
        setError(error.message || 'Failed to load technology radar data');
      }
      
      setAllTechnologies([]);
      setFilteredTechnologies([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Set up auto-refresh (fixed 30-second interval)
  const autoRefresh = useAutoRefresh(loadAllTechnologies, {
    enabled: true
  });
  
  // Initial load
  useEffect(() => {
    loadAllTechnologies();
  }, [loadAllTechnologies]);
  
  // Handle external refresh trigger
  const prevExternalTrigger = useRef(externalRefreshTrigger);
  useEffect(() => {
    if (externalRefreshTrigger && externalRefreshTrigger !== prevExternalTrigger.current) {
      console.log('🔔 External refresh triggered for TechRadarTable');
      autoRefresh.triggerRefresh();
      prevExternalTrigger.current = externalRefreshTrigger;
    }
  }, [externalRefreshTrigger, autoRefresh]);

  // Apply filtering and sorting whenever filter or sort parameters change
  useEffect(() => {
    // Ensure allTechnologies is an array
    const technologies = Array.isArray(allTechnologies) ? allTechnologies : [];
    
    // Apply filtering
    let result = [...technologies];
    
    if (filterText) {
      if (filterColumn.value === 'all') {
        result = result.filter(item => 
          (item.technology && item.technology.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.quadrant && item.quadrant.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.phase && item.phase.toLowerCase().includes(filterText.toLowerCase()))
        );
      } else {
        result = result.filter(item => {
          const value = item[filterColumn.value];
          return value && value.toLowerCase().includes(filterText.toLowerCase());
        });
      }
    }
    
    // Apply sorting
    if (sortingColumn) {
      result.sort((a, b) => {
        const valueA = a[sortingColumn.sortingField];
        const valueB = b[sortingColumn.sortingField];
        
        // Handle string sorting
        const stringA = String(valueA || '').toLowerCase();
        const stringB = String(valueB || '').toLowerCase();
        
        if (sortingDescending) {
          return stringB.localeCompare(stringA);
        }
        return stringA.localeCompare(stringB);
      });
    }
    
    setFilteredTechnologies(result);
    setTotalItems(result.length);
    
    // Reset to first page when filtering changes
    if (filterText !== '') {
      setCurrentPage(1);
    }
  }, [allTechnologies, filterText, filterColumn, sortingColumn, sortingDescending]);

  // Apply pagination whenever filtered data or pagination parameters change
  useEffect(() => {
    // Ensure filteredTechnologies is an array
    const technologies = Array.isArray(filteredTechnologies) ? filteredTechnologies : [];
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, technologies.length);
    setDisplayedTechnologies(technologies.slice(startIndex, endIndex));
  }, [filteredTechnologies, currentPage, pageSize]);

  // Handle page change
  const handlePageChange = ({ detail }) => {
    setCurrentPage(detail.currentPageIndex);
  };

  // Handle preferences change
  const handlePreferencesChange = ({ detail }) => {
    setPreferences(detail);
    if (detail.pageSize !== pageSize) {
      setPageSize(detail.pageSize);
      setCurrentPage(1); // Reset to first page when changing page size
    }
  };

  // Handle filter change
  const handleFilterChange = ({ detail }) => {
    setFilterText(detail.filteringText);
    // Pause auto-refresh while user is typing
    autoRefresh.pauseTemporarily(5000);
  };

  // Handle filter column change
  const handleFilterColumnChange = ({ detail }) => {
    setFilterColumn(detail.selectedOption);
  };

  // Handle sorting change
  const handleSortingChange = ({ detail }) => {
    if (detail.sortingColumn) {
      setSortingColumn(detail.sortingColumn);
      setSortingDescending(detail.isDescending);
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getTechRadarData(true);
      const technologies = response?.data || [];
      
      const technologiesWithUniqueIds = technologies.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      
      setAllTechnologies(technologiesWithUniqueIds);
    } catch (error) {
      console.error('Error refreshing technology radar data:', error);
      
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
      } else {
        setError(error.message || 'Failed to refresh technology radar data');
      }
    } finally {
      setLoading(false);
    }
  };



  // Calculate total pages
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <>
      <Table
        columnDefinitions={columnDefinitions}
        items={displayedTechnologies}
        loading={loading}
        loadingText={t('components:tables.loadingTechRadarData')}
        selectionType="single"
        trackBy="uniqueId"
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={handleSortingChange}
        empty={
          error ? (
            <Box textAlign="center" color="inherit">
              <b>{t('techRadarTable.errorLoadingData')}</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                <StatusIndicator type="error">{error}</StatusIndicator>
              </Box>
            </Box>
          ) : (
            <Box textAlign="center" color="inherit">
              <b>{t('techRadarTable.noTechnologies')}</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                {t('techRadarTable.noTechnologiesToDisplay')}
              </Box>
            </Box>
          )
        }
        header={
          <Header
            counter={totalItems > 0 ? `(${totalItems})` : undefined}
            actions={
              <AutoRefreshControl
                isRefreshing={autoRefresh.isRefreshing}
                onManualRefresh={autoRefresh.triggerRefresh}
                isPaused={autoRefresh.isPaused}
                onTogglePause={autoRefresh.togglePause}
              />
            }
          >
            {t('techRadarTable.technologyRadar')}
          </Header>
        }
        filter={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Select
              selectedOption={filterColumn}
              onChange={handleFilterColumnChange}
              options={filterColumnOptions}
              ariaLabel={t('components:tables.filterColumn')}
            />
            <div style={{ width: '300px' }}>
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder={t('techRadarTable.findBy', { column: filterColumn.label.toLowerCase() })}
                filteringAriaLabel={t('techRadarTable.findBy', { column: filterColumn.label.toLowerCase() })}
                onChange={handleFilterChange}
              />
            </div>

          </div>
        }
        pagination={
          <Pagination
            currentPageIndex={currentPage}
            pagesCount={totalPages}
            ariaLabels={{
              nextPageLabel: t('common:nextPage'),
              previousPageLabel: t('common:previousPage'),
              pageLabel: pageNumber => t('common:pageLabel', { pageNumber })
            }}
            onChange={handlePageChange}
          />
        }
        preferences={
          <CollectionPreferences
            title={t('techRadarTable.preferences')}
            confirmLabel={t('common:confirm')}
            cancelLabel={t('common:cancel')}
            preferences={preferences}
            pageSizePreference={{
              title: t('techRadarTable.pageSize'),
              options: [
                { value: 10, label: t('techRadarTable.tenTechnologies') },
                { value: 20, label: t('techRadarTable.twentyTechnologies') },
                { value: 50, label: t('techRadarTable.fiftyTechnologies') }
              ]
            }}
            visibleContentPreference={{
              title: t('techRadarTable.selectVisibleColumns'),
              options: [
                {
                  label: t('techRadarTable.technologyProperties'),
                  options: [
                    { id: "technology", label: t('techRadarTable.technology') },
                    { id: "quadrant", label: t('techRadarTable.quadrant') },
                    { id: "phase", label: t('techRadarTable.phase') }
                  ]
                }
              ]
            }}
            onConfirm={handlePreferencesChange}
          />
        }
        visibleColumns={preferences.visibleContent}
      />
      
      <Box padding={{ top: 'l' }}>
        <DownloadDropdownButton
          data={Array.isArray(allTechnologies) ? allTechnologies : []}
          filteredData={Array.isArray(filteredTechnologies) ? filteredTechnologies : []}
          columns={[
            { id: 'technology', header: t('techRadarTable.technology') },
            { id: 'quadrant', header: t('techRadarTable.quadrant') },
            { id: 'phase', header: t('techRadarTable.phase') }
          ]}
          filename="technology_radar"
          dataType="technology radar dataset"
        />
      </Box>
    </>
  );
}

export default TechRadarTable;
