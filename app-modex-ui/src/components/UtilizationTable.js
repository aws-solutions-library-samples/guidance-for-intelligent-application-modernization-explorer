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
  ButtonDropdown
} from '@cloudscape-design/components';
import { getUtilizationData } from '../services/athenaQueryService';
import DownloadDropdownButton from './DownloadDropdownButton';
import AutoRefreshControl from './AutoRefreshControl';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { hasDataChanged } from '../utils/dataComparisonUtils';

function UtilizationTable({ externalRefreshTrigger }) {
  const { t } = useTranslation(['components', 'common']);
  const [allMetrics, setAllMetrics] = useState([]);
  const [filteredMetrics, setFilteredMetrics] = useState([]);
  const [displayedMetrics, setDisplayedMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [filterColumn, setFilterColumn] = useState({ value: 'all', label: 'All columns' });
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'timestamp' });
  const [sortingDescending, setSortingDescending] = useState(true); // Default to newest first
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['timestamp', 'applicationName', 'serverName', 'cpuUtilization', 'memoryUtilization', 'storageUtilization', 'networkTraffic', 'iops']
  });
  const [error, setError] = useState(null);

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Get utilization status
  const getUtilizationStatus = (utilization) => {
    const value = parseFloat(utilization);
    if (value >= 80) {
      return 'error'; // Red for high utilization
    } else if (value >= 60) {
      return 'warning'; // Yellow for medium utilization
    } else {
      return 'success'; // Green for low utilization
    }
  };

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'timestamp',
      header: t('components:utilizationTable.timestamp'),
      cell: item => formatTimestamp(item.timestamp),
      sortingField: 'timestamp'
    },
    {
      id: 'applicationName',
      header: t('components:utilizationTable.application'),
      cell: item => item.applicationName,
      sortingField: 'applicationName'
    },
    {
      id: 'serverName',
      header: t('components:utilizationTable.serverName'),
      cell: item => item.serverName,
      sortingField: 'serverName'
    },
    {
      id: 'cpuUtilization',
      header: t('components:utilizationTable.cpuUtilization'),
      cell: item => (
        <StatusIndicator type={getUtilizationStatus(item.cpuUtilization)}>
          {item.cpuUtilization}%
        </StatusIndicator>
      ),
      sortingField: 'cpuUtilization'
    },
    {
      id: 'memoryUtilization',
      header: t('components:utilizationTable.memoryUtilization'),
      cell: item => (
        <StatusIndicator type={getUtilizationStatus(item.memoryUtilization)}>
          {item.memoryUtilization}%
        </StatusIndicator>
      ),
      sortingField: 'memoryUtilization'
    },
    {
      id: 'storageUtilization',
      header: t('components:utilizationTable.storageUtilization'),
      cell: item => (
        <StatusIndicator type={getUtilizationStatus(item.storageUtilization)}>
          {item.storageUtilization}%
        </StatusIndicator>
      ),
      sortingField: 'storageUtilization'
    },
    {
      id: 'networkTraffic',
      header: t('components:utilizationTable.networkTraffic'),
      cell: item => `${item.networkTraffic} MB/s`,
      sortingField: 'networkTraffic'
    },
    {
      id: 'iops',
      header: t('components:utilizationTable.iops'),
      cell: item => item.iops,
      sortingField: 'iops'
    }
  ];

  // Filter column options
  const filterColumnOptions = [
    { value: 'all', label: t('components:utilizationTable.allColumns') },
    { value: 'applicationName', label: t('components:utilizationTable.application') },
    { value: 'serverName', label: t('components:utilizationTable.serverName') },
    { value: 'cpuUtilization', label: t('components:utilizationTable.cpuUtilization') },
    { value: 'memoryUtilization', label: t('components:utilizationTable.memoryUtilization') },
    { value: 'storageUtilization', label: t('components:utilizationTable.storageUtilization') },
    { value: 'networkTraffic', label: t('components:utilizationTable.networkTraffic') },
    { value: 'iops', label: t('components:utilizationTable.iops') }
  ];

  // Store current data for comparison
  const currentDataRef = useRef(null);
  
  // Load utilization data when component mounts
  const loadUtilizationData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCurrentPage(1);
    
    try {
      const response = await getUtilizationData(true);
      const metricsWithUniqueIds = response.items.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      
      // Smart refresh: only update if data actually changed
      if (hasDataChanged(currentDataRef.current, metricsWithUniqueIds)) {
        console.log('📊 [UtilizationTable] data changed, updating UI');
        currentDataRef.current = metricsWithUniqueIds;
        setAllMetrics(metricsWithUniqueIds);
      } else {
        console.log('✓ [UtilizationTable] data unchanged, skipping UI update');
      }
    } catch (error) {
      console.error('Error loading utilization data:', error);
      
      // Check if error is due to missing view/table (no data uploaded yet)
      if (error.message && (
        error.message.includes('does not exist') || 
        error.message.includes('FAILED') ||
        error.message.includes('Table not found') ||
        error.message.includes('View not found')
      )) {
        // Don't show error for missing data - just show empty state
        console.log('No utilization data uploaded yet');
        setError(null);
      } else {
        setError(`Failed to load utilization data: ${error.message}`);
      }
      
      setAllMetrics([]);
      setFilteredMetrics([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Set up auto-refresh (fixed 30-second interval)
  const autoRefresh = useAutoRefresh(loadUtilizationData, {
    enabled: true
  });
  
  // Initial load
  useEffect(() => {
    loadUtilizationData();
  }, [loadUtilizationData]);
  
  // Handle external refresh trigger
  const prevExternalTrigger = useRef(externalRefreshTrigger);
  useEffect(() => {
    if (externalRefreshTrigger && externalRefreshTrigger !== prevExternalTrigger.current) {
      console.log('🔔 External refresh triggered for UtilizationTable');
      autoRefresh.triggerRefresh();
      prevExternalTrigger.current = externalRefreshTrigger;
    }
  }, [externalRefreshTrigger, autoRefresh]);

  // Apply filtering and sorting whenever filter or sort parameters change
  useEffect(() => {
    // Apply filtering
    let result = [...allMetrics];
    
    if (filterText) {
      if (filterColumn.value === 'all') {
        result = result.filter(item => 
          (item.applicationName && item.applicationName.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.serverName && item.serverName.toLowerCase().includes(filterText.toLowerCase())) ||
          (item.cpuUtilization && item.cpuUtilization.toString().includes(filterText)) ||
          (item.memoryUtilization && item.memoryUtilization.toString().includes(filterText)) ||
          (item.storageUtilization && item.storageUtilization.toString().includes(filterText)) ||
          (item.networkTraffic && item.networkTraffic.toString().includes(filterText)) ||
          (item.iops && item.iops.toString().includes(filterText))
        );
      } else if (filterColumn.value === 'applicationName' || filterColumn.value === 'serverName') {
        result = result.filter(item => {
          const value = item[filterColumn.value];
          return value && value.toLowerCase().includes(filterText.toLowerCase());
        });
      } else {
        // For numeric fields
        result = result.filter(item => {
          const value = item[filterColumn.value];
          return value && value.toString().includes(filterText);
        });
      }
    }
    
    // Apply sorting
    if (sortingColumn) {
      result.sort((a, b) => {
        let valueA, valueB;
        
        // Special handling for timestamp
        if (sortingColumn.sortingField === 'timestamp') {
          valueA = new Date(a.timestamp);
          valueB = new Date(b.timestamp);
        } else {
          valueA = a[sortingColumn.sortingField];
          valueB = b[sortingColumn.sortingField];
        }
        
        // Handle date sorting
        if (valueA instanceof Date && valueB instanceof Date) {
          return sortingDescending ? valueB - valueA : valueA - valueB;
        }
        
        // Handle numeric sorting
        if (!isNaN(valueA) && !isNaN(valueB)) {
          return sortingDescending ? valueB - valueA : valueA - valueB;
        }
        
        // Handle string sorting
        const stringA = String(valueA || '').toLowerCase();
        const stringB = String(valueB || '').toLowerCase();
        
        if (sortingDescending) {
          return stringB.localeCompare(stringA);
        }
        return stringA.localeCompare(stringB);
      });
    }
    
    setFilteredMetrics(result);
    setTotalItems(result.length);
    
    // Reset to first page when filtering changes
    if (filterText !== '') {
      setCurrentPage(1);
    }
  }, [allMetrics, filterText, filterColumn, sortingColumn, sortingDescending]);

  // Apply pagination whenever filtered data or pagination parameters change
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredMetrics.length);
    setDisplayedMetrics(filteredMetrics.slice(startIndex, endIndex));
  }, [filteredMetrics, currentPage, pageSize]);

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

  // Handle refresh button click
  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await getUtilizationData(true);
      const metricsWithUniqueIds = response.items.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      setAllMetrics(metricsWithUniqueIds);
    } catch (error) {
      console.error('Error refreshing utilization data:', error);
      
      // Check if error is due to missing view/table (no data uploaded yet)
      if (error.message && (
        error.message.includes('does not exist') || 
        error.message.includes('FAILED') ||
        error.message.includes('Table not found') ||
        error.message.includes('View not found')
      )) {
        // Don't show error for missing data - just show empty state
        console.log('No utilization data uploaded yet');
        setError(null);
      } else {
        setError(`Failed to refresh utilization data: ${error.message}`);
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
        items={displayedMetrics}
        loading={loading}
        loadingText={t('components:tables.loadingUtilizationData')}
        selectionType="single"
        trackBy="uniqueId"
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={handleSortingChange}
        empty={
          <Box textAlign="center" color="inherit">
            <b>{error ? t('components:tables.error') : t('components:tables.noMetrics')}</b>
            <Box padding={{ bottom: "s" }} variant="p" color="inherit">
              {error ? error : t('components:tables.noUtilizationMetrics')}
            </Box>
            {error && (
              <Button onClick={handleRefresh}>{t('components:tables.retry')}</Button>
            )}
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
            {t('components:tables.resourceUtilization')}
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
                filteringPlaceholder={t('components:tables.findBy', { column: filterColumn.label.toLowerCase() })}
                filteringAriaLabel={t('components:tables.findBy', { column: filterColumn.label.toLowerCase() })}
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
              nextPageLabel: t('components:tables.nextPage'),
              previousPageLabel: t('components:tables.previousPage'),
              pageLabel: pageNumber => t('components:tables.pageOf', { pageNumber })
            }}
            onChange={handlePageChange}
          />
        }
        preferences={
          <CollectionPreferences
            title={t('components:utilizationTable.preferences')}
            confirmLabel={t('components:utilizationTable.confirm')}
            cancelLabel={t('components:utilizationTable.cancel')}
            preferences={preferences}
            pageSizePreference={{
              title: t('components:utilizationTable.pageSize'),
              options: [
                { value: 10, label: t('components:utilizationTable.tenMetrics') },
                { value: 20, label: t('components:utilizationTable.twentyMetrics') },
                { value: 50, label: t('components:utilizationTable.fiftyMetrics') }
              ]
            }}
            visibleContentPreference={{
              title: t('components:tables.selectVisibleColumns'),
              options: [
                {
                  label: t('components:utilizationTable.metricProperties'),
                  options: [
                    { id: "timestamp", label: t('components:utilizationTable.timestamp') },
                    { id: "applicationName", label: t('components:utilizationTable.application') },
                    { id: "serverName", label: t('components:utilizationTable.serverName') },
                    { id: "cpuUtilization", label: t('components:utilizationTable.cpuUtilization') },
                    { id: "memoryUtilization", label: t('components:utilizationTable.memoryUtilization') },
                    { id: "storageUtilization", label: t('components:utilizationTable.storageUtilization') },
                    { id: "networkTraffic", label: t('components:utilizationTable.networkTraffic') },
                    { id: "iops", label: t('components:utilizationTable.iops') }
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
          data={allMetrics}
          filteredData={filteredMetrics}
          columns={[
            { id: 'timestamp', header: t('components:utilizationTable.timestamp') },
            { id: 'applicationName', header: t('components:utilizationTable.application') },
            { id: 'serverName', header: t('components:utilizationTable.serverName') },
            { id: 'cpuUtilization', header: t('components:utilizationTable.cpuUtilization') },
            { id: 'memoryUtilization', header: t('components:utilizationTable.memoryUtilization') },
            { id: 'storageUtilization', header: t('components:utilizationTable.storageUtilization') },
            { id: 'networkTraffic', header: t('components:utilizationTable.networkTraffic') },
            { id: 'iops', header: t('components:utilizationTable.iops') }
          ]}
          filename="resource_utilization"
          dataType="resource utilization dataset"
        />
      </Box>
    </>
  );
}

export default UtilizationTable;
