import React, { useState, useEffect, useCallback } from 'react';
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
  Alert,
  Modal,
  ColumnLayout,
  Container,
  Badge
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import ExportErrorBoundary from './export/ExportErrorBoundary';
// Import types are not needed in JavaScript files
// Types are defined in ../types/export.ts for reference

/**
 * Export History Table Component
 * 
 * Implements sortable table with column header click handling, real-time filtering
 * functionality for all columns, pagination controls with configurable page sizes
 * (10, 25, 50, 100), and download link handling for completed exports.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
function ExportHistoryTable({ 
  data = [], 
  loading = false, 
  error = null, 
  onRefresh = () => {}, 
  onDownload = () => {} 
}) {
  const { t } = useTranslation(['components', 'common']);
  // State management for table functionality
  const [filteredData, setFilteredData] = useState([]);
  const [displayedData, setDisplayedData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [filterColumn, setFilterColumn] = useState({ value: 'all', label: t('components:exportHistory.allColumns') });
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'createdAt' });
  const [sortingDescending, setSortingDescending] = useState(true); // Most recent first
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['createdAt', 'status', 'fileSizeMB', 'downloadCount', 'actions']
  });
  
  // State for export details popup
  const [selectedExport, setSelectedExport] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Format date for display
  const formatDate = useCallback((dateString) => {
    if (!dateString) return t('components:exportHistory.notAvailable');
    try {
      return new Date(dateString).toLocaleString();
    } catch (error) {
      return t('components:exportHistory.invalidDate');
    }
  }, []);

  // Format file size for display (handles both bytes and MB)
  const formatFileSize = useCallback((item) => {
    // Check if we have fileSizeBytes (from API) or fileSizeMB (legacy)
    const sizeInBytes = item?.fileSizeBytes;
    const sizeInMB = item?.fileSizeMB;
    
    if (sizeInBytes && sizeInBytes > 0) {
      // Convert bytes to appropriate unit
      if (sizeInBytes < 1024) {
        return `${sizeInBytes} B`;
      } else if (sizeInBytes < 1024 * 1024) {
        return `${(sizeInBytes / 1024).toFixed(1)} KB`;
      } else {
        return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
      }
    } else if (sizeInMB && sizeInMB > 0) {
      // Legacy format
      if (sizeInMB < 1) {
        return `${(sizeInMB * 1024).toFixed(0)} KB`;
      }
      return `${sizeInMB.toFixed(1)} MB`;
    }
    
    return t('components:exportHistory.notAvailable');
  }, []);

  // Get status indicator type and text
  const getStatusIndicator = useCallback((status) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED':
        return { type: 'success', text: t('components:exportHistory.completed') };
      case 'PROCESSING':
        return { type: 'in-progress', text: t('components:exportHistory.processing') };
      case 'INITIATED':
        return { type: 'pending', text: t('components:exportHistory.initiated') };
      case 'FAILED':
        return { type: 'error', text: t('components:exportHistory.failed') };
      default:
        return { type: 'info', text: status || t('components:exportHistory.unknown') };
    }
  }, [t]);

  // Handle download action with error handling
  const handleDownload = useCallback((exportId, status) => {
    try {
      if (status?.toUpperCase() === 'COMPLETED') {
        onDownload(exportId);
      } else {
        console.warn(`Attempted to download export ${exportId} with status ${status}`);
      }
    } catch (error) {
      console.error('Error in download handler:', error);
      // Error will be handled by parent component
    }
  }, [onDownload]);

  // Handle showing export details
  const handleShowDetails = useCallback((exportItem) => {
    setSelectedExport(exportItem);
    setShowDetailsModal(true);
  }, []);

  // Handle closing export details modal
  const handleCloseDetails = useCallback(() => {
    setShowDetailsModal(false);
    setSelectedExport(null);
  }, []);

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'createdAt',
      header: t('components:exportHistory.created'),
      cell: item => formatDate(item.createdAt),
      sortingField: 'createdAt',
      width: 180
    },

    {
      id: 'status',
      header: t('components:exportHistory.status'),
      cell: item => {
        const { type, text } = getStatusIndicator(item.status);
        return <StatusIndicator type={type}>{text}</StatusIndicator>;
      },
      sortingField: 'status',
      width: 120
    },
    {
      id: 'fileSizeMB',
      header: t('components:exportHistory.fileSize'),
      cell: item => formatFileSize(item),
      sortingField: 'fileSizeBytes',
      width: 100
    },
    {
      id: 'downloadCount',
      header: t('components:exportHistory.downloads'),
      cell: item => item.downloadCount || 0,
      sortingField: 'downloadCount',
      width: 100
    },
    {
      id: 'actions',
      header: t('common:actions'),
      cell: item => {
        const isCompleted = item.status?.toUpperCase() === 'COMPLETED';
        return (
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="icon"
              iconName="status-info"
              onClick={() => handleShowDetails(item)}
              ariaLabel={t('components:exportHistory.viewDetails', { exportId: item.exportId })}
            />
            <Button
              variant="icon"
              iconName="download"
              onClick={() => handleDownload(item.exportId, item.status)}
              disabled={!isCompleted}
              ariaLabel={t('components:exportHistory.downloadExport', { exportId: item.exportId })}
            />
          </SpaceBetween>
        );
      },
      width: 120
    }
  ];

  // Filter column options
  const filterColumnOptions = [
    { value: 'all', label: t('components:exportHistory.allColumns') },
    { value: 'createdAt', label: t('components:exportHistory.createdDate') },
    { value: 'status', label: t('components:exportHistory.status') },
    { value: 'userName', label: t('components:exportHistory.user') }
  ];

  // Apply filtering and sorting whenever data or filter parameters change
  useEffect(() => {
    // Ensure data is an array
    const records = Array.isArray(data) ? data : [];
    
    // Apply filtering
    let result = [...records];
    
    if (filterText) {
      const searchText = filterText.toLowerCase();
      
      if (filterColumn.value === 'all') {
        result = result.filter(item => {
          // Search across all searchable fields
          const searchableFields = [
            formatDate(item.createdAt),
            item.status || '',
            item.userName || '',
            formatFileSize(item)
          ];
          
          return searchableFields.some(field => 
            field.toLowerCase().includes(searchText)
          );
        });
      } else if (filterColumn.value === 'createdAt') {
        result = result.filter(item => 
          formatDate(item.createdAt).toLowerCase().includes(searchText)
        );
      } else {
        result = result.filter(item => {
          const value = item[filterColumn.value];
          return value && String(value).toLowerCase().includes(searchText);
        });
      }
    }
    
    // Apply sorting
    if (sortingColumn) {
      result.sort((a, b) => {
        let valueA = a[sortingColumn.sortingField];
        let valueB = b[sortingColumn.sortingField];
        
        // Handle date sorting
        if (sortingColumn.sortingField === 'createdAt' || sortingColumn.sortingField === 'completedAt') {
          valueA = valueA ? new Date(valueA).getTime() : 0;
          valueB = valueB ? new Date(valueB).getTime() : 0;
          return sortingDescending ? valueB - valueA : valueA - valueB;
        }
        
        // Handle numeric sorting
        if (sortingColumn.sortingField === 'fileSizeMB' || sortingColumn.sortingField === 'fileSizeBytes' || sortingColumn.sortingField === 'downloadCount') {
          const numA = parseFloat(valueA) || 0;
          const numB = parseFloat(valueB) || 0;
          return sortingDescending ? numB - numA : numA - numB;
        }
        
        // Handle array sorting (for selectedCategories)
        if (sortingColumn.sortingField === 'selectedCategories') {
          const strA = Array.isArray(valueA) ? valueA.join(', ') : String(valueA || '');
          const strB = Array.isArray(valueB) ? valueB.join(', ') : String(valueB || '');
          return sortingDescending 
            ? strB.localeCompare(strA) 
            : strA.localeCompare(strB);
        }
        
        // Handle string sorting
        const stringA = String(valueA || '').toLowerCase();
        const stringB = String(valueB || '').toLowerCase();
        
        return sortingDescending 
          ? stringB.localeCompare(stringA) 
          : stringA.localeCompare(stringB);
      });
    }
    
    setFilteredData(result);
    setTotalItems(result.length);
    
    // Reset to first page when filtering changes
    if (filterText !== '') {
      setCurrentPage(1);
    }
  }, [data, filterText, filterColumn, sortingColumn, sortingDescending, formatDate, formatFileSize]);

  // Apply pagination whenever filtered data or pagination parameters change
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredData.length);
    setDisplayedData(filteredData.slice(startIndex, endIndex));
  }, [filteredData, currentPage, pageSize]);

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
  }, []);

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

  // Calculate total pages
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <ExportErrorBoundary 
      context="export_history_table"
      onRetry={() => {
        // Reset table state and refresh data
        setCurrentPage(1);
        setFilterText('');
        onRefresh();
      }}
    >
      {error && (
        <Alert 
          type="error" 
          header={t('components:exportHistory.errorLoadingHistory')} 
          dismissible
          action={
            <Button onClick={onRefresh} variant="primary">
              {t('common:retry')}
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      
      <Table
        columnDefinitions={columnDefinitions}
        items={displayedData}
        loading={loading}
        loadingText={t('components:exportHistory.loadingExportHistory')}
        selectionType="single"
        trackBy="exportId"
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={handleSortingChange}
        empty={
          <Box textAlign="center" color="inherit">
            <b>{t('components:exportHistory.noExportHistory')}</b>
            <Box padding={{ bottom: "s" }} variant="p" color="inherit">
              {t('components:exportHistory.noExportRecords')}
            </Box>
          </Box>
        }
        header={
          <Header
            counter={totalItems > 0 ? `(${totalItems})` : undefined}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" onClick={onRefresh} disabled={loading}>
                  {t('common:refresh')}
                </Button>
              </SpaceBetween>
            }
          >
            {t('components:exportHistory.exportHistory')}
          </Header>
        }
        filter={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Select
              selectedOption={filterColumn}
              onChange={handleFilterColumnChange}
              options={filterColumnOptions}
              ariaLabel={t('components:exportHistory.filterColumn')}
            />
            <div style={{ width: '300px' }}>
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder={t('components:exportHistory.findBy', { column: filterColumn.label.toLowerCase() })}
                filteringAriaLabel={t('components:exportHistory.findBy', { column: filterColumn.label.toLowerCase() })}
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
                { value: 10, label: t('components:exportHistory.tenExports') },
                { value: 25, label: t('components:exportHistory.twentyFiveExports') },
                { value: 50, label: t('components:exportHistory.fiftyExports') },
                { value: 100, label: t('components:exportHistory.hundredExports') }
              ]
            }}
            visibleContentPreference={{
              title: t('common:selectVisibleColumns'),
              options: [
                {
                  label: t('components:exportHistory.exportProperties'),
                  options: [
                    { id: "createdAt", label: t('components:exportHistory.createdDate') },
                    { id: "status", label: t('components:exportHistory.status') },
                    { id: "fileSizeMB", label: t('components:exportHistory.fileSize') },
                    { id: "downloadCount", label: t('components:exportHistory.downloadCount') },
                    { id: "actions", label: t('common:actions') }
                  ]
                }
              ]
            }}
            onConfirm={handlePreferencesChange}
          />
        }
        visibleColumns={preferences.visibleContent}
      />
      
      {/* Export Details Modal */}
      <Modal
        onDismiss={handleCloseDetails}
        visible={showDetailsModal}
        header={t('components:exportHistory.exportDetailsHeader', { exportId: selectedExport?.exportId?.substring(0, 8) })}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="normal" onClick={handleCloseDetails}>
                {t('common:close')}
              </Button>
              {selectedExport?.status?.toUpperCase() === 'COMPLETED' && (
                <Button 
                  variant="primary" 
                  iconName="download"
                  onClick={() => {
                    handleDownload(selectedExport.exportId, selectedExport.status);
                    handleCloseDetails();
                  }}
                >
                  {t('common:download')}
                </Button>
              )}
            </SpaceBetween>
          </Box>
        }
      >
        {selectedExport && (
          <Container>
            <ColumnLayout columns={2} variant="text-grid">
              <div>
                <Box variant="awsui-key-label">{t('components:exportHistory.exportId')}</Box>
                <div>{selectedExport.exportId}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">{t('components:exportHistory.status')}</Box>
                <StatusIndicator type={getStatusIndicator(selectedExport.status).type}>
                  {getStatusIndicator(selectedExport.status).text}
                </StatusIndicator>
              </div>
              <div>
                <Box variant="awsui-key-label">{t('components:exportHistory.created')}</Box>
                <div>{formatDate(selectedExport.createdAt)}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">{t('components:exportHistory.updated')}</Box>
                <div>{formatDate(selectedExport.updatedAt)}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">{t('components:exportHistory.fileSize')}</Box>
                <div>{formatFileSize(selectedExport)}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">{t('components:exportHistory.downloads')}</Box>
                <div>{selectedExport.downloadCount || 0}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">{t('components:common.user')}</Box>
                <div>{selectedExport.userName || 'N/A'}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">{t('components:exportHistory.lastDownloaded')}</Box>
                <div>{selectedExport.lastDownloadAt ? formatDate(selectedExport.lastDownloadAt) : t('components:exportHistory.never')}</div>
              </div>
            </ColumnLayout>
            
            {selectedExport.selectedCategories && selectedExport.selectedCategories.length > 0 && (
              <Box margin={{ top: 'l' }}>
                <Box variant="awsui-key-label">{t('components:exportHistoryTable.selectedCategories')}{selectedExport.selectedCategories.length})</Box>
                <SpaceBetween direction="horizontal" size="xs" wrap>
                  {selectedExport.selectedCategories.map((category, index) => (
                    <Badge key={index} color="blue">
                      {category}
                    </Badge>
                  ))}
                </SpaceBetween>
              </Box>
            )}
          </Container>
        )}
      </Modal>
    </ExportErrorBoundary>
  );
}

export default ExportHistoryTable;