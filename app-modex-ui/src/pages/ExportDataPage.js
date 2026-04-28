import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Header,
  Box,
  Button,
  ContentLayout,
  SpaceBetween,
  Alert,
  StatusIndicator,
  ProgressBar,
  Tabs,
  Modal
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Layout from '../layouts/AppLayout';
import ExportDataInfoContent from '../components/info/ExportDataInfoContent';
import ExportCategorySelector from '../components/ExportCategorySelector';
import ExportHistoryTable from '../components/ExportHistoryTable';
import ExportErrorBoundary from '../components/export/ExportErrorBoundary';
import exportApiService from '../services/exportApiService';
import { getExecutionStatus } from '../services/stepFunctionService';
import { retryExportOperation } from '../utils/exportRetryUtils';
import { useSimpleAuth } from '../contexts/SimpleAuthContext';

const ExportDataPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  const { user } = useSimpleAuth();
  
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState('export-config');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [project, setProject] = useState(null);
  
  // Export history state
  const [exportHistory, setExportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportErrorFromFailure, setExportErrorFromFailure] = useState(false); // Track if error is from a failed export
  const [exportSuccess, setExportSuccess] = useState(null);

  // Auto-close timer for error messages - REMOVED
  // Error messages now require manual dismissal via the dismiss button

  // Real-time status tracking state
  const [activeExports, setActiveExports] = useState(new Map()); // Map of exportId -> polling info
  const [statusUpdates, setStatusUpdates] = useState(new Map()); // Map of exportId -> latest status
  const [dismissedExports, setDismissedExports] = useState(new Set()); // Set of dismissed exportIds
  const pollingIntervals = useRef(new Map()); // Map of exportId -> interval ID
  const componentMounted = useRef(true);
  
  // Download completion modal state
  const [showDownloadCompletionModal, setShowDownloadCompletionModal] = useState(false);
  const [downloadedExportId, setDownloadedExportId] = useState(null);

  // Get project and user IDs from context/localStorage
  useEffect(() => {
    // Get selected project from localStorage
    const selectedProject = localStorage.getItem('selectedProject');
    
    if (!selectedProject) {
      // If no project is selected, redirect to projects list
      navigate('/projects');
      return;
    }
    
    const projectData = JSON.parse(selectedProject);
    setProject(projectData);
  }, [navigate]);

  // Handle preselection from download buttons
  useEffect(() => {
    // Check if there's a preselection from a download button
    const exportPreselection = localStorage.getItem('exportPreselection');
    
    if (exportPreselection) {
      // Pre-select the category
      setSelectedCategories([exportPreselection]);
      console.log(`Pre-selected category from download button: ${exportPreselection}`);
    }
    
    // Clear the preselection from localStorage (one-time use)
    localStorage.removeItem('exportPreselection');
  }, []);

  // Get project and user IDs
  const projectId = project?.projectId;
  const userId = user?.username;

  // Load export history when project is available (only for Export History tab)
  useEffect(() => {
    if (projectId && userId && activeTabId === 'export-history') {
      loadExportHistory();
    }
    
    // Cleanup polling intervals on unmount
    return () => {
      componentMounted.current = false;
      pollingIntervals.current.forEach(intervalId => {
        clearInterval(intervalId);
      });
      pollingIntervals.current.clear();
    };
  }, [projectId, userId, activeTabId]);

  // Load export history from API with enhanced error handling (only for Export History tab)
  const loadExportHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    
    try {
      const response = await retryExportOperation(
        () => exportApiService.getExportHistory({
          projectId,
          page: 1,
          pageSize: 50 // Load more records for better UX
        }),
        'Load export history',
        {
          maxRetries: 2,
          onRetry: (retryInfo) => {
            console.log(`Retrying export history load: ${retryInfo.operationName} (attempt ${retryInfo.attempt})`);
          }
        }
      );
      
      const records = response.records || [];
      setExportHistory(records);
      
      // DON'T start polling from history - Create Export tab is independent
      
    } catch (error) {
      console.error('Error loading export history:', error);
      
      // Provide user-friendly error messages
      let errorMessage = 'Failed to load export history';
      
      if (error.name === 'ExportApiError') {
        if (error.status === 403) {
          errorMessage = 'You do not have permission to view export history';
        } else if (error.status === 0) {
          errorMessage = 'Unable to connect to the export service. Please check your internet connection.';
        } else if (error.isRetryable) {
          errorMessage = 'Temporary issue loading export history. Please try refreshing the page.';
        } else {
          errorMessage = error.message || errorMessage;
        }
      }
      
      setHistoryError(errorMessage);
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  // Start polling for export status updates
  const startPollingExportStatus = useCallback((exportId, executionArn) => {
    // Don't start polling if already polling this export
    if (pollingIntervals.current.has(exportId)) {
      return;
    }
    
    console.log(`Starting status polling for export: ${exportId} with execution: ${executionArn}`);
    
    const pollStatus = async () => {
      console.log(`🔄 Polling status for export ${exportId} with execution ${executionArn}`);
      
      try {
        console.log(`📡 Calling getExecutionStatus for ${executionArn}`);
        // Get Step Function execution status using existing service
        const statusResponse = await getExecutionStatus(executionArn, projectId);
        console.log(`📡 Got status response:`, statusResponse);
        
        if (statusResponse && statusResponse.success) {
          // Map Step Function status to export status
          let exportStatus = 'PROCESSING';
          let progress = 50; // Default progress for running
          
          if (statusResponse.status === 'SUCCEEDED') {
            exportStatus = 'COMPLETED';
            progress = 100;
          } else if (statusResponse.status === 'FAILED' || statusResponse.status === 'TIMED_OUT' || statusResponse.status === 'ABORTED') {
            exportStatus = 'FAILED';
            progress = 0;
          } else if (statusResponse.status === 'RUNNING') {
            exportStatus = 'PROCESSING';
            progress = 75; // Higher progress for running
          }
          
          // Update status in our tracking (preserve existing selectedCategories)
          setStatusUpdates(prev => {
            const existing = prev.get(exportId) || {};
            return new Map(prev.set(exportId, {
              ...existing,
              status: exportStatus,
              progress: progress,
              message: statusResponse.error || `Step Function ${statusResponse.status}`,
              lastUpdated: new Date().toISOString(),
              exportId: exportId
            }));
          });
          
          // If export is completed or failed, stop polling
          if (['COMPLETED', 'FAILED'].includes(exportStatus)) {
            stopPollingExportStatus(exportId);
            
            // For completed exports, keep the status update so the download link shows immediately
            if (exportStatus === 'COMPLETED') {
              // Don't remove the status update - keep it so download link shows
              console.log(`✅ Export ${exportId} completed - keeping status for download link`);
              // Clear selection now that export is complete
              setSelectedCategories([]);
            }
            
            // Only refresh history if we're on the Export History tab
            if (activeTabId === 'export-history') {
              setTimeout(() => {
                if (componentMounted.current) {
                  loadExportHistory();
                }
              }, 1000);
            }
            
            // Show completion notification only for failures
            if (exportStatus === 'FAILED') {
              setExportError(`Export ${exportId.substring(0, 8)}... failed. Please try again or contact support.`);
              setExportErrorFromFailure(true); // Mark this as a failure error that should persist
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error polling status for export ${exportId}:`, error);
        console.error(`❌ Error details:`, error.message, error.stack);
        // Don't stop polling on error, just log it
        // But if we get consistent errors, we might want to stop polling after a few attempts
      }
    };
    
    // Poll immediately, then every 5 seconds
    pollStatus();
    const intervalId = setInterval(pollStatus, 5000);
    
    // Track the interval
    pollingIntervals.current.set(exportId, intervalId);
    setActiveExports(prev => new Map(prev.set(exportId, {
      startTime: new Date().toISOString(),
      intervalId,
      executionArn
    })));
  }, [projectId, loadExportHistory, activeTabId]);
  
  // Stop polling for a specific export
  const stopPollingExportStatus = useCallback((exportId) => {
    const intervalId = pollingIntervals.current.get(exportId);
    if (intervalId) {
      clearInterval(intervalId);
      pollingIntervals.current.delete(exportId);
      console.log(`Stopped status polling for export: ${exportId}`);
    }
    
    setActiveExports(prev => {
      const newMap = new Map(prev);
      newMap.delete(exportId);
      return newMap;
    });
  }, []);

  // Handle dismissing completed export notifications
  const handleDismissExport = useCallback((exportId) => {
    console.log('🗑️ Dismissing export:', exportId);
    setDismissedExports(prev => new Set(prev.add(exportId)));
    // Also remove from status updates to clean up
    setStatusUpdates(prev => {
      const newMap = new Map(prev);
      newMap.delete(exportId);
      return newMap;
    });
  }, []);

  // Handle download completion modal close
  const handleDownloadCompletionClose = useCallback(() => {
    setShowDownloadCompletionModal(false);
    
    // Clear the completed export from the page
    if (downloadedExportId) {
      handleDismissExport(downloadedExportId);
      setDownloadedExportId(null);
    }
  }, [downloadedExportId, handleDismissExport]);

  // Handle category selection change
  const handleSelectionChange = (newSelection) => {
    setSelectedCategories(newSelection);
    // Clear any previous export messages when selection changes, but NOT if error is from a failed export
    if (!exportErrorFromFailure) {
      setExportError(null);
    }
    setExportSuccess(null);
  };

  // Handle export initiation with enhanced error handling
  const handleExport = async () => {
    if (selectedCategories.length === 0) {
      setExportError(t('pages:exportData.pleaseSelectCategory'));
      return;
    }

    if (!projectId || !userId) {
      setExportError(t('pages:exportData.projectUserInfoNotAvailable'));
      return;
    }
    
    setExportLoading(true);
    setExportError(null);
    setExportErrorFromFailure(false); // Reset the flag when starting a new export
    setExportSuccess(null);
    
    try {
      const exportRequest = {
        projectId,
        userId,
        selectedCategories
      };
      
      const result = await retryExportOperation(
        () => exportApiService.initiateExport(exportRequest),
        'Initiate export',
        {
          maxRetries: 1, // Limited retries for export initiation
          onRetry: (retryInfo) => {
            console.log(`Retrying export initiation: ${retryInfo.operationName} (attempt ${retryInfo.attempt})`);
            setExportError(`Retrying export initiation (attempt ${retryInfo.attempt})...`);
          }
        }
      );
      
      // Don't show success message - progress will be shown above categories
      
      // Start polling for this new export immediately
      if (result.exportId && result.executionArn) {
        // Store the selected categories for this export
        setStatusUpdates(prev => new Map(prev.set(result.exportId, {
          status: 'INITIATED',
          progress: 0,
          message: 'Export initiated',
          lastUpdated: new Date().toISOString(),
          exportId: result.exportId,
          selectedCategories: [...selectedCategories] // Store a copy of the selected categories
        })));
        
        startPollingExportStatus(result.exportId, result.executionArn);
      }
      
      // Don't refresh export history - Create Export tab is independent
      
      // Don't clear selection immediately - wait until export completes
      
    } catch (error) {
      console.error('Error initiating export:', error);
      
      // Provide user-friendly error messages based on error type
      let errorMessage = t('pages:exportData.failedToInitiateExport');
      
      if (error.name === 'ExportApiError') {
        if (error.status === 400) {
          errorMessage = t('pages:exportData.invalidExportRequest');
        } else if (error.status === 403) {
          errorMessage = t('pages:exportData.noPermissionToExport');
        } else if (error.status === 429) {
          errorMessage = t('pages:exportData.tooManyRequests');
        } else if (error.status === 0) {
          errorMessage = t('pages:exportData.unableToConnect');
        } else if (error.message.includes('quota') || error.message.includes('limit')) {
          errorMessage = t('pages:exportData.exportLimitReached');
        } else {
          errorMessage = error.message || errorMessage;
        }
      }
      
      setExportError(errorMessage);
      setExportErrorFromFailure(true); // Mark this as a failure error that should persist
    } finally {
      setExportLoading(false);
    }
  };

  // Handle download from history table with enhanced error handling
  const handleDownload = useCallback(async (exportId) => {
    try {
      // Clear any previous messages
      setExportError(null);
      setExportSuccess(null);
      
      await retryExportOperation(
        () => exportApiService.downloadExport(exportId, projectId),
        `Download export ${exportId.substring(0, 8)}...`,
        {
          maxRetries: 1, // Limited retries for downloads
          onRetry: (retryInfo) => {
            console.log(`Retrying download: ${retryInfo.operationName} (attempt ${retryInfo.attempt})`);
          }
        }
      );
      
      // Show download completion modal
      setDownloadedExportId(exportId);
      setShowDownloadCompletionModal(true);
      
      // Refresh history to update download count (only if on Export History tab)
      if (activeTabId === 'export-history') {
        setTimeout(() => {
          loadExportHistory();
        }, 1000);
      }
      
    } catch (error) {
      console.error('Error downloading export:', error);
      
      // Provide user-friendly error messages for download failures
      let errorMessage = `${t('pages:exportData.failedToDownloadExport')} ${exportId.substring(0, 8)}...`;
      
      if (error.name === 'ExportApiError') {
        if (error.status === 404) {
          errorMessage = 'Export file not found or has expired. Please try generating a new export.';
        } else if (error.status === 403) {
          errorMessage = 'You do not have permission to download this export.';
        } else if (error.status === 410) {
          errorMessage = 'Export file is no longer available. Please generate a new export.';
        } else if (error.message.includes('browser') || error.message.includes('blocked')) {
          errorMessage = 'Download was blocked by your browser. Please check your browser settings and try again.';
        } else if (error.status === 0) {
          errorMessage = 'Unable to connect to download the file. Please check your internet connection.';
        } else {
          errorMessage = error.message || errorMessage;
        }
      }
      
      setExportError(errorMessage);
      setExportErrorFromFailure(true); // Mark this as a failure error that should persist
    }
  }, [loadExportHistory]);

  // Handle history refresh
  const handleHistoryRefresh = useCallback(() => {
    loadExportHistory();
  }, [loadExportHistory]);

  // Handle tab change
  const handleTabChange = useCallback(({ detail }) => {
    setActiveTabId(detail.activeTabId);
    
    // Load export history when switching to Export History tab
    if (detail.activeTabId === 'export-history' && projectId && userId) {
      loadExportHistory();
    }
  }, [projectId, userId, loadExportHistory]);

  // Check if any categories are selected
  const hasSelection = selectedCategories.length > 0;
  
  // Get active export count for display
  const activeExportCount = activeExports.size;
  
  // Get latest status updates for display
  const getExportStatusUpdate = (exportId) => {
    return statusUpdates.get(exportId);
  };

  // Show loading state while project is being loaded
  if (!project) {
    return (
      <Layout
        activeHref="/project/export"
        toolsOpen={toolsOpen}
        onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      >
        <ContentLayout
          header={
            <Header variant="h1">
              {t('pages:exportData.title')}
            </Header>
          }
        >
          <Box textAlign="center" padding="xxl">
            <StatusIndicator type="loading">{t('pages:exportData.loadingProjectInformation')}</StatusIndicator>
          </Box>
        </ContentLayout>
      </Layout>
    );
  }

  return (
    <Layout
      activeHref="/project/export"
      infoContent={
        <Box padding="l">
          <ExportDataInfoContent />
        </Box>
      }
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
    >
      <ExportErrorBoundary 
        context="export_data_page"
        onRetry={() => {
          // Reset all error states and reload data
          setExportError(null);
          setHistoryError(null);
          setExportSuccess(null);
          loadExportHistory();
        }}
      >
        <ContentLayout
        header={
          <Header variant="h1">
            {t('pages:exportData.title')}
          </Header>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          {/* Tabs for Export Configuration and History */}
          <Tabs
            activeTabId={activeTabId}
            onChange={handleTabChange}
            tabs={[
              {
                id: 'export-config',
                label: t('pages:exportData.createExport'),
                content: (
                  <SpaceBetween direction="vertical" size="l">
                    <Box>
                      <Header 
                        variant="h2"
                        description={t('pages:exportData.selectDataCategoriesDescription')}
                        actions={
                          <Button 
                            variant="primary" 
                            onClick={handleExport}
                            disabled={!hasSelection}
                            loading={exportLoading}
                          >
                            {exportLoading ? t('pages:exportData.initiatingExport') : t('pages:exportData.exportSelected')}
                          </Button>
                        }
                      >
                        {t('pages:exportData.exportConfiguration')}
                      </Header>
                    </Box>

                    {/* Export error message - only show when user actually tries to export without selection */}
                    {exportError && exportError !== t('pages:exportData.pleaseSelectCategory') && (
                      <Alert 
                        type="warning" 
                        dismissible 
                        onDismiss={() => {
                          console.log('Alert dismissed manually');
                          setExportError(null);
                          setExportErrorFromFailure(false); // Clear the flag when user dismisses
                        }}
                        header={t('pages:exportData.exportError')}
                      >
                        {exportError}
                      </Alert>
                    )}

                    {/* Single dynamic export status container - shows only ONE export at a time from current session */}
                    {(() => {
                      // Priority 1: Show the most recent active export (if any)
                      if (activeExportCount > 0) {
                        const mostRecentActiveExportId = Array.from(activeExports.keys())[0]; // Just show the first/most recent one
                        const statusUpdate = getExportStatusUpdate(mostRecentActiveExportId);
                        const progress = statusUpdate?.progress || 0;
                        const status = statusUpdate?.status || 'INITIATED';
                        
                        return (
                          <Alert type="info" header={`${t('pages:exportData.export')} ${mostRecentActiveExportId.substring(0, 8)}... - ${status}`}>
                            <SpaceBetween direction="vertical" size="xs">
                              {statusUpdate?.lastUpdated && (
                                <Box variant="small" color="text-status-info">
                                  {t('pages:exportData.lastUpdated')}: {new Date(statusUpdate.lastUpdated).toLocaleTimeString()}
                                </Box>
                              )}
                              {progress > 0 && (
                                <ProgressBar
                                  value={progress}
                                  additionalInfo={statusUpdate?.message || `${Math.round(progress)}% ${t('pages:exportData.complete')}`}
                                />
                              )}
                            </SpaceBetween>
                          </Alert>
                        );
                      }
                      
                      // Priority 2: Show completed export from current session only
                      // Only show exports that were completed via polling in this session and not dismissed
                      const completedFromCurrentSession = Array.from(statusUpdates.entries())
                        .filter(([exportId, status]) => status.status === 'COMPLETED' && !dismissedExports.has(exportId))
                        .map(([exportId, status]) => ({
                          exportId,
                          selectedCategories: status.selectedCategories || [],
                          createdAt: status.lastUpdated,
                          status: 'COMPLETED'
                        }));
                      
                      if (completedFromCurrentSession.length > 0) {
                        const mostRecent = completedFromCurrentSession[0];
                        return (
                          <Alert 
                            type="success" 
                            header={`${t('pages:exportData.export')} ${mostRecent.exportId.substring(0, 8)}... - ${t('pages:exportData.completed')}`}
                            action={
                              <SpaceBetween direction="horizontal" size="xs">
                                <Button
                                  variant="primary"
                                  iconName="download"
                                  onClick={() => {
                                    handleDownload(mostRecent.exportId);
                                    // Show modal after download
                                    setDownloadedExportId(mostRecent.exportId);
                                    setShowDownloadCompletionModal(true);
                                  }}
                                >
                                  {t('common:buttons.download')}
                                </Button>
                                <Button
                                  variant="icon"
                                  iconName="close"
                                  onClick={() => {
                                    // Show modal when dismissing
                                    setDownloadedExportId(mostRecent.exportId);
                                    setShowDownloadCompletionModal(true);
                                  }}
                                  ariaLabel={t('pages:exportData.dismissNotification')}
                                />
                              </SpaceBetween>
                            }
                          >
                            <SpaceBetween direction="vertical" size="xs">
                              <Box variant="small">
                                {t('pages:exportData.categories')}: {mostRecent.selectedCategories?.join(', ') || t('common:general.notAvailable')}
                              </Box>
                              <Box variant="small" color="text-status-info">
                                {t('pages:exportData.completed')}: {new Date(mostRecent.createdAt).toLocaleString()}
                              </Box>
                            </SpaceBetween>
                          </Alert>
                        );
                      }
                      
                      // Show nothing if no active or completed exports from current session
                      return null;
                    })()}
                    
                    <ExportCategorySelector
                      selectedCategories={selectedCategories}
                      onSelectionChange={handleSelectionChange}
                      disabled={exportLoading}
                      hideSelectionWarning={
                        activeExportCount > 0 || 
                        Array.from(statusUpdates.entries()).some(([exportId, status]) => 
                          status.status === 'COMPLETED' && !dismissedExports.has(exportId)
                        )
                      }
                    />
                  </SpaceBetween>
                )
              },
              {
                id: 'export-history',
                label: t('pages:exportData.exportHistory'),
                content: (
                  <SpaceBetween direction="vertical" size="l">
                    <Box>
                      <Header 
                        variant="h2"
                        description={t('pages:exportData.exportHistoryDescription')}
                      >
                        {t('pages:exportData.exportHistory')}
                      </Header>
                    </Box>
                    
                    <ExportHistoryTable
                      data={exportHistory}
                      loading={historyLoading}
                      error={historyError}
                      onRefresh={handleHistoryRefresh}
                      onDownload={handleDownload}
                    />
                  </SpaceBetween>
                )
              }
            ]}
          />
        </SpaceBetween>
        </ContentLayout>
      </ExportErrorBoundary>
      
      {/* Export Completion Modal */}
      <Modal
        onDismiss={handleDownloadCompletionClose}
        visible={showDownloadCompletionModal}
        header={t('pages:exportData.exportAvailable')}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="normal" onClick={handleDownloadCompletionClose}>
                {t('pages:exportData.gotIt')}
              </Button>
              <Button 
                variant="primary" 
                onClick={() => {
                  setActiveTabId('export-history');
                  handleDownloadCompletionClose();
                }}
              >
                {t('pages:exportData.viewExportHistory')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween direction="vertical" size="m">
          <Box>
            {t('pages:exportData.exportAvailableMessage')}
          </Box>
          <Box>
            {t('pages:exportData.exportAvailableDetails')}
          </Box>
          <Box variant="small" color="text-status-info">
            {t('pages:exportData.exportId')}: {downloadedExportId?.substring(0, 8)}...
          </Box>
        </SpaceBetween>
      </Modal>
    </Layout>
  );
};

export default ExportDataPage;