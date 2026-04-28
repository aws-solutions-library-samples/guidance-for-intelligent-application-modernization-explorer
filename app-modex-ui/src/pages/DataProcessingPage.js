import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { 
  Table, Pagination, TextFilter, Header, 
  SpaceBetween, DateRangePicker, Select, Multiselect,
  Button, StatusIndicator, Box, CollectionPreferences,
  Container, FormField, Alert
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import Layout from '../layouts/AppLayout';
import DataProcessingInfo from '../components/info/DataProcessingInfo';
import { fetchProcesses } from '../services/processTrackingApi';
import TableErrorHandler from '../components/dataProcessing/TableErrorHandler';
import ResizeObserverErrorSuppressor from '../components/dataProcessing/ResizeObserverErrorSuppressor';

// Enhanced error suppression for ResizeObserver issues
const suppressResizeObserverErrors = () => {
  // Store original error handler
  const originalOnError = window.onerror;
  const originalConsoleError = console.error;
  
  // Override window.onerror to catch ResizeObserver errors
  window.onerror = function(message, source, lineno, colno, error) {
    // Check if this is a ResizeObserver error (exact match for your error)
    if (
      (message && typeof message === 'string' && 
       (message.includes('ResizeObserver loop completed with undelivered notifications') ||
        message.includes('ResizeObserver'))) ||
      (error && error.message && error.message.includes('ResizeObserver'))
    ) {
      console.debug('Suppressed ResizeObserver error:', message);
      return true; // Prevent error from propagating
    }
    
    // Call original handler for other errors
    return originalOnError ? originalOnError.apply(this, arguments) : false;
  };
  
  // Override console.error to suppress ResizeObserver console errors
  console.error = function(...args) {
    if (args[0] && typeof args[0] === 'string' && 
        args[0].includes('ResizeObserver loop completed with undelivered notifications')) {
      console.debug('Suppressed ResizeObserver console error');
      return;
    }
    return originalConsoleError.apply(this, args);
  };
  
  // Also handle unhandled promise rejections
  const rejectionHandler = (event) => {
    if (event.reason && String(event.reason).includes('ResizeObserver')) {
      console.debug('Suppressed ResizeObserver rejection:', event.reason);
      event.preventDefault();
      return false;
    }
  };
  
  window.addEventListener('unhandledrejection', rejectionHandler);
  
  // Return cleanup function
  return () => {
    window.onerror = originalOnError;
    console.error = originalConsoleError;
    window.removeEventListener('unhandledrejection', rejectionHandler);
  };
};

const DataProcessingPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const { projectId } = useParams();
  const location = useLocation();
  
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [filterParams, setFilterParams] = useState({
    startDate: null,
    endDate: null,
    status: null,
    processTypes: []
  });
  const [pagination, setPagination] = useState({ 
    pageSize: 10, 
    currentPage: 1,
    totalCount: 0,
    hasNextPage: false,
    pageTokens: {} // Store tokens for each page: {1: null, 2: "token1", 3: "token2"}
  });
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: [
      'processId',
      'processName',
      'processType',
      'status',
      'startTime',
      'endTime',
      'duration'
    ]
  });
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'startTime' });
  const [sortingDescending, setSortingDescending] = useState(true);
  
  useEffect(() => {
    if (projectId) {
      loadProcesses();
    }
  }, [projectId, filterParams, pagination.currentPage]);
  
  // Handle page size changes separately
  useEffect(() => {
    if (projectId) {
      loadProcesses();
    }
  }, [pagination.pageSize]);
  
  // Apply enhanced error suppression for this page
  useEffect(() => {
    // Suppress ResizeObserver errors for this page
    const cleanup = suppressResizeObserverErrors();
    
    // Return cleanup function
    return cleanup;
  }, []);
  
  const loadProcesses = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const currentPageToken = pagination.pageTokens[pagination.currentPage] || null;
      
      const response = await fetchProcesses(projectId, {
        ...filterParams,
        limit: pagination.pageSize,
        nextToken: currentPageToken,
        sortBy: 'startTime',
        sortOrder: 'desc'
      });
      
      console.log('API Response:', response);
      console.log('Has nextToken:', !!response.nextToken);
      console.log('NextToken value:', response.nextToken);
      
      setProcesses(response.items || []);
      setPagination(prev => ({ 
        ...prev, 
        hasNextPage: !!response.nextToken,
        pageTokens: {
          ...prev.pageTokens,
          [prev.currentPage + 1]: response.nextToken // Store token for next page
        }
      }));
    } catch (error) {
      console.error('Error loading processes:', error);
      setError(t('pages:dataProcessing.failedToLoadProcessData'));
    } finally {
      setLoading(false);
    }
  };
  
  const handleRefresh = () => {
    loadProcesses();
  };
  
  const handleFilterChange = (newFilters) => {
    setFilterParams(prev => ({
      ...prev,
      ...newFilters
    }));
    setPagination(prev => ({
      ...prev,
      currentPage: 1
    }));
  };
  
  const handleDateRangeChange = ({ detail }) => {
    handleFilterChange({
      startDate: detail.value.startDate,
      endDate: detail.value.endDate
    });
  };
  
  const handleStatusChange = ({ detail }) => {
    handleFilterChange({
      status: detail.selectedOption.value
    });
  };
  
  const handleProcessTypeChange = ({ detail }) => {
    handleFilterChange({
      processTypes: detail.selectedOptions.map(option => option.value)
    });
  };
  
  const handleTextFilterChange = ({ detail }) => {
    // This will filter on the client side since we don't have a server-side API for text search
    if (detail.filteringText) {
      const filteredProcesses = processes.filter(process => 
        process.processName.toLowerCase().includes(detail.filteringText.toLowerCase()) ||
        process.processId.toLowerCase().includes(detail.filteringText.toLowerCase())
      );
      setProcesses(filteredProcesses);
    } else {
      // If filter is cleared, reload from server
      loadProcesses();
    }
  };
  
  const handlePageChange = ({ detail }) => {
    setPagination(prev => ({ 
      ...prev, 
      currentPage: detail.currentPageIndex 
    }));
  };
  
  const handlePreferencesChange = ({ detail }) => {
    if (!detail) {
      return;
    }
    
    setPreferences(detail);
    
    if (detail.pageSize && detail.pageSize !== pagination.pageSize) {
      setPagination(prev => ({ 
        ...prev, 
        pageSize: detail.pageSize,
        currentPage: 1, // Reset to first page
        pageTokens: {}, // Clear stored tokens
        hasNextPage: false // Reset next page flag
      }));
    }
  };
  
  const getStatusIndicator = (status) => {
    switch (status) {
      case 'INITIATED':
        return <StatusIndicator type="pending">{t('pages:dataProcessing.initiated')}</StatusIndicator>;
      case 'PROCESSING':
        return <StatusIndicator type="in-progress">{t('pages:dataProcessing.processing')}</StatusIndicator>;
      case 'COMPLETED':
        return <StatusIndicator type="success">{t('pages:dataProcessing.completed')}</StatusIndicator>;
      case 'FAILED':
        return <StatusIndicator type="error">{t('pages:dataProcessing.failed')}</StatusIndicator>;
      default:
        return <StatusIndicator type="info">{status}</StatusIndicator>;
    }
  };
  
  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };
  
  const columnDefinitions = [
    {
      id: 'processId',
      header: t('pages:dataProcessing.processId'),
      cell: item => item.processId,
      sortingField: 'processId',
      width: 150
    },
    {
      id: 'processName',
      header: t('pages:dataProcessing.processName'),
      cell: item => item.processName,
      sortingField: 'processName',
      width: 200
    },
    {
      id: 'processType',
      header: t('pages:dataProcessing.type'),
      cell: item => item.processType,
      sortingField: 'processType',
      width: 120
    },
    {
      id: 'status',
      header: t('pages:dataProcessing.status'),
      cell: item => getStatusIndicator(item.status),
      sortingField: 'status',
      width: 100
    },
    {
      id: 'startTime',
      header: t('pages:dataProcessing.startTime'),
      cell: item => new Date(item.startTime).toLocaleString(),
      sortingField: 'startTime',
      width: 160
    },
    {
      id: 'endTime',
      header: t('pages:dataProcessing.endTime'),
      cell: item => {
        // For completed/failed processes, use updatedAt as end time
        if ((item.status === 'COMPLETED' || item.status === 'FAILED') && item.updatedAt) {
          return new Date(item.updatedAt).toLocaleString();
        }
        return '-';
      },
      sortingField: 'updatedAt',
      width: 160
    },
    {
      id: 'duration',
      header: t('pages:dataProcessing.duration'),
      cell: item => {
        // Calculate duration from startTime to updatedAt for completed/failed processes
        if ((item.status === 'COMPLETED' || item.status === 'FAILED') && item.startTime && item.updatedAt) {
          const start = new Date(item.startTime);
          const end = new Date(item.updatedAt);
          const durationSeconds = (end - start) / 1000;
          return formatDuration(durationSeconds);
        }
        return '-';
      },
      sortingField: 'duration',
      width: 100
    }
  ];
  
  const visibleColumns = preferences.visibleContent;
  
  // Filter processes by selected process types
  const filteredProcesses = filterParams.processTypes.length > 0
    ? processes.filter(process => filterParams.processTypes.includes(process.processType))
    : processes;
  
  // Sort processes based on current sorting configuration
  const sortedProcesses = [...filteredProcesses].sort((a, b) => {
    const field = sortingColumn.sortingField;
    let aValue, bValue;
    
    switch (field) {
      case 'processId':
      case 'processName':
      case 'processType':
      case 'status':
        aValue = (a[field] || '').toLowerCase();
        bValue = (b[field] || '').toLowerCase();
        break;
      case 'startTime':
        aValue = new Date(a.startTime).getTime();
        bValue = new Date(b.startTime).getTime();
        break;
      case 'updatedAt':
        aValue = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        bValue = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        break;
      case 'duration':
        // Calculate duration for sorting
        if ((a.status === 'COMPLETED' || a.status === 'FAILED') && a.startTime && a.updatedAt) {
          aValue = new Date(a.updatedAt).getTime() - new Date(a.startTime).getTime();
        } else {
          aValue = 0;
        }
        if ((b.status === 'COMPLETED' || b.status === 'FAILED') && b.startTime && b.updatedAt) {
          bValue = new Date(b.updatedAt).getTime() - new Date(b.startTime).getTime();
        } else {
          bValue = 0;
        }
        break;
      default:
        return 0;
    }
    
    if (aValue < bValue) return sortingDescending ? 1 : -1;
    if (aValue > bValue) return sortingDescending ? -1 : 1;
    return 0;
  });
  
  const content = (
    <Container>
      <SpaceBetween size="l">
        <Header
          variant="h1"
          description={t('pages:dataProcessing.description')}
          actions={
            <Button onClick={handleRefresh} iconName="refresh">
              {t('common:buttons.refresh')}
            </Button>
          }
        >
          {t('pages:dataProcessing.title')}
        </Header>
        
        {error && (
          <Alert type="error" header={t('pages:dataProcessing.errorLoadingData')}>
            {error}
          </Alert>
        )}
        
        <Box padding="l">
          <SpaceBetween size="l">
            <SpaceBetween size="s" direction="horizontal">
              <FormField label={t('pages:dataProcessing.status')}>
                <Select
                  selectedOption={filterParams.status ? { value: filterParams.status, label: filterParams.status } : null}
                  onChange={handleStatusChange}
                  options={[
                    { value: '', label: t('pages:dataProcessing.allStatuses') },
                    { value: 'INITIATED', label: t('pages:dataProcessing.initiated') },
                    { value: 'PROCESSING', label: t('pages:dataProcessing.processing') },
                    { value: 'COMPLETED', label: t('pages:dataProcessing.completed') },
                    { value: 'FAILED', label: t('pages:dataProcessing.failed') }
                  ]}
                  placeholder={t('pages:dataProcessing.filterByStatus')}
                />
              </FormField>
              
              <FormField label={t('pages:dataProcessing.processType')}>
                <Multiselect
                  selectedOptions={filterParams.processTypes.map(type => ({ value: type, label: type }))}
                  onChange={handleProcessTypeChange}
                  options={[
                    { value: 'FILE_UPLOAD', label: t('pages:dataProcessing.fileUpload') },
                    { value: 'FILE_DELETION', label: t('pages:dataProcessing.fileDeletion') },
                    { value: 'GENAI_NORMALIZATION', label: t('pages:dataProcessing.genaiNormalization') },
                    { value: 'APP_SIMILARITY', label: t('pages:dataProcessing.appSimilarity') },
                    { value: 'COMP_SIMILARITY', label: t('pages:dataProcessing.compSimilarity') },
                    { value: 'PILOT_IDENTIFICATION', label: t('pages:dataProcessing.pilotIdentification') },
                    { value: 'EXPORT', label: t('pages:dataProcessing.export') }
                  ]}
                  placeholder={t('pages:dataProcessing.filterByProcessType')}
                  tokenLimit={3}
                  i18nStrings={{
                    tokenLimitShowMore: t('common:buttons.showMore'),
                    tokenLimitShowFewer: t('common:buttons.showLess')
                  }}
                />
              </FormField>
            </SpaceBetween>
            
            <FormField label={t('pages:dataProcessing.search')}>
              <TextFilter
                filteringText=""
                onChange={handleTextFilterChange}
                placeholder={t('pages:dataProcessing.searchPlaceholder')}
              />
            </FormField>
            
            <TableErrorHandler>
              <Table
                variant="container"
                stickyHeader={true}
                horizontalScrolling={true}
                loading={loading}
                loadingText={t('pages:dataProcessing.loadingProcesses')}
                items={sortedProcesses}
                columnDefinitions={columnDefinitions}
                visibleColumns={visibleColumns}
                sortingColumn={sortingColumn}
                sortingDescending={sortingDescending}
                onSortingChange={({ detail }) => {
                  setSortingColumn(detail.sortingColumn);
                  setSortingDescending(detail.isDescending);
                }}
                pagination={
                  <Pagination
                    currentPageIndex={pagination.currentPage}
                    pagesCount={pagination.hasNextPage ? pagination.currentPage + 1 : pagination.currentPage}
                    onChange={handlePageChange}
                  />
                }
              preferences={
                <CollectionPreferences
                  title={t('common:general.preferences')}
                  confirmLabel={t('common:general.confirm')}
                  cancelLabel={t('common:general.cancel')}
                  preferences={preferences}
                  onConfirm={handlePreferencesChange}
                  pageSizePreference={{
                    title: t('common:general.pageSize'),
                    options: [
                      { value: 10, label: t('pages:dataProcessing.tenProcesses') },
                      { value: 25, label: t('pages:dataProcessing.twentyFiveProcesses') },
                      { value: 50, label: t('pages:dataProcessing.fiftyProcesses') }
                    ]
                  }}
                  visibleContentPreference={{
                    title: t('common:general.selectVisibleColumns'),
                    options: [
                      {
                        label: t('pages:dataProcessing.processInformation'),
                        options: [
                          { id: "processId", label: t('pages:dataProcessing.processId') },
                          { id: "processName", label: t('pages:dataProcessing.processName') },
                          { id: "processType", label: t('pages:dataProcessing.type') },
                          { id: "status", label: t('pages:dataProcessing.status') }
                        ]
                      },
                      {
                        label: t('pages:dataProcessing.timeInformation'),
                        options: [
                          { id: "startTime", label: t('pages:dataProcessing.startTime') },
                          { id: "endTime", label: t('pages:dataProcessing.endTime') },
                          { id: "duration", label: t('pages:dataProcessing.duration') }
                        ]
                      }
                    ]
                  }}
                />
              }
              empty={
                <Box textAlign="center" padding="l">
                  <SpaceBetween size="m">
                    <b>{t('pages:dataProcessing.noProcessesFound')}</b>
                    <Box variant="p">
                      {filterParams.status || filterParams.processType || filterParams.startDate ? 
                        t('pages:dataProcessing.tryChangingFilters') : 
                        t('pages:dataProcessing.noDataProcessingOperations')}
                    </Box>
                  </SpaceBetween>
                </Box>
              }
            />
            </TableErrorHandler>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </Container>
  );
  
  return (
    <Layout
      activeHref={location.pathname}
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      infoContent={<DataProcessingInfo />}
    >
      <ResizeObserverErrorSuppressor />
      {content}
    </Layout>
  );
};

export default DataProcessingPage;
