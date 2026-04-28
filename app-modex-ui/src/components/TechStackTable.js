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
  Link,
  ExpandableSection,
  Alert
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { getTechStackData } from '../services/athenaQueryService';
import DownloadDropdownButton from './DownloadDropdownButton';
import withResizeOptimization from '../hoc/withResizeOptimization';
import { debounce } from '../utils/resizeUtils';
import AutoRefreshControl from './AutoRefreshControl';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { hasDataChanged } from '../utils/dataComparisonUtils';

function TechStackTable({ dimensions, externalRefreshTrigger }) {
  const { t } = useTranslation(['components', 'common']);
  const [allComponents, setAllComponents] = useState([]);
  const [filteredComponents, setFilteredComponents] = useState([]);
  const [displayedComponents, setDisplayedComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [filterColumn, setFilterColumn] = useState({ value: 'all', label: 'All columns' });
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'applicationName' });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['applicationName', 'componentName', 'runtime', 'framework', 'databases', 'integrations', 'storages']
  });
  const [error, setError] = useState(null);

  // Format list of technologies
  const formatTechList = useCallback((techList) => {
    // Check if techList is null, undefined, or not an array
    if (!techList || !Array.isArray(techList) || techList.length === 0) {
      return <Box color="text-body-secondary" fontStyle="italic">{t('common:none')}</Box>;
    }
    
    if (techList.length === 1) {
      return techList[0];
    }
    
    if (techList.length <= 3) {
      return techList.join(', ');
    }
    
    // For more than 3 items, use expandable section
    return (
      <ExpandableSection headerText={t('components:techStackTable.itemsCount', { count: techList.length })}>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          {techList.map((tech, index) => (
            <li key={index}>{tech}</li>
          ))}
        </ul>
      </ExpandableSection>
    );
  }, [t]);

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'applicationName',
      header: t('components:techStackTable.application'),
      cell: item => item.applicationName,
      sortingField: 'applicationName'
    },
    {
      id: 'componentName',
      header: t('components:techStackTable.component'),
      cell: item => item.componentName,
      sortingField: 'componentName'
    },
    {
      id: 'runtime',
      header: t('components:techStackTable.runtime'),
      cell: item => formatTechList(item.runtime ? [item.runtime] : []),
      sortingField: 'runtime'
    },
    {
      id: 'framework',
      header: t('components:techStackTable.framework'),
      cell: item => formatTechList(item.framework ? [item.framework] : []),
      sortingField: 'framework'
    },
    {
      id: 'databases',
      header: t('components:techStackTable.databases'),
      cell: item => formatTechList(item.databases),
      sortingField: 'databases'
    },
    {
      id: 'integrations',
      header: t('components:techStackTable.integrations'),
      cell: item => formatTechList(item.integrations),
      sortingField: 'integrations'
    },
    {
      id: 'storages',
      header: t('components:techStackTable.storage'),
      cell: item => formatTechList(item.storages),
      sortingField: 'storages'
    }
  ];

  // Filter column options
  const filterColumnOptions = [
    { value: 'all', label: t('components:techStackTable.allColumns') },
    { value: 'applicationName', label: t('components:techStackTable.application') },
    { value: 'componentName', label: t('components:techStackTable.component') },
    { value: 'runtime', label: t('components:techStackTable.runtime') },
    { value: 'framework', label: t('components:techStackTable.framework') },
    { value: 'databases', label: t('components:techStackTable.databases') },
    { value: 'integrations', label: t('components:techStackTable.integrations') },
    { value: 'storages', label: t('components:techStackTable.storage') }
  ];

  // Store current data for comparison
  const currentDataRef = useRef(null);
  
  // Load all tech stack data when component mounts
  const loadAllTechStackData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getTechStackData(true);
      const componentsWithUniqueIds = response.items.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      
      // Smart refresh: only update if data actually changed
      if (hasDataChanged(currentDataRef.current, componentsWithUniqueIds)) {
        console.log('📊 TechStack data changed, updating UI');
        currentDataRef.current = componentsWithUniqueIds;
        setAllComponents(componentsWithUniqueIds);
      } else {
        console.log('✓ TechStack data unchanged, skipping UI update');
      }
    } catch (error) {
      console.error('Error loading tech stack data:', error);
      
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
      } else {
        setError(error.message || 'Failed to load tech stack data');
      }
      
      setAllComponents([]);
      setFilteredComponents([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const autoRefresh = useAutoRefresh(loadAllTechStackData, {
    enabled: true
  });

  useEffect(() => {
    loadAllTechStackData();
  }, [loadAllTechStackData]);

  const prevExternalTrigger = useRef(externalRefreshTrigger);
  useEffect(() => {
    if (externalRefreshTrigger && externalRefreshTrigger !== prevExternalTrigger.current) {
      console.log('🔔 External refresh triggered for TechStackTable');
      autoRefresh.triggerRefresh();
      prevExternalTrigger.current = externalRefreshTrigger;
    }
  }, [externalRefreshTrigger, autoRefresh]);

  // Apply filtering and sorting whenever filter or sort parameters change
  useEffect(() => {
    // Debounce the filtering to avoid performance issues
    const debouncedFilter = debounce(() => {
      // Apply filtering
      let result = [...allComponents];
      
      if (filterText) {
        const lowerFilterText = filterText.toLowerCase();
        
        if (filterColumn.value === 'all') {
          // Search in all columns
          result = result.filter(item => {
            // Check application name
            if (item.applicationName.toLowerCase().includes(lowerFilterText)) {
              return true;
            }
            
            // Check component name
            if (item.componentName.toLowerCase().includes(lowerFilterText)) {
              return true;
            }
            
            // Check runtime
            if (item.runtime && item.runtime.toLowerCase().includes(lowerFilterText)) {
              return true;
            }
            
            // Check framework
            if (item.framework && item.framework.toLowerCase().includes(lowerFilterText)) {
              return true;
            }
            
            // Check databases
            if (item.databases && Array.isArray(item.databases) && 
                item.databases.some(tech => tech.toLowerCase().includes(lowerFilterText))) {
              return true;
            }
            
            // Check integrations
            if (item.integrations && Array.isArray(item.integrations) && 
                item.integrations.some(tech => tech.toLowerCase().includes(lowerFilterText))) {
              return true;
            }
            
            // Check storages
            if (item.storages && Array.isArray(item.storages) && 
                item.storages.some(tech => tech.toLowerCase().includes(lowerFilterText))) {
              return true;
            }
            
            return false;
          });
        } else {
          // Search in specific column
          const column = filterColumn.value;
          
          result = result.filter(item => {
            if (column === 'applicationName' || column === 'componentName' || column === 'runtime' || column === 'framework') {
              return item[column] && item[column].toLowerCase().includes(lowerFilterText);
            } else {
              // For array columns (databases, integrations, storages)
              return item[column] && Array.isArray(item[column]) && 
                     item[column].some(tech => tech.toLowerCase().includes(lowerFilterText));
            }
          });
        }
      }
      
      // Apply sorting
      if (sortingColumn) {
        result.sort((a, b) => {
          const column = sortingColumn.sortingField;
          
          if (column === 'applicationName' || column === 'componentName' || column === 'runtime' || column === 'framework') {
            // String comparison for application and component names
            const valueA = (a[column] || '').toLowerCase();
            const valueB = (b[column] || '').toLowerCase();
            
            return sortingDescending ? 
              valueB.localeCompare(valueA) : 
              valueA.localeCompare(valueB);
          } else {
            // For array columns, compare the first item or length
            const valueA = a[column] && Array.isArray(a[column]) ? 
              (a[column].length > 0 ? a[column][0].toLowerCase() : '') : '';
            
            const valueB = b[column] && Array.isArray(b[column]) ? 
              (b[column].length > 0 ? b[column][0].toLowerCase() : '') : '';
            
            return sortingDescending ? 
              valueB.localeCompare(valueA) : 
              valueA.localeCompare(valueB);
          }
        });
      }
      
      setFilteredComponents(result);
      setTotalItems(result.length);
      
      // Reset to first page when filtering changes
      if (filterText !== '') {
        setCurrentPage(1);
      }
    }, 300);
    
    debouncedFilter();
    
    // No need to include debouncedFilter in dependencies as it's created on each render
  }, [allComponents, filterText, filterColumn, sortingColumn, sortingDescending]);

  // Apply pagination whenever filtered data or pagination parameters change
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredComponents.length);
    setDisplayedComponents(filteredComponents.slice(startIndex, endIndex));
  }, [filteredComponents, currentPage, pageSize]);

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
      const response = await getTechStackData(true);
      const components = response?.items || [];
      const componentsWithUniqueIds = components.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      setAllComponents(componentsWithUniqueIds);
    } catch (err) {
      console.error('Error refreshing tech stack data:', err);
      
      // Check if error is due to missing view/table (no data uploaded yet)
      if (err.message && (
        err.message.includes('does not exist') || 
        err.message.includes('FAILED') ||
        err.message.includes('Table not found') ||
        err.message.includes('View not found')
      )) {
        // Don't show error for missing data - just show empty state
        console.log('No tech stack data uploaded yet');
        setError(null);
      } else {
        setError(t('components:techStackTable.failedToRefresh'));
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
        <Alert type="error" header={t('components:techStackTable.errorLoadingData')} dismissible>
          {error}
        </Alert>
      )}
      
      <Table
        columnDefinitions={columnDefinitions}
        items={displayedComponents}
        loading={loading}
        loadingText={t('components:techStackTable.loadingTechStackData')}
        selectionType="single"
        trackBy="uniqueId"
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={handleSortingChange}
        empty={
          <Box textAlign="center" color="inherit">
            <b>{t('components:techStackTable.noTechStackComponents')}</b>
            <Box padding={{ bottom: "s" }} variant="p" color="inherit">
              {t('components:techStackTable.noTechStackComponentsToDisplay')}
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
            {t('components:techStackTable.techStackComponents')}
          </Header>
        }
        filter={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Select
              selectedOption={filterColumn}
              onChange={handleFilterColumnChange}
              options={filterColumnOptions}
              filteringType="auto"
              ariaLabel={t('components:techStackTable.filterColumn')}
              expandToViewport
            />
            <div style={{ width: '300px' }}>
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder={t('components:techStackTable.findBy', { column: filterColumn.label.toLowerCase() })}
                filteringAriaLabel={t('components:techStackTable.filterBy', { column: filterColumn.label.toLowerCase() })}
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
                { value: 10, label: t('components:techStackTable.tenComponents') },
                { value: 20, label: t('components:techStackTable.twentyComponents') },
                { value: 50, label: t('components:techStackTable.fiftyComponents') }
              ]
            }}
            visibleContentPreference={{
              title: t('common:selectVisibleColumns'),
              options: [
                {
                  label: t('components:techStackTable.componentProperties'),
                  options: [
                    { id: "applicationName", label: t('components:techStackTable.application') },
                    { id: "componentName", label: t('components:techStackTable.component') },
                    { id: "runtime", label: t('components:techStackTable.runtime') },
                    { id: "framework", label: t('components:techStackTable.framework') },
                    { id: "databases", label: t('components:techStackTable.databases') },
                    { id: "integrations", label: t('components:techStackTable.integrations') },
                    { id: "storages", label: t('components:techStackTable.storage') }
                  ]
                }
              ]
            }}
            onConfirm={handlePreferencesChange}
          />
        }
        visibleColumns={preferences.visibleContent}
        wrapLines
        stickyHeader
      />
      
      <Box padding={{ top: 'l' }}>
        <DownloadDropdownButton
          data={allComponents}
          filteredData={filteredComponents}
          columns={[
            { id: 'applicationName', header: t('components:techStackTable.application') },
            { id: 'componentName', header: t('components:techStackTable.component') },
            { id: 'runtime', header: t('components:techStackTable.runtime') },
            { id: 'framework', header: t('components:techStackTable.framework') },
            { id: 'databases', header: t('components:techStackTable.databases') },
            { id: 'integrations', header: t('components:techStackTable.integrations') },
            { id: 'storages', header: t('components:techStackTable.storage') }
          ]}
          filename="tech_stack_components"
          dataType={t('components:techStackTable.techStackComponentsDataset')}
        />
      </Box>
    </>
  );
}

// Export the component wrapped with resize optimization
export default withResizeOptimization(TechStackTable);
