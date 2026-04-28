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
import { getApplicationPortfolioData } from '../services/athenaQueryService';
import DownloadDropdownButton from './DownloadDropdownButton';
import AutoRefreshControl from './AutoRefreshControl';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { hasDataChanged } from '../utils/dataComparisonUtils';

function PortfolioTable({ externalRefreshTrigger }) {
  const { t } = useTranslation(['components', 'common']);
  const [allApplications, setAllApplications] = useState([]);
  const [filteredApplications, setFilteredApplications] = useState([]);
  const [displayedApplications, setDisplayedApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [filterColumn, setFilterColumn] = useState({ value: 'all', label: t('components:portfolioTable.allColumns') });
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'applicationName' });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['applicationName', 'purpose', 'criticality', 'department']
  });
  const [error, setError] = useState(null);

  // Get criticality status
  const getCriticalityStatus = useCallback((criticality) => {
    switch (criticality) {
      case 'High':
        return 'error'; // Red for high criticality
      case 'Medium':
        return 'warning'; // Yellow for medium criticality
      case 'Low':
        return 'success'; // Green for low criticality
      default:
        return 'info';
    }
  }, []);

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'applicationName',
      header: t('components:portfolioTable.application'),
      cell: item => item.applicationName,
      sortingField: 'applicationName'
    },
    {
      id: 'purpose',
      header: t('components:portfolioTable.purpose'),
      cell: item => item.purpose,
      sortingField: 'purpose'
    },
    {
      id: 'criticality',
      header: t('components:portfolioTable.criticality'),
      cell: item => (
        <StatusIndicator type={getCriticalityStatus(item.criticality)}>
          {item.criticality}
        </StatusIndicator>
      ),
      sortingField: 'criticality'
    },
    {
      id: 'department',
      header: t('components:portfolioTable.department'),
      cell: item => item.department,
      sortingField: 'department'
    }
  ];

  // Filter column options
  const filterColumnOptions = [
    { value: 'all', label: t('components:portfolioTable.allColumns') },
    { value: 'applicationName', label: t('components:portfolioTable.application') },
    { value: 'purpose', label: t('components:portfolioTable.purpose') },
    { value: 'criticality', label: t('components:portfolioTable.criticality') },
    { value: 'department', label: t('components:portfolioTable.department') }
  ];

  // Store current data for comparison
  const currentDataRef = useRef(null);
  
  // Load all applications when component mounts
  const loadAllApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getApplicationPortfolioData(true);
      const applicationsWithUniqueIds = response.items.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      
      // Smart refresh: only update if data actually changed
      if (hasDataChanged(currentDataRef.current, applicationsWithUniqueIds)) {
        console.log('📊 Portfolio data changed, updating UI');
        currentDataRef.current = applicationsWithUniqueIds;
        setAllApplications(applicationsWithUniqueIds);
      } else {
        console.log('✓ Portfolio data unchanged, skipping UI update');
      }
    } catch (error) {
      console.error('Error loading portfolio data:', error);
      
      // Check if error is due to missing view/table (no data uploaded yet)
      if (error.message && (
        error.message.includes('does not exist') || 
        error.message.includes('FAILED') ||
        error.message.includes('Table not found') ||
        error.message.includes('View not found')
      )) {
        // Don't show error for missing data - just show empty state
        console.log('No application portfolio data uploaded yet');
        setError(null);
      } else {
        setError(error.message || t('components:portfolioTable.failedToLoadData'));
      }
      
      setAllApplications([]);
      setFilteredApplications([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Set up auto-refresh (fixed 30-second interval)
  const autoRefresh = useAutoRefresh(loadAllApplications, {
    enabled: true
  });

  // Initial load
  useEffect(() => {
    loadAllApplications();
  }, [loadAllApplications]);

  // Handle external refresh trigger
  const prevExternalTrigger = useRef(externalRefreshTrigger);
  useEffect(() => {
    if (externalRefreshTrigger && externalRefreshTrigger !== prevExternalTrigger.current) {
      console.log('🔔 External refresh triggered for PortfolioTable');
      autoRefresh.triggerRefresh();
      prevExternalTrigger.current = externalRefreshTrigger;
    }
  }, [externalRefreshTrigger, autoRefresh]);

  // Apply filtering and sorting whenever filter or sort parameters change
  useEffect(() => {
    // Debounce the filtering and sorting operation
    const debounceTimer = setTimeout(() => {
      // Apply filtering
      let result = [...allApplications];
      
      if (filterText) {
        if (filterColumn.value === 'all') {
          result = result.filter(item => 
            (item.applicationName && item.applicationName.toLowerCase().includes(filterText.toLowerCase())) ||
            (item.purpose && item.purpose.toLowerCase().includes(filterText.toLowerCase())) ||
            (item.criticality && item.criticality.toLowerCase().includes(filterText.toLowerCase())) ||
            (item.department && item.department.toLowerCase().includes(filterText.toLowerCase()))
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
      
      setFilteredApplications(result);
      setTotalItems(result.length);
      
      // Reset to first page when filtering changes
      if (filterText !== '') {
        setCurrentPage(1);
      }
    }, 300); // 300ms debounce
    
    return () => clearTimeout(debounceTimer);
  }, [allApplications, filterText, filterColumn, sortingColumn, sortingDescending]);

  // Apply pagination whenever filtered data or pagination parameters change
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredApplications.length);
    
    // Use requestAnimationFrame to avoid ResizeObserver loop issues
    const animationFrame = requestAnimationFrame(() => {
      setDisplayedApplications(filteredApplications.slice(startIndex, endIndex));
    });
    
    return () => cancelAnimationFrame(animationFrame);
  }, [filteredApplications, currentPage, pageSize]);

  // Handle page change
  const handlePageChange = useCallback(({ detail }) => {
    setCurrentPage(detail.currentPageIndex);
  }, []);

  // Handle preferences change
  const handlePreferencesChange = useCallback(({ detail }) => {
    setPreferences(detail);
    if (detail.pageSize !== pageSize) {
      setPageSize(detail.pageSize);
      setCurrentPage(1); // Reset to first page when changing page size
    }
  }, [pageSize]);

  // Handle filter change
  const handleFilterChange = useCallback(({ detail }) => {
    setFilterText(detail.filteringText);
    autoRefresh.pauseTemporarily(5000);
  }, [autoRefresh]);

  // Handle filter column change
  const handleFilterColumnChange = useCallback(({ detail }) => {
    setFilterColumn(detail.selectedOption);
  }, []);

  // Handle sorting change
  const handleSortingChange = useCallback(({ detail }) => {
    if (detail.sortingColumn) {
      setSortingColumn(detail.sortingColumn);
      setSortingDescending(detail.isDescending);
    }
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getApplicationPortfolioData(true);
      const applications = response?.items || [];
      const applicationsWithUniqueIds = applications.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      setAllApplications(applicationsWithUniqueIds);
    } catch (err) {
      console.error('Error refreshing application portfolio data:', err);
      
      // Check if error is due to missing view/table (no data uploaded yet)
      if (err.message && (
        err.message.includes('does not exist') || 
        err.message.includes('FAILED') ||
        err.message.includes('Table not found') ||
        err.message.includes('View not found')
      )) {
        // Don't show error for missing data - just show empty state
        console.log('No application portfolio data uploaded yet');
        setError(null);
      } else {
        setError(t('components:portfolioTable.failedToRefreshData'));
      }
    } finally {
      setLoading(false);
    }
  }, []);



  // Calculate total pages
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <>
      {error && (
        <Alert type="error" header={t('components:portfolioTable.errorLoadingData')} dismissible>
          {error}
        </Alert>
      )}
      
      <Table
        columnDefinitions={columnDefinitions}
        items={displayedApplications}
        loading={loading}
        loadingText={t('components:portfolioTable.loadingApplications')}
        selectionType="single"
        trackBy="uniqueId"
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={handleSortingChange}
        empty={
          <Box textAlign="center" color="inherit">
            <b>{t('components:portfolioTable.noApplications')}</b>
            <Box padding={{ bottom: "s" }} variant="p" color="inherit">
              {t('components:portfolioTable.noApplicationsToDisplay')}
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
            {t('components:portfolioTable.applications')}
          </Header>
        }
        filter={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Select
              selectedOption={filterColumn}
              onChange={handleFilterColumnChange}
              options={filterColumnOptions}
              ariaLabel={t('components:portfolioTable.filterColumn')}
            />
            <div style={{ width: '300px' }}>
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder={t('components:portfolioTable.findBy', { column: filterColumn.label.toLowerCase() })}
                filteringAriaLabel={t('components:portfolioTable.findBy', { column: filterColumn.label.toLowerCase() })}
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
            title={t('common:preferences')}
            confirmLabel={t('common:confirm')}
            cancelLabel={t('common:cancel')}
            preferences={preferences}
            pageSizePreference={{
              title: t('common:pageSize'),
              options: [
                { value: 10, label: t('components:portfolioTable.applicationsCount', { count: 10 }) },
                { value: 20, label: t('components:portfolioTable.applicationsCount', { count: 20 }) },
                { value: 50, label: t('components:portfolioTable.applicationsCount', { count: 50 }) }
              ]
            }}
            visibleContentPreference={{
              title: t('common:selectVisibleColumns'),
              options: [
                {
                  label: t('components:portfolioTable.applicationProperties'),
                  options: [
                    { id: "applicationName", label: t('components:portfolioTable.application') },
                    { id: "purpose", label: t('components:portfolioTable.purpose') },
                    { id: "criticality", label: t('components:portfolioTable.criticality') },
                    { id: "department", label: t('components:portfolioTable.department') }
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
          data={allApplications}
          filteredData={filteredApplications}
          columns={[
            { id: 'name', header: t('components:portfolioTable.application') },
            { id: 'description', header: t('components:portfolioTable.description') },
            { id: 'criticality', header: t('components:portfolioTable.criticality') },
            { id: 'status', header: t('components:portfolioTable.status') },
            { id: 'owner', header: t('components:portfolioTable.owner') },
            { id: 'department', header: t('components:portfolioTable.department') }
          ]}
          filename="application_portfolio"
          dataType={t('components:portfolioTable.applicationPortfolioDataset')}
        />
      </Box>
    </>
  );
}

export default PortfolioTable;