import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Header,
  Button,
  SpaceBetween,
  Box,
  Alert,
  ExpandableSection,
  FormField,
  Checkbox,
  Select,
  ColumnLayout,
  StatusIndicator,
  ProgressBar
} from '@cloudscape-design/components';

// Services
import { analyzeApplicationSimilarities, pollApplicationSimilarityExecution, clearApplicationSimilarityResults } from '../services/applicationSimilarityApi';
import { getExecutionStatus } from '../services/stepFunctionService';

// Hooks
import useProjectPermissions from '../hooks/useProjectPermissions';

/**
 * Application Similarities Analysis Trigger Component
 * 
 * Provides a button to trigger the application similarities analysis step function
 * and shows the current status of the analysis.
 */
const SimilaritiesAnalysisTrigger = ({ 
  onAnalysisComplete, 
  analysisData,
  executionStatus,
  setExecutionStatus,
  analysisProgress,
  setAnalysisProgress
}) => {
  const { t } = useTranslation('components');
  const [selectedProject, setSelectedProject] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // Check project permissions
  const { hasWriteAccess, loading: permissionsLoading } = useProjectPermissions(selectedProject?.projectId);

  // Debug: Log when analysisData prop changes
  useEffect(() => {
    console.log('🔍 SimilaritiesAnalysisTrigger - analysisData prop changed:', {
      hasAnalysisData: !!analysisData,
      analysisDataKeys: analysisData ? Object.keys(analysisData) : []
    });
  }, [analysisData]);

  // Advanced filters state - application-specific filters
  const [currentFilters, setCurrentFilters] = useState({
    minSimilarityScore: 0.7,
    includeRuntimes: true,
    includeFrameworks: true,
    includeDatabases: true,
    includeIntegrations: true,
    includeStorages: true,
    applicationFilter: 'all',
    departmentFilter: 'all'
  });

  // Handle filter changes
  const handleFilterChange = (filterName, value) => {
    setCurrentFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  // Load selected project from localStorage
  useEffect(() => {
    const projectData = localStorage.getItem('selectedProject');
    if (projectData) {
      const project = JSON.parse(projectData);
      setSelectedProject(project);
    }
  }, []);
  
  // Resume polling if execution status is provided and running
  useEffect(() => {
    if (executionStatus && executionStatus.status === 'RUNNING' && executionStatus.executionArn) {
      console.log('🔄 Resuming polling for in-flight execution:', executionStatus.executionArn);
      pollExecution(executionStatus.executionArn);
    }
  }, [executionStatus?.executionArn]); // Only trigger when executionArn changes

  // Handle clearing results
  const handleClearResults = async () => {
    try {
      console.log('🗑️ Clearing application similarity results...');
      
      setIsClearing(true);
      setError(null);
      setSuccess(null);
      
      await clearApplicationSimilarityResults(selectedProject.projectId);
      
      // Clear local state
      setSuccess(t('similaritiesAnalysis.resultsClearedSuccessfully'));
      setExecutionStatus(null);
      setAnalysisProgress(0);
      
      // Clear from localStorage
      if (selectedProject) {
        const executionKey = `applicationSimilarityExecution_${selectedProject.projectId}`;
        localStorage.removeItem(executionKey);
        console.log('🗑️ Cleared execution from localStorage after clearing results');
      }
      
      // Notify parent component
      if (onAnalysisComplete) {
        onAnalysisComplete(null);
      }
      
      console.log('✅ Application similarity results cleared');
    } catch (err) {
      console.error('❌ Error clearing results:', err);
      setError(t('similaritiesAnalysis.failedToClearResults', { error: err.message }));
    } finally {
      setIsClearing(false);
    }
  };

  // Handle triggering the analysis
  const handleTriggerAnalysis = async () => {
    if (!selectedProject?.projectId) {
      setError(t('similaritiesAnalysis.noProjectSelected'));
      return;
    }

    setIsTriggering(true);
    setError(null);
    setSuccess(null);
    setExecutionStatus(null);
    setAnalysisProgress(0);

    try {
      console.log('🚀 Triggering application similarities analysis for project:', selectedProject.projectId);
      console.log('📋 Analysis filters:', currentFilters);

      const result = await analyzeApplicationSimilarities(selectedProject.projectId, currentFilters);
      
      if (result.success) {
        console.log('✅ Application analysis triggered successfully');
        
        const execution = {
          status: 'RUNNING',
          executionArn: result.executionArn,
          executionId: result.executionId,
          estimatedTimeMinutes: result.estimatedTimeMinutes,
          startTime: new Date().toISOString(),
          progress: 0
        };
        
        setExecutionStatus(execution);
        setAnalysisProgress(0);
        
        // Save execution status to localStorage for persistence across navigation
        const executionKey = `applicationSimilarityExecution_${selectedProject.projectId}`;
        localStorage.setItem(executionKey, JSON.stringify(execution));
        console.log('💾 Saved execution status to localStorage:', executionKey);
        
        // Start polling for status updates
        pollExecution(result.executionArn);
      } else {
        setError(result.error || t('similaritiesAnalysis.failedToStartAnalysis'));
      }
    } catch (err) {
      console.error('❌ Error triggering analysis:', err);
      const errorMessage = typeof err === 'string' ? err : (err.message || err.error || t('similaritiesAnalysis.failedToTriggerAnalysis'));
      setError(errorMessage);
    } finally {
      setIsTriggering(false);
    }
  };

  // Poll execution status
  const pollExecution = async (executionArn) => {
    let pollCount = 0;
    const maxPolls = 360; // Poll for up to 30 minutes (360 * 5 seconds)
    
    const pollInterval = setInterval(async () => {
      try {
        const statusResult = await getExecutionStatus(executionArn);
        
        if (statusResult.success) {
          const status = statusResult.status;
          
          // Calculate progress based on time elapsed (rough estimate)
          const progress = Math.min(95, (pollCount / maxPolls) * 100);
          
          const updatedExecution = {
            executionArn,
            status,
            progress,
            estimatedTimeMinutes: executionStatus?.estimatedTimeMinutes || 15,
            startTime: executionStatus?.startTime || new Date().toISOString()
          };
          
          setExecutionStatus(updatedExecution);
          setAnalysisProgress(progress);
          
          // Update localStorage with current status
          if (selectedProject) {
            const executionKey = `applicationSimilarityExecution_${selectedProject.projectId}`;
            localStorage.setItem(executionKey, JSON.stringify(updatedExecution));
          }
          
          if (status === 'SUCCEEDED') {
            clearInterval(pollInterval);
            setAnalysisProgress(100);
            setSuccess(t('similaritiesAnalysis.analysisCompletedSuccessfully'));
            
            // Clear execution status since analysis is complete
            setExecutionStatus(null);
            setAnalysisProgress(0);
            
            // Clear from localStorage
            if (selectedProject) {
              const executionKey = `applicationSimilarityExecution_${selectedProject.projectId}`;
              localStorage.removeItem(executionKey);
              console.log('🗑️ Cleared execution from localStorage');
            }
            
            // Notify parent component to fetch and display results
            if (onAnalysisComplete) {
              onAnalysisComplete(statusResult.output || { success: true });
            }
          } else if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED') {
            clearInterval(pollInterval);
            setError(t('similaritiesAnalysis.analysisFailed', { status: status.toLowerCase(), error: statusResult.error || t('similaritiesAnalysis.unknownError') }));
            setExecutionStatus(null);
            setAnalysisProgress(0);
            
            // Clear from localStorage
            if (selectedProject) {
              const executionKey = `applicationSimilarityExecution_${selectedProject.projectId}`;
              localStorage.removeItem(executionKey);
              console.log('🗑️ Cleared failed execution from localStorage');
            }
          } else if (status === 'RUNNING') {
            // Continue polling
            pollCount++;
            if (pollCount >= maxPolls) {
              clearInterval(pollInterval);
              setError(t('similaritiesAnalysis.analysisTimeout'));
              setExecutionStatus(null);
              setAnalysisProgress(0);
              
              // Clear from localStorage
              if (selectedProject) {
                const executionKey = `applicationSimilarityExecution_${selectedProject.projectId}`;
                localStorage.removeItem(executionKey);
                console.log('🗑️ Cleared timed out execution from localStorage');
              }
            }
          }
        } else {
          console.error('❌ Error getting execution status:', statusResult.error);
          pollCount++;
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            setError(t('similaritiesAnalysis.failedToCheckStatus', { error: statusResult.error }));
            setExecutionStatus(null);
            setAnalysisProgress(0);
            
            // Clear from localStorage
            if (selectedProject) {
              const executionKey = `applicationSimilarityExecution_${selectedProject.projectId}`;
              localStorage.removeItem(executionKey);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error polling execution status:', error);
        pollCount++;
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setError(t('similaritiesAnalysis.failedToCheckStatus', { error: error.message }));
          setExecutionStatus(null);
          setAnalysisProgress(0);
          
          // Clear from localStorage
          if (selectedProject) {
            const executionKey = `applicationSimilarityExecution_${selectedProject.projectId}`;
            localStorage.removeItem(executionKey);
          }
        }
      }
    }, 5000); // Poll every 5 seconds
  };

  return (
    <Container>
      <SpaceBetween size="l">
        <Header
          variant="h2"
          description={t('similaritiesAnalysis.headerDescriptionApplications')}
        >
          {t('similaritiesAnalysis.applicationSimilarityAnalysis')}
        </Header>

        <Box variant="p" color="text-body-secondary">
          {t('similaritiesAnalysis.descriptionApplications')}
        </Box>

        {/* Read-only access alert */}
        {!permissionsLoading && !hasWriteAccess && (
          <Alert type="info" header="Read-only access">
            You have read-only access to this project. You cannot run new analyses or clear results.
          </Alert>
        )}

        {/* Status Messages */}
        {error && (
          <Alert type="error" header={t('similaritiesAnalysis.analysisError')} dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert type="success" header={t('alerts.success')} dismissible onDismiss={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        {/* Execution Status - Hide when successfully completed */}
        {executionStatus && executionStatus.status !== 'SUCCEEDED' && (
          <Box>
            <Box>
              <Box variant="awsui-key-label">{t('similaritiesAnalysis.analysisStatus')}</Box>
              <StatusIndicator type={
                executionStatus.status === 'FAILED' ? 'error' :
                executionStatus.status === 'RUNNING' ? 'in-progress' : 'pending'
              }>
                {executionStatus.status === 'RUNNING' ? t('similaritiesAnalysis.analysisInProgress') :
                 executionStatus.status === 'FAILED' ? t('similaritiesAnalysis.analysisFailed') : executionStatus.status}
              </StatusIndicator>
            </Box>
          </Box>
        )}

        {/* Clearing Status */}
        {isClearing && (
          <Box>
            <SpaceBetween size="s">
              <Box>
                <Box variant="awsui-key-label">{t('similaritiesAnalysis.clearStatus')}</Box>
                <StatusIndicator type="in-progress">
                  {t('similaritiesAnalysis.clearingResults')}
                </StatusIndicator>
              </Box>
              
              <ProgressBar
                value={50}
                additionalInfo={t('similaritiesAnalysis.removingSimilarityRecords')}
                description={t('similaritiesAnalysis.analysisTimeDescription')}
              />
            </SpaceBetween>
          </Box>
        )}

        {/* Action Buttons */}
        <SpaceBetween direction="horizontal" size="s">
          <Button 
            variant="primary"
            disabled={!selectedProject?.projectId || isTriggering || isClearing || executionStatus?.status === 'RUNNING' || analysisData || !hasWriteAccess}
            loading={isTriggering || executionStatus?.status === 'RUNNING'}
            onClick={handleTriggerAnalysis}
          >
            {isTriggering ? t('similaritiesAnalysis.startingAnalysis') : 
             executionStatus?.status === 'RUNNING' ? t('similaritiesAnalysis.analysisInProgressButton') : 
             analysisData ? t('similaritiesAnalysis.clearResultsToRunNew') :
             t('similaritiesAnalysis.runSimilaritiesAnalysis')}
          </Button>
          
          {/* Clear Results button - only show if there's analysis data */}
          {analysisData && (
            <Button 
              variant="normal"
              disabled={!selectedProject?.projectId || isTriggering || isClearing || executionStatus?.status === 'RUNNING' || !hasWriteAccess}
              loading={isClearing}
              onClick={handleClearResults}
            >
              {isClearing ? t('similaritiesAnalysis.clearingResults') : t('similaritiesAnalysis.clearResults')}
            </Button>
          )}
        </SpaceBetween>

        {/* Advanced Configuration */}
        <ExpandableSection
          headerText={t('similaritiesAnalysis.advancedConfiguration')}
          defaultExpanded={false}
          description={t('similaritiesAnalysis.advancedConfigDescription')}
        >
          <SpaceBetween size="l">
            {/* Technology Category Weights */}
            <FormField 
              description={t('similaritiesAnalysis.technologyCategoryDescription')}
            >
              <SpaceBetween size="m">
                <ColumnLayout columns={2}>
                  <FormField label={t('similaritiesAnalysis.includeRuntimes')} description={t('similaritiesAnalysis.includeRuntimesDescription')}>
                    <Checkbox
                      checked={currentFilters.includeRuntimes}
                      onChange={({ detail }) => handleFilterChange('includeRuntimes', detail.checked)}
                      disabled={isTriggering}
                    >
                      {t('similaritiesAnalysis.runtimeExamples')}
                    </Checkbox>
                  </FormField>

                  <FormField label={t('similaritiesAnalysis.includeFrameworks')} description={t('similaritiesAnalysis.includeFrameworksDescription')}>
                    <Checkbox
                      checked={currentFilters.includeFrameworks}
                      onChange={({ detail }) => handleFilterChange('includeFrameworks', detail.checked)}
                      disabled={isTriggering}
                    >
                      {t('similaritiesAnalysis.frameworkExamples')}
                    </Checkbox>
                  </FormField>

                  <FormField label={t('similaritiesAnalysis.includeDatabases')} description={t('similaritiesAnalysis.includeDatabasesDescription')}>
                    <Checkbox
                      checked={currentFilters.includeDatabases}
                      onChange={({ detail }) => handleFilterChange('includeDatabases', detail.checked)}
                      disabled={isTriggering}
                    >
                      {t('similaritiesAnalysis.databaseExamples')}
                    </Checkbox>
                  </FormField>

                  <FormField label={t('similaritiesAnalysis.includeIntegrations')} description={t('similaritiesAnalysis.includeIntegrationsDescription')}>
                    <Checkbox
                      checked={currentFilters.includeIntegrations}
                      onChange={({ detail }) => handleFilterChange('includeIntegrations', detail.checked)}
                      disabled={isTriggering}
                    >
                      {t('similaritiesAnalysis.integrationExamples')}
                    </Checkbox>
                  </FormField>

                  <FormField label={t('similaritiesAnalysis.includeStorages')} description={t('similaritiesAnalysis.includeStoragesDescription')}>
                    <Checkbox
                      checked={currentFilters.includeStorages}
                      onChange={({ detail }) => handleFilterChange('includeStorages', detail.checked)}
                      disabled={isTriggering}
                    >
                      {t('similaritiesAnalysis.storageExamples')}
                    </Checkbox>
                  </FormField>
                </ColumnLayout>
              </SpaceBetween>
            </FormField>
          </SpaceBetween>
        </ExpandableSection>
      </SpaceBetween>
    </Container>
  );
};

export default SimilaritiesAnalysisTrigger;
