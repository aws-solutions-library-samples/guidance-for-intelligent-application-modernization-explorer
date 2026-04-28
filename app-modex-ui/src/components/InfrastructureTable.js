import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
  StatusIndicator,
  Modal,
  ButtonDropdown,
  Alert
} from '@cloudscape-design/components';
import { getInfrastructureData } from '../services/athenaQueryService';
import DownloadDropdownButton from './DownloadDropdownButton';
import AutoRefreshControl from './AutoRefreshControl';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { hasDataChanged } from '../utils/dataComparisonUtils';

function InfrastructureTable({ externalRefreshTrigger }) {
  const { t } = useTranslation(['components', 'common']);
  const [allResources, setAllResources] = useState([]);
  const [filteredResources, setFilteredResources] = useState([]);
  const [displayedResources, setDisplayedResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [filterColumn, setFilterColumn] = useState({ value: 'all', label: t('components:infrastructureTable.allColumns') });
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'applicationName' });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['applicationName', 'serverName', 'serverType', 'osType', 'osVersion', 'cpu', 'memory', 'storage', 'dbEngineVersion', 'dbClusterType', 'orchestrationPlatform', 'environment']
  });
  const [error, setError] = useState(null);

  // Get environment status
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

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'applicationName',
      header: t('components:infrastructureTable.application'),
      cell: item => item.applicationName,
      sortingField: 'applicationName'
    },
    {
      id: 'serverName',
      header: t('components:infrastructureTable.serverName'),
      cell: item => item.serverName || '-',
      sortingField: 'serverName'
    },
    {
      id: 'serverType',
      header: t('components:infrastructureTable.serverType'),
      cell: item => item.serverType,
      sortingField: 'serverType'
    },
    {
      id: 'osType',
      header: t('components:infrastructureTable.osType'),
      cell: item => item.osType,
      sortingField: 'osType'
    },
    {
      id: 'osVersion',
      header: t('components:infrastructureTable.osVersion'),
      cell: item => item.osVersion,
      sortingField: 'osVersion'
    },
    {
      id: 'cpu',
      header: t('components:infrastructureTable.cpu'),
      cell: item => item.cpu,
      sortingField: 'cpu'
    },
    {
      id: 'memory',
      header: t('components:infrastructureTable.memory'),
      cell: item => item.memory,
      sortingField: 'memory'
    },
    {
      id: 'storage',
      header: t('components:infrastructureTable.storage'),
      cell: item => item.storage,
      sortingField: 'storage'
    },
    {
      id: 'dbEngineVersion',
      header: t('components:infrastructureTable.dbEngineVersion'),
      cell: item => item.dbEngineVersion || '-',
      sortingField: 'dbEngineVersion'
    },
    {
      id: 'dbClusterId',
      header: t('components:infrastructureTable.dbClusterId'),
      cell: item => item.dbClusterId || '-',
      sortingField: 'dbClusterId'
    },
    {
      id: 'dbClusterType',
      header: t('components:infrastructureTable.dbClusterType'),
      cell: item => item.dbClusterType || '-',
      sortingField: 'dbClusterType'
    },
    {
      id: 'orchestrationPlatform',
      header: t('components:infrastructureTable.orchestrationPlatform'),
      cell: item => item.orchestrationPlatform || '-',
      sortingField: 'orchestrationPlatform'
    },
    {
      id: 'environment',
      header: t('components:infrastructureTable.environment'),
      cell: item => (
        <StatusIndicator type={getEnvironmentStatus(item.environment)}>
          {item.environment}
        </StatusIndicator>
      ),
      sortingField: 'environment'
    }
  ];

  // Filter column options
  const filterColumnOptions = [
    { value: 'all', label: t('components:infrastructureTable.allColumns') },
    { value: 'applicationName', label: t('components:infrastructureTable.application') },
    { value: 'serverName', label: t('components:infrastructureTable.serverName') },
    { value: 'serverType', label: t('components:infrastructureTable.serverType') },
    { value: 'osType', label: t('components:infrastructureTable.osType') },
    { value: 'osVersion', label: t('components:infrastructureTable.osVersion') },
    { value: 'cpu', label: t('components:infrastructureTable.cpu') },
    { value: 'memory', label: t('components:infrastructureTable.memory') },
    { value: 'storage', label: t('components:infrastructureTable.storage') },
    { value: 'dbEngineVersion', label: t('components:infrastructureTable.dbEngineVersion') },
    { value: 'dbClusterId', label: t('components:infrastructureTable.dbClusterId') },
    { value: 'dbClusterType', label: t('components:infrastructureTable.dbClusterType') },
    { value: 'orchestrationPlatform', label: t('components:infrastructureTable.orchestrationPlatform') },
    { value: 'environment', label: t('components:infrastructureTable.environment') }
  ];

  // Store current data for comparison
  const currentDataRef = useRef(null);
  
  // Load all infrastructure data when component mounts
  const loadAllInfrastructureData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCurrentPage(1);
    try {
      const response = await getInfrastructureData(true);
      const resourcesWithUniqueIds = response.items.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      
      // Smart refresh: only update if data actually changed
      if (hasDataChanged(currentDataRef.current, resourcesWithUniqueIds)) {
        console.log('📊 Infrastructure data changed, updating UI');
        currentDataRef.current = resourcesWithUniqueIds;
        setAllResources(resourcesWithUniqueIds);
      } else {
        console.log('✓ Infrastructure data unchanged, skipping UI update');
      }
    } catch (error) {
      console.error('Error loading infrastructure data:', error);
      
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
      } else {
        setError(error.message || 'Failed to load infrastructure data');
      }
      
      setAllResources([]);
      setFilteredResources([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Set up auto-refresh (fixed 30-second interval)
  const autoRefresh = useAutoRefresh(loadAllInfrastructureData, {
    enabled: true
  });
  
  // Initial load
  useEffect(() => {
    loadAllInfrastructureData();
  }, [loadAllInfrastructureData]);
  
  // Handle external refresh trigger
  const prevExternalTrigger = useRef(externalRefreshTrigger);
  useEffect(() => {
    if (externalRefreshTrigger && externalRefreshTrigger !== prevExternalTrigger.current) {
      console.log('🔔 External refresh triggered for InfrastructureTable');
      autoRefresh.triggerRefresh();
      prevExternalTrigger.current = externalRefreshTrigger;
    }
  }, [externalRefreshTrigger, autoRefresh]);

  // Apply filtering and sorting whenever filter or sort parameters change
  useEffect(() => {
    // Apply filtering
    let result = [...allResources];
    
    if (filterText) {
      if (filterColumn.value === 'all') {
        result = result.filter(item => 
          (item.applicationName && item.applicationName.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.serverName && item.serverName.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.serverType && item.serverType.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.osType && item.osType.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.osVersion && item.osVersion.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.cpu && item.cpu.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.memory && item.memory.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.storage && item.storage.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.dbEngineVersion && item.dbEngineVersion.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.dbClusterId && item.dbClusterId.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.dbClusterType && item.dbClusterType.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.orchestrationPlatform && item.orchestrationPlatform.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.environment && item.environment.toLowerCase().includes(filterText.toLowerCase()))
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
    
    setFilteredResources(result);
    setTotalItems(result.length);
    
    // Reset to first page when filtering changes
    if (filterText !== '') {
      setCurrentPage(1);
    }
  }, [allResources, filterText, filterColumn, sortingColumn, sortingDescending]);

  // Apply pagination whenever filtered data or pagination parameters change
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredResources.length);
    setDisplayedResources(filteredResources.slice(startIndex, endIndex));
  }, [filteredResources, currentPage, pageSize]);

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
      const response = await getInfrastructureData(true);
      const resources = response?.items || [];
      const resourcesWithUniqueIds = resources.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      setAllResources(resourcesWithUniqueIds);
    } catch (err) {
      console.error('Error refreshing infrastructure data:', err);
      
      // Check if error is due to missing view/table (no data uploaded yet)
      if (err.message && (
        err.message.includes('does not exist') || 
        err.message.includes('FAILED') ||
        err.message.includes('Table not found') ||
        err.message.includes('View not found')
      )) {
        // Don't show error for missing data - just show empty state
        console.log('No infrastructure data uploaded yet');
        setError(null);
      } else {
        setError('Failed to refresh infrastructure data. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };



  // Calculate total pages
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <>
      {error && (
        <Alert type="error" header="Error loading data" dismissible>
          {error}
        </Alert>
      )}
      
      <Table
        columnDefinitions={columnDefinitions}
        items={displayedResources}
        loading={loading}
        loadingText={t('components:infrastructureTable.loadingInfrastructureData')}
        selectionType="single"
        trackBy="uniqueId"
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={handleSortingChange}
        empty={
          <Box textAlign="center" color="inherit">
            <b>{t('components:emptyStates.noResources')}</b>
            <Box padding={{ bottom: "s" }} variant="p" color="inherit">
              {t('components:emptyStates.noInfrastructureResources')}
            </Box>
          </Box>
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
            {t('components:infrastructureTable.infrastructureResourcesHeader')}
          </Header>
        }
        filter={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Select
              selectedOption={filterColumn}
              onChange={handleFilterColumnChange}
              options={filterColumnOptions}
              ariaLabel={t('components:common.filterColumn')}
            />
            <div style={{ width: '300px' }}>
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder={t('components:infrastructureTable.findByPlaceholder', { column: filterColumn.label.toLowerCase() })}
                filteringAriaLabel={t('components:infrastructureTable.findByPlaceholder', { column: filterColumn.label.toLowerCase() })}
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
              nextPageLabel: 'Next page',
              previousPageLabel: 'Previous page',
              pageLabel: pageNumber => `Page ${pageNumber} of all pages`
            }}
            onChange={handlePageChange}
          />
        }
        preferences={
          <CollectionPreferences
            title={t('components:tables.preferences')}
            confirmLabel={t('components:tables.confirm')}
            cancelLabel={t('components:tables.cancel')}
            preferences={preferences}
            pageSizePreference={{
              title: t('components:tables.pagination.pageSize'),
              options: [
                { value: 10, label: t('components:infrastructureTable.tenResources') },
                { value: 20, label: t('components:infrastructureTable.twentyResources') },
                { value: 50, label: t('components:infrastructureTable.fiftyResources') }
              ]
            }}
            visibleContentPreference={{
              title: t('components:tables.selectVisibleColumns'),
              options: [
                {
                  label: t('components:infrastructureTable.resourceProperties'),
                  options: [
                    { id: "applicationName", label: t('components:infrastructureTable.application') },
                    { id: "serverName", label: t('components:infrastructureTable.serverName') },
                    { id: "serverType", label: t('components:infrastructureTable.serverType') },
                    { id: "osType", label: t('components:infrastructureTable.osType') },
                    { id: "osVersion", label: t('components:infrastructureTable.osVersion') },
                    { id: "cpu", label: t('components:infrastructureTable.cpu') },
                    { id: "memory", label: t('components:infrastructureTable.memory') },
                    { id: "storage", label: t('components:infrastructureTable.storage') },
                    { id: "dbEngineVersion", label: t('components:infrastructureTable.dbEngineVersion') },
                    { id: "dbClusterId", label: t('components:infrastructureTable.dbClusterId') },
                    { id: "dbClusterType", label: t('components:infrastructureTable.dbClusterType') },
                    { id: "orchestrationPlatform", label: t('components:infrastructureTable.orchestrationPlatform') },
                    { id: "environment", label: t('components:infrastructureTable.environment') }
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
          data={allResources}
          filteredData={filteredResources}
          columns={[
            { id: 'applicationName', header: t('components:infrastructureTable.application') },
            { id: 'serverName', header: t('components:infrastructureTable.serverName') },
            { id: 'serverType', header: t('components:infrastructureTable.serverType') },
            { id: 'osType', header: t('components:infrastructureTable.osType') },
            { id: 'osVersion', header: t('components:infrastructureTable.osVersion') },
            { id: 'cpu', header: t('components:infrastructureTable.cpu') },
            { id: 'memory', header: t('components:infrastructureTable.memory') },
            { id: 'storage', header: t('components:infrastructureTable.storage') },
            { id: 'dbEngineVersion', header: t('components:infrastructureTable.dbEngineVersion') },
            { id: 'dbClusterId', header: t('components:infrastructureTable.dbClusterId') },
            { id: 'dbClusterType', header: t('components:infrastructureTable.dbClusterType') },
            { id: 'orchestrationPlatform', header: t('components:infrastructureTable.orchestrationPlatform') },
            { id: 'environment', header: t('components:infrastructureTable.environment') }
          ]}
          filename="infrastructure_resources"
          dataType="infrastructure resources dataset"
        />
      </Box>
    </>
  );
}

export default InfrastructureTable;