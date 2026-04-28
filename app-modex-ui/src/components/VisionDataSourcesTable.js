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
  Icon,
  Spinner,
  Popover,
  Modal,
  Alert,
  Flashbar
} from '@cloudscape-design/components';
import { getDataSources, deleteDataSource, downloadDataSource } from '../services/dataSourcesService';
import useProjectPermissions from '../hooks/useProjectPermissions';
import AutoRefreshControl from './AutoRefreshControl';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { hasDataChanged } from '../utils/dataComparisonUtils';

function VisionDataSourcesTable({ dataSourceType = 'technology-vision', refreshTrigger = 0, projectId, onDataProcessingComplete, onDataChanged }) {
  const { t } = useTranslation(['components', 'common']);
  const [allDataSources, setAllDataSources] = useState([]);
  const [filteredDataSources, setFilteredDataSources] = useState([]);
  const [displayedDataSources, setDisplayedDataSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalItems, setTotalItems] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'timestamp' });
  const [sortingDescending, setSortingDescending] = useState(true); // Default to newest first
  const [preferences, setPreferences] = useState({
    pageSize: 5,
    visibleContent: ['filename', 'timestamp', 'fileFormat', 'status', 'download', 'delete']
  });
  
  // State for notifications and modals
  const [notifications, setNotifications] = useState([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  
  // Check if user has write access to the project
  const { hasWriteAccess } = useProjectPermissions(projectId);
  
  // Track previous data sources for status change detection
  const prevDataSourcesRef = useRef([]);
  
  // Store current data for comparison
  const currentDataRef = useRef(null);

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Add notification
  const addNotification = (type, content, dismissible = true, id = null) => {
    const notificationId = id || Math.random().toString(36).substring(2, 11);
    
    setNotifications(currentNotifications => [
      ...currentNotifications,
      {
        type,
        content,
        dismissible,
        id: notificationId,
        onDismiss: () => dismissNotification(notificationId)
      }
    ]);
    
    // Auto-dismiss success and info notifications after 5 seconds
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        dismissNotification(notificationId);
      }, 5000);
    }
    
    return notificationId;
  };

  // Dismiss notification
  const dismissNotification = (id) => {
    setNotifications(currentNotifications => 
      currentNotifications.filter(notification => notification.id !== id)
    );
  };

  // Handle download
  const handleDownload = async (id, filename) => {
    try {
      setLoading(true);
      console.log(`🔍 Initiating download for file: ${filename} (ID: ${id})`);
      
      const response = await downloadDataSource(id);
      console.log(`🔍 Download response:`, response);
      
      if (!response.success) {
        console.error('Error downloading file:', response.error);
        addNotification('error', t('components:visionDataSourcesTable.errorDownloading', { filename, error: response.error }));
      } else {
        console.log(`✅ Download initiated successfully for ${filename}`);
        addNotification('success', t('components:visionDataSourcesTable.downloadInitiated', { filename }));
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      addNotification('error', t('components:visionDataSourcesTable.errorDownloadingFile', { filename }));
    } finally {
      setLoading(false);
    }
  };

  // Open delete confirmation modal
  const openDeleteModal = (id, filename) => {
    if (!hasWriteAccess) {
      addNotification('error', t('components:visionDataSourcesTable.noDeletePermission'));
      return;
    }
    
    setFileToDelete({ id, filename });
    setDeleteModalVisible(true);
  };

  // Handle delete confirmation
  const confirmDelete = async () => {
    if (!fileToDelete) return;
    
    try {
      setLoading(true);
      setDeleteModalVisible(false);
      
      const { id, filename } = fileToDelete;
      const response = await deleteDataSource(id);
      
      if (response.success) {
        // Remove the item from the local state
        const updatedDataSources = allDataSources.filter(item => item.id !== id);
        setAllDataSources(updatedDataSources);
        addNotification('success', t('components:visionDataSourcesTable.deleteSuccess', { filename }));
      } else {
        addNotification('error', t('components:visionDataSourcesTable.deleteError', { filename, error: response.error }));
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      addNotification('error', t('components:visionDataSourcesTable.errorDeletingFile', { filename: fileToDelete.filename }));
    } finally {
      setLoading(false);
      setFileToDelete(null);
    }
  };

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'filename',
      header: t('components:visionDataSourcesTable.filename'),
      cell: item => item.filename,
      sortingField: 'filename'
    },
    {
      id: 'timestamp',
      header: t('components:visionDataSourcesTable.timestamp'),
      cell: item => formatTimestamp(item.timestamp),
      sortingField: 'timestamp'
    },
    {
      id: 'fileFormat',
      header: t('components:visionDataSourcesTable.fileFormat'),
      cell: item => item.fileFormat,
      sortingField: 'fileFormat'
    },
    {
      id: 'status',
      header: t('components:visionDataSourcesTable.status'),
      cell: item => {
        const status = item.processingStatus || 'pending';
        let statusIcon, statusText, statusColor;
        
        switch (status.toLowerCase()) {
          case 'processed':
            statusIcon = 'status-positive';
            statusText = t('components:visionDataSourcesTable.processed');
            statusColor = 'text-status-success';
            break;
          case 'processing':
            statusIcon = 'status-in-progress';
            statusText = t('components:visionDataSourcesTable.processing');
            statusColor = 'text-status-info';
            break;
          case 'failed':
            statusIcon = 'status-negative';
            statusText = t('components:visionDataSourcesTable.failed');
            statusColor = 'text-status-error';
            break;
          case 'pending':
          default:
            statusIcon = 'status-pending';
            statusText = t('components:visionDataSourcesTable.pending');
            statusColor = 'text-status-warning';
            break;
        }
        
        return (
          <Box display="flex" alignItems="center">
            <Icon
              name={statusIcon}
              size="small"
              variant="subtle"
            />
            <span style={{ marginLeft: '8px', color: `var(--${statusColor})` }}>
              {statusText}
            </span>
          </Box>
        );
      },
      sortingField: 'processingStatus'
    },
    {
      id: 'download',
      header: t('components:visionDataSourcesTable.download'),
      cell: item => (
        <Button
          variant="icon"
          iconName="download"
          ariaLabel={t('components:visionDataSourcesTable.downloadFile', { filename: item.filename })}
          onClick={() => handleDownload(item.id, item.filename)}
        />
      )
    },
    {
      id: 'delete',
      header: t('components:visionDataSourcesTable.delete'),
      cell: item => {
        const deleteButton = (
          <Button
            variant="icon"
            iconName="remove"
            ariaLabel={t('components:visionDataSourcesTable.deleteFile', { filename: item.filename })}
            onClick={() => openDeleteModal(item.id, item.filename)}
            disabled={!hasWriteAccess}
          />
        );
        
        return hasWriteAccess ? (
          deleteButton
        ) : (
          <Popover
            dismissButton={false}
            position="top"
            size="small"
            content={t('components:visionDataSourcesTable.noDeletePermissionTooltip')}
          >
            {deleteButton}
          </Popover>
        );
      }
    }
  ];

  // Load data sources from API
  const loadDataSources = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getDataSources(dataSourceType);
      if (response.success) {
        const newData = response.items;
        
        // Detect status changes from processing to completed
        if (onDataProcessingComplete && prevDataSourcesRef.current.length > 0) {
          const completedItems = newData.filter((newItem) => {
            const prevItem = prevDataSourcesRef.current.find(p => p.id === newItem.id);
            return prevItem && 
                   prevItem.processingStatus !== 'processed' && 
                   newItem.processingStatus === 'processed';
          });
          
          if (completedItems.length > 0) {
            console.log('🔔 Detected completed data sources:', completedItems.map(i => i.filename));
            onDataProcessingComplete();
          }
        }
        
        prevDataSourcesRef.current = newData;
        
        // Smart refresh: only update if data actually changed
        if (hasDataChanged(currentDataRef.current, newData)) {
          console.log('📊 [VisionDataSourcesTable] data changed, updating UI');
          currentDataRef.current = newData;
          setAllDataSources(newData);
          setFilteredDataSources(newData);
          setTotalItems(response.totalItems);
          
          // Notify parent that data has changed
          if (onDataChanged) {
            console.log('🔔 [VisionDataSourcesTable] Notifying parent of data change');
            onDataChanged();
          }
        } else {
          console.log('✓ [VisionDataSourcesTable] data unchanged, skipping UI update');
        }
      } else {
        console.error('Error loading data sources:', response.error);
        addNotification('error', t('components:visionDataSourcesTable.errorLoadingDataSources', { error: response.error }));
        setAllDataSources([]);
        setFilteredDataSources([]);
        setTotalItems(0);
      }
    } catch (error) {
      console.error('Error loading data sources:', error);
      addNotification('error', t('components:visionDataSourcesTable.errorLoadingDataSourcesGeneric'));
      setAllDataSources([]);
      setFilteredDataSources([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [dataSourceType, onDataProcessingComplete, t]);
  
  // Set up auto-refresh (fixed 30-second interval)
  const autoRefresh = useAutoRefresh(loadDataSources, {
    enabled: true
  });
  
  // Initial load
  useEffect(() => {
    loadDataSources();
  }, [loadDataSources]);
  
  // Handle external refresh trigger
  const prevRefreshTrigger = useRef(refreshTrigger);
  useEffect(() => {
    if (refreshTrigger && refreshTrigger !== prevRefreshTrigger.current) {
      console.log('🔔 External refresh triggered for VisionDataSourcesTable');
      autoRefresh.triggerRefresh();
      prevRefreshTrigger.current = refreshTrigger;
    }
  }, [refreshTrigger, autoRefresh]);

  // Apply filtering and sorting whenever filter or sort parameters change
  useEffect(() => {
    // Apply filtering - only by filename
    let result = [...allDataSources];
    
    if (filterText) {
      result = result.filter(item => 
        item.filename && item.filename.toLowerCase().includes(filterText.toLowerCase())
      );
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
        
        // Handle string sorting
        const stringA = String(valueA || '').toLowerCase();
        const stringB = String(valueB || '').toLowerCase();
        
        if (sortingDescending) {
          return stringB.localeCompare(stringA);
        }
        return stringA.localeCompare(stringB);
      });
    }
    
    setFilteredDataSources(result);
    setTotalItems(result.length);
    
    // Reset to first page when filtering changes
    if (filterText !== '') {
      setCurrentPage(1);
    }
  }, [allDataSources, filterText, sortingColumn, sortingDescending]);

  // Apply pagination whenever filtered data or pagination parameters change
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredDataSources.length);
    setDisplayedDataSources(filteredDataSources.slice(startIndex, endIndex));
  }, [filteredDataSources, currentPage, pageSize]);

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

  // Handle sorting change
  const handleSortingChange = ({ detail }) => {
    if (detail.sortingColumn) {
      setSortingColumn(detail.sortingColumn);
      setSortingDescending(detail.isDescending);
    }
  };

  // Calculate total pages
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <>
      {notifications.length > 0 && (
        <Flashbar items={notifications} />
      )}
      
      <Table
        columnDefinitions={columnDefinitions}
        items={displayedDataSources}
        loading={loading}
        loadingText={t('components:visionDataSourcesTable.loadingDataSources')}
        selectionType="single"
        trackBy="id"
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={handleSortingChange}
        empty={
          <Box textAlign="center" color="inherit">
            <b>{t('components:visionDataSourcesTable.noDataSources')}</b>
            <Box padding={{ bottom: "s" }} variant="p" color="inherit">
              {t('components:visionDataSourcesTable.noDataSourcesToDisplay')}
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
            {t('components:visionDataSourcesTable.dataSources')}
          </Header>
        }
        filter={
          <div style={{ maxWidth: '300px' }}>
            <TextFilter
              filteringText={filterText}
              filteringPlaceholder={t('components:visionDataSourcesTable.findByFilename')}
              filteringAriaLabel={t('components:visionDataSourcesTable.filterByFilename')}
              onChange={handleFilterChange}
            />
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
                { value: 5, label: t('components:visionDataSourcesTable.filesCount', { count: 5 }) },
                { value: 10, label: t('components:visionDataSourcesTable.filesCount', { count: 10 }) },
                { value: 20, label: t('components:visionDataSourcesTable.filesCount', { count: 20 }) }
              ]
            }}
            visibleContentPreference={{
              title: t('common:selectVisibleColumns'),
              options: [
                {
                  label: t('components:visionDataSourcesTable.fileProperties'),
                  options: [
                    { id: "filename", label: t('components:visionDataSourcesTable.filename') },
                    { id: "timestamp", label: t('components:visionDataSourcesTable.timestamp') },
                    { id: "fileFormat", label: t('components:visionDataSourcesTable.fileFormat') },
                    { id: "status", label: t('components:visionDataSourcesTable.status') },
                    { id: "download", label: t('components:visionDataSourcesTable.download') },
                    { id: "delete", label: t('components:visionDataSourcesTable.delete') }
                  ]
                }
              ]
            }}
            onConfirm={handlePreferencesChange}
          />
        }
        visibleColumns={preferences.visibleContent}
      />
      
      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        onDismiss={() => setDeleteModalVisible(false)}
        header={t('components:visionDataSourcesTable.confirmDeletion')}
        closeAriaLabel={t('common:closeModal')}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteModalVisible(false)}>{t('common:cancel')}</Button>
              <Button variant="primary" onClick={confirmDelete}>{t('common:delete')}</Button>
            </SpaceBetween>
          </Box>
        }
      >
        {fileToDelete && (
          <SpaceBetween size="m">
            <Box variant="span">
              {t('components:visionDataSourcesTable.confirmDeleteMessage', { filename: fileToDelete.filename })}
            </Box>
            <Alert type="warning">
              {t('components:visionDataSourcesTable.deleteWarning')}
            </Alert>
          </SpaceBetween>
        )}
      </Modal>
    </>
  );
}

export default VisionDataSourcesTable;
